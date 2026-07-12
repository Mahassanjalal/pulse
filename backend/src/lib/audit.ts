import { prisma } from './prisma';
import type { AuthUser } from '../middleware/auth';

/**
 * Append an entry to the admin audit log. Called from sensitive admin actions
 * (lock/unlock, role change, premium grant/revoke, coin adjustments, coin-package
 * CRUD, broadcast, content deletion) so every privileged change is traceable.
 */
export async function recordAudit(
  admin: AuthUser,
  action: string,
  targetType?: string,
  targetId?: string,
  detail?: unknown,
): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.id,
      adminName: admin.displayName || admin.username,
      action,
      targetType,
      targetId,
      detail: detail === undefined ? null : JSON.stringify(detail),
    },
  });
}
