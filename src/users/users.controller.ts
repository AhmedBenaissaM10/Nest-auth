import { Controller, Get, Param } from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';
import { PublicUser, UsersService } from './users.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/types/auth-user.js';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrors,
} from '../common/swagger/api-docs.decorator.js';
import { UserListItemDto } from './dto/list-users.dto.js';
import { PublicUserDto } from '../auth/dto/auth-response.dto.js';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'List all users (ADMIN only)' })
  @ApiEnvelope(UserListItemDto, { isArray: true })
  @ApiErrors(401, 403)
  findAll(): Promise<PublicUser[]> {
    return this.users.findAll();
  }
  @Roles(Role.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'user by id (ADMIN only)' })
  @ApiEnvelope(PublicUserDto, { isArray: false })
  @ApiErrors(401, 403, 404)
  findById(@Param('id') id: string) {
    return this.users.findById(id);
  }
}
