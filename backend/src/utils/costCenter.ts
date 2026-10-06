import { prisma } from '../config/db';
import { tag } from './costCenterMath';

export { tag };

export async function assertCenter(tenantId: string, costCenterId?: string | null) {
  const active = await prisma.costCenter.count({ where: { tenantId, status: 'ACTIVE' } });
  if (!active) return costCenterId || null;
  if (!costCenterId) {
    const error = new Error('اختر مركز التكلفة أو الفرع قبل الاعتماد') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  const row = await prisma.costCenter.findFirst({ where: { id: costCenterId, tenantId, status: 'ACTIVE' } });
  if (!row) {
    const error = new Error('مركز التكلفة غير موجود أو موقوف') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return row.id;
}
