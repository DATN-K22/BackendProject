import { ErrorCode } from './ErrorCode';
import { ErrorMeta } from './ErrorMeta';

export class AppException extends Error {
  readonly code: number;
  readonly errorCode: ErrorCode;
  readonly isOperational: boolean;
  readonly details?: unknown;

  constructor(
    errorCode: ErrorCode,
    isOperational = true,
    message?: string,
    details?: unknown,
  ) {
    super(message ?? ErrorMeta[errorCode].message);
    this.errorCode = errorCode;
    this.code = ErrorMeta[errorCode].code;
    this.isOperational = isOperational;
    this.details = details;
  }
}
