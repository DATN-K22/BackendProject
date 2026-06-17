import { ChapterItemGeneralDTO } from './ChapterItemGeneralDTO'

export class ChapterResponse {
  id!: string
  title!: string
  status!: string
  sort_order!: number
  lessons!: ChapterItemGeneralDTO[]
}
