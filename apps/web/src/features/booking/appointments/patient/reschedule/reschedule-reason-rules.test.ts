import { describe, expect, it } from 'vitest';
import {
  checkRescheduleReason,
  countReasonLength,
  normalizeRescheduleReason,
  REQUEST_REASON_LIMITS,
} from './reschedule-reason-rules';

// reschedule F2, mã ca WDH-28 [đề xuất]: luật ô lý do (hàm thuần). Viết ĐÚNG như `apps/api/src/appointments/reschedule/reschedule-reason.ts` (B5): NFC rồi cắt khoảng trắng ASCII hai đầu,
// độ dài đếm bằng ĐIỂM MÃ, không ký tự điều khiển trừ xuống dòng. Ký tự đặc biệt dựng bằng `String.fromCodePoint` để không phụ thuộc cách file được lưu.
const ACUTE = String.fromCodePoint(0x301);
const NBSP = String.fromCodePoint(0xa0);
const ZWJ = String.fromCodePoint(0x200d);
const NULL_CHAR = String.fromCodePoint(0);
const EMOJI = String.fromCodePoint(0x1f600);
const LIMITS = REQUEST_REASON_LIMITS;
const check = (text: string) => checkRescheduleReason(text, LIMITS);
const error = (text: string) => {
  const result = check(text);
  return result.ok ? null : result.error;
};

describe('luật ô lý do (WDH-28)', () => {
  it('WDH-28 giới hạn của yêu cầu đổi lịch là 5 đến 500 (như B5)', () => {
    expect(LIMITS).toEqual({ min: 5, max: 500 });
  });

  it.each([
    [4, 'tooShort'],
    [5, null],
    [6, null],
    [499, null],
    [500, null],
    [501, 'tooLong'],
  ])('WDH-28 biên: %i ký tự "a" ⇒ %s', (length, expected) => {
    expect(error('a'.repeat(length))).toBe(expected);
  });

  it('WDH-28 rỗng và chỉ khoảng trắng ASCII ⇒ quá ngắn (độ dài 0, không phải 5 ký tự trắng)', () => {
    for (const blank of ['', '     ', ' \t\n\r\f\v ', '\n\n\n\n\n\n']) {
      const result = check(blank);
      expect(result).toEqual({ ok: false, error: 'tooShort', length: 0 });
    }
  });

  it('WDH-28 đếm bằng điểm mã: 4 emoji là 4 (quá ngắn), 5 emoji là 5 (đủ), 500 emoji vừa đủ, 501 emoji quá dài', () => {
    expect(EMOJI.length).toBe(2);
    expect(error(EMOJI.repeat(4))).toBe('tooShort');
    expect(error(EMOJI.repeat(5))).toBeNull();
    expect(error(EMOJI.repeat(500))).toBeNull();
    expect(error(EMOJI.repeat(501))).toBe('tooLong');
  });

  it('WDH-28 chuẩn hoá NFC TRƯỚC khi đếm: 3 chữ có dấu rời chỉ là 3 điểm mã (quá ngắn), 251 chữ như vậy là 251 (đủ, dù thô là 502)', () => {
    const decomposed = `e${ACUTE}`;
    expect(error(decomposed.repeat(3))).toBe('tooShort');
    expect(error(decomposed.repeat(251))).toBeNull();
    const ok = check(decomposed.repeat(5));
    expect(ok).toEqual({ ok: true, value: 'é'.repeat(5) });
  });

  it('WDH-28 chỉ cắt khoảng trắng ASCII hai đầu; U+00A0 ở hai đầu KHÔNG bị cắt (cố ý không dùng String.trim)', () => {
    const text = `${NBSP}abc${NBSP}`;
    expect(error(text)).toBeNull();
    expect(check(text)).toEqual({ ok: true, value: text });
    expect(normalizeRescheduleReason(`  \tabc de\n `)).toBe('abc de');
    expect(countReasonLength(`${NBSP}abc`)).toBe(4);
  });

  it('WDH-28 kết quả hợp lệ là chữ ĐÃ chuẩn hoá (thứ sẽ gửi đi), khoảng trắng giữa chữ giữ nguyên', () => {
    expect(check('  Cần đổi vì có việc đột xuất \n')).toEqual({
      ok: true,
      value: 'Cần đổi vì có việc đột xuất',
    });
  });

  it('WDH-28 ký tự điều khiển bị chặn (Tab, NUL) và được báo TRƯỚC lỗi độ dài; xuống dòng và ZWJ thì được', () => {
    expect(error('abc\tdef')).toBe('control');
    expect(error(`abc${NULL_CHAR}def`)).toBe('control');
    expect(error(`${'a'.repeat(300)}\t${'a'.repeat(300)}`)).toBe('control');
    expect(error('dòng một\ndòng hai')).toBeNull();
    expect(error(`ab${ZWJ}cd${ZWJ}e`)).toBeNull();
  });

  it('WDH-28 giới hạn là tham số: 1 đến 255 (Lễ tân đổi hộ) khác 5 đến 500', () => {
    const proxy = { min: 1, max: 255 };
    expect(checkRescheduleReason('a', proxy)).toEqual({ ok: true, value: 'a' });
    expect(error('abcd')).toBe('tooShort');
    expect(checkRescheduleReason('', proxy)).toMatchObject({
      error: 'tooShort',
    });
    expect(checkRescheduleReason('a'.repeat(255), proxy).ok).toBe(true);
    expect(checkRescheduleReason('a'.repeat(256), proxy)).toMatchObject({
      error: 'tooLong',
    });
  });

  it('WDH-28 `countReasonLength` đếm chữ đã chuẩn hoá, điểm mã', () => {
    expect(countReasonLength('')).toBe(0);
    expect(countReasonLength('   ')).toBe(0);
    expect(countReasonLength(`  ${EMOJI}${EMOJI} `)).toBe(2);
    expect(countReasonLength(`e${ACUTE}e${ACUTE}`)).toBe(2);
  });
});
