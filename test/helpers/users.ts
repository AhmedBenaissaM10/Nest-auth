import * as argon2 from 'argon2';
import { TEST_USER } from './auth.js';
import type { TestHarness } from './use-test-app.js';

export const ADMIN_USER = {
  name: 'Admin',
  email: 'admin@example.com',
  password: TEST_USER.password,
};

// There is no endpoint that creates an admin (on purpose), so the test inserts one
// directly in the database, then logs in through the real API.
export async function createAdminAndLogin(t: TestHarness) {
  const admin = await t.prisma.user.create({
    data: {
      name: ADMIN_USER.name,
      email: ADMIN_USER.email,
      passwordHash: await argon2.hash(ADMIN_USER.password),
      role: 'ADMIN',
    },
  });

  const res = await t.api
    .login({ email: ADMIN_USER.email, password: ADMIN_USER.password })
    .expect(200);

  return { token: res.body.data.accessToken as string, userId: admin.id };
}
