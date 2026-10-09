import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import type { Request, Response } from 'express';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  data: T | null;
  path: string;
  method: string;
  timestamp: string;
}
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const http = context.switchToHttp();
    const request: Request = http.getRequest();
    const response: Response = http.getResponse();
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        statusCode: response.statusCode,
        data: data ?? null,
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
