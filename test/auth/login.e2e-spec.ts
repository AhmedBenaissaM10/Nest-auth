import { beforeEach, describe, expect, it } from 'vitest';
import { rawRefreshCookie } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

describe('POST /api/auth/login (e2e)', () => {
  const t = useTestApp();

  beforeEach(async () => {
    await t.api.signup().expect(201);
  });

  it('returns an access token and a refresh cookie', async () => {
    const res = await t.api.login().expect(200);

    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(rawRefreshCookie(res)).toContain('HttpOnly');
  });

  it('creates a new session per login', async () => {
    await t.api.login().expect(200);
    await t.api.login().expect(200);

    // 1 from signup + 2 from the logins
    expect(await t.prisma.session.count()).toBe(3);
  });

  it('rejects a wrong password with 401', async () => {
    await t.api.login({ password: 'wrong-password' }).expect(401);
  });

  it('returns the same error for an unknown email', async () => {
    const wrongPassword = await t.api
      .login({ password: 'wrong-password' })
      .expect(401);
    const unknownEmail = await t.api
      .login({ email: 'nobody@example.com' })
      .expect(401);

    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });

  it('rejects a missing password with 400', async () => {
    await t.api.login({ password: undefined }).expect(400);
  });
});
