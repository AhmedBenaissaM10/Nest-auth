import { describe, expect, it } from 'vitest';
import { useTestApp } from '../helpers/use-test-app.js';

describe('Health checks (e2e)', () => {
  const t = useTestApp();

  it('GET /health/live returns 200 without a token', async () => {
    const res = await t.api.http().get('/health/live').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /health/live checks no dependency', async () => {
    const res = await t.api.http().get('/health/live').expect(200);

    expect(res.body.data.info).toEqual({});
  });

  it('GET /health/ready returns 200 and reports the database as up', async () => {
    const res = await t.api.http().get('/health/ready').expect(200);

    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.info.database.status).toBe('up');
  });

  it('is not served under the /api prefix', async () => {
    await t.api.http().get('/api/health/live').expect(404);
    await t.api.http().get('/api/health/ready').expect(404);
  });

  it('does not leak connection details', async () => {
    const res = await t.api.http().get('/health/ready').expect(200);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('postgresql://');
    expect(serialized).not.toContain('postgres:postgres');
  });
});
