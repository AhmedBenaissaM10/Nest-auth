import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TEST_USER } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';
import { ADMIN_USER, createAdminAndLogin } from '../helpers/users.js';

describe('GET /api/users/:id (e2e)', () => {
  const t = useTestApp();

  const signupAndGetToken = async () => {
    const res = await t.api.signup().expect(201);

    return {
      token: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  };

  it('rejects a request without a token with 401', async () => {
    const { userId } = await signupAndGetToken();

    await t.api.getUser(undefined, userId).expect(401);
  });

  it('rejects a normal user with 403, even for their own id', async () => {
    const { token, userId } = await signupAndGetToken();

    await t.api.getUser(token, userId).expect(403);
  });

  it('lets an admin read any user', async () => {
    const { userId } = await signupAndGetToken();
    const { token } = await createAdminAndLogin(t);

    const res = await t.api.getUser(token, userId).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: userId,
      email: TEST_USER.email,
      name: TEST_USER.name,
      role: 'USER',
    });
  });

  it('lets an admin read their own record', async () => {
    const { token, userId } = await createAdminAndLogin(t);

    const res = await t.api.getUser(token, userId).expect(200);

    expect(res.body.data).toMatchObject({
      id: userId,
      email: ADMIN_USER.email,
      role: 'ADMIN',
    });
  });

  it('never leaks secrets', async () => {
    const { userId } = await signupAndGetToken();
    const { token } = await createAdminAndLogin(t);

    const res = await t.api.getUser(token, userId).expect(200);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('refreshTokenHash');
  });

  it('returns 404 for a user that does not exist', async () => {
    const { token } = await createAdminAndLogin(t);

    const res = await t.api.getUser(token, randomUUID()).expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('User not found');
  });

  it('returns 404 for a user that was deleted', async () => {
    const { userId } = await signupAndGetToken();
    const { token } = await createAdminAndLogin(t);

    await t.prisma.user.delete({ where: { id: userId } });

    await t.api.getUser(token, userId).expect(404);
  });

  it('returns 403, not 404, to a normal user asking for an unknown id', async () => {
    const { token } = await signupAndGetToken();

    await t.api.getUser(token, randomUUID()).expect(403);
  });

  it('rejects an id that is not a UUID with 400', async () => {
    const { token } = await createAdminAndLogin(t);

    await t.api.getUser(token, 'not-a-uuid').expect(400);
  });
});
