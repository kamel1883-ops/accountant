/** الجلسة صالحة فقط إذا كان المستخدم ما زال على نفس المنشأة ولم تُغيَّر كلمة مروره بعد إصدار التوكن. */
export function sessionStillValid(
  payload: { userId?: string; tenantId?: string; tokenVersion?: number },
  user: { id: string; tenantId: string; tokenVersion: number } | null,
): boolean {
  if (!user || !payload.userId || !payload.tenantId) return false;
  if (user.id !== payload.userId) return false;
  if (user.tenantId !== payload.tenantId) return false;
  if ((payload.tokenVersion ?? 0) !== user.tokenVersion) return false;
  return true;
}
