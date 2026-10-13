import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Current password, to confirm the deletion.',
    example: 'StrongPass123',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
