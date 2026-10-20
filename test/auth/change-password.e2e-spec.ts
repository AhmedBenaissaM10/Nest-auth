import * as argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import {
  rawRefreshCookie,
  refreshCookieOf,
  TEST_USER,
} from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

const OLD_PASSWORD = TEST_USER.password;
const NEW_PASSWORD = 'newpassword456';

describe('POST /api/auth/change-password (e2e)', () => {
  const t = useTestApp();

  const signupAndGetToken = async () => {
    const res = await t.api.signup().expect(201);

    return {
      token: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
      cookie: refreshCookieOf(res),
    };
  };

  const validBody = {
    currentPassword: OLD_PASSWORD,
    newPassword: NEW_PASSWORD,
  };

  it('rejects a request without a token with 401', async () => {
    await t.api.changePassword(undefined, validBody).expect(401);
  });

  it('rejects a wrong current password with 400 and changes nothing', async () => {
    const { token } = await signupAndGetToken();

    const res = await t.api
      .changePassword(token, {
        currentPassword: 'wrong-password',
        newPassword: NEW_PASSWORD,
      })
      .expect(400);

    expect(res.body.message).toBe('Current password is incorrect');

    // nothing was revoked, and the old password still works
    expect(await t.prisma.session.count({ where: { revokedAt: null } })).toBe(
      1,
    );
    await t.api.login().expect(200);
  });

  it('rejects a new password equal to the current one with 400', async () => {
    const { token } = await signupAndGetToken();

    const res = await t.api
      .changePassword(token, {
        currentPassword: OLD_PASSWORD,
        newPassword: OLD_PASSWORD,
      })
      .expect(400);

    expect(res.body.message).toBe(
      'New password must be different from the current one',
    );
  });

  it('rejects a short new password with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api
      .changePassword(token, { ...validBody, newPassword: 'short' })
      .expect(400);
  });

  it('rejects a new password longer than 128 characters with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api
      .changePassword(token, { ...validBody, newPassword: 'a'.repeat(129) })
      .expect(400);
  });

  it('rejects missing fields with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api.changePassword(token, {}).expect(400);
    await t.api
      .changePassword(token, { newPassword: NEW_PASSWORD })
      .expect(400);
    await t.api
      .changePassword(token, { currentPassword: OLD_PASSWORD })
      .expect(400);
  });

  it('rejects passwords that are not strings with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api
      .changePassword(token, {
        currentPassword: 123456789,
        newPassword: 987654321,
      })
      .expect(400);
  });

  it('rejects unknown fields with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api
      .changePassword(token, { ...validBody, role: 'ADMIN' })
      .expect(400);
  });

  it('returns a new access token and a new refresh cookie', async () => {
    const { token, cookie } = await signupAndGetToken();

    const res = await t.api.changePassword(token, validBody).expect(200);

    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const newRawCookie = rawRefreshCookie(res);
    expect(newRawCookie).toContain('HttpOnly');
    expect(newRawCookie).toContain('Path=/api/auth');
    expect(refreshCookieOf(res)).not.toBe(cookie);

    await t.api.me(res.body.data.accessToken).expect(200);
  });

  it('stores the new password as an argon2 hash', async () => {
    const { token, userId } = await signupAndGetToken();
    const before = await t.prisma.user.findUnique({ where: { id: userId } });

    await t.api.changePassword(token, validBody).expect(200);

    const after = await t.prisma.user.findUnique({ where: { id: userId } });

    expect(after!.passwordHash).not.toBe(before!.passwordHash);
    expect(after!.passwordHash).not.toContain(NEW_PASSWORD);
    expect(await argon2.verify(after!.passwordHash!, NEW_PASSWORD)).toBe(true);
  });

  it('accepts the new password at login and rejects the old one', async () => {
    const { token } = await signupAndGetToken();

    await t.api.changePassword(token, validBody).expect(200);

    await t.api.login({ password: OLD_PASSWORD }).expect(401);
    await t.api.login({ password: NEW_PASSWORD }).expect(200);
  });

  it('revokes every other session and keeps only the new one', async () => {
    const { token, cookie: cookieA } = await signupAndGetToken();
    const cookieB = refreshCookieOf(await t.api.login().expect(200));

    const res = await t.api.changePassword(token, validBody).expect(200);
    const cookieC = refreshCookieOf(res);

    await t.api.refresh(cookieA).expect(401);
    await t.api.refresh(cookieB).expect(401);
    await t.api.refresh(cookieC).expect(200);

    expect(await t.prisma.session.count({ where: { revokedAt: null } })).toBe(
      1,
    );
  });

  it('returns 400 for an account without a password (Google sign-in)', async () => {
    const { token, userId } = await signupAndGetToken();
    await t.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: null },
    });

    const res = await t.api.changePassword(token, validBody).expect(400);

    expect(res.body.message).toContain('no password');
  });

  it('returns 404 when the user no longer exists', async () => {
    const { token, userId } = await signupAndGetToken();
    await t.prisma.user.delete({ where: { id: userId } });

    const res = await t.api.changePassword(token, validBody).expect(404);

    expect(res.body.message).toBe('User not found');
  });
});
