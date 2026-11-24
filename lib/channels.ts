// Каналы привлечения клиентов и заявок. Новый канал — добавить сюда строку.
export const CHANNELS: Record<string, { label: string; color: string }> = {
  site: { label: 'Сайт', color: '#c4aa88' },
  avito: { label: 'Авито', color: '#3ab4ff' },
  crm: { label: 'Создана в CRM', color: '#9a9a9a' },
  telegram: { label: 'Telegram', color: '#5aa9e6' },
  phone: { label: 'Звонок', color: '#7fc28a' },
};
export const channelLabel = (c: string | null | undefined) => (c ? CHANNELS[c]?.label ?? c : '—');
