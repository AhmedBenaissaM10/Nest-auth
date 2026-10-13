import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'EvenStronger456' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
