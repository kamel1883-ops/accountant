import { Request, Response, NextFunction } from 'express';

// حدّ محاولات بسيط في الذاكرة (يكفي لسيرفر واحد): يمنع تخمين كلمات المرور وإغراق طلبات الاستعادة.
export function rateLimit(opts: { max: number; windowMs: number; key?: (req: Request) => string }) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const k = (opts.key ? opts.key(req) : '') + '|' + (req.ip || '');
    const now = Date.now();
    const h = hits.get(k);
    if (!h || h.reset < now) { hits.set(k, { n: 1, reset: now + opts.windowMs }); return next(); }
    if (++h.n > opts.max) return res.status(429).json({ error: 'محاولات كثيرة، حاول لاحقاً' });
    next();
  };
}
