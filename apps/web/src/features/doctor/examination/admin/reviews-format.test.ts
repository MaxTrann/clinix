import { describe, expect, it } from 'vitest';
import { formatSentDate, formatVisitStamp } from './reviews-format';

// doctor-exam F7, WKD-15 [đề xuất]: ngày giờ của màn Kiểm duyệt theo giờ Việt Nam (+07:00 cố định, KHÔNG theo múi giờ của máy). Chạy lại dưới `TZ=UTC` và `TZ=America/New_York` (PLAN 7.12): kết quả phải y hệt.
describe('doctor-exam F7 — định dạng giờ Việt Nam (WKD-15)', () => {
  it('WKD-15 ngày gửi `dd/MM/yyyy`: ví dụ của Figma `514:398`', () => {
    expect(formatSentDate('2026-05-28T03:00:00.000Z')).toBe('28/05/2026');
    expect(formatSentDate('2026-05-15T00:00:00.000Z')).toBe('15/05/2026');
  });

  it.each([
    // [ISO UTC, ngày gửi, giờ khám] ở biên 17:00Z (nửa đêm giờ Việt Nam)
    ['2026-12-31T16:59:59.000Z', '31/12/2026', '23:59 31/12/2026'],
    ['2026-12-31T17:00:00.000Z', '01/01/2027', '00:00 01/01/2027'],
    ['2026-06-10T17:30:00.000Z', '11/06/2026', '00:30 11/06/2026'],
    ['2028-02-28T17:00:00.000Z', '29/02/2028', '00:00 29/02/2028'],
    ['2027-02-28T17:00:00.000Z', '01/03/2027', '00:00 01/03/2027'],
    ['2026-06-11T02:30:00.000Z', '11/06/2026', '09:30 11/06/2026'],
  ])('WKD-15 %s ⇒ ngày gửi %s, giờ khám %s', (iso, sent, visit) => {
    expect(formatSentDate(iso)).toBe(sent);
    expect(formatVisitStamp(iso)).toBe(visit);
  });

  it.each([
    [''],
    ['28/05/2026'],
    ['2026-06-11'],
    ['2026-06-11 09:30'],
    ['không phải ngày'],
    ['2026-13-45T25:61:00.000Z'],
  ])('WKD-15 chuỗi không phải ISO "%s" ⇒ "—" (không in NaN)', (value) => {
    expect(formatSentDate(value)).toBe('—');
    expect(formatVisitStamp(value)).toBe('—');
  });
});
