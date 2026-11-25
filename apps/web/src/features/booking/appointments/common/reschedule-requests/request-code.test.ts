import { describe, expect, it } from 'vitest';
import { checkRequestCode, REQUEST_CODE_PATTERN } from './request-code';

// reschedule F4, WXD-45…WXD-48 (`[đề xuất]`): ô tìm theo MÃ LỊCH HẸN ĐẦY ĐỦ của danh sách yêu cầu. Web chặn sớm đúng như `normalizeAppointmentCode` và `APPOINTMENT_CODE_PATTERN` của máy chủ
// (cắt khoảng trắng bằng `trim()`, đổi `[a-z]` ASCII thành chữ hoa, mẫu `CLX-yyyyMMdd-XXXXX` với năm ký tự Crockford bỏ I, L, O, U); máy chủ vẫn là lưới an toàn (400 `MA_LICH_HEN_KHONG_HOP_LE`).
describe('luật ô tìm theo mã lịch hẹn', () => {
  it('WXD-45 mã đúng dạng dùng được, giữ nguyên', () => {
    expect(checkRequestCode('CLX-20261120-7K3M9')).toEqual({
      ok: true,
      code: 'CLX-20261120-7K3M9',
    });
  });

  it('WXD-45 chữ thường và khoảng trắng hai đầu được chuẩn hoá thành chữ hoa, đúng chữ sẽ gửi lên API', () => {
    expect(checkRequestCode('  clx-20261120-7k3m9 \n')).toEqual({
      ok: true,
      code: 'CLX-20261120-7K3M9',
    });
    // `String.prototype.trim()` như máy chủ: cắt cả khoảng không ngắt U+00A0
    expect(checkRequestCode('\u00a0CLX-20261120-7K3M9\u00a0')).toMatchObject({
      ok: true,
      code: 'CLX-20261120-7K3M9',
    });
  });

  it.each(['', '   ', '\t\n'])(
    'WXD-46 chuỗi rỗng hay toàn khoảng trắng %j ⇒ `empty` (nghĩa là bỏ bộ lọc, không phải lỗi)',
    (input) => {
      expect(checkRequestCode(input)).toEqual({ ok: false, error: 'empty' });
    },
  );

  it.each([
    'CLX-20261120-7K3M',
    'CLX-20261120-7K3M90',
    'CLX-2026112-7K3M9',
    'CLX-202611200-7K3M9',
    'CLX-20261120-7K3MI',
    'CLX-20261120-7K3ML',
    'CLX-20261120-7K3MO',
    'CLX-20261120-7K3MU',
    'CLX_20261120_7K3M9',
    'ABC-20261120-7K3M9',
    'CLX-20261120-7K3M9 thêm',
    'CLX 20261120 7K3M9',
    '7K3M9',
    // chữ số toàn chiều và chữ số Ả Rập: `\d` của JavaScript chỉ là 0-9
    'CLX-２０２６１１２０-7K3M9',
    'CLX-٢٠٢٦١١٢٠-7K3M9',
    'CLX-20261120-7K3M9\u200b',
  ])('WXD-46 %j sai dạng ⇒ `invalid`', (input) => {
    expect(checkRequestCode(input)).toEqual({ ok: false, error: 'invalid' });
  });

  it('WXD-47 chuẩn hoá CHỈ đổi `[a-z]` ASCII: `ſ` (U+017F) KHÔNG bị đổi thành `S` để lọt qua mẫu (như máy chủ)', () => {
    // `'ſ'.toUpperCase()` là 'S', một ký tự hợp lệ của mẫu: nếu web đổi nguyên chuỗi thì hai chuỗi khác nhau cùng ra một mã
    expect('ſ'.toUpperCase()).toBe('S');
    expect(checkRequestCode('CLX-20261120-ſK3M9')).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(checkRequestCode('CLX-20261120-7K3Mı')).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('WXD-48 mẫu khớp mẫu của máy chủ: đúng 5 ký tự Crockford, 8 chữ số, tiền tố CLX', () => {
    expect(REQUEST_CODE_PATTERN.source).toBe(
      '^CLX-\\d{8}-[0-9A-HJKMNP-TV-Z]{5}$',
    );
    for (const letter of 'ILOU') {
      expect(REQUEST_CODE_PATTERN.test(`CLX-20261120-0000${letter}`)).toBe(
        false,
      );
    }
    for (const letter of 'ABCDEFGHJKMNPQRSTVWXYZ0123456789') {
      expect(REQUEST_CODE_PATTERN.test(`CLX-20261120-0000${letter}`)).toBe(
        true,
      );
    }
  });
});
