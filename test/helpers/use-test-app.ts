import { afterAll, beforeAll, beforeEach } from 'vitest';
import { authRequests } from './auth.js';
import {
  createTestApp,
  resetDatabase,
  type Customize,
  type TestContext,
} from './create-test-app.js';

export type TestHarness = TestContext & {
  api: ReturnType<typeof authRequests>;
};

// Call once at the top of a describe block (or at the top of the file).
// Pass a function to replace providers with fakes: (b) => b.overrideProvider(X).useValue(fake)
export function useTestApp(customize?: Customize): TestHarness {
  const t = {} as TestHarness;

  beforeAll(async () => {
    const { app, prisma } = await createTestApp(customize);
    t.app = app;
    t.prisma = prisma;
    t.api = authRequests(app);
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  afterAll(async () => {
    await t.app.close();
  });

  return t;
}
