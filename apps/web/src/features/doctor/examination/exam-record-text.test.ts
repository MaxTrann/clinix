import { describe, expect, it } from 'vitest';
import {
  formatReturnDate,
  formatUpdatedAt,
  recordView,
} from './exam-record-text';

// doctor-exam F2: hàm thuần của thẻ `Hồ sơ khám bệnh` (WHS-11 định dạng, WHS-01 và WHS-10 bảng "thẻ hiện gì"; Q6, Q16). Câu chữ viết NGUYÊN VĂN ở đây (không import hằng) để đổi chữ ở mã là test đỏ.
describe('doctor-exam F2 — định dạng "Cập nhật lúc" và ngày tái khám (WHS-11)', () => {
  it.each([
    ['2026-06-10T10:30:00.000Z', '17:30 ngày 10/06/2026'],
    ['2026-06-10T16:59:59.999Z', '23:59 ngày 10/06/2026'],
    ['2026-06-10T17:00:00.000Z', '00:00 ngày 11/06/2026'],
    ['2026-12-31T17:00:00.000Z', '00:00 ngày 01/01/2027'],
    ['2026-02-28T17:00:00.000Z', '00:00 ngày 01/03/2026'],
    ['2028-02-28T17:00:00.000Z', '00:00 ngày 29/02/2028'],
    ['2026-01-02T01:05:00.000Z', '08:05 ngày 02/01/2026'],
    ['2026-06-10T00:00:00Z', '07:00 ngày 10/06/2026'],
  ])('WHS-11 %s ⇒ %s (giờ Việt Nam cố định +07:00)', (iso, expected) => {
    expect(formatUpdatedAt(iso)).toBe(expected);
  });

  it.each(['', 'abc', '2026-13-45T00:00:00Z', '10/06/2026 17:30'])(
    'WHS-11 chuỗi không phải ngày %j ⇒ null (thẻ bỏ dòng, không in "NaN")',
    (value) => {
      expect(formatUpdatedAt(value)).toBeNull();
    },
  );

  it.each([
    ['2026-07-10', '10/07/2026'],
    ['2026-07-05', '05/07/2026'],
    ['2027-01-01', '01/01/2027'],
  ])(
    'WHS-11 ngày tái khám %s ⇒ %s (cắt chuỗi, không qua Date)',
    (iso, expected) => {
      expect(formatReturnDate(iso)).toBe(expected);
    },
  );

  it.each(['', '10/07/2026', '2026-7-1', '2026-07-10T00:00:00Z', 'ngày'])(
    'WHS-11 ngày tái khám sai dạng %j ⇒ null (thẻ bỏ khối)',
    (value) => {
      expect(formatReturnDate(value)).toBeNull();
    },
  );
});

describe('doctor-exam F2 — thẻ hiện gì theo cặp (trạng thái, có hồ sơ) (WHS-01, WHS-10; Q6, Q16)', () => {
  it('WHS-01 `DaTiepDon` và `HoanThanh`: có hồ sơ ⇒ nội dung; chưa có ⇒ trạng thái rỗng với câu theo trạng thái', () => {
    expect(recordView('DaTiepDon', true)).toEqual({ kind: 'content' });
    expect(recordView('HoanThanh', true)).toEqual({ kind: 'content' });
    expect(recordView('DaTiepDon', false)).toEqual({
      kind: 'empty',
      text: 'Chưa ghi hồ sơ khám.',
    });
    expect(recordView('HoanThanh', false)).toEqual({
      kind: 'empty',
      text: 'Ca khám đã hoàn thành nhưng chưa có hồ sơ khám.',
    });
  });

  it.each([true, false])(
    'WHS-10 chờ thanh toán và đã xác nhận (có hồ sơ: %s) ⇒ hộp chữ, KHÔNG nội dung',
    (hasRecord) => {
      for (const trangThai of ['ChoThanhToan', 'DaXacNhan']) {
        expect(recordView(trangThai, hasRecord)).toEqual({
          kind: 'note',
          text: 'Hồ sơ khám sẽ được bác sĩ cập nhật sau khi người bệnh được tiếp đón.',
          italic: false,
        });
      }
    },
  );

  it.each([true, false])(
    'WHS-10 đã hủy, vắng mặt, mã lạ (có hồ sơ: %s) ⇒ hộp chữ nghiêng, KHÔNG nội dung (Q16: hồ sơ cũ ẩn)',
    (hasRecord) => {
      for (const trangThai of ['DaHuy', 'VangMat', 'DaDoiLich', '']) {
        expect(recordView(trangThai, hasRecord)).toEqual({
          kind: 'note',
          text: 'Không có hồ sơ khám.',
          italic: true,
        });
      }
    },
  );
});
