export interface MediaClient {
  getResorcesByLessonId(lessonId: string): Promise<any>
}
