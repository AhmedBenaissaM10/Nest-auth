import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailService } from '../../src/mail/mail.service.js';
import { RedisService } from '../../src/redis/redis.service.js';
import { TEST_USER } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

const GENERIC_MESSAGE =
  'If an account exists for this email, a code has been sent.';

const otpKey = (email: string) => `otp:reset-password:${email}`;
const cooldownKey = (email: string) => `${otpKey(email)}:cooldown`;
const attemptsKey = (email: string) => `${otpKey(email)}:attempts`;
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('POST /api/auth/forgot-password (e2e)', () => {
  const mail = { sendOtp: vi.fn() };

  const t = useTestApp((builder) =>
    builder.overrideProvider(MailService).useValue(mail),
  );

  const redis = () => t.app.get(RedisService).client;
  const sentCode = (call = 0) => mail.sendOtp.mock.calls[call][1] as string;
  const email = TEST_USER.email;

  beforeEach(async () => {
    mail.sendOtp.mockReset();
    mail.sendOtp.mockResolvedValue(undefined);
    await redis().flushdb();
  });

  it('rejects invalid bodies with 400 and sends nothing', async () => {
    await t.api.forgotPassword({}).expect(400);
    await t.api.forgotPassword({ email: 'not-an-email' }).expect(400);
    await t.api.forgotPassword({ email: 12345 }).expect(400);
    await t.api.forgotPassword({ email, role: 'ADMIN' }).expect(400);

    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('returns 200 with the generic message for an existing account', async () => {
    await t.api.signup().expect(201);

    const res = await t.api.forgotPassword({ email }).expect(200);

    expect(res.body.data.message).toBe(GENERIC_MESSAGE);
  });

  it('sends a 6-digit code to the account email', async () => {
    await t.api.signup().expect(201);

    await t.api.forgotPassword({ email }).expect(200);

    expect(mail.sendOtp).toHaveBeenCalledTimes(1);
    expect(mail.sendOtp).toHaveBeenCalledWith(
      email,
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('stores only a hash of the code in Redis with a 10-minute TTL', async () => {
    await t.api.signup().expect(201);

    await t.api.forgotPassword({ email }).expect(200);

    const code = sentCode();
    const stored = await redis().get(otpKey(email));
    const ttl = await redis().ttl(otpKey(email));

    expect(stored).toBe(sha256(code));
    expect(stored).not.toBe(code);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('matches the email case-insensitively', async () => {
    await t.api.signup().expect(201);

    await t.api.forgotPassword({ email: email.toUpperCase() }).expect(200);

    expect(mail.sendOtp).toHaveBeenCalledWith(email, expect.any(String));
  });

  it('returns the same response for an unknown email and sends nothing', async () => {
    const res = await t.api
      .forgotPassword({ email: 'nobody@example.com' })
      .expect(200);

    expect(res.body.data.message).toBe(GENERIC_MESSAGE);
    expect(mail.sendOtp).not.toHaveBeenCalled();
    expect(await redis().exists(otpKey('nobody@example.com'))).toBe(0);
  });

  it('also sends a code to an account without a password (Google sign-in)', async () => {
    const signup = await t.api.signup().expect(201);
    await t.prisma.user.update({
      where: { id: signup.body.data.user.id },
      data: { passwordHash: null },
    });

    await t.api.forgotPassword({ email }).expect(200);

    expect(mail.sendOtp).toHaveBeenCalledTimes(1);
  });

  it('ignores a second request during the 60-second cooldown', async () => {
    await t.api.signup().expect(201);

    await t.api.forgotPassword({ email }).expect(200);
    const res = await t.api.forgotPassword({ email }).expect(200);

    const ttl = await redis().ttl(cooldownKey(email));

    expect(res.body.data.message).toBe(GENERIC_MESSAGE);
    expect(mail.sendOtp).toHaveBeenCalledTimes(1);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('issues a new code once the cooldown has passed', async () => {
    await t.api.signup().expect(201);

    await t.api.forgotPassword({ email }).expect(200);
    await redis().del(cooldownKey(email));
    await t.api.forgotPassword({ email }).expect(200);

    expect(mail.sendOtp).toHaveBeenCalledTimes(2);
    expect(await redis().get(otpKey(email))).toBe(sha256(sentCode(1)));
  });

  it('resets the wrong-attempts counter when a new code is issued', async () => {
    await t.api.signup().expect(201);

    await t.api.forgotPassword({ email }).expect(200);
    await redis().set(attemptsKey(email), '4');
    await redis().del(cooldownKey(email));
    await t.api.forgotPassword({ email }).expect(200);

    expect(await redis().exists(attemptsKey(email))).toBe(0);
  });

  it('still returns 200 and removes the code when sending fails', async () => {
    await t.api.signup().expect(201);
    mail.sendOtp.mockRejectedValue(new Error('SMTP down'));

    const res = await t.api.forgotPassword({ email }).expect(200);

    expect(res.body.data.message).toBe(GENERIC_MESSAGE);
    expect(await redis().exists(otpKey(email))).toBe(0);
  });
});
