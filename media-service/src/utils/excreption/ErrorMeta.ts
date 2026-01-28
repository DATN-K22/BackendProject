import { ErrorCode } from './ErrorCode';

// This is used to map Error to its metadata
export const ErrorMeta: Record<
  ErrorCode,
  { code: number; message: string }
> = {
  [ErrorCode.USER_NOT_FOUND]: {
    code: 1001,
    message: 'User not found',
  },
  [ErrorCode.EMAIL_EXISTS]: {
    code: 1002,
    message: 'Email already exists',
  },
  [ErrorCode.VALIDATION_ERROR]: {
    code: 2001,
    message: 'Validation error',
  },
  [ErrorCode.INTERNAL_ERROR]: {
    code: 3001,
    message: 'Internal server error',
  },
  [ErrorCode.UNSUPORTED_FILE_TYPE]: {
    code: 4001,
    message: 'Unsupported file type',
  },
};
