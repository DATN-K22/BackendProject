export interface MediaClient {
  getResourcesByChapterItemId(chapterItemId: string): Promise<any>
}
