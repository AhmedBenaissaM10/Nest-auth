import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule {}
