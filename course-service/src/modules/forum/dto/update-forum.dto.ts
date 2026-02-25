import { PartialType, OmitType } from '@nestjs/swagger'
import { CreateForumDto } from './create-forum.dto'

export class UpdateForumDto extends PartialType(OmitType(CreateForumDto, ['course_id'] as const)) {}
