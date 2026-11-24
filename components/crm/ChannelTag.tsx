// Метка канала привлечения (Сайт, Авито, …) — цвета и названия в lib/channels.ts.
import { CHANNELS } from '@/lib/channels';

export function ChannelTag({ channel }: { channel: string | null | undefined }) {
  if (!channel) return null;
  const c = CHANNELS[channel];
  return <span className="tag" style={{ color: c?.color, borderColor: c ? `${c.color}66` : undefined, fontSize: 11, padding: '1px 7px' }}>{c?.label ?? channel}</span>;
}
