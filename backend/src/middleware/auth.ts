import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { sessionStillValid } from './sessionCheck';
import { audit } from '../utils/audit';

export interface TenantAuthPayload {
  userId: string;
  tenantId: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';
}

declare global {
  namespace Express {
    interface Request {
      auth?: TenantAuthPayload;
    }
  }
}

// Every request in tenant-space must carry a JWT that includes tenantId.
// This is what makes the system multi-tenant safe: every query downstream
// is filtered by req.auth.tenantId — a tenant can never see another tenant's data.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
  }
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as TenantAuthPayload & { scope?: string; tokenVersion?: number };
    if (payload.scope === 'customer' || payload.scope === 'owner') {
      return res.status(401).json({ error: 'جلسة غير صالحة، سجّل الدخول من جديد' });
    }
    if (!payload.tenantId || !payload.userId || !payload.role) {
      return res.status(401).json({ error: 'جلسة غير صالحة، سجّل الدخول من جديد' });
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, tenantId: true, role: true, tokenVersion: true },
    });
    if (!sessionStillValid(payload, user) || !user) {
      audit(req, { tenantId: payload.tenantId, userId: payload.userId, action: 'SESSION_REJECTED', result: 'DENIED' });
      return res.status(401).json({ error: 'جلسة غير صالحة، سجّل الدخول من جديد' });
    }
    req.auth = { userId: user.id, tenantId: user.tenantId, role: user.role };
    const sub = await prisma.subscription.findUnique({ where: { tenantId: payload.tenantId }, select: { status: true } });
    if (sub && (sub.status === 'SUSPENDED' || sub.status === 'EXPIRED' || sub.status === 'CANCELLED')) {
      const error = sub.status === 'SUSPENDED'
        ? 'تم إيقاف اشتراك المنشأة مؤقتاً. تواصل مع جداره لإعادة التفعيل.'
        : 'انتهى اشتراك المنشأة، تواصل مع جداره لتجديده';
      return res.status(402).json({ error });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة غير صالحة، سجّل الدخول من جديد' });
  }
}

export function requireRole(...roles: TenantAuthPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الإجراء' });
    }
    next();
  };
}
