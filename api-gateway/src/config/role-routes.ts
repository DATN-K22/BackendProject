// gateway/src/config/role-routes.ts

export type Role = 'Admin' | 'Teacher' | 'User';

export interface RoleRoute {
  path: RegExp;
  method: string;
  roles: Role[];
  description?: string;
}

export const roleRoutes: RoleRoute[] = [
  // ==========================================
  // COURSE SERVICE (/api/courses/*)
  // ==========================================

  // ---------- COURSE ----------
  {
    path: /^\/api\/courses\/course\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'Teacher'],
    description: 'Delete course',
  },

  // ---------- CREATE (Admin + Teacher) ----------
  {
    path: /^\/api\/courses\/chapters$/,
    method: 'POST',
    roles: ['Admin', 'Teacher'],
    description: 'Create chapter',
  },
  {
    path: /^\/api\/courses\/lessons$/,
    method: 'POST',
    roles: ['Admin', 'Teacher'],
    description: 'Create lesson',
  },
  {
    path: /^\/api\/courses\/forums$/,
    method: 'POST',
    roles: ['Admin', 'Teacher'],
    description: 'Create forum',
  },
  {
    path: /^\/api\/courses\/quizzes$/,
    method: 'POST',
    roles: ['Admin', 'Teacher'],
    description: 'Create quiz',
  },
  {
    path: /^\/api\/courses\/labs$/,
    method: 'POST',
    roles: ['Admin', 'Teacher'],
    description: 'Create lab',
  },

  // ---------- CHAPTER ----------
  {
    path: /^\/api\/courses\/chapters\/[^/]+$/,
    method: 'PATCH',
    roles: ['Admin', 'Teacher'],
    description: 'Update chapter',
  },
  {
    path: /^\/api\/courses\/chapters\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'Teacher'],
    description: 'Delete chapter',
  },

  // ---------- LESSON ----------
  {
    path: /^\/api\/courses\/lessons\/[^/]+$/,
    method: 'PATCH',
    roles: ['Admin', 'Teacher'],
    description: 'Update lesson',
  },
  {
    path: /^\/api\/courses\/lessons\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'Teacher'],
    description: 'Delete lesson',
  },

  // ---------- QUIZ ----------
  {
    path: /^\/api\/courses\/quizzes\/[^/]+$/,
    method: 'PATCH',
    roles: ['Admin', 'Teacher'],
    description: 'Update quiz',
  },
  {
    path: /^\/api\/courses\/quizzes\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'Teacher'],
    description: 'Delete quiz',
  },

  // ---------- LAB ----------
  {
    path: /^\/api\/courses\/labs\/[^/]+$/,
    method: 'PATCH',
    roles: ['Admin', 'Teacher'],
    description: 'Update lab',
  },
  {
    path: /^\/api\/courses\/labs\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'Teacher'],
    description: 'Delete lab',
  },

  // ---------- FORUM ----------
  {
    path: /^\/api\/courses\/forums\/[^/]+$/,
    method: 'PATCH',
    roles: ['Admin', 'Teacher'],
    description: 'Update forum',
  },
  {
    path: /^\/api\/courses\/forums\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'Teacher'],
    description: 'Delete forum',
  },

  // ---------- MESSAGE (forum moderation) ----------
  {
    path: /^\/api\/courses\/messages\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'Teacher'],
    description: 'Delete message',
  },

  // ==========================================
  // IAM SERVICE (/api/users/*)
  // ==========================================

  // No role restriction at gateway (handled by ownership in service)

  // ==========================================
  // MEDIA SERVICE (/api/media/*)
  // ==========================================

  {
    path: /^\/api\/media\/files\/presigned-url\/.*$/,
    method: 'GET',
    roles: ['Admin', 'Teacher'],
    description: 'Get presigned URL',
  },
  {
    path: /^\/api\/media\/files$/,
    method: 'POST',
    roles: ['Admin', 'Teacher', 'User'],
    description: 'Save file record',
  },
  {
    path: /^\/api\/media\/files\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'Teacher'],
    description: 'Delete file',
  },
];
