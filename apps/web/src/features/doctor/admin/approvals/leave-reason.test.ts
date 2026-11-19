import { LEAVE_REASON_PREVIEW_MAX, previewLeaveReason } from './leave-reason';

// doctor UX2 (G15; T5): cột "Lý do nghỉ" cắt chữ ở WEB, khoảng 80 ký tự. Đếm theo ĐIỂM MÃ (như server đếm lý do 2–500, Q25), nên emoji là 1 và không bao giờ bị cắt đôi.
// Mọi lý do dưới đây là chữ GIẢ.
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const points = (text: string) => Array.from(text).length;

describe('previewLeaveReason (cột Lý do nghỉ, doctor UX2)', () => {
  it('DUX2-20 ngưỡng là 80 điểm mã; lý do ngắn giữ nguyên, không cờ cắt, không "…"', () => {
    expect(LEAVE_REASON_PREVIEW_MAX).toBe(80);
    expect(previewLeaveReason('Việc gia đình đột xuất')).toEqual({
      text: 'Việc gia đình đột xuất',
      truncated: false,
    });
    expect(previewLeaveReason('ab')).toEqual({ text: 'ab', truncated: false });
  });

  it('DUX2-21 lý do dài 81 điểm mã bị cắt còn 80 điểm mã cộng "…" và có cờ cắt', () => {
    const reason = 'x'.repeat(81);

    const result = previewLeaveReason(reason);

    expect(result.truncated).toBe(true);
    expect(result.text).toBe(`${'x'.repeat(80)}…`);
  });

  it('DUX2-22 biên: 79 và đúng 80 điểm mã giữ nguyên, 81 mới cắt', () => {
    expect(previewLeaveReason('y'.repeat(79))).toEqual({
      text: 'y'.repeat(79),
      truncated: false,
    });
    expect(previewLeaveReason('y'.repeat(80))).toEqual({
      text: 'y'.repeat(80),
      truncated: false,
    });
    expect(previewLeaveReason('y'.repeat(81)).truncated).toBe(true);
  });

  it('DUX2-23 lý do dài đúng 500 điểm mã (tối đa của server) cũng chỉ còn 80 điểm mã cộng "…"', () => {
    const reason = Array.from({ length: 500 }, (_, i) =>
      String.fromCharCode(97 + (i % 26)),
    ).join('');

    const result = previewLeaveReason(reason);

    expect(result.truncated).toBe(true);
    expect(result.text).toBe(`${reason.slice(0, 80)}…`);
    expect(points(result.text)).toBe(81);
  });

  it('DUX2-24 cặp thay thế (emoji): đếm theo điểm mã, không cắt đôi một emoji ở biên 80', () => {
    // Điểm mã thứ 80 là emoji (2 đơn vị UTF-16): cắt bằng slice(0, 80) sẽ để lại nửa cặp
    const straddling = `${'a'.repeat(79)}🩺${'b'.repeat(5)}`;
    const cut = previewLeaveReason(straddling);
    expect(cut.truncated).toBe(true);
    expect(cut.text).toBe(`${'a'.repeat(79)}🩺…`);
    expect(LONE_SURROGATE.test(cut.text)).toBe(false);

    // Đúng 80 điểm mã nhưng 81 đơn vị UTF-16: KHÔNG được coi là dài quá
    const exactly80 = `${'a'.repeat(78)}🩺b`;
    expect(points(exactly80)).toBe(80);
    expect(exactly80.length).toBe(81);
    expect(previewLeaveReason(exactly80)).toEqual({
      text: exactly80,
      truncated: false,
    });
  });

  it('DUX2-25 biên rơi đúng vào dấu cách: bỏ khoảng trắng thừa trước "…" (không ra "x …")', () => {
    const reason = `${'a'.repeat(79)} ${'b'.repeat(10)}`;

    const result = previewLeaveReason(reason);

    expect(result.text).toBe(`${'a'.repeat(79)}…`);
  });

  it('DUX2-26 tiếng Việt có dấu (NFC): mỗi chữ là một điểm mã, phần giữ lại không đổi', () => {
    const reason =
      'Tôi xin nghỉ để đưa mẹ đi khám bệnh tại bệnh viện tuyến trên, ';
    const long = reason.repeat(3);
    expect(points(long)).toBeGreaterThan(80);

    const result = previewLeaveReason(long);

    expect(result.truncated).toBe(true);
    expect(result.text.startsWith(reason.slice(0, 60))).toBe(true);
    expect(points(result.text)).toBeLessThanOrEqual(81);
    expect(result.text.endsWith('…')).toBe(true);
    expect(result.text).toBe(result.text.normalize('NFC'));
  });

  it('DUX2-27 MỘT từ rất dài không dấu cách vẫn chỉ còn 80 điểm mã cộng "…"', () => {
    const result = previewLeaveReason('z'.repeat(500));

    expect(result).toEqual({ text: `${'z'.repeat(80)}…`, truncated: true });
  });

  it('DUX2-28 ký tự đặc biệt giữ NGUYÊN trong text (HTML, &, dấu nháy, xuống dòng); việc hiển thị như chữ thường là của thành phần', () => {
    const short = '<b>đậm</b> & "nháy" \'đơn\'\ndòng hai';
    expect(previewLeaveReason(short)).toEqual({
      text: short,
      truncated: false,
    });

    const long = `<b>${'x'.repeat(100)}</b> & \n`;
    const result = previewLeaveReason(long);
    expect(result.text).toBe(`<b>${'x'.repeat(77)}…`);
  });

  it('DUX2-29 hàm thuần: không đổi đầu vào, gọi hai lần cùng kết quả, chỉ MỘT dấu "…"', () => {
    const reason = 'q'.repeat(200);
    const copy = `${reason}`;

    const first = previewLeaveReason(reason);
    const second = previewLeaveReason(reason);

    expect(reason).toBe(copy);
    expect(second).toEqual(first);
    expect(first.text.match(/…/g)).toHaveLength(1);
    // Cắt rồi đưa kết quả cắt (81 điểm mã) vào lần nữa vẫn ổn định: chữ không đổi, không thêm "…" thứ hai
    expect(previewLeaveReason(first.text).text).toBe(first.text);
  });
});
