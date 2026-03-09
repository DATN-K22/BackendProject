import { PartialType } from '@nestjs/swagger'
import { LessonDetailDTO } from './LessonDetailDTO'

export class LessonGeneralDTO extends PartialType(LessonDetailDTO) {}
