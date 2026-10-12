import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { User } from '../generated/prisma/client.js';

export type PublicUser = Pick<User, 'id' | 'email' | 'role' | 'createdAt'>;
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
  create(data: { name: string; email: string; passwordHash: string }) {
    return this.prisma.user.create({ data });
  }
  findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
