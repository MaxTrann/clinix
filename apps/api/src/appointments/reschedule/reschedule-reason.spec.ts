import {
  REQUEST_REASON_FIELD_ERROR,
  REQUEST_REASON_MAX_LENGTH,
  REQUEST_REASON_MIN_LENGTH,
  isValidRequestReason,
  normalizeRequestReason,
} from './reschedule-reason.js';

// reschedule B5 — XDL-25 phần U `[đề xuất]` (PLAN reschedule 5.7, DLH-11): luật `lyDoYeuCau`, hàm THUẦN. 5 đến 500 ĐIỂM MÃ sau chuẩn hoá (NFC, cắt khoảng trắng ASCII hai đầu), không ký tự điều khiển
// trừ xuống dòng. Cùng nếp `visit-reason.rules.ts` của đặt lịch.
const ok = (value: string) =>
  isValidRequestReason(normalizeRequestReason(value));

describe('XDL-25 chuẩn hoá', () => {
  it('NFC: chữ có dấu viết rời ghép lại thành MỘT điểm mã', () => {
    // e + dấu mũ rời (U+0065 U+0302): viết bằng điểm mã để tệp không chứa ký tự tổ hợp thô
    const decomposed = String.fromCodePoint(0x65, 0x302);
    expect(normalizeRequestReason(decomposed)).toBe(String.fromCodePoint(0xea));
    expect(Array.from(normalizeRequestReason(decomposed))).toHaveLength(1);
  });

  it('cắt khoảng trắng ASCII hai đầu (dấu cách, tab, xuống dòng) nhưng KHÔNG cắt U+00A0 và không đụng khoảng trắng giữa chữ', () => {
    expect(normalizeRequestReason(' \t\n  cần đổi lịch  \r\n ')).toBe(
      'cần đổi lịch',
    );
    const nbsp = String.fromCodePoint(0xa0);
    expect(normalizeRequestReason(`${nbsp}cần đổi lịch${nbsp}`)).toBe(
      `${nbsp}cần đổi lịch${nbsp}`,
    );
    expect(normalizeRequestReason('cần  đổi\nlịch')).toBe('cần  đổi\nlịch');
  });

  it('chỉ khoảng trắng ⇒ chuỗi rỗng ⇒ không hợp lệ', () => {
    expect(normalizeRequestReason(' \t\n ')).toBe('');
    expect(ok(' \t\n ')).toBe(false);
  });
});

describe('XDL-25 độ dài tính bằng điểm mã (biên 4, 5, 500, 501)', () => {
  it('hằng số đúng PLAN: 5 đến 500', () => {
    expect(REQUEST_REASON_MIN_LENGTH).toBe(5);
    expect(REQUEST_REASON_MAX_LENGTH).toBe(500);
  });

  it.each([
    [4, false],
    [5, true],
    [6, true],
    [499, true],
    [500, true],
    [501, false],
  ])('%i ký tự ⇒ %s', (length, expected) => {
    expect(ok('a'.repeat(length))).toBe(expected);
  });

  it('đếm điểm mã, không đếm đơn vị UTF-16: 500 emoji (1000 đơn vị) hợp lệ, 501 emoji không; 4 emoji không đủ 5', () => {
    expect(ok('😀'.repeat(500))).toBe(true);
    expect(ok('😀'.repeat(501))).toBe(false);
    expect(ok('😀'.repeat(4))).toBe(false);
    expect(ok('😀'.repeat(5))).toBe(true);
  });

  it('độ dài tính SAU khi cắt: 4 chữ bao bởi khoảng trắng vẫn không đủ; 5 chữ bao bởi khoảng trắng đủ', () => {
    expect(ok('   abcd   ')).toBe(false);
    expect(ok('   abcde   ')).toBe(true);
  });

  it('tiếng Việt có dấu: 5 chữ có dấu đủ, ZWJ trong emoji ghép (loại Cf) không bị coi là điều khiển', () => {
    expect(ok('đổi ạ')).toBe(true);
    expect(ok('👨‍👩‍👧 cần đổi')).toBe(true);
  });
});

describe('XDL-25 ký tự điều khiển', () => {
  it('xuống dòng (\\n, \\r) ở giữa được phép', () => {
    expect(ok('dòng một\ndòng hai\r\nđoạn ba')).toBe(true);
  });

  it.each([
    ['tab', 'cần\tđổi lịch'],
    ['NUL', 'cần\u0000đổi lịch'],
    ['ESC', 'cần\u001bđổi lịch'],
    ['DEL', 'cần\u007fđổi lịch'],
    ['NEL (điều khiển C1)', 'cần\u0085đổi lịch'],
    ['form feed giữa chuỗi', 'cần\fđổi lịch'],
  ])('%s ở giữa ⇒ không hợp lệ', (_name, value) => {
    expect(ok(value)).toBe(false);
  });

  it('dạng CHƯA chuẩn hoá bị từ chối: isValid chỉ nhận kết quả của normalize', () => {
    expect(isValidRequestReason('  cần đổi lịch ')).toBe(false);
    const decomposed = String.fromCodePoint(0x65, 0x302);
    expect(isValidRequestReason(`${decomposed} cần đổi`)).toBe(false);
    expect(isValidRequestReason('cần đổi lịch')).toBe(true);
  });
});

describe('XDL-25 lỗi trường', () => {
  it('trường và mã ổn định cho DTO của B6', () => {
    expect(REQUEST_REASON_FIELD_ERROR).toStrictEqual({
      truong: 'lyDoYeuCau',
      ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE',
    });
  });
});
