export interface MediaClient {
  getResourcesByChapterItemId(chapterItemId: string): Promise<any>
  getResorcesByLessonId(lessonId: string): Promise<any>
}
