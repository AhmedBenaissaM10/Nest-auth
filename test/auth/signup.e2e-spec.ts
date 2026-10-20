import { describe, expect, it } from 'vitest';
import {
  rawRefreshCookie,
  refreshCookieOf,
  TEST_USER,
} from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

describe('POST /api/auth/signup (e2e)', () => {
  const t = useTestApp();

  it('creates the user and returns an access token and a refresh cookie', async () => {
    const res = await t.api.signup().expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(TEST_USER.email);
    expect(res.body.data.user.name).toBe(TEST_USER.name);
    expect(res.body.data.user.role).toBe('USER');
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const cookie = rawRefreshCookie(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('stores a hashed refresh token, not the raw one', async () => {
    const res = await t.api.signup().expect(201);
    const rawToken = refreshCookieOf(res).split('=')[1];

    const session = await t.prisma.session.findFirst({
      where: { userId: res.body.data.user.id },
    });

    expect(session).not.toBeNull();
    expect(session!.refreshTokenHash).not.toBe(rawToken);
    expect(session!.revokedAt).toBeNull();
  });

  it('rejects a duplicate email with 409', async () => {
    await t.api.signup().expect(201);
    await t.api.signup().expect(409);
  });

  it('treats emails as case-insensitive', async () => {
    await t.api.signup().expect(201);
    await t.api.signup({ email: 'TEST@example.com' }).expect(409);
  });

  it('rejects an invalid email with 400', async () => {
    await t.api.signup({ email: 'not-an-email' }).expect(400);
  });

  it('rejects a short password with 400', async () => {
    await t.api.signup({ password: 'short' }).expect(400);
  });

  it('rejects a missing name with 400', async () => {
    await t.api.signup({ name: undefined }).expect(400);
  });

  it('rejects unknown fields (no role injection) with 400', async () => {
    await t.api.signup({ role: 'ADMIN' }).expect(400);

    expect(await t.prisma.user.count()).toBe(0);
  });
});
