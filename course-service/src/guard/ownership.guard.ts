import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'

// iam-service/src/guards/ownership.guard.ts
@Injectable()
export class OwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const userId = request.headers['x-user-id']
    const userRole = request.headers['x-user-role']
    const targetId = request.params.id

    // Admin bypass
    if (userRole === 'Admin') return true

    if (userId !== targetId) {
      throw new ForbiddenException('You can only access your own resource')
    }

    return true
  }
}
