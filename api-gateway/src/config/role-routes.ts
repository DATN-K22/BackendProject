// gateway/src/config/role-routes.ts

export type Role = 'admin' | 'teacher' | 'user';

export interface RoleRoute {
  path: RegExp;
  method: string; // 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' | '*'
  roles: Role[];
  description?: string;
}

export const roleRoutes: RoleRoute[] = [
  // ==========================================
  // COURSE SERVICE (/api/courses/*)
  // ==========================================

  // Xóa course → chỉ admin
  {
    path: /^\/api\/courses\/course\/[^/]+$/,
    method: 'DELETE',
    roles: ['admin'],
    description: 'Delete course',
  },

  // Tạo chapter, lesson, forum → admin + teacher
  {
    path: /^\/api\/courses\/chapters$/,
    method: 'POST',
    roles: ['admin', 'teacher'],
    description: 'Create chapter',
  },
  {
    path: /^\/api\/courses\/lessons$/,
    method: 'POST',
    roles: ['admin', 'teacher'],
    description: 'Create lesson',
  },
  {
    path: /^\/api\/courses\/forums$/,
    method: 'POST',
    roles: ['admin', 'teacher'],
    description: 'Create forum',
  },

  // Cập nhật / xóa chapter → admin + teacher
  {
    path: /^\/api\/courses\/chapters\/[^/]+$/,
    method: 'PATCH',
    roles: ['admin', 'teacher'],
    description: 'Update chapter',
  },
  {
    path: /^\/api\/courses\/chapters\/[^/]+$/,
    method: 'DELETE',
    roles: ['admin', 'teacher'],
    description: 'Delete chapter',
  },

  // Xóa lesson → admin + teacher
  {
    path: /^\/api\/courses\/lessons\/[^/]+$/,
    method: 'DELETE',
    roles: ['admin', 'teacher'],
    description: 'Delete lesson',
  },

  // Cập nhật / xóa forum → admin + teacher
  {
    path: /^\/api\/courses\/forums\/[^/]+$/,
    method: 'PATCH',
    roles: ['admin', 'teacher'],
    description: 'Update forum',
  },
  {
    path: /^\/api\/courses\/forums\/[^/]+$/,
    method: 'DELETE',
    roles: ['admin', 'teacher'],
    description: 'Delete forum',
  },

  // Xóa message → admin + teacher (mod forum)
  {
    path: /^\/api\/courses\/messages\/[^/]+$/,
    method: 'DELETE',
    roles: ['admin', 'teacher'],
    description: 'Delete message',
  },

  // ==========================================
  // IAM SERVICE (/api/users/*)
  // ==========================================

  // Schedule: mỗi user quản lý lịch của mình → ownership check tại service
  // Chỉ cần authenticated, không cần role check ở gateway

  // ==========================================
  // MEDIA SERVICE (/api/media/*)
  // ==========================================

  // Upload file / presigned URL → admin + teacher
  {
    path: /^\/api\/media\/files\/presigned-url\/.*$/,
    method: 'GET',
    roles: ['admin', 'teacher'],
    description: 'Get presigned URL',
  },
  {
    path: /^\/api\/media\/files$/,
    method: 'POST',
    roles: ['admin', 'teacher'],
    description: 'Save file record',
  },
  {
    path: /^\/api\/media\/files\/[^/]+$/,
    method: 'DELETE',
    roles: ['admin', 'teacher'],
    description: 'Delete file',
  },
];
