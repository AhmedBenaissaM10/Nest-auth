import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    description:
      'Current password, to confirm the deletion. Required for accounts that have a password.',
    example: 'StrongPass123',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password: string;
}
