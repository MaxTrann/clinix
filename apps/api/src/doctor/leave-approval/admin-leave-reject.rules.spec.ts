import { normalizeRejectReason } from './admin-leave-reject.rules.js';

// Dựng bằng mã điểm (không gõ trực tiếp): trình soạn thảo hay công cụ định dạng có thể tự đổi dạng chuỗi, làm ca NFC mất tác dụng.
const NBSP = String.fromCodePoint(0x00a0);
const COMPOSED_E = String.fromCodePoint(0x00e9);
const DECOMPOSED_E = String.fromCodePoint(0x0065, 0x0301);

// Doctor B14 — luật thuần của lý do từ chối (Q27c): PD-04 (phần đơn vị).
describe('normalizeRejectReason (PD-04)', () => {
  it('nhận 1 ký tự và đúng 255 ký tự (biên)', () => {
    expect(normalizeRejectReason('a')).toBe('a');
    expect(normalizeRejectReason('a'.repeat(255))).toBe('a'.repeat(255));
  });

  it('256 ký tự ⇒ null (biên trên)', () => {
    expect(normalizeRejectReason('a'.repeat(256))).toBeNull();
  });

  it('thiếu, không phải chuỗi, rỗng hoặc chỉ khoảng trắng ASCII ⇒ null', () => {
    for (const bad of [
      undefined,
      null,
      42,
      {},
      ['x'],
      true,
      '',
      '   ',
      '\t\n\r',
    ])
      expect(normalizeRejectReason(bad)).toBeNull();
  });

  it('cắt khoảng trắng ASCII hai đầu nhưng giữ khoảng trắng ở giữa; không cắt khoảng trắng Unicode', () => {
    expect(normalizeRejectReason('  Trùng lịch mổ \n')).toBe('Trùng lịch mổ');
    // No-break space (U+00A0) không phải khoảng trắng ASCII nên vẫn là một ký tự (giống lý do xin nghỉ, Q25).
    expect(normalizeRejectReason(NBSP)).toBe(NBSP);
  });

  it('chuẩn hoá NFC: "e" + dấu sắc rời đếm là 1 ký tự, và 255 ký tự dạng tổ hợp vẫn hợp lệ', () => {
    expect(normalizeRejectReason(DECOMPOSED_E)).toBe(COMPOSED_E);
    expect(normalizeRejectReason(DECOMPOSED_E.repeat(255))).toBe(
      COMPOSED_E.repeat(255),
    );
    // Chưa chuẩn hoá thì 255 cặp là 510 điểm mã: phải đếm SAU NFC mới đúng.
    expect(DECOMPOSED_E.repeat(255)).toHaveLength(510);
  });

  it('đếm theo điểm mã: 255 emoji hợp lệ, 256 thì không', () => {
    expect(normalizeRejectReason('😀'.repeat(255))).not.toBeNull();
    expect(normalizeRejectReason('😀'.repeat(256))).toBeNull();
  });

  it('có ký tự điều khiển giữa chuỗi (kể cả xuống dòng, NUL) ⇒ null', () => {
    for (const bad of ['a\nb', 'a\u0000b', 'a\u001bb', 'a\u007fb'])
      expect(normalizeRejectReason(bad)).toBeNull();
  });
});
