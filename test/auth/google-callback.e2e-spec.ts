import { Logger, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthGuard } from '../../src/auth/guards/google-auth.guard.js';
import type { OAuthProfile } from '../../src/auth/types/oauth-profile.js';
import {
  rawRefreshCookie,
  refreshCookieOf,
  TEST_USER,
} from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

const GOOGLE_PROFILE: OAuthProfile = {
  provider: 'google',
  providerAccountId: 'google-123',
  email: 'google.user@example.com',
  name: 'Google User',
};

// What Google would have told us. The real guard is replaced by this fake,
// so these tests exercise our callback handler, service and database only.
let currentProfile: OAuthProfile | undefined;

const fakeGoogleGuard = {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = currentProfile;
    return true;
  },
};

describe('GET /api/auth/google/callback (e2e)', () => {
  const t = useTestApp((builder) =>
    builder.overrideGuard(GoogleAuthGuard).useValue(fakeGoogleGuard),
  );

  const frontendUrl = () =>
    t.app.get(ConfigService).getOrThrow<string>('FRONTEND_URL');

  const callback = () => t.api.http().get('/api/auth/google/callback');

  beforeEach(() => {
    currentProfile = { ...GOOGLE_PROFILE };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the user, opens a session, and redirects to the frontend', async () => {
    const res = await callback().expect(302);

    expect(res.headers.location).toBe(`${frontendUrl()}/auth/callback`);
    expect(res.headers.location).not.toContain('token');

    const cookie = rawRefreshCookie(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('SameSite=Strict');

    const user = await t.prisma.user.findUnique({
      where: { email: GOOGLE_PROFILE.email },
      include: { oauthAccounts: true },
    });

    expect(user).toMatchObject({
      name: 'Google User',
      role: 'USER',
      passwordHash: null,
    });
    expect(user!.oauthAccounts).toHaveLength(1);
    expect(user!.oauthAccounts[0]).toMatchObject({
      provider: 'google',
      providerAccountId: 'google-123',
    });
    expect(await t.prisma.session.count({ where: { userId: user!.id } })).toBe(
      1,
    );
  });

  it('gives the frontend a working session through the refresh cookie', async () => {
    const res = await callback().expect(302);

    const refreshRes = await t.api.refresh(refreshCookieOf(res)).expect(200);
    const profile = await t.api
      .getProfile(refreshRes.body.data.accessToken)
      .expect(200);

    expect(profile.body.data).toMatchObject({
      email: GOOGLE_PROFILE.email,
      name: 'Google User',
      role: 'USER',
    });
  });

  it('stores the email in lowercase', async () => {
    currentProfile = { ...GOOGLE_PROFILE, email: 'Google.User@Example.COM' };

    await callback().expect(302);

    expect(
      await t.prisma.user.findUnique({
        where: { email: 'google.user@example.com' },
      }),
    ).not.toBeNull();
  });

  it('logs a returning Google user into the same account', async () => {
    await callback().expect(302);
    const res = await callback().expect(302);

    expect(res.headers.location).toBe(`${frontendUrl()}/auth/callback`);
    expect(await t.prisma.user.count()).toBe(1);
    expect(await t.prisma.oAuthAccount.count()).toBe(1);
    expect(await t.prisma.session.count()).toBe(2);
  });

  it('finds a returning user by Google account id, not by email', async () => {
    await callback().expect(302);

    currentProfile = {
      ...GOOGLE_PROFILE,
      email: 'new.address@example.com',
      name: 'Renamed',
    };
    const res = await callback().expect(302);

    expect(res.headers.location).toBe(`${frontendUrl()}/auth/callback`);
    expect(await t.prisma.user.count()).toBe(1);

    // profile changes at Google are not synced (documented behavior)
    const user = await t.prisma.user.findFirstOrThrow();
    expect(user.email).toBe(GOOGLE_PROFILE.email);
    expect(user.name).toBe('Google User');
  });

  it('creates separate users for different Google accounts', async () => {
    await callback().expect(302);

    currentProfile = {
      provider: 'google',
      providerAccountId: 'google-456',
      email: 'second.user@example.com',
      name: 'Second User',
    };
    await callback().expect(302);

    expect(await t.prisma.user.count()).toBe(2);
    expect(await t.prisma.oAuthAccount.count()).toBe(2);
  });

  it('refuses to merge into an existing password account with the same email', async () => {
    await t.api.signup({ email: GOOGLE_PROFILE.email }).expect(201);

    const res = await callback().expect(302);

    expect(res.headers.location).toBe(
      `${frontendUrl()}/login?error=account_exists`,
    );

    const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(false);

    expect(await t.prisma.user.count()).toBe(1);
    expect(await t.prisma.oAuthAccount.count()).toBe(0);

    // the password account is untouched
    await t.api.login({ email: GOOGLE_PROFILE.email }).expect(200);
  });

  it('does not let a Google-only account log in with a password', async () => {
    await callback().expect(302);

    await t.api
      .login({
        email: GOOGLE_PROFILE.email,
        password: TEST_USER.password,
      })
      .expect(401);
  });

  it('does not let a Google-only account change its password', async () => {
    const res = await callback().expect(302);
    const { body } = await t.api.refresh(refreshCookieOf(res)).expect(200);

    await t.api
      .changePassword(body.data.accessToken, {
        currentPassword: 'anything123',
        newPassword: 'newpassword456',
      })
      .expect(400);
  });

  it('redirects with a failure and logs an unexpected error', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    currentProfile = undefined;

    const res = await callback().expect(302);

    expect(res.headers.location).toBe(
      `${frontendUrl()}/login?error=oauth_failed`,
    );
    expect(logSpy).toHaveBeenCalled();
    expect(await t.prisma.user.count()).toBe(0);
  });
});
