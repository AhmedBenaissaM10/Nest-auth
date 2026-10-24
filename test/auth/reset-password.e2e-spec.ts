import * as argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailService } from '../../src/mail/mail.service.js';
import { RedisService } from '../../src/redis/redis.service.js';
import { refreshCookieOf, TEST_USER } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

const OLD_PASSWORD = TEST_USER.password;
const NEW_PASSWORD = 'Newpassword456';
const INVALID_CODE_MESSAGE = 'Invalid or expired code';

const otpKey = (email: string) => `otp:reset-password:${email}`;
const attemptsKey = (email: string) => `${otpKey(email)}:attempts`;

describe('POST /api/auth/reset-password (e2e)', () => {
  const mail = { sendOtp: vi.fn() };

  const t = useTestApp((builder) =>
    builder.overrideProvider(MailService).useValue(mail),
  );

  const email = TEST_USER.email;
  const redis = () => t.app.get(RedisService).client;
  const lastCode = () => mail.sendOtp.mock.calls.at(-1)![1] as string;
  const wrongCodeFor = (code: string) =>
    code === '000000' ? '111111' : '000000';

  const body = (code: string, overrides: Record<string, unknown> = {}) => ({
    email,
    code,
    newPassword: NEW_PASSWORD,
    ...overrides,
  });

  const signupAndRequestCode = async () => {
    await t.api.signup().expect(201);
    await t.api.forgotPassword({ email }).expect(200);
    return lastCode();
  };

  beforeEach(async () => {
    mail.sendOtp.mockReset();
    mail.sendOtp.mockResolvedValue(undefined);
    await redis().flushdb();
  });

  it('rejects invalid bodies with 400', async () => {
    const code = await signupAndRequestCode();

    await t.api.resetPassword({}).expect(400);
    await t.api.resetPassword({ code, newPassword: NEW_PASSWORD }).expect(400);
    await t.api.resetPassword({ email, newPassword: NEW_PASSWORD }).expect(400);
    await t.api.resetPassword({ email, code }).expect(400);
    await t.api
      .resetPassword(body(code, { email: 'not-an-email' }))
      .expect(400);
    await t.api.resetPassword(body(code, { role: 'ADMIN' })).expect(400);
  });

  it('rejects malformed codes with 400', async () => {
    await signupAndRequestCode();

    await t.api.resetPassword(body('12345')).expect(400);
    await t.api.resetPassword(body('1234567')).expect(400);
    await t.api.resetPassword(body('abcdef')).expect(400);
    await t.api.resetPassword(body(123456 as unknown as string)).expect(400);
  });

  it('rejects a short or too long new password with 400', async () => {
    const code = await signupAndRequestCode();

    await t.api.resetPassword(body(code, { newPassword: 'short' })).expect(400);
    await t.api
      .resetPassword(body(code, { newPassword: 'a'.repeat(129) }))
      .expect(400);

    // validation failures do not consume the code
    await t.api.resetPassword(body(code)).expect(200);
  });

  it('resets the password with a valid code', async () => {
    const code = await signupAndRequestCode();

    const res = await t.api.resetPassword(body(code)).expect(200);

    expect(res.body.data.message).toBe('Password has been reset successfully.');
  });

  it('stores the new password as an argon2 hash', async () => {
    const code = await signupAndRequestCode();
    const before = await t.prisma.user.findUnique({ where: { email } });

    await t.api.resetPassword(body(code)).expect(200);

    const after = await t.prisma.user.findUnique({ where: { email } });

    expect(after!.passwordHash).not.toBe(before!.passwordHash);
    expect(after!.passwordHash).not.toContain(NEW_PASSWORD);
    expect(await argon2.verify(after!.passwordHash!, NEW_PASSWORD)).toBe(true);
  });

  it('accepts the new password at login and rejects the old one', async () => {
    const code = await signupAndRequestCode();

    await t.api.resetPassword(body(code)).expect(200);

    await t.api.login({ password: OLD_PASSWORD }).expect(401);
    await t.api.login({ password: NEW_PASSWORD }).expect(200);
  });

  it('matches the email case-insensitively', async () => {
    const code = await signupAndRequestCode();

    await t.api
      .resetPassword(body(code, { email: email.toUpperCase() }))
      .expect(200);

    await t.api.login({ password: NEW_PASSWORD }).expect(200);
  });

  it('deletes the code after a successful reset, so it cannot be reused', async () => {
    const code = await signupAndRequestCode();

    await t.api.resetPassword(body(code)).expect(200);

    expect(await redis().exists(otpKey(email))).toBe(0);
    expect(await redis().exists(attemptsKey(email))).toBe(0);

    const res = await t.api
      .resetPassword(body(code, { newPassword: 'Anotherpassword789' }))
      .expect(400);

    expect(res.body.message).toBe(INVALID_CODE_MESSAGE);
    await t.api.login({ password: NEW_PASSWORD }).expect(200);
  });

  it('rejects a wrong code with 400 and changes nothing', async () => {
    const code = await signupAndRequestCode();

    const res = await t.api.resetPassword(body(wrongCodeFor(code))).expect(400);

    expect(res.body.message).toBe(INVALID_CODE_MESSAGE);
    expect(await redis().get(attemptsKey(email))).toBe('1');
    await t.api.login({ password: OLD_PASSWORD }).expect(200);
  });

  it('keeps the code valid after a single wrong attempt', async () => {
    const code = await signupAndRequestCode();

    await t.api.resetPassword(body(wrongCodeFor(code))).expect(400);
    await t.api.resetPassword(body(code)).expect(200);
  });

  it('invalidates the code after 5 wrong attempts, even for the correct code', async () => {
    const code = await signupAndRequestCode();

    for (let i = 0; i < 5; i++) {
      await t.api.resetPassword(body(wrongCodeFor(code))).expect(400);
    }

    const res = await t.api.resetPassword(body(code)).expect(400);

    expect(res.body.message).toBe(INVALID_CODE_MESSAGE);
    expect(await redis().exists(otpKey(email))).toBe(0);
    await t.api.login({ password: OLD_PASSWORD }).expect(200);
  });

  it('rejects when no code was requested', async () => {
    await t.api.signup().expect(201);

    const res = await t.api.resetPassword(body('123456')).expect(400);

    expect(res.body.message).toBe(INVALID_CODE_MESSAGE);
  });

  it('rejects an expired code', async () => {
    const code = await signupAndRequestCode();
    await redis().del(otpKey(email));

    const res = await t.api.resetPassword(body(code)).expect(400);

    expect(res.body.message).toBe(INVALID_CODE_MESSAGE);
    await t.api.login({ password: OLD_PASSWORD }).expect(200);
  });

  it('rejects a code that was issued for another email', async () => {
    const otherEmail = 'other@example.com';
    await t.api.signup().expect(201);
    await t.api.signup({ email: otherEmail }).expect(201);
    await t.api.forgotPassword({ email }).expect(200);
    const code = lastCode();

    const res = await t.api
      .resetPassword(body(code, { email: otherEmail }))
      .expect(400);

    expect(res.body.message).toBe(INVALID_CODE_MESSAGE);
    await t.api
      .login({ email: otherEmail, password: OLD_PASSWORD })
      .expect(200);
  });

  it('returns the same error for an unknown email as for a wrong code', async () => {
    await signupAndRequestCode();

    const unknown = await t.api
      .resetPassword(body('123456', { email: 'nobody@example.com' }))
      .expect(400);

    expect(unknown.body.message).toBe(INVALID_CODE_MESSAGE);
  });

  it('revokes every session after a successful reset', async () => {
    const signup = await t.api.signup().expect(201);
    const cookieA = refreshCookieOf(signup);
    const cookieB = refreshCookieOf(await t.api.login().expect(200));
    await t.api.forgotPassword({ email }).expect(200);

    await t.api.resetPassword(body(lastCode())).expect(200);

    await t.api.refresh(cookieA).expect(401);
    await t.api.refresh(cookieB).expect(401);
    expect(await t.prisma.session.count({ where: { revokedAt: null } })).toBe(
      0,
    );
  });

  it('lets an account without a password (Google sign-in) set one', async () => {
    const signup = await t.api.signup().expect(201);
    await t.prisma.user.update({
      where: { id: signup.body.data.user.id },
      data: { passwordHash: null },
    });
    await t.api.forgotPassword({ email }).expect(200);

    await t.api.resetPassword(body(lastCode())).expect(200);

    await t.api.login({ password: NEW_PASSWORD }).expect(200);
  });
});
