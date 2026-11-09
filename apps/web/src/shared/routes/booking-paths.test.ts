import { describe, expect, it } from 'vitest';
import { BOOKING_PATH, doctorListPath, serviceListPath } from './booking-paths';

// booking P5. Mã ca BP-01…BP-04 lấy từ PLAN booking mục 7.18. Khoá chuỗi để link (search, booking) và route không lệch nhau.
describe('booking P5 — đường dẫn luồng đặt lịch dùng chung', () => {
  it('BP-01 BOOKING_PATH là /dat-lich', () => {
    expect(BOOKING_PATH).toBe('/dat-lich');
  });

  it('BP-02 serviceListPath nối /nhom/:groupId vào gốc đặt lịch', () => {
    expect(serviceListPath('5')).toBe('/dat-lich/nhom/5');
  });

  it('BP-03 doctorListPath nối /dich-vu/:serviceId sau serviceListPath', () => {
    expect(doctorListPath('5', '20')).toBe('/dat-lich/nhom/5/dich-vu/20');
  });

  // Ca biên: id chứa ký tự đặc biệt không được làm vỡ cấu trúc đường dẫn hay chèn thêm query/hash.
  it('BP-04 mã hoá id có /, dấu cách, tiếng Việt, ?, # ở cả hai hàm', () => {
    const cases = [
      ['a/b', 'a%2Fb'],
      ['x y', 'x%20y'],
      ['tim mạch', 'tim%20m%E1%BA%A1ch'],
      ['1?x=2#y', '1%3Fx%3D2%23y'],
    ];
    for (const [id, encoded] of cases) {
      expect(serviceListPath(id)).toBe(`/dat-lich/nhom/${encoded}`);
      expect(doctorListPath(id, id)).toBe(
        `/dat-lich/nhom/${encoded}/dich-vu/${encoded}`,
      );
    }
  });
});
