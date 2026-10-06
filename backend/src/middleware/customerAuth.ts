import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';

export interface CustomerAuthPayload { customerId: string; leadId: string; scope: 'customer'; tokenVersion?: number }

declare global {
  namespace Express {
    interface Request { customerAuth?: CustomerAuthPayload }
  }
}

// توثيق العميل الذي لم يُفعَّل اشتراكه بعد — توكن منفصل (scope=customer) لا يفتح أي بيانات محاسبية.
export async function requireCustomerAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
  try {
    const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET as string) as CustomerAuthPayload;
    if (payload.scope !== 'customer') throw new Error('wrong scope');
    const row = await prisma.customerAccount.findUnique({ where: { id: payload.customerId }, select: { leadId: true, tokenVersion: true } });
    if (!row || row.leadId !== payload.leadId) throw new Error('stale');
    if ((payload.tokenVersion ?? 0) !== row.tokenVersion) throw new Error('stale');
    req.customerAuth = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة غير صالحة، سجّل الدخول من جديد' });
  }
}
