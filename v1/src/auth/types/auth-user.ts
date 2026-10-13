import { Role } from '../../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  role: Role;
}
export interface JwtAccessPayload {
  sub: string;
  role: Role;
}
