import { Request } from 'express';
import { prisma } from '../config/db';

/** يسجّل العملية دون كلمات مرور أو رموز أو مفاتيح. الفشل هنا لا يوقف الطلب. */
export function audit(req: Request | null, entry: {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  resource?: string | null;
  result: 'OK' | 'DENIED';
}) {
  const ip = req?.ip ? String(req.ip).slice(0, 64) : null;
  prisma.auditLog.create({
    data: {
      tenantId: entry.tenantId || null,
      userId: entry.userId || null,
      action: entry.action.slice(0, 80),
      resource: entry.resource ? entry.resource.slice(0, 120) : null,
      result: entry.result,
      ip,
    },
  }).catch(() => {});
}
