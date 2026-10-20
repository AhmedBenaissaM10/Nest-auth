import { beforeEach, describe, expect, it } from 'vitest';
import { refreshCookieOf } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

describe('POST /api/auth/refresh (e2e)', () => {
  const t = useTestApp();

  beforeEach(async () => {
    await t.api.signup().expect(201);
  });

  it('rejects a request without a cookie with 401', async () => {
    await t.api.refresh().expect(401);
  });

  it('rejects a garbage cookie with 401', async () => {
    await t.api.refresh('refresh_token=garbage').expect(401);
  });

  it('rotates the refresh token and returns a new access token', async () => {
    const loginRes = await t.api.login().expect(200);
    const cookieA = refreshCookieOf(loginRes);

    const before = await t.prisma.session.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const res = await t.api.refresh(cookieA).expect(200);
    const cookieB = refreshCookieOf(res);

    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(cookieB).not.toBe(cookieA);

    const after = await t.prisma.session.findUnique({
      where: { id: before!.id },
    });
    expect(after!.refreshTokenHash).not.toBe(before!.refreshTokenHash);

    await t.api.me(res.body.data.accessToken).expect(200);
  });

  it('revokes every session when an old refresh token is reused', async () => {
    const loginRes = await t.api.login().expect(200);
    const cookieA = refreshCookieOf(loginRes);

    const refreshRes = await t.api.refresh(cookieA).expect(200);
    const cookieB = refreshCookieOf(refreshRes);

    await t.api.refresh(cookieA).expect(401);
    await t.api.refresh(cookieB).expect(401);

    expect(await t.prisma.session.count({ where: { revokedAt: null } })).toBe(
      0,
    );
  });
});
