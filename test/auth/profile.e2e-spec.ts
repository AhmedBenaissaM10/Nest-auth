import { describe, expect, it } from 'vitest';
import { TEST_USER } from '../helpers/auth.js';
import { useTestApp } from '../helpers/use-test-app.js';

// Hooks registered at the top of the file apply to both describe blocks,
// so the app boots once for this file.
const t = useTestApp();

const signupAndGetToken = async () => {
  const { body } = await t.api.signup().expect(201);

  return {
    token: body.data.accessToken as string,
    userId: body.data.user.id as string,
  };
};

describe('GET /api/auth/profile (e2e)', () => {
  it('rejects a request without a token with 401', async () => {
    await t.api.getProfile().expect(401);
  });

  it('rejects a garbage token with 401', async () => {
    await t.api.getProfile('garbage').expect(401);
  });

  it('returns the profile of the logged-in user', async () => {
    const { token, userId } = await signupAndGetToken();

    const res = await t.api.getProfile(token).expect(200);
    expect(res.body.data).toEqual({
      id: userId,
      email: TEST_USER.email,
      name: TEST_USER.name,
      role: 'USER',
      createdAt: res.body.data.createdAt,
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('reads the profile from the database, not from the token', async () => {
    const { token, userId } = await signupAndGetToken();

    await t.prisma.user.update({
      where: { id: userId },
      data: { name: 'Changed In Database' },
    });

    const res = await t.api.getProfile(token).expect(200);

    expect(res.body.data.name).toBe('Changed In Database');
  });

  it('returns 404 when the user no longer exists', async () => {
    const { token, userId } = await signupAndGetToken();
    await t.prisma.user.delete({ where: { id: userId } });

    const res = await t.api.getProfile(token).expect(404);

    expect(res.body.message).toBe('User not found');
  });
});

describe('PATCH /api/auth/profile (e2e)', () => {
  it('rejects a request without a token with 401', async () => {
    await t.api.updateProfile(undefined, { name: 'New Name' }).expect(401);
  });

  it('updates the name and returns the profile', async () => {
    const { token, userId } = await signupAndGetToken();

    const res = await t.api
      .updateProfile(token, { name: 'New Name' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      id: userId,
      email: TEST_USER.email,
      name: 'New Name',
      role: 'USER',
      createdAt: res.body.data.createdAt,
    });

    const inDb = await t.prisma.user.findUnique({ where: { id: userId } });
    expect(inDb!.name).toBe('New Name');
  });

  it('trims the name', async () => {
    const { token } = await signupAndGetToken();

    const res = await t.api
      .updateProfile(token, { name: '  Spaced Name  ' })
      .expect(200);

    expect(res.body.data.name).toBe('Spaced Name');
  });

  it('rejects an empty or whitespace-only name with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api.updateProfile(token, { name: '' }).expect(400);
    await t.api.updateProfile(token, { name: '   ' }).expect(400);
  });

  it('rejects a missing name with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api.updateProfile(token, {}).expect(400);
  });

  it('rejects a name that is not a string with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api.updateProfile(token, { name: 123 }).expect(400);
  });

  it('rejects a name longer than 100 characters with 400', async () => {
    const { token } = await signupAndGetToken();

    await t.api.updateProfile(token, { name: 'a'.repeat(101) }).expect(400);
  });

  it('rejects any other field (email, role) with 400 and changes nothing', async () => {
    const { token, userId } = await signupAndGetToken();

    await t.api.updateProfile(token, { name: 'Ok', role: 'ADMIN' }).expect(400);
    await t.api
      .updateProfile(token, { name: 'Ok', email: 'other@example.com' })
      .expect(400);

    const inDb = await t.prisma.user.findUnique({ where: { id: userId } });
    expect(inDb!.role).toBe('USER');
    expect(inDb!.email).toBe(TEST_USER.email);
    expect(inDb!.name).toBe(TEST_USER.name);
  });

  it('returns 404 when the user no longer exists', async () => {
    const { token, userId } = await signupAndGetToken();
    await t.prisma.user.delete({ where: { id: userId } });

    const res = await t.api.updateProfile(token, { name: 'Ghost' }).expect(404);

    expect(res.body.message).toBe('User not found');
  });

  it('shows the new name on the next GET', async () => {
    const { token } = await signupAndGetToken();

    await t.api.updateProfile(token, { name: 'Brand New' }).expect(200);
    const res = await t.api.getProfile(token).expect(200);

    expect(res.body.data.name).toBe('Brand New');
  });
});
