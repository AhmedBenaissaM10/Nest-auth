import { describe, expect, it } from 'vitest';
import { TEST_USER } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';
import { ADMIN_USER, createAdminAndLogin } from '../helpers/users.js';

// If your list endpoint wraps the rows (for example { items, total }), change this one line.
const rowsOf = (body: { data: unknown }) =>
  body.data as Array<{ email: string }>;

describe('GET /api/users (e2e)', () => {
  const t = useTestApp();

  const signupAndGetToken = async () => {
    const res = await t.api.signup().expect(201);

    return {
      token: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  };

  it('rejects a request without a token with 401', async () => {
    await t.api.listUsers().expect(401);
  });

  it('rejects a garbage token with 401', async () => {
    await t.api.listUsers('garbage').expect(401);
  });

  it('rejects a normal user with 403', async () => {
    const { token } = await signupAndGetToken();

    const res = await t.api.listUsers(token).expect(403);

    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(403);
  });

  it('lets an admin list the users and never leaks secrets', async () => {
    await t.api.signup().expect(201);
    const { token } = await createAdminAndLogin(t);

    const res = await t.api.listUsers(token).expect(200);

    const emails = rowsOf(res.body).map((user) => user.email);
    expect(emails).toEqual(
      expect.arrayContaining([TEST_USER.email, ADMIN_USER.email]),
    );

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('refreshTokenHash');
  });

  it('uses the role stored in the token, so a promotion needs a new login', async () => {
    const { token, userId } = await signupAndGetToken();

    await t.prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
    });

    // the old token still says USER
    await t.api.listUsers(token).expect(403);

    // a new token says ADMIN
    const fresh = await t.api.login().expect(200);
    await t.api.listUsers(fresh.body.data.accessToken).expect(200);
  });

  it('keeps an admin token working after a demotion until it expires (known limit)', async () => {
    const { token, userId } = await createAdminAndLogin(t);

    await t.prisma.user.update({
      where: { id: userId },
      data: { role: 'USER' },
    });

    // Access tokens are stateless. If you later make JwtStrategy read the role
    // from the database, this test must expect 403 instead.
    await t.api.listUsers(token).expect(200);
  });
});
