import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AppException } from './AppException';
import { ErrorCode } from './ErrorCode';
import { ErrorMeta } from './ErrorMeta';
import { ApiResponse } from 'src/utils/dto/ApiResponse';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrorMeta[ErrorCode.INTERNAL_ERROR].code;
    let message = ErrorMeta[ErrorCode.INTERNAL_ERROR].message;
    let data: any = null;
    // 1. AppException (business error)
    if (exception instanceof AppException) {
      status = exception.isOperational
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.INTERNAL_SERVER_ERROR;

      code = exception.code;
      message = exception.message;
      data = exception.details ?? null;
    }

    // 2. HttpException (NestJS)
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = ErrorMeta[ErrorCode.VALIDATION_ERROR].code;

      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as any).message ?? exception.message;
    }

    // 3. Runtime error
    else if (exception instanceof Error) {
      console.error(exception);
    }

    const body: ApiResponse<any> = {
      success: false,
      code,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }
}
