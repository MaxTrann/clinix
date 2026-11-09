import {
  AppException,
  type ErrorBody,
} from '../common/errors/app.exception.js';
import { ERROR_CODE_PATTERN } from '../common/errors/error-codes.js';
import {
  CA_KHONG_TON_TAI,
  CHI_NHANH_CHUA_KHAI_BAO,
  CHI_NHANH_NGHI,
} from '../scheduling/scheduling.constants.js';
import {
  BOOKING_ERRORS,
  BOOKING_ERROR_CODES,
  BOOKING_FIELD_ERROR_CODES,
  BOOKING_JOB_BATCH_SIZE,
  BOOKING_JOB_MAX_BATCHES,
  BOOKING_NOTIFICATION_EVENTS,
  HOLD_EXPIRY_CRON,
  NO_SHOW_CRON,
  bookingException,
  type BookingErrorCode,
} from './appointments.constants.js';

// Task P1 — BCS-01…BCS-05 (PLAN booking 7.17). Danh sách mong đợi viết RIÊNG ở đây, theo bảng 5.14 (kèm câu (h): mã 503), không đọc lại từ hằng.
const EXPECTED_STATUS: Record<string, number> = {
  KHUNG_GIO_KHONG_TON_TAI: 404,
  KHUNG_GIO_DA_DAT: 409,
  KHUNG_GIO_DANG_GIU: 409,
  KHUNG_GIO_DA_QUA: 409,
  KHUNG_GIO_KHONG_HOP_LE: 409,
  CHI_NHANH_CHUA_KHAI_BAO: 409,
  CHI_NHANH_NGHI: 409,
  CA_KHONG_TON_TAI: 409,
  NGOAI_GIO_HOAT_DONG: 409,
  BAC_SI_NGHI_PHEP: 409,
  BAC_SI_KHONG_KHA_DUNG: 409,
  KHUNG_GIO_NGOAI_LICH_MOI: 409,
  DAT_LICH_BI_KHOA_NO_SHOW: 403,
  VUOT_SO_LICH_HEN_TOI_DA: 409,
  LICH_HEN_TRUNG_THOI_GIAN: 409,
  LICH_HEN_KHONG_CHO_HUY: 409,
  CHUYEN_TRANG_THAI_KHONG_HOP_LE: 409,
  CHI_BAC_SI_HOAN_THANH: 409,
  CON_PHAN_CHUA_THANH_TOAN: 409,
  NGOAI_KHUNG_GIO_TIEP_DON: 409,
  CHUA_QUA_GIO_HEN: 409,
  HE_THONG_DANG_BAN: 503,
};
const EXPECTED_FIELD_CODES = [
  'LY_DO_KHAM_KHONG_HOP_LE',
  'LY_DO_BAT_BUOC',
  'TU_KHOA_KHONG_HOP_LE',
];

const allCodes = Object.values(BOOKING_ERROR_CODES);

describe('BCS-01 bảng mã lỗi của 5.14', () => {
  it('đủ 22 mã có HTTP và 3 mã trường (tổng 25), khớp danh sách viết riêng, không mã nào thiếu hay thừa', () => {
    expect([...allCodes].sort()).toEqual(Object.keys(EXPECTED_STATUS).sort());
    expect(Object.keys(BOOKING_ERRORS).sort()).toEqual(
      Object.keys(EXPECTED_STATUS).sort(),
    );
    expect(Object.values(BOOKING_FIELD_ERROR_CODES).sort()).toEqual(
      [...EXPECTED_FIELD_CODES].sort(),
    );
    expect(allCodes.length + EXPECTED_FIELD_CODES.length).toBe(25);
  });

  it('không mã nào trùng nhau (kể cả giữa nhóm có HTTP và nhóm mã trường)', () => {
    const everything = [
      ...allCodes,
      ...Object.values(BOOKING_FIELD_ERROR_CODES),
    ];
    expect(new Set(everything).size).toBe(everything.length);
  });

  it('mọi mã đúng ERROR_CODE_PATTERN (HOA_GACH_DUOI); HTTP đúng cột 5.14: 403 cho khoá no-show, 404 cho khung giờ không có, 503 cho hết lượt thử lại, còn lại 409', () => {
    for (const code of [
      ...allCodes,
      ...Object.values(BOOKING_FIELD_ERROR_CODES),
    ])
      expect(code, code).toMatch(ERROR_CODE_PATTERN);
    for (const code of allCodes)
      expect(BOOKING_ERRORS[code].status, code).toBe(EXPECTED_STATUS[code]);
  });

  it('mỗi mã có câu thongBao không rỗng và KHÔNG chứa chỗ tham số {…} (giá trị đi trong chiTiet)', () => {
    for (const code of allCodes) {
      const { thongBao } = BOOKING_ERRORS[code];
      expect(thongBao.trim().length, code).toBeGreaterThan(0);
      expect(thongBao, code).not.toMatch(/[{}]/);
    }
  });
});

