export class ChapterItemGeneralDTO {
  id: string
  title: string
  status: string
  type: string
  sort_order: number
  duration?: number
  isFinished: boolean
  short_description?: string
  long_description?: string
  resources?: string[]
}
