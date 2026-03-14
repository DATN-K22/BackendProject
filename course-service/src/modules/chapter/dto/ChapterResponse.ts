import { LessonGeneralDTO } from '../../lesson/dto/LessonGeneralDTO'

export class ChapterResponse {
  id: string
  title: string
  short_description: string
  status: string
  sort_order: number
  lessons: LessonGeneralDTO[]
}
