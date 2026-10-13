import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { Env } from '../config/env.js';
import { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshPayload, SessionMeta, TokenPair } from './types/tokens.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}
  async register(dto: RegisterDto, meta: SessionMeta) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });
    const tokens = await this.createSession(user, meta);
    return {
      user: this.toPublicUser(user),
      ...tokens,
    };
  }
  async login(dto: LoginDto, meta: SessionMeta) {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await argon2.verify(user.passwordHash, dto.password)))
      throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.createSession(user, meta);
    return {
      user: this.toPublicUser(user),
      ...tokens,
    };
  }
  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid session');
    }
    const tokens = await this.signTokens(session.user, session.id);
    const { count } = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: sha256(refreshToken),
        revokedAt: null,
      },
      data: { refreshTokenHash: sha256(tokens.refreshToken) },
    });
    if (count === 0) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Token reuse detected');
    }

    return tokens;
  }
  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    let payload: RefreshPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }
    await this.prisma.session.updateMany({
      where: { id: payload.sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    meta: SessionMeta,
  ): Promise<TokenPair> {
    const user = await this.users.findByIdOrThrow(userId);

    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current one',
      );
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return this.createSession(user, meta);
  }
  private async createSession(
    user: User,
    meta: SessionMeta,
  ): Promise<TokenPair> {
    const sid = randomUUID();
    const tokens = await this.signTokens(user, sid);
    await this.prisma.session.create({
      data: {
        id: sid,
        userId: user.id,
        refreshTokenHash: sha256(tokens.refreshToken),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return tokens;
  }
  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.users.findByIdOrThrow(userId);

    if (!(await argon2.verify(user.passwordHash, dto.password))) {
      throw new BadRequestException('Password is incorrect');
    }

    await this.users.delete(userId);
  }
  private async signTokens(user: User, sid: string): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, role: user.role },
        {
          secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
          expiresIn: ACCESS_TOKEN_TTL,
        },
      ),
      this.jwt.signAsync(
        { sub: user.id, sid },
        {
          secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
          expiresIn: REFRESH_TOKEN_TTL_SECONDS,
          jwtid: randomUUID(),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private toPublicUser(user: User) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
