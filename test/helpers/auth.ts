import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export const TEST_USER = {
  name: 'Ahmed',
  email: 'test@example.com',
  password: 'Password123',
};

type Overrides = Record<string, unknown>;
type HasHeaders = { headers: Record<string, unknown> };

export const rawRefreshCookie = (res: HasHeaders): string => {
  const cookies = res.headers['set-cookie'] as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('refresh_token cookie not found');
  return cookie;
};

export const refreshCookieOf = (res: HasHeaders): string =>
  rawRefreshCookie(res).split(';')[0];

export function authRequests(app: INestApplication) {
  const http = () => request(app.getHttpServer());

  return {
    http,

    // signup({ email: 'x' }) overrides one field; signup({ name: undefined }) removes it
    signup: (overrides: Overrides = {}) =>
      http()
        .post('/api/auth/signup')
        .send({ ...TEST_USER, ...overrides }),

    login: (overrides: Overrides = {}) =>
      http()
        .post('/api/auth/login')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password,
          ...overrides,
        }),

    refresh: (cookie?: string) => {
      const req = http().post('/api/auth/refresh');
      return cookie ? req.set('Cookie', cookie) : req;
    },

    logout: (cookie?: string) => {
      const req = http().post('/api/auth/logout');
      return cookie ? req.set('Cookie', cookie) : req;
    },

    me: (token?: string) => {
      const req = http().get('/api/auth/me');
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    },
    getProfile: (token?: string) => {
      const req = http().get('/api/auth/profile');
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    },
    updateProfile: (
      token: string | undefined,
      body: Record<string, unknown>,
    ) => {
      const req = http().patch('/api/auth/profile').send(body);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    },
    changePassword: (
      token: string | undefined,
      body: Record<string, unknown>,
    ) => {
      const req = http().post('/api/auth/change-password').send(body);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    },
    deleteAccount: (
      token: string | undefined,
      body: Record<string, unknown> = {},
    ) => {
      const req = http().delete('/api/auth/account').send(body);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    },
    listUsers: (token?: string, query: Record<string, unknown> = {}) => {
      const req = http().get('/api/users').query(query);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    },
    getUser: (token: string | undefined, id: string) => {
      const req = http().get(`/api/users/${id}`);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    },
  };
}
