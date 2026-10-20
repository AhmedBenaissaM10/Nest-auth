import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { useTestApp } from '../helpers/use-test-app.js';

type HasHeaders = { headers: Record<string, unknown> };

const findCookie = (res: HasHeaders, name: string) =>
  ((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) =>
    c.startsWith(`${name}=`),
  );

describe('Google sign-in: start and state check (e2e)', () => {
  const t = useTestApp();

  const config = (key: string) =>
    t.app.get(ConfigService).getOrThrow<string>(key);

  const failureUrl = () => `${config('FRONTEND_URL')}/login?error=oauth_failed`;

  const start = () => t.api.http().get('/api/auth/google');

  const callback = (query: string, cookie?: string) => {
    const req = t.api.http().get(`/api/auth/google/callback${query}`);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('redirects to Google with the expected parameters', async () => {
    const res = await start().expect(302);
    const location = new URL(res.headers.location);

    expect(`${location.origin}${location.pathname}`).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('client_id')).toBe(
      config('GOOGLE_CLIENT_ID'),
    );
    expect(location.searchParams.get('redirect_uri')).toBe(
      config('GOOGLE_CALLBACK_URL'),
    );
    expect(location.searchParams.get('scope')).toContain('email');
    expect(location.searchParams.get('scope')).toContain('profile');
  });

  it('sets an httpOnly state cookie that matches the state parameter', async () => {
    const res = await start().expect(302);
    const location = new URL(res.headers.location);
    const cookie = findCookie(res, 'oauth_state');

    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/google');
    expect(cookie).toContain('Max-Age=600');

    const cookieValue = cookie!.split(';')[0].split('=')[1];
    expect(location.searchParams.get('state')).toBe(cookieValue);
    expect(cookieValue).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different state each time', async () => {
    const first = await start().expect(302);
    const second = await start().expect(302);

    expect(new URL(first.headers.location).searchParams.get('state')).not.toBe(
      new URL(second.headers.location).searchParams.get('state'),
    );
  });

  it('rejects a callback without the state cookie', async () => {
    const res = await callback('?code=x&state=abc').expect(302);

    expect(res.headers.location).toBe(failureUrl());
  });

  it('rejects a callback without a state parameter', async () => {
    const res = await callback('?code=x', 'oauth_state=abc').expect(302);

    expect(res.headers.location).toBe(failureUrl());
  });

  it.each([
    ['a different value of the same length', 'abd'],
    ['a value of a different length', 'abcdef'],
  ])('rejects a callback whose state is %s', async (_label, state) => {
    const res = await callback(
      `?code=x&state=${state}`,
      'oauth_state=abc',
    ).expect(302);

    expect(res.headers.location).toBe(failureUrl());
  });

  it('clears the state cookie even when the check fails', async () => {
    const res = await callback('?code=x&state=wrong', 'oauth_state=abc').expect(
      302,
    );

    const cleared = (
      (res.headers['set-cookie'] as unknown as string[]) ?? []
    ).find((c) => c.startsWith('oauth_state=;'));

    expect(cleared).toBeDefined();
    expect(cleared).toContain('Path=/api/auth/google');
  });

  it('creates no user, session or refresh cookie when the state is wrong', async () => {
    const res = await callback('?code=x&state=wrong', 'oauth_state=abc').expect(
      302,
    );

    expect(findCookie(res, 'refresh_token')).toBeUndefined();
    expect(await t.prisma.user.count()).toBe(0);
    expect(await t.prisma.session.count()).toBe(0);
  });

  it('redirects with a failure when the user denies consent', async () => {
    const res = await callback(
      '?error=access_denied&state=abc123',
      'oauth_state=abc123',
    ).expect(302);

    expect(res.headers.location).toBe(failureUrl());
    expect(findCookie(res, 'refresh_token')).toBeUndefined();
  });
});