describe('BCS-02 ba mã của doctor dùng lại, không khai lần hai', () => {
  it('CHI_NHANH_CHUA_KHAI_BAO, CHI_NHANH_NGHI, CA_KHONG_TON_TAI cùng giá trị với scheduling.constants (và đúng chuỗi của 5.14)', () => {
    expect(BOOKING_ERROR_CODES.BRANCH_NOT_DECLARED).toBe(
      CHI_NHANH_CHUA_KHAI_BAO,
    );
    expect(BOOKING_ERROR_CODES.BRANCH_CLOSED).toBe(CHI_NHANH_NGHI);
    expect(BOOKING_ERROR_CODES.SHIFT_NOT_ACCEPTED).toBe(CA_KHONG_TON_TAI);
    expect([CHI_NHANH_CHUA_KHAI_BAO, CHI_NHANH_NGHI, CA_KHONG_TON_TAI]).toEqual(
      ['CHI_NHANH_CHUA_KHAI_BAO', 'CHI_NHANH_NGHI', 'CA_KHONG_TON_TAI'],
    );
  });
});

describe('BCS-03 bookingException', () => {
  it('dựng được AppException cho MỌI mã: đúng trạng thái, maLoi, thongBao của bảng; không có chiTiet khi không truyền', () => {
    for (const code of allCodes) {
      const error = bookingException(code);
      expect(error, code).toBeInstanceOf(AppException);
      expect(error.getStatus(), code).toBe(EXPECTED_STATUS[code]);
      expect(error.maLoi, code).toBe(code);
      const body = error.getResponse() as ErrorBody;
      expect(body.maLoi).toBe(code);
      expect(body.thongBao).toBe(BOOKING_ERRORS[code].thongBao);
      expect(body).not.toHaveProperty('chiTiet');
    }
  });

  it('chiTiet được chuyển NGUYÊN khối (kể cả giá trị 0 và mảng rỗng, không bị coi là "không có")', () => {
    const detail = { toiDa: 0, lichTrung: [] };
    const body = bookingException(
      BOOKING_ERROR_CODES.OVER_MAX_APPOINTMENTS,
      detail,
    ).getResponse() as ErrorBody;
    expect(body.chiTiet).toEqual(detail);
    const zero = bookingException(
      BOOKING_ERROR_CODES.UNPAID_BALANCE,
      0,
    ).getResponse() as ErrorBody;
    expect(zero.chiTiet).toBe(0);
  });

  it('mã ngoài bảng không dựng được (kiểu chặn ở compile; ở chạy thật là lỗi lập trình)', () => {
    const unknown = 'MA_LA' as BookingErrorCode;
    expect(() => bookingException(unknown)).toThrow();
  });
});

describe('BCS-04 mã sự kiện thông báo (5.12)', () => {
  it('đúng bốn mã của 5.12, dạng PascalCase, khác nhau, ≤ 100 ký tự (thong_bao.loai_su_kien là varchar(100))', () => {
    const events = Object.values(BOOKING_NOTIFICATION_EVENTS);
    expect([...events].sort()).toEqual(
      [
        'KhoaDatLichNoShow',
        'LichHenDaHuy',
        'LichHenDaXacNhan',
        'LichHenVangMat',
      ].sort(),
    );
    expect(new Set(events).size).toBe(events.length);
    for (const event of events) {
      expect(event, event).toMatch(/^[A-Z][A-Za-z0-9]*$/);
      expect(event.length, event).toBeLessThanOrEqual(100);
    }
  });
});

describe('BCS-05 hằng job (5.5, Q23)', () => {
  const FIELDS = /^(\d{1,2}) (\S+) \* \* \* \*$/;

  it('cron 6 trường: hết hạn giữ chỗ mỗi phút, Vắng mặt mỗi 5 phút; giây khác nhau và khác giây 0', () => {
    const hold = FIELDS.exec(HOLD_EXPIRY_CRON);
    const noShow = FIELDS.exec(NO_SHOW_CRON);
    expect(hold?.[2]).toBe('*');
    expect(noShow?.[2]).toBe('*/5');
    const holdSecond = Number(hold?.[1]);
    const noShowSecond = Number(noShow?.[1]);
    for (const second of [holdSecond, noShowSecond]) {
      expect(second).toBeGreaterThan(0);
      expect(second).toBeLessThan(60);
    }
    expect(holdSecond).not.toBe(noShowSecond);
  });

  it('lô 100 và trần 10 lô (đúng 5.5 và Q23)', () => {
    expect(BOOKING_JOB_BATCH_SIZE).toBe(100);
    expect(BOOKING_JOB_MAX_BATCHES).toBe(10);
  });
});
