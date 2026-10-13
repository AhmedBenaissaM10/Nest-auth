import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ErrorResponseDto,
  SuccessEnvelopeDto,
} from '../dto/api-envelope.dto.js';

interface EnvelopeOptions {
  status?: 200 | 201;
  isArray?: boolean;
  description?: string;
}

export const ApiEnvelope = (
  model: Type<unknown>,
  { status = 200, isArray = false, description }: EnvelopeOptions = {},
) => {
  const Response = status === 201 ? ApiCreatedResponse : ApiOkResponse;
  const ref = { $ref: getSchemaPath(model) };

  return applyDecorators(
    ApiExtraModels(SuccessEnvelopeDto, model),
    Response({
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(SuccessEnvelopeDto) },
          {
            properties: {
              data: isArray ? { type: 'array', items: ref } : ref,
            },
          },
        ],
      },
    }),
  );
};

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Validation failed',
  401: 'Missing, invalid or expired credentials',
  403: 'Not allowed for your role',
  404: 'User not found',
  409: 'Conflict',
  429: 'Too many requests',
  503: 'A dependency (database) is not reachable',
};

export const ApiErrors = (...statuses: number[]) =>
  applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'Error',
        type: ErrorResponseDto,
      }),
    ),
  );
