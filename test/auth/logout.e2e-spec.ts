import { beforeEach, describe, expect, it } from 'vitest';
import { refreshCookieOf } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

describe('POST /api/auth/logout (e2e)', () => {
  const t = useTestApp();
  beforeEach(async () => {
    await t.api.signup().expect(201);
  });

  it('revokes the session and blocks further refreshes', async () => {
    const loginRes = await t.api.login().expect(200);
    const cookie = refreshCookieOf(loginRes);

    await t.api.logout(cookie).expect(204);
    await t.api.refresh(cookie).expect(401);

    const revoked = await t.prisma.session.count({
      where: { revokedAt: { not: null } },
    });
    expect(revoked).toBe(1);
  });

  it('does not fail without a cookie', async () => {
    await t.api.logout().expect(204);
  });
});
