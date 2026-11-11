import { describe, expect, it } from 'vitest';
import { isSlotId, readSlotId } from './slot-id';

// booking F3. Mã ca BWZ-01 là [đề xuất] (PLAN booking mục 7.27). Luật giống `isBigintId` của backend (list-query.rules.ts).
describe('booking F3 — đọc khungGioId từ URL', () => {
  it('BWZ-01 nhận id BIGINT dương dạng chuỗi, kể cả giá trị lớn nhất', () => {
    for (const id of ['1', '5', '123', '9223372036854775807']) {
      expect(isSlotId(id)).toBe(true);
      expect(readSlotId(new URLSearchParams({ khungGioId: id }))).toBe(id);
    }
    // Chuỗi 19 chữ số nhỏ hơn giá trị lớn nhất: biên của phép so chuỗi
    expect(isSlotId('9223372036854775806')).toBe(true);
    expect(isSlotId('1000000000000000000')).toBe(true);
  });

  it('BWZ-01 loại thiếu, rỗng, 0, số 0 đứng đầu, âm, thập phân, mũ, chữ, khoảng trắng, 20 chữ số, vượt BIGINT', () => {
    const bad = [
      '',
      '0',
      '007',
      '-1',
      '+1',
      '1.5',
      '1e3',
      '0x10',
      'abc',
      '5a',
      ' 5',
      '5 ',
      '١٢٣', // chữ số Ả Rập: không phải 0-9
      '12345678901234567890',
      '9223372036854775808',
      '9999999999999999999',
    ];
    for (const id of bad) {
      expect(isSlotId(id)).toBe(false);
      expect(readSlotId(new URLSearchParams({ khungGioId: id }))).toBeNull();
    }
    expect(readSlotId(new URLSearchParams())).toBeNull();
  });

  it('BWZ-01 hai khoá khungGioId (kể cả cùng giá trị) ⇒ null, không đoán lấy giá trị nào; khoá khác tên bị bỏ qua', () => {
    expect(
      readSlotId(new URLSearchParams('khungGioId=1&khungGioId=2')),
    ).toBeNull();
    expect(
      readSlotId(new URLSearchParams('khungGioId=1&khungGioId=1')),
    ).toBeNull();
    expect(readSlotId(new URLSearchParams('khungGioId=1&khac=2'))).toBe('1');
    expect(readSlotId(new URLSearchParams('khungGioID=1'))).toBeNull();
  });
});
