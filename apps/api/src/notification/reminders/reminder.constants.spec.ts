import { fileURLToPath } from 'node:url';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';
import {
  REMINDER_CRON,
  REMINDER_JOB_NAME,
  REMINDER_LATE_WINDOW_MINUTES,
  REMINDER_MAX_ATTEMPTS,
  REMINDER_RETRY_GAP_MINUTES,
  REMINDER_STALE_APPOINTMENT,
} from './reminder.constants.js';
import { dueWindow } from './reminder.query.js';

// notification B3 — hằng và cửa sổ mốc, phần ĐƠN VỊ: NLH-19 (10 phút, 3 lần, 5 phút nằm MỘT chỗ, không đọc cấu hình hay `.env`), NLH-03 và NLH-04 (biên mốc và biên cửa sổ trễ của `dueWindow`;
// bản trên MySQL thật ở appointment-reminder.int-spec.ts).
const DIR = fileURLToPath(new URL('.', import.meta.url));
const code = listSourceFiles(DIR).map((file) => ({
  file,
  text: stripComments(readSource(file)),
}));
const NOW = new Date('2026-11-09T08:00:00+07:00');
const S = 1000;
const M = 60 * S;
const H = 60 * M;

/** Lịch có giờ hẹn `thoiGian` có mốc `soGio` đến hạn ở `now` không (đúng phép so khoảng đóng hai đầu của câu SQL). */
const due = (now: Date, soGio: number, thoiGian: Date): boolean => {
  const { from, to } = dueWindow(now, soGio);
  return thoiGian >= from && thoiGian <= to;
};

describe('NLH-19 hằng của nhắc lịch', () => {
  it('10 phút, 3 lần (gồm lần đầu), 5 phút; tên job và lịch mỗi phút', () => {
    expect(REMINDER_LATE_WINDOW_MINUTES).toBe(10);
    expect(REMINDER_MAX_ATTEMPTS).toBe(3);
    expect(REMINDER_RETRY_GAP_MINUTES).toBe(5);
    expect(REMINDER_STALE_APPOINTMENT).toBe('LICH_KHONG_CON_HIEU_LUC');
    expect(REMINDER_JOB_NAME).toBe('notification-appointment-reminder');
    expect(REMINDER_CRON).toMatch(/^\d{1,2} \* \* \* \* \*$/);
  });

  it('mã chạy của reminders/ không đọc `.env` (trừ NODE_ENV tắt job) và không tự viết lại các số 10, 3, 5 ngoài reminder.constants.ts', () => {
    expect(code.length).toBeGreaterThanOrEqual(6);
    for (const { file, text } of code) {
      for (const env of text.matchAll(/process\.env\.(\w+)/g))
        expect(env[1], file).toBe('NODE_ENV');
      if (file.endsWith('reminder.constants.ts')) continue;
      expect(text, file).not.toMatch(/\bREMINDER_\w+\s*=/);
      expect(text, file).not.toMatch(/\*\s*(?:10|5)\s*\*\s*60_?000/);
    }
  });
});

describe('NLH-03 biên mốc (mốc = giờ hẹn − 24 giờ)', () => {
  const thoiGian = new Date(NOW.getTime() + 24 * H);
  it('trước mốc 1 giây: chưa đến hạn; đúng mốc: đến hạn (đóng); sau mốc 1 giây: đến hạn', () => {
    expect(due(new Date(NOW.getTime() - S), 24, thoiGian)).toBe(false);
    expect(due(NOW, 24, thoiGian)).toBe(true);
    expect(due(new Date(NOW.getTime() + S), 24, thoiGian)).toBe(true);
  });

  it('mốc tính theo chiều TRƯỚC giờ hẹn: lịch đã qua 24 giờ không bao giờ đến hạn', () => {
    const past = new Date(NOW.getTime() - 24 * H);
    expect(due(NOW, 24, past)).toBe(false);
    expect(dueWindow(NOW, 24).to).toEqual(thoiGian);
  });
});

describe('NLH-04 biên cửa sổ trễ 10 phút', () => {
  const thoiGian = new Date(NOW.getTime() + 2 * H);
  it('mốc + 10 phút: còn đến hạn (đóng); mốc + 10 phút 1 giây: bỏ', () => {
    expect(due(new Date(NOW.getTime() + 10 * M), 2, thoiGian)).toBe(true);
    expect(due(new Date(NOW.getTime() + 10 * M + S), 2, thoiGian)).toBe(false);
    expect(dueWindow(NOW, 2)).toEqual({
      from: new Date(NOW.getTime() + 2 * H - 10 * M),
      to: thoiGian,
    });
  });
});
