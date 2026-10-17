# NestJS Auth API

A production-ready authentication API built with NestJS, Prisma and PostgreSQL. It uses short-lived JWT access tokens, rotating refresh tokens stored in httpOnly cookies, Google sign-in and role-based access control, with a test, Docker and OpenAPI setup around it.

## Features

- **Email and password auth** with argon2 hashing
- **Access token (15 min)** in the `Authorization` header and **refresh token (7 days)** in an httpOnly cookie
- **Refresh token rotation with reuse detection**: reusing an old token revokes every session of the user
- **Sessions per device**, stored hashed in the database (a database leak does not leak usable tokens)
- **Google OAuth** (Passport) with a CSRF `state` cookie
- **Secure by default**: a global JWT guard protects every route, and `@Public()` opts a route out
- **Role-based access control** with `@Roles()` and `RolesGuard`
- **Account management**: get and update profile, change password, delete account
- **Rate limiting**, `helmet` and CORS with credentials
- **Environment validation** with zod: the app refuses to start with a bad `.env`
- **Structured logging** with pino, a global exception filter and a response envelope
- **OpenAPI docs** (Swagger UI) and **health checks** (liveness and readiness)
- **End-to-end tests** with Vitest and Supertest
- **Docker**: multi-stage image and a compose file that runs migrations on start

## Tech stack

| Area            | Choice                                                  |
| --------------- | ------------------------------------------------------- |
| Framework       | NestJS 11, TypeScript                                   |
| Database        | PostgreSQL 17, Prisma 7 (driver adapter `pg`)           |
| Auth            | Passport (JWT, Google OAuth 2.0), `@nestjs/jwt`, argon2 |
| Validation      | class-validator, class-transformer, zod (environment)   |
| Security        | helmet, `@nestjs/throttler`, cookie-parser              |
| Logging         | nestjs-pino                                             |
| Docs and health | `@nestjs/swagger`, `@nestjs/terminus`                   |
| Tests           | Vitest, Supertest, SWC                                  |
| Infra           | Docker, Docker Compose                                  |

## How authentication works

```
Client                                   API                                  Database
  |  POST /api/auth/login                  |                                      |
  |--------------------------------------->|  verify password (argon2)            |
  |                                        |  create Session (hashed refresh) --->|
  |<---------------------------------------|                                      |
  |  body: { accessToken }                 |                                      |
  |  cookie: refresh_token (httpOnly)      |                                      |
  |                                        |                                      |
  |  GET /api/auth/me                      |                                      |
  |  Authorization: Bearer <accessToken>   |  verify signature + expiry only      |
  |--------------------------------------->|                                      |
  |                                        |                                      |
  |  POST /api/auth/refresh (cookie)       |  check session, rotate token ------->|
  |--------------------------------------->|  old token reused? revoke all        |
  |<---------------------------------------|                                      |
  |  new accessToken + new cookie          |                                      |
```

| Decision                                                       | Why                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Access token lives 15 minutes                                  | A leaked token has a limited lifetime                                          |
| Refresh token in an httpOnly, `SameSite=Strict` cookie         | JavaScript cannot read it, so XSS cannot steal it                              |
| Refresh token stored as a SHA-256 hash                         | A database leak does not leak usable tokens                                    |
| Rotation on every refresh                                      | Limits the lifetime of any stolen refresh token                                |
| Reuse detection                                                | Using an old refresh token means theft, so every session is revoked            |
| Global guard and `@Public()`                                   | You cannot forget to protect a route                                           |
| Wrong current password returns 400, not 401                    | A logged-in user would otherwise trigger the frontend's "session expired" flow |
| No automatic linking of Google to an existing password account | Prevents account pre-hijacking until email verification exists                 |

## Getting started

### Prerequisites

