// gateway/src/config/role-routes.ts

export type Role = 'Admin' | 'teacher' | 'User';

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

  // Xóa course → chỉ Admin
  {
    path: /^\/api\/courses\/course\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin'],
    description: 'Delete course',
  },

  // Tạo chapter, lesson, forum → Admin + teacher
  {
    path: /^\/api\/courses\/chapters$/,
    method: 'POST',
    roles: ['Admin', 'teacher'],
    description: 'Create chapter',
  },
  {
    path: /^\/api\/courses\/lessons$/,
    method: 'POST',
    roles: ['Admin', 'teacher'],
    description: 'Create lesson',
  },
  {
    path: /^\/api\/courses\/forums$/,
    method: 'POST',
    roles: ['Admin', 'teacher'],
    description: 'Create forum',
  },

  // Cập nhật / xóa chapter → Admin + teacher
  {
    path: /^\/api\/courses\/chapters\/[^/]+$/,
    method: 'PATCH',
    roles: ['Admin', 'teacher'],
    description: 'Update chapter',
  },
  {
    path: /^\/api\/courses\/chapters\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'teacher'],
    description: 'Delete chapter',
  },

  // Xóa lesson → Admin + teacher
  {
    path: /^\/api\/courses\/lessons\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'teacher'],
    description: 'Delete lesson',
  },

  // Cập nhật / xóa forum → Admin + teacher
  {
    path: /^\/api\/courses\/forums\/[^/]+$/,
    method: 'PATCH',
    roles: ['Admin', 'teacher'],
    description: 'Update forum',
  },
  {
    path: /^\/api\/courses\/forums\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'teacher'],
    description: 'Delete forum',
  },

  // Xóa message → Admin + teacher (mod forum)
  {
    path: /^\/api\/courses\/messages\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'teacher'],
    description: 'Delete message',
  },

  // ==========================================
  // IAM SERVICE (/api/Users/*)
  // ==========================================

  // Schedule: mỗi User quản lý lịch của mình → ownership check tại service
  // Chỉ cần authenticated, không cần role check ở gateway

  // ==========================================
  // MEDIA SERVICE (/api/media/*)
  // ==========================================

  // Upload file / presigned URL → Admin + teacher
  {
    path: /^\/api\/media\/files\/presigned-url\/.*$/,
    method: 'GET',
    roles: ['Admin', 'teacher'],
    description: 'Get presigned URL',
  },
  {
    path: /^\/api\/media\/files$/,
    method: 'POST',
    roles: ['Admin', 'teacher'],
    description: 'Save file record',
  },
  {
    path: /^\/api\/media\/files\/[^/]+$/,
    method: 'DELETE',
    roles: ['Admin', 'teacher'],
    description: 'Delete file',
  },
];
