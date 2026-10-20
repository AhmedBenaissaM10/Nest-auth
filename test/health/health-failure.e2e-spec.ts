import { describe, expect, it } from 'vitest';
import { DatabaseHealthIndicator } from '../../src/health/database.health.js';
import { useTestApp } from '../helpers/use-test-app.js';

// Replaces the real database check: it always reports "down".
const unhealthyDatabase = {
  isHealthy: async (key: string) => ({
    [key]: { status: 'down', message: 'Database is not reachable' },
  }),
};

describe('Health checks when the database is down (e2e)', () => {
  const t = useTestApp((builder) =>
    builder
      .overrideProvider(DatabaseHealthIndicator)
      .useValue(unhealthyDatabase),
  );

  it('GET /health/ready returns 503 in the standard error format', async () => {
    const res = await t.api.http().get('/health/ready').expect(503);

    expect(res.body).toMatchObject({
      success: false,
      statusCode: 503,
      path: '/health/ready',
      method: 'GET',
    });
  });

  it('does not expose which check failed or why', async () => {
    const res = await t.api.http().get('/health/ready').expect(503);

    expect(res.body).not.toHaveProperty('details');
    expect(res.body).not.toHaveProperty('info');
    expect(res.body).not.toHaveProperty('error');
  });

  it('GET /health/live still returns 200, so the container is not restarted', async () => {
    const res = await t.api.http().get('/health/live').expect(200);

    expect(res.body.data.status).toBe('ok');
  });
});
