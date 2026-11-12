import { describe, expect, it } from 'vitest';
import { ROLE_HOME_PATHS } from '../../features/auth';
import {
  BOOKING_CONFIRM_PATH,
  BOOKING_DONE_ROUTE,
  BOOKING_INFO_PATH,
  BOOKING_PATH,
  BOOKING_PAYMENT_ROUTE,
  BOOKING_SLOT_PARAM,
  bookingConfirmPath,
  bookingDonePath,
  bookingInfoPath,
  bookingPaymentPath,
  doctorListPath,
  PATIENT_APPOINTMENTS_PATH,
  PATIENT_APPOINTMENTS_SEGMENT,
  serviceListPath,
} from './booking-paths';

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

// booking F3. Mã ca BP-05…BP-08 là [đề xuất] (PLAN booking mục 7.18 sau khi duyệt). Bước 4–6: tên đường dẫn là [đề xuất] ở PLAN 5.13.
describe('booking F3 — đường dẫn Bước 4–6', () => {
  it('BP-05 bookingInfoPath và bookingConfirmPath mang khungGioId trên query', () => {
    expect(BOOKING_SLOT_PARAM).toBe('khungGioId');
    expect(BOOKING_INFO_PATH).toBe('/dat-lich/thong-tin');
    expect(BOOKING_CONFIRM_PATH).toBe('/dat-lich/xac-nhan');
    expect(bookingInfoPath('12')).toBe('/dat-lich/thong-tin?khungGioId=12');
    expect(bookingConfirmPath('12')).toBe('/dat-lich/xac-nhan?khungGioId=12');
  });

  it('BP-06 bookingPaymentPath và bookingDonePath mang mã lịch hẹn trên đường dẫn', () => {
    expect(bookingPaymentPath('CP20261018001')).toBe(
      '/dat-lich/thanh-toan/CP20261018001',
    );
    expect(bookingDonePath('CP20261018001')).toBe(
      '/dat-lich/hoan-tat/CP20261018001',
    );
  });

  // Ca biên: giá trị có ký tự đặc biệt không được vỡ cấu trúc, chèn query hay hash lạ
  it('BP-07 mã hoá khungGioId và maLichHen có /, ?, #, &, dấu cách, tiếng Việt', () => {
    const cases = [
      ['a/b', 'a%2Fb'],
      ['x y', 'x%20y'],
      ['1&x=2', '1%26x%3D2'],
      ['1?x=2#y', '1%3Fx%3D2%23y'],
      ['tim mạch', 'tim%20m%E1%BA%A1ch'],
    ];
    for (const [value, encoded] of cases) {
      expect(bookingInfoPath(value)).toBe(
        `/dat-lich/thong-tin?khungGioId=${encoded}`,
      );
      expect(bookingConfirmPath(value)).toBe(
        `/dat-lich/xac-nhan?khungGioId=${encoded}`,
      );
      expect(bookingPaymentPath(value)).toBe(`/dat-lich/thanh-toan/${encoded}`);
      expect(bookingDonePath(value)).toBe(`/dat-lich/hoan-tat/${encoded}`);
    }
  });

  it('BP-08 mẫu route khớp hàm dựng liên kết và nằm dưới BOOKING_PATH', () => {
    expect(BOOKING_PAYMENT_ROUTE).toBe('/dat-lich/thanh-toan/:maLichHen');
    expect(BOOKING_DONE_ROUTE).toBe('/dat-lich/hoan-tat/:maLichHen');
    for (const path of [
      BOOKING_INFO_PATH,
      BOOKING_CONFIRM_PATH,
      BOOKING_PAYMENT_ROUTE,
      BOOKING_DONE_ROUTE,
    ]) {
      expect(path.startsWith(`${BOOKING_PATH}/`)).toBe(true);
    }
    // Thay `:maLichHen` bằng đúng giá trị cho ra đường dẫn của hàm dựng
    expect(BOOKING_PAYMENT_ROUTE.replace(':maLichHen', 'X1')).toBe(
      bookingPaymentPath('X1'),
    );
    expect(BOOKING_DONE_ROUTE.replace(':maLichHen', 'X1')).toBe(
      bookingDonePath('X1'),
    );
  });
});

// booking F1. Mã ca BP-09 là [đề xuất] (PLAN booking mục 7.18 sau khi duyệt). `shared/routes` không import `features/` nên gốc `/benh-nhan` viết
// chữ ở `booking-paths.ts`; ca này giữ nó khớp `ROLE_HOME_PATHS.BenhNhan` (nếp ca `AQ-` của patient) và không trùng đường dẫn nào đã có.
describe('booking F1 — đường dẫn "Lịch hẹn của tôi"', () => {
  it('BP-09 nằm dưới gốc khu Bệnh nhân, đoạn đường là nhãn menu không dấu, khác mọi đường dẫn đã có', () => {
    expect(PATIENT_APPOINTMENTS_SEGMENT).toBe('lich-hen-cua-toi');
    expect(PATIENT_APPOINTMENTS_PATH).toBe('/benh-nhan/lich-hen-cua-toi');
    // Khớp gốc khu Bệnh nhân của auth: đổi `ROLE_HOME_PATHS.BenhNhan` mà quên file này thì ca đỏ
    expect(PATIENT_APPOINTMENTS_PATH).toBe(
      `${ROLE_HOME_PATHS.BenhNhan}/${PATIENT_APPOINTMENTS_SEGMENT}`,
    );

    // Ca âm: không trùng gốc của bốn khu, không nằm trong luồng đặt lịch, không trùng Bước 4–6
    const taken = [
      ...Object.values(ROLE_HOME_PATHS),
      BOOKING_PATH,
      BOOKING_INFO_PATH,
      BOOKING_CONFIRM_PATH,
      BOOKING_PAYMENT_ROUTE,
      BOOKING_DONE_ROUTE,
    ];
    expect(taken).not.toContain(PATIENT_APPOINTMENTS_PATH);
    expect(PATIENT_APPOINTMENTS_PATH.startsWith(`${BOOKING_PATH}/`)).toBe(
      false,
    );
  });
});
