import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shared/api/errors';
import { isoWeekdayLabel } from '../appointments/common/appointment-format';
import {
  BOOKING_ERROR_CODES,
  knownBookingError,
  type KnownBookingErrorScope,
} from './booking-errors';

// booking F4. BRD-06 là [đề xuất] (PLAN booking mục 7.38): MỘT bảng `maLoi` ⇒ câu cho A2, A3, A6 và hồ sơ ngừng, mà Bước 5 (F5, WZ-06, WZ-07) dùng lại. Chữ lấy từ PLAN 5.14.
const apiError = (maLoi: string, chiTiet?: unknown) =>
  new ApiError(409, { maLoi, thongBao: 'câu của API', chiTiet });
const known = (maLoi: string, chiTiet?: unknown) =>
  knownBookingError(apiError(maLoi, chiTiet));

describe('booking F4 — bảng câu lỗi của bước kiểm trước khi đặt', () => {
  it('BRD-06 mỗi mã có đúng câu của PLAN 5.14, đúng nguyên nhân (khung giờ, hồ sơ, tài khoản) và đúng khả năng thử lại', () => {
    const table: [string, string, KnownBookingErrorScope, boolean][] = [
      [
        'KHUNG_GIO_KHONG_TON_TAI',
        'Không tìm thấy khung giờ này.',
        'slot',
        false,
      ],
      [
        'KHUNG_GIO_DA_DAT',
        'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
        'slot',
        false,
      ],
      [
        'KHUNG_GIO_DANG_GIU',
        'Khung giờ này đang được người khác giữ chỗ. Vui lòng chọn khung giờ khác hoặc thử lại sau ít phút.',
        'slot',
        true,
      ],
      [
        'KHUNG_GIO_DA_QUA',
        'Khung giờ này đã qua. Vui lòng chọn khung giờ khác.',
        'slot',
        false,
      ],
      [
        'KHUNG_GIO_KHONG_HOP_LE',
        'Khung giờ này không còn hợp lệ. Vui lòng chọn lại.',
        'slot',
        false,
      ],
      [
        'CHI_NHANH_CHUA_KHAI_BAO',
        'Chi nhánh chưa công bố giờ nhận khám vào ngày này.',
        'slot',
        false,
      ],
      [
        'CA_KHONG_TON_TAI',
        'Chi nhánh không nhận khám vào buổi này.',
        'slot',
        false,
      ],
      [
        'BAC_SI_NGHI_PHEP',
        'Bác sĩ nghỉ vào thời gian này. Vui lòng chọn khung giờ khác.',
        'slot',
        false,
      ],
      [
        'BAC_SI_KHONG_KHA_DUNG',
        'Bác sĩ hiện không nhận đặt lịch.',
        'slot',
        false,
      ],
      [
        'KHUNG_GIO_NGOAI_LICH_MOI',
        'Chi nhánh sắp thay đổi lịch nhận khám nên không nhận đặt vào khung giờ này.',
        'slot',
        false,
      ],
      [
        'HO_SO_NGUOI_THAN_DA_NGUNG',
        'Hồ sơ này đã ngừng sử dụng. Vui lòng chọn hồ sơ khác.',
        'profile',
        false,
      ],
      [
        'DAT_LICH_BI_KHOA_NO_SHOW',
        'Tài khoản đang bị khoá đặt lịch trực tuyến do vắng mặt nhiều lần. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.',
        'account',
        false,
      ],
      [
        'KHONG_DU_QUYEN',
        'Tài khoản này không được phép đặt lịch.',
        'account',
        false,
      ],
      [
        'HE_THONG_CHUA_CAU_HINH',
        'Hệ thống chưa sẵn sàng nhận đặt lịch. Vui lòng thử lại sau.',
        'account',
        true,
      ],
    ];
    for (const [maLoi, message, scope, retryable] of table) {
      expect(known(maLoi), maLoi).toEqual({ message, scope, retryable });
    }
  });

  it('BRD-06 A6 dùng `chiTiet`: chi nhánh nghỉ vào thứ mấy, giờ mở và đóng; thiếu hay sai ⇒ câu không có số liệu', () => {
    expect(known('CHI_NHANH_NGHI', { thuTrongTuan: 2 })?.message).toBe(
      'Chi nhánh nghỉ vào Thứ 3.',
    );
    expect(known('CHI_NHANH_NGHI', { thuTrongTuan: 3 })?.message).toBe(
      'Chi nhánh nghỉ vào Thứ 4.',
    );
    expect(known('CHI_NHANH_NGHI', { thuTrongTuan: 7 })?.message).toBe(
      'Chi nhánh nghỉ vào Chủ nhật.',
    );
    expect(known('CHI_NHANH_NGHI', { thuTrongTuan: 1 })?.message).toBe(
      'Chi nhánh nghỉ vào Thứ 2.',
    );
    for (const bad of [
      undefined,
      null,
      {},
      { thuTrongTuan: 0 },
      { thuTrongTuan: 8 },
      { thuTrongTuan: '3' },
      { thuTrongTuan: 2.5 },
      'x',
    ]) {
      expect(known('CHI_NHANH_NGHI', bad)?.message).toBe(
        'Chi nhánh nghỉ vào ngày này.',
      );
    }
    expect(
      known('NGOAI_GIO_HOAT_DONG', {
        thuTrongTuan: 3,
        gioMo: '07:30',
        gioDong: '17:00',
      })?.message,
    ).toBe('Ngoài giờ hoạt động, chi nhánh mở cửa từ 07:30 đến 17:00.');
    for (const bad of [
      undefined,
      {},
      { gioMo: '07:30' },
      { gioMo: '7:30', gioDong: '17:00' },
      { gioMo: '<b>x</b>', gioDong: '17:00' },
      { gioMo: 730, gioDong: 1700 },
    ]) {
      expect(known('NGOAI_GIO_HOAT_DONG', bad)?.message).toBe(
        'Ngoài giờ hoạt động của chi nhánh.',
      );
    }
    expect(known('CHI_NHANH_NGHI')?.scope).toBe('slot');
    expect(known('NGOAI_GIO_HOAT_DONG')?.scope).toBe('slot');
  });

  it('BRD-06 A3 dùng `chiTiet`: số lịch tối đa và mã lịch trùng; thiếu hay sai ⇒ câu không có số liệu, không hiện chuỗi lạ', () => {
    expect(known('VUOT_SO_LICH_HEN_TOI_DA', { toiDa: 3 })?.message).toBe(
      'Hồ sơ này đã có 3 lịch hẹn đang hoạt động, là mức tối đa.',
    );
    for (const bad of [
      undefined,
      {},
      { toiDa: 0 },
      { toiDa: -1 },
      { toiDa: 2.5 },
      { toiDa: '3' },
    ]) {
      expect(known('VUOT_SO_LICH_HEN_TOI_DA', bad)?.message).toBe(
        'Hồ sơ này đã đạt số lịch hẹn đang hoạt động tối đa.',
      );
    }
    expect(
      known('LICH_HEN_TRUNG_THOI_GIAN', {
        maLichHen: 'CP20261018001',
        thoiGian: '2026-10-20T02:00:00.000Z',
      })?.message,
    ).toBe('Hồ sơ này đã có lịch hẹn CP20261018001 trùng thời gian.');
    for (const bad of [
      undefined,
      {},
      { maLichHen: '' },
      { maLichHen: '<script>' },
      { maLichHen: 5 },
      { maLichHen: 'a'.repeat(41) },
    ]) {
      expect(known('LICH_HEN_TRUNG_THOI_GIAN', bad)?.message).toBe(
        'Hồ sơ này đã có lịch hẹn trùng thời gian.',
      );
    }
    expect(known('VUOT_SO_LICH_HEN_TOI_DA')?.scope).toBe('profile');
    expect(known('LICH_HEN_TRUNG_THOI_GIAN')?.scope).toBe('profile');
  });

  it('BRD-06 mã lạ, mã của nguyên mẫu và lỗi không phải ApiError ⇒ không có câu riêng (nơi gọi dùng câu chung)', () => {
    for (const maLoi of [
      'MA_LA',
      '',
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(known(maLoi), maLoi).toBeUndefined();
    }
    expect(knownBookingError(new TypeError('Failed to fetch'))).toBeUndefined();
    expect(knownBookingError(undefined)).toBeUndefined();
    expect(knownBookingError('KHUNG_GIO_DA_DAT')).toBeUndefined();
  });

  it('BRD-06 hằng mã khớp đúng chữ của backend (mã `HOA_GACH_DUOI`)', () => {
    expect(BOOKING_ERROR_CODES.SLOT_TAKEN).toBe('KHUNG_GIO_DA_DAT');
    expect(BOOKING_ERROR_CODES.OVERLAPPING_APPOINTMENT).toBe(
      'LICH_HEN_TRUNG_THOI_GIAN',
    );
    expect(BOOKING_ERROR_CODES.RELATIVE_DEACTIVATED).toBe(
      'HO_SO_NGUOI_THAN_DA_NGUNG',
    );
  });

  it('BRD-06 thứ ISO: 1 = Thứ 2 … 6 = Thứ 7, 7 = Chủ nhật; ngoài 1 đến 7 hay không phải số nguyên ⇒ null', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(isoWeekdayLabel)).toEqual([
      'Thứ 2',
      'Thứ 3',
      'Thứ 4',
      'Thứ 5',
      'Thứ 6',
      'Thứ 7',
      'Chủ nhật',
    ]);
    for (const bad of [0, 8, -1, 1.5, '1', null, undefined, NaN]) {
      expect(isoWeekdayLabel(bad)).toBeNull();
    }
  });
});
