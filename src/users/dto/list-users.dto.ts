import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client.js';

export class UserListItemDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f6c1c2e-8a1b-4d0e-9f3a-2b7c5d9e1a44',
  })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;
  @ApiProperty({ format: 'email', example: 'ahmed@example.com' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role', example: Role.USER })
  role: Role;

  @ApiProperty({ type: Date })
  createdAt: Date;
}
