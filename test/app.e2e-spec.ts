import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const EMAIL = 'test@example.com';
const PASSWORD = 'password123';
const NAME = 'Ahmed';

type HasHeaders = { headers: Record<string, unknown> };

const rawRefreshCookie = (res: HasHeaders): string => {
  const cookies = res.headers['set-cookie'] as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('refresh_token cookie not found');
  return cookie;
};

const refreshCookieOf = (res: HasHeaders): string =>
  rawRefreshCookie(res).split(';')[0];

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());

  const register = (name = NAME, email = EMAIL, password = PASSWORD) =>
    http().post('/auth/signup').send({ name, email, password });

  const login = (password = PASSWORD) =>
    http().post('/auth/login').send({ email: EMAIL, password });

  const refresh = (cookie?: string) => {
    const req = http().post('/auth/refresh');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/signup', () => {
    it('creates the user and returns an access token and a refresh cookie', async () => {
      const res = await register().expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(EMAIL);
      expect(res.body.data.user.role).toBe('USER');
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      const cookie = rawRefreshCookie(res);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/auth');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('stores a hashed refresh token, not the raw one', async () => {
      const res = await register().expect(201);
      const rawToken = refreshCookieOf(res).split('=')[1];

      const session = await prisma.session.findFirst({
        where: { userId: res.body.data.user.id },
      });

      expect(session).not.toBeNull();
      expect(session!.refreshTokenHash).not.toBe(rawToken);
      expect(session!.revokedAt).toBeNull();
    });

    it('rejects a duplicate email (case-insensitive) with 409', async () => {
      await register().expect(201);
      await register('TEST@example.com').expect(409);
    });

    it('rejects an invalid email with 400', async () => {
      await register('not-an-email').expect(400);
    });

    it('rejects a short password with 400', async () => {
      await register(EMAIL, 'short').expect(400);
    });

    it('rejects unknown fields (no role injection) with 400', async () => {
      await http()
        .post('/auth/signup')
        .send({ email: EMAIL, password: PASSWORD, role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    it('returns an access token and a refresh cookie', async () => {
      const res = await login().expect(200);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(rawRefreshCookie(res)).toContain('HttpOnly');
    });

    it('creates a new session per login', async () => {
      await login().expect(200);
      await login().expect(200);

      expect(await prisma.session.count()).toBe(3);
    });

    it('rejects a wrong password with 401', async () => {
      await login('wrong-password').expect(401);
    });

    it('returns the same error for an unknown email', async () => {
      const wrongPassword = await login('wrong-password').expect(401);
      const unknownEmail = await http()
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);

      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });
  });

  describe('GET /auth/profile', () => {
    it('rejects a request without a token with 401', async () => {
      await http().get('/auth/profile').expect(401);
    });

    it('rejects a garbage token with 401', async () => {
      await http()
        .get('/auth/profile')
        .set('Authorization', 'Bearer garbage')
        .expect(401);
    });

    it('returns the current user with a valid token', async () => {
      const { body } = await register().expect(201);

      const res = await http()
        .get('/auth/profile')
        .set('Authorization', `Bearer ${body.data.accessToken}`)
        .expect(200);

      expect(res.body.data).toEqual({ id: body.data.user.id, role: 'USER' });
    });
  });

  describe('POST /auth/refresh', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    it('rejects a request without a cookie with 401', async () => {
      await refresh().expect(401);
    });

    it('rejects a garbage cookie with 401', async () => {
      await refresh('refresh_token=garbage').expect(401);
    });

    it('rotates the refresh token and returns a new access token', async () => {
      const loginRes = await login().expect(200);
      const cookieA = refreshCookieOf(loginRes);

      const before = await prisma.session.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      const res = await refresh(cookieA).expect(200);
      const cookieB = refreshCookieOf(res);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(cookieB).not.toBe(cookieA);

      const after = await prisma.session.findUnique({
        where: { id: before!.id },
      });
      expect(after!.refreshTokenHash).not.toBe(before!.refreshTokenHash);

      await http()
        .get('/auth/profile')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);
    });

    it('revokes every session when an old refresh token is reused', async () => {
      const loginRes = await login().expect(200);
      const cookieA = refreshCookieOf(loginRes);

      const refreshRes = await refresh(cookieA).expect(200);
      const cookieB = refreshCookieOf(refreshRes);

      await refresh(cookieA).expect(401);
      await refresh(cookieB).expect(401);

      expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(
        0,
      );
    });
  });

  describe('POST /auth/logout', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    it('revokes the session and blocks further refreshes', async () => {
      const loginRes = await login().expect(200);
      const cookie = refreshCookieOf(loginRes);

      await http().post('/auth/logout').set('Cookie', cookie).expect(204);

      await refresh(cookie).expect(401);

      const revoked = await prisma.session.count({
        where: { revokedAt: { not: null } },
      });
      expect(revoked).toBe(1);
    });

    it('does not fail without a cookie', async () => {
      await http().post('/auth/logout').expect(204);
    });
  });
});
