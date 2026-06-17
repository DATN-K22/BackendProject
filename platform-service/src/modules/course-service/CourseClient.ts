export interface CourseClient {
  enrollUserInCourse(user_id: string, course_id: string): Promise<void>;
}
