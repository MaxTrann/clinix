import { toRatio } from './ratio.rules.js';

// dashboard B1 — DVM-04 (PLAN dashboard 7.3; T5): phần trăm một chữ số thập phân, làm tròn nửa lên, mẫu 0 ⇒ `null`.

describe('dashboard B1 — tỉ lệ của thẻ số', () => {
  it.each([
    [1, 3, 33.3],
    [2, 3, 66.7],
    [1, 8, 12.5],
    [1, 16, 6.3],
    [0, 5, 0],
    [5, 5, 100],
  ])('DVM-04: %i/%i ⇒ %d', (tuSo, mauSo, phanTram) => {
    expect(toRatio(tuSo, mauSo)).toStrictEqual({ tuSo, mauSo, phanTram });
  });

  it('DVM-04: mẫu số 0 ⇒ `phanTram` là `null` (không chia cho 0, không phải 0)', () => {
    expect(toRatio(0, 0)).toStrictEqual({ tuSo: 0, mauSo: 0, phanTram: null });
  });

  it('DVM-04: số của bộ D0 (bảng 7.0): 2/6 = 33,3; 1/4 = 25; 1/2 = 50; 7/12 = 58,3; 5/8 = 62,5', () => {
    expect([
      toRatio(2, 6).phanTram,
      toRatio(1, 4).phanTram,
      toRatio(1, 2).phanTram,
      toRatio(7, 12).phanTram,
      toRatio(5, 8).phanTram,
    ]).toStrictEqual([33.3, 25, 50, 58.3, 62.5]);
  });

  it('làm tròn bằng số nguyên, không lệch ở mẫu lớn (1/2000 = 0,05 ⇒ 0,1; 1/2001 ⇒ 0)', () => {
    expect(toRatio(1, 2000).phanTram).toBe(0.1);
    expect(toRatio(1, 2001).phanTram).toBe(0);
  });
});
