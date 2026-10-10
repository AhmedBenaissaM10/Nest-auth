export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface RefreshPayload {
  sub: string;
  sid: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
