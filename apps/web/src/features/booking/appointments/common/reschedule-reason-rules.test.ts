import { describe, expect, it } from 'vitest';
import {
  checkRescheduleReason,
  countReasonLength,
  normalizeRescheduleReason,
  REQUEST_REASON_LIMITS,
  STAFF_REASON_LIMITS,
} from './reschedule-reason-rules';
import { checkStatusReason } from './status-reason';

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

// reschedule F3, mã ca WDO-07 [đề xuất]: luật ô lý do của LỄ TÂN ĐỔI HỘ (đơn vị `utf16`). Máy chủ (`RequiredReason` của B7; TRACKING 1.15 mục A) cắt bằng `String.trim()` rồi đòi `length` 1 đến 255 đơn vị
// UTF-16: KHÔNG chuẩn hoá NFC, KHÔNG cấm ký tự điều khiển. Luật này phải KHỚP `checkStatusReason` (hộp Hủy của Lễ tân, cùng bộ `RequiredReason`): hai nơi không được lệch nhau.
const FEFF = String.fromCodePoint(0xfeff);
const STAFF = STAFF_REASON_LIMITS;
const staff = (text: string) => checkRescheduleReason(text, STAFF, 'utf16');
const staffError = (text: string) => {
  const result = staff(text);
  return result.ok ? null : result.error;
};

describe('luật ô lý do của Lễ tân đổi hộ, đơn vị UTF-16 (WDO-07)', () => {
  it('WDO-07 giới hạn của Lễ tân đổi hộ là 1 đến 255 (Q9, B7)', () => {
    expect(STAFF_REASON_LIMITS).toEqual({ min: 1, max: 255 });
  });

  it.each([
    [0, 'tooShort'],
    [1, null],
    [255, null],
    [256, 'tooLong'],
  ])('WDO-07 biên: %i đơn vị ⇒ %s', (count, expected) => {
    expect(staffError('a'.repeat(count))).toBe(expected);
  });

  it('WDO-07 đếm ĐƠN VỊ UTF-16, không đếm điểm mã: 127 biểu tượng và một chữ là 255 (qua), 128 biểu tượng là 256 (quá dài)', () => {
    expect(staff(`${EMOJI.repeat(127)}a`).ok).toBe(true);
    expect(staffError(EMOJI.repeat(128))).toBe('tooLong');
    expect(countReasonLength(EMOJI.repeat(128), 'utf16')).toBe(256);
    // đối chứng: luật điểm mã của Bệnh nhân coi 128 biểu tượng là 128
    expect(countReasonLength(EMOJI.repeat(128))).toBe(128);
  });

  it('WDO-07 KHÔNG chuẩn hoá NFC (máy chủ không chuẩn hoá): "é" dạng tổ hợp là 2 đơn vị, 127 lần qua và 128 lần bị chặn; chữ gửi đi đúng như đã gõ', () => {
    const decomposed = `e${ACUTE}`;
    expect(staff(decomposed.repeat(127))).toEqual({
      ok: true,
      value: decomposed.repeat(127),
    });
    expect(staffError(decomposed.repeat(128))).toBe('tooLong');
    expect(countReasonLength(decomposed.repeat(3), 'utf16')).toBe(6);
  });

  it('WDO-07 cắt bằng `trim()` của JavaScript: cả khoảng không ngắt (U+00A0) và BOM; toàn khoảng trắng ⇒ chưa đủ 1', () => {
    for (const blank of [
      '',
      ' ',
      '\n\r\n',
      `${NBSP}${NBSP}`,
      FEFF,
      ` ${NBSP}\t `,
    ]) {
      expect(staffError(blank), JSON.stringify(blank)).toBe('tooShort');
    }
    expect(staff(`${NBSP}Bận đột xuất${NBSP}`)).toEqual({
      ok: true,
      value: 'Bận đột xuất',
    });
    // luật Bệnh nhân cố ý KHÔNG cắt U+00A0 (đối chứng: hai luật khác nhau vì hai máy chủ khác nhau)
    expect(
      checkRescheduleReason(`${NBSP}abcde${NBSP}`, REQUEST_REASON_LIMITS),
    ).toMatchObject({
      ok: true,
      value: `${NBSP}abcde${NBSP}`,
    });
  });

  it('WDO-07 cắt TRƯỚC khi đếm; khoảng trắng ở giữa vẫn được đếm', () => {
    expect(staff(`  \n${'a'.repeat(255)}\t `)).toMatchObject({ ok: true });
    expect(staffError(`a${' '.repeat(254)}b`)).toBe('tooLong');
  });

  it('WDO-07 Tab và ký tự điều khiển KHÔNG bị chặn (máy chủ không cấm); luật Bệnh nhân vẫn chặn (đối chứng)', () => {
    expect(staff('Bệnh nhân\tbáo bận').ok).toBe(true);
    expect(staff(`a${NULL_CHAR}b`).ok).toBe(true);
    expect(error('abcde\tf')).toBe('control');
  });

  it('WDO-07 `countReasonLength` theo `utf16` là độ dài của chữ ĐÃ cắt', () => {
    expect(countReasonLength('', 'utf16')).toBe(0);
    expect(countReasonLength(`  ${NBSP}ab${NBSP} `, 'utf16')).toBe(2);
    expect(countReasonLength(`${EMOJI}${EMOJI}`, 'utf16')).toBe(4);
  });

  it('WDO-07 KHỚP `checkStatusReason` (hộp Hủy, cùng bộ RequiredReason) trên cùng kho chuỗi', () => {
    const corpus = [
      '',
      ' ',
      'a',
      'a'.repeat(255),
      'a'.repeat(256),
      `${EMOJI.repeat(127)}a`,
      EMOJI.repeat(128),
      `e${ACUTE}`.repeat(127),
      `e${ACUTE}`.repeat(128),
      `${NBSP}x${NBSP}`,
      NBSP,
      FEFF,
      `  \n${'b'.repeat(255)}\t `,
      `a${' '.repeat(254)}b`,
      'a\tb',
    ];
    for (const text of corpus) {
      const other = checkStatusReason(text);
      const mine = staff(text);
      expect(mine.ok, JSON.stringify(text)).toBe(other.ok);
      if (other.ok) {
        expect(mine).toMatchObject({ ok: true, value: other.value });
      } else {
        expect(staffError(text)).toBe(
          other.error === 'required' ? 'tooShort' : 'tooLong',
        );
      }
    }
  });
});
