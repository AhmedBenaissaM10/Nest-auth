import { describe, expect, it } from 'vitest';
import { useTestApp } from '../helpers/use-test-app.js';

describe('GET /api/auth/me (e2e)', () => {
  const t = useTestApp();

  it('rejects a request without a token with 401', async () => {
    await t.api.me().expect(401);
  });

  it('rejects a garbage token with 401', async () => {
    await t.api.me('garbage').expect(401);
  });

  it('returns the id and role from a valid token', async () => {
    const { body } = await t.api.signup().expect(201);

    const res = await t.api.me(body.data.accessToken).expect(200);

    expect(res.body.data).toEqual({ id: body.data.user.id, role: 'USER' });
  });
});
