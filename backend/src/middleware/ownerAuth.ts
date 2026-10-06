import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';

export interface OwnerAuthPayload {
  ownerId: string;
  email: string;
  scope: 'owner';
  tokenVersion?: number;
}

declare global {
  namespace Express {
    interface Request {
      ownerAuth?: OwnerAuthPayload;
    }
  }
}

// Deliberately separate from tenant requireAuth: an owner token and a tenant
// user token are never interchangeable, even if both are valid JWTs, because
// this middleware checks payload.scope === 'owner'.
export async function requireOwnerAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'الرجاء تسجيل الدخول كمالك للمنصة' });
  }
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as OwnerAuthPayload;
    if (payload.scope !== 'owner') throw new Error('wrong scope');
    const approved = String(process.env.OWNER_EMAIL || process.env.OWNER_SEED_EMAIL || '').trim().toLowerCase();
    if (!approved || String(payload.email).toLowerCase() !== approved) throw new Error('not the approved owner');
    const owner = await prisma.owner.findUnique({ where: { id: payload.ownerId }, select: { email: true, tokenVersion: true } });
    if (!owner || owner.email.toLowerCase() !== approved) throw new Error('not the approved owner');
    if ((payload.tokenVersion ?? 0) !== owner.tokenVersion) throw new Error('stale session');
    req.ownerAuth = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة غير صالحة' });
  }
}
