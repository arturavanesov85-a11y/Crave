// Простое ограничение частоты отправки форм (в памяти процесса).
const hits = new Map<string, number[]>();

export function allow(key: string, limit = 5, windowMs = 10 * 60000): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}