- Node.js 24 or newer
- Docker and Docker Compose
- A Google OAuth client (see [Google sign-in setup](#google-sign-in-setup))

### 1. Install

```bash
git clone https://github.com/AhmedBenaissaM10/nestjs-auth-api.git
cd nestjs-auth-api
npm install
```

### 2. Configure

Create a `.env` file in the project root (all variables are described [below](#environment-variables)):

```env
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auth_db
JWT_ACCESS_SECRET=<generated secret>
JWT_REFRESH_SECRET=<another generated secret>
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

Generate each secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Start the database and run migrations

```bash
docker compose up -d db
npx prisma migrate dev
npx prisma generate
```

### 4. Run the API

```bash
npm run start:dev
```

| URL                                  | What                                             |
| ------------------------------------ | ------------------------------------------------ |
| `http://localhost:3000/api`          | API base path                                    |
| `http://localhost:3000/docs`         | Swagger UI (disabled when `NODE_ENV=production`) |
| `http://localhost:3000/health/ready` | Readiness probe                                  |

## Environment variables

| Variable               | Required | Description                                                     |
| ---------------------- | -------- | --------------------------------------------------------------- |
| `NODE_ENV`             | no       | `development` (default), `production` or `test`                 |
| `PORT`                 | no       | HTTP port (default `3000`)                                      |
| `FRONTEND_URL`         | yes      | Allowed CORS origin, and where the Google callback redirects to |
| `DATABASE_URL`         | yes      | PostgreSQL connection string                                    |
| `JWT_ACCESS_SECRET`    | yes      | At least 32 characters                                          |
| `JWT_REFRESH_SECRET`   | yes      | At least 32 characters, different from the access secret        |
| `GOOGLE_CLIENT_ID`     | yes      | From Google Cloud Console                                       |
| `GOOGLE_CLIENT_SECRET` | yes      | From Google Cloud Console                                       |
| `GOOGLE_CALLBACK_URL`  | yes      | Must match the redirect URI registered in Google Cloud Console  |
| `THROTTLE_DISABLED`    | no       | `true` disables rate limiting (used by the tests)               |

## Google sign-in setup

1. Open the [Google Cloud Console](https://console.cloud.google.com) and create a project.
2. Configure the **OAuth consent screen**: choose **External**, and while the app is in **Testing**, add your Google account under **Test users**.
3. Go to **Credentials > Create credentials > OAuth client ID > Web application**.
4. Under **Authorized redirect URIs**, add exactly the value of `GOOGLE_CALLBACK_URL` (for example `http://localhost:3000/api/auth/google/callback`).
5. Copy the client ID and client secret into `.env`, then restart the API.

## Running with Docker

```bash
docker compose up -d --build
```

This starts PostgreSQL and the API. The API container applies the pending migrations and then starts the app.

- The container runs with `NODE_ENV=production`: Swagger is disabled and the refresh cookie is `Secure`.
- Your `.env` is read by the API container, and `DATABASE_URL` is overridden to point at the `db` service.
- Stop everything with `docker compose down` (add `-v` to delete the database volume too).

For daily development, run only the database with `docker compose up -d db` and the API with `npm run start:dev`.

## Scripts

| Script                    | Description                            |
| ------------------------- | -------------------------------------- |
| `npm run start:dev`       | Start in watch mode                    |
| `npm run build`           | Compile to `dist/`                     |
| `npm run start:prod`      | Run the compiled app                   |
| `npm run test:db:migrate` | Apply migrations to the test database  |
| `npm run test:e2e`        | Run the end-to-end tests once          |
| `npm run test:e2e:watch`  | Run the end-to-end tests in watch mode |

## API reference

Every route is under `/api` (except health checks and the docs). The full, interactive reference is in Swagger UI at `/docs`.

| Method   | Path                        | Access                | Description                                      |
| -------- | --------------------------- | --------------------- | ------------------------------------------------ |
| `POST`   | `/api/auth/signup`          | Public (5 per minute) | Create an account, open a session                |
| `POST`   | `/api/auth/login`           | Public (5 per minute) | Log in, open a session                           |
| `POST`   | `/api/auth/refresh`         | Refresh cookie        | Rotate the refresh token, get a new access token |
| `POST`   | `/api/auth/logout`          | Refresh cookie        | Revoke the session, clear the cookie             |
| `GET`    | `/api/auth/me`              | Bearer                | Id and role from the access token                |
| `GET`    | `/api/auth/profile`         | Bearer                | Profile read from the database                   |
| `PATCH`  | `/api/auth/profile`         | Bearer                | Update the name                                  |
| `POST`   | `/api/auth/change-password` | Bearer (5 per minute) | Change the password, revoke all other sessions   |
| `DELETE` | `/api/auth/account`         | Bearer (5 per minute) | Delete the account and all its sessions          |
| `GET`    | `/api/auth/google`          | Public                | Start Google sign-in (open in the browser)       |
| `GET`    | `/api/auth/google/callback` | Public                | Google redirects here                            |
| `GET`    | `/api/users`                | Bearer, `ADMIN`       | List users                                       |
| `GET`    | `/health/live`              | Public                | Liveness probe                                   |
| `GET`    | `/health/ready`             | Public                | Readiness probe (checks the database)            |

### Response format

Success:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {},
  "path": "/api/auth/me",
  "method": "GET",
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

Error:

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid credentials",
  "path": "/api/auth/login",
  "method": "POST",
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

## Frontend integration

- Keep the access token **in memory** (not `localStorage`) and send it as `Authorization: Bearer <token>`.
- Send requests with `credentials: 'include'` so the browser sends the refresh cookie.
- On page load and on a `401`, call `POST /api/auth/refresh` to get a new access token. If that fails, send the user to the login page.
- On logout, call `POST /api/auth/logout` and delete the access token from memory.
- **Google sign-in:** navigate the browser to `/api/auth/google`. On success the API redirects to `FRONTEND_URL/auth/callback` with the refresh cookie set, and your frontend then calls `POST /api/auth/refresh`. On failure it redirects to `FRONTEND_URL/login?error=oauth_failed` or `?error=account_exists`.
- The frontend and the API must be on the same site (for example `app.example.com` and `api.example.com`), or the `SameSite=Strict` cookie will not be sent.

## Project structure

```
src/
├── main.ts
├── app.module.ts
├── app.setup.ts            # helmet, CORS, cookies, pipes, filter, interceptor
├── swagger.setup.ts
├── auth/
│   ├── decorators/         # @Public, @Roles, @CurrentUser
│   ├── dto/
│   ├── filters/            # OAuth redirect filter
│   ├── guards/             # JWT, roles, Google
│   ├── strategies/         # JWT, Google
│   ├── types/
│   ├── auth.constants.ts
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   └── auth.service.ts
├── common/                 # exception filter, response interceptor, Swagger helpers
├── config/env.ts           # zod-validated environment
├── generated/prisma/       # generated Prisma client (git-ignored)
├── health/
├── prisma/
└── users/
prisma/                     # schema and migrations
test/                       # end-to-end tests
```

## Testing

The tests are end-to-end: they boot the whole app against a separate PostgreSQL database and call it over HTTP.

```bash
# 1. create the test database (once)
docker exec auth-db psql -U postgres -c "CREATE DATABASE auth_test;"

# 2. create .env.test (same variables as .env, with
#    NODE_ENV=test, PORT=3001, THROTTLE_DISABLED=true,
#    DATABASE_URL pointing to auth_test, and dummy Google values)

# 3. migrate the test database and run the tests
npm run test:db:migrate
npm run test:e2e
```

## Security notes

- **Logout does not invalidate the access token immediately.** The access token is stateless, so it stays valid until it expires (15 minutes at most). Logout revokes the session, which blocks any refresh. Clients should delete the token on logout. If you need instant revocation, check the session on every request or keep a denylist in Redis.
- **Google-only accounts have no password.** They cannot use password login or change password, and they confirm account deletion with a valid access token only.
- **Behind a reverse proxy,** configure `trust proxy`, otherwise the rate limiter sees every request as coming from the proxy.
- Never commit `.env` files. Use different secrets for every environment.

## Roadmap

- [x] Email and password auth with refresh token rotation
- [x] Roles, rate limiting, helmet and CORS
- [x] Profile, change password, delete account
- [x] OpenAPI docs, health checks, Docker
- [x] Google OAuth
- [ ] Email verification
- [ ] Forgot and reset password
- [ ] Link Google to an existing account (after email verification)
- [ ] Two-factor authentication (TOTP)

## Author

**Ahmed Ben Aissa** ([@AhmedBenaissaM10](https://github.com/AhmedBenaissaM10))

## License

Distributed under the MIT License. Add a `LICENSE` file to the repository.
