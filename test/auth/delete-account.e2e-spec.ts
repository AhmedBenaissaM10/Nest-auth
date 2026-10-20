import { describe, expect, it } from 'vitest';
import { refreshCookieOf, TEST_USER } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

describe('DELETE /api/auth/account (e2e)', () => {
  const t = useTestApp();

  const signupAndGetToken = async (overrides: Record<string, unknown> = {}) => {
    const res = await t.api.signup(overrides).expect(201);

    return {
      token: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
      cookie: refreshCookieOf(res),
    };
  };

  const correctPassword = { password: TEST_USER.password };

  it('rejects a request without a token with 401', async () => {
    await t.api.deleteAccount(undefined, correctPassword).expect(401);
  });

  it('rejects a wrong password with 400 and keeps the user', async () => {
    const { token } = await signupAndGetToken();

    const res = await t.api
      .deleteAccount(token, { password: 'wrong-password' })
      .expect(400);

    expect(res.body.message).toBe('Password is incorrect');
    expect(await t.prisma.user.count()).toBe(1);
    expect(await t.prisma.session.count()).toBe(1);
  });

  it('rejects a missing password for an account that has one', async () => {
    const { token } = await signupAndGetToken();

    const res = await t.api.deleteAccount(token, {}).expect(400);

    expect(res.body.message).toBe('Password is incorrect');
    expect(await t.prisma.user.count()).toBe(1);
  });

  it('rejects an empty or non-string password with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api.deleteAccount(token, { password: '' }).expect(400);
    await t.api.deleteAccount(token, { password: 123456789 }).expect(400);

    expect(await t.prisma.user.count()).toBe(1);
  });

  it('rejects unknown fields with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api
      .deleteAccount(token, { ...correctPassword, force: true })
      .expect(400);

    expect(await t.prisma.user.count()).toBe(1);
  });

  it('deletes the user, clears the cookie and blocks login and refresh', async () => {
    const { token, userId, cookie } = await signupAndGetToken();

    const res = await t.api.deleteAccount(token, correctPassword).expect(204);

    const cleared = res.headers['set-cookie'][0] as string;

    expect(cleared).toBeDefined();
    expect(cleared).toContain('Path=/api/auth');
    expect(cleared).toContain('refresh_token=;');

    expect(
      await t.prisma.user.findUnique({ where: { id: userId } }),
    ).toBeNull();
    expect(await t.prisma.session.count()).toBe(0);

    await t.api.login().expect(401);
    await t.api.refresh(cookie).expect(401);
  });

  it('removes the sessions of every device', async () => {
    const { token } = await signupAndGetToken();
    await t.api.login().expect(200);
    expect(await t.prisma.session.count()).toBe(2);

    await t.api.deleteAccount(token, correctPassword).expect(204);

    expect(await t.prisma.session.count()).toBe(0);
  });

  it('leaves other users untouched', async () => {
    const { token } = await signupAndGetToken();
    await signupAndGetToken({ email: 'other@example.com' });

    await t.api.deleteAccount(token, correctPassword).expect(204);

    expect(await t.prisma.user.count()).toBe(1);
    expect(await t.prisma.session.count()).toBe(1);
    expect(
      await t.prisma.user.findUnique({ where: { email: 'other@example.com' } }),
    ).not.toBeNull();
  });

  it('deletes a Google-only account without a password and removes its OAuth link', async () => {
    const { token, userId } = await signupAndGetToken();
    await t.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: null,
        oauthAccounts: {
          create: { provider: 'google', providerAccountId: 'google-123' },
        },
      },
    });

    await t.api.deleteAccount(token).expect(204);

    expect(await t.prisma.user.count()).toBe(0);
    expect(await t.prisma.oAuthAccount.count()).toBe(0);
  });

  it('returns 404 when the account is already deleted', async () => {
    const { token } = await signupAndGetToken();

    await t.api.deleteAccount(token, correctPassword).expect(204);
    const res = await t.api.deleteAccount(token, correctPassword).expect(404);

    expect(res.body.message).toBe('User not found');
  });
});
