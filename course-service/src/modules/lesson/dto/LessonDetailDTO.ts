export class LessonDetailDTO {
  id: string
  title: string
  status: string
  type: string
  short_description: string
  long_description: string
  sort_order: number
  duration?: number
  isFinished: boolean
  resources: string[]
}
