import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { AppException } from 'src/utils/excreption/AppException';
import { ErrorCode } from 'src/utils/excreption/ErrorCode';

function formatErrors(errors: ValidationError[]) {
  return errors.map(err => ({
    field: err.property,
    errors: Object.values(err.constraints ?? {}),
  }));
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
