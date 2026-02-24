import {
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { AppException } from '../excreption/AppException';
import { ErrorCode } from '../excreption/ErrorCode';

function formatErrors(
  errors: ValidationError[],
  parentPath = '',
) {
  return errors.flatMap(err => {
    const fieldPath = parentPath
      ? `${parentPath}.${err.property}`
      : err.property;

    const currentErrors = err.constraints
      ? [{
          field: fieldPath,
          errors: Object.values(err.constraints),
        }]
      : [];

    const childrenErrors = err.children?.length
      ? formatErrors(err.children, fieldPath)
      : [];

    return [...currentErrors, ...childrenErrors];
  });
}

export const AppValidationPipe = new ValidationPipe({
  whitelist: true, 
  forbidNonWhitelisted: true,
  transform: true,

  exceptionFactory: (errors: ValidationError[]) => {
    return new AppException(
      ErrorCode.VALIDATION_ERROR,
      true,
      'Validation failed',
      formatErrors(errors),
    );
  },

});
