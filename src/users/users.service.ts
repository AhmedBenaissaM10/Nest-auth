import { Injectable } from '@nestjs/common';
import { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UserNotFoundException } from '../common/exceptions/NotFound/user-not-found.exception.js';

export type PublicUser = Pick<
  User,
  'id' | 'email' | 'name' | 'role' | 'createdAt'
>;
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
  async findByIdOrThrow(id: string) {
    const user = await this.findById(id);
    if (!user) throw new UserNotFoundException();
    return user;
  }
  create(data: { name: string; email: string; passwordHash: string }) {
    return this.prisma.user.create({ data });
  }
  findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async findProfileById(id: string): Promise<PublicUser> {
    const profile = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!profile) throw new UserNotFoundException();

    return profile;
  }
  async updateProfile(id: string, dto: UpdateProfileDto): Promise<PublicUser> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { name: dto.name },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) throw new UserNotFoundException();
      throw error;
    }
  }
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (this.isRecordNotFound(error)) throw new UserNotFoundException();
      throw error;
    }
  }
  async findByOAuthAccount(provider: string, providerAccountId: string) {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });

    return account?.user ?? null;
  }

  createWithOAuth(data: {
    email: string;
    name: string;
    provider: string;
    providerAccountId: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        oauthAccounts: {
          create: {
            provider: data.provider,
            providerAccountId: data.providerAccountId,
          },
        },
      },
    });
  }
  private isRecordNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2025'
    );
  }
}
