import { Controller, Get } from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';
import { PublicUser, UsersService } from './users.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/types/auth-user.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  findAll(): Promise<PublicUser[]> {
    return this.users.findAll();
  }
}
