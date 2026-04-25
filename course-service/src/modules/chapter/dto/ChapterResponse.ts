import { ChapterItemGeneralDTO } from './ChapterItemGeneralDTO'

export class ChapterResponse {
  id: string
  title: string
  short_description: string
  status: string
  sort_order: number
  lessons: ChapterItemGeneralDTO[]
}
