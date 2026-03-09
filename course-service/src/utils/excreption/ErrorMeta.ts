import { ErrorCode } from './ErrorCode'

// This is used to map Error to its metadata
export const ErrorMeta: Record<ErrorCode, { code: number; message: string }> = {
  [ErrorCode.VALIDATION_ERROR]: {
    code: 2001,
    message: 'Validation error'
  },

  [ErrorCode.INTERNAL_ERROR]: {
    code: 3001,
    message: 'Internal server error'
  }
}
