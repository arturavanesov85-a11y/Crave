// Подсказки для формы осмотра (CRM и мини-приложение).
import { db } from './db';

/** Подсказки из ранее введённых повреждений и заметок: сначала по этой машине, затем частые. */
export async function inspectionHints(vehicleId: string) {
  const [damages, notes] = await Promise.all([
    db.damage.findMany({ orderBy: { createdAt: 'desc' }, take: 300, select: { vehicleId: true, location: true, description: true } }),
    db.inspection.findMany({ where: { notes: { not: null } }, orderBy: { performedAt: 'desc' }, take: 200, select: { notes: true } }),
  ]);
  const rank = (items: { key: string; own: boolean }[], limit: number) => {
    const score = new Map<string, number>();
    for (const i of items) if (i.key) score.set(i.key, (score.get(i.key) ?? 0) + (i.own ? 5 : 1));
    return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
  };
  return {
    damageHints: rank(damages.map((d) => ({ key: d.description && d.description !== d.location ? `${d.location} — ${d.description}` : d.location, own: d.vehicleId === vehicleId })), 10),
    locationHints: rank(damages.map((d) => ({ key: d.location, own: d.vehicleId === vehicleId })), 30),
    descriptionHints: rank(damages.map((d) => ({ key: d.description, own: false })), 30),
    noteHints: rank(notes.map((n) => ({ key: (n.notes ?? '').trim().slice(0, 80), own: false })), 8),
  };
}
