import { describe, expect, it } from 'vitest';
import { signInitDataForTest, verifyInitData } from '@/lib/telegram';

const TOKEN = '123456:TEST-token-for-unit-tests';
const now = Date.UTC(2026, 10, 13, 12, 0, 0);
const fields = (authDate = now / 1000) => ({
  auth_date: String(Math.floor(authDate)),
  query_id: 'AAE-test',
  user: JSON.stringify({ id: 777001, first_name: 'Иван', username: 'ivan_crave' }),
});

describe('подпись данных Telegram (initData)', () => {
  it('принимает данные, подписанные токеном бота', () => {
    const u = verifyInitData(signInitDataForTest(fields(), TOKEN), TOKEN, 86400, now);
    expect(u?.id).toBe(777001);
    expect(u?.username).toBe('ivan_crave');
  });

  it('отклоняет подделанные данные', () => {
    const data = signInitDataForTest(fields(), TOKEN).replace('777001', '777002');
    expect(verifyInitData(data, TOKEN, 86400, now)).toBeNull();
  });

  it('отклоняет подпись другого бота', () => {
    expect(verifyInitData(signInitDataForTest(fields(), 'other:token'), TOKEN, 86400, now)).toBeNull();
  });

  it('отклоняет устаревшие данные', () => {
    const old = signInitDataForTest(fields(now / 1000 - 2 * 86400), TOKEN);
    expect(verifyInitData(old, TOKEN, 86400, now)).toBeNull();
  });

  it('отклоняет пустые данные и пустой токен', () => {
    expect(verifyInitData('', TOKEN)).toBeNull();
    expect(verifyInitData(signInitDataForTest(fields(), TOKEN), '')).toBeNull();
  });
});
