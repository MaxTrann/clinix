import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  PATIENT_APPOINTMENTS_PATH,
  adminAppointmentDetailPath,
  doctorAppointmentDetailPath,
  patientAppointmentDetailPath,
  receptionAppointmentDetailPath,
} from '../../../shared/routes/booking-paths';
import {
  ADMIN_WITHDRAWALS_PATH,
  PATIENT_WALLET_PATH,
} from '../../../shared/routes/wallet-paths';
import { ADMIN_APPROVALS_PATH, DOCTOR_PATHS } from '../../doctor';
import {
  parseNotificationItem,
  parseNotificationPage,
} from '../api/notification-api';
import { notice } from '../testing/fake-notification-api';
import { notificationLinkPath } from './notification-links';
import { LOAD_ERROR_TEXT, loadErrorMessage } from './notification-text';
import { formatAbsolute, formatRelative } from './notification-time';

// notification F2 — hàm thuần của trang Trung tâm thông báo: bộ đọc phản hồi (hợp đồng PLAN 5.4), bảng liên kết (WTB-11), thời gian (WTB-06), câu lỗi (WTB-10).

describe('bộ đọc danh sách (hợp đồng 5.4)', () => {
  it('đọc đủ tám khoá; `nhom: null` và `lienKet: null` hợp lệ', () => {
    expect(
      parseNotificationItem(notice({ nhom: null, lienKet: null })),
    ).toEqual({
      id: '1',
      loai: 'NapViThanhCong',
      nhom: null,
      tieuDe: 'Nạp ví thành công',
      noiDung: 'Bạn đã nạp 200.000 đ vào ví.',
      daDoc: false,
      thoiDiemTao: '2026-11-20T01:00:00.000Z',
      lienKet: null,
    });
    expect(
      parseNotificationItem(
        notice({ lienKet: { kieu: 'LichHen', maLichHen: 'CP1' } }),
      ).lienKet,
    ).toEqual({ kieu: 'LichHen', maLichHen: 'CP1' });
  });

  it('ca âm: id số, nhóm lạ, kiểu liên kết lạ, lịch thiếu mã, `daDoc` chuỗi, ngày hỏng, trang 0, items không phải mảng ⇒ phản hồi hỏng', () => {
    for (const bad of [
      notice({ id: 1 }),
      notice({ nhom: 'Khac' }),
      notice({ lienKet: { kieu: 'Chat' } }),
      notice({ lienKet: { kieu: 'LichHen' } }),
      notice({ daDoc: 'false' }),
      notice({ thoiDiemTao: 'hôm qua' }),
    ])
      expect(() => parseNotificationItem(bad)).toThrow(UnexpectedResponseError);
    const page = { items: [], total: 0, page: 1, pageSize: 20, soChuaDoc: 0 };
    expect(parseNotificationPage(page)).toEqual(page);
    for (const bad of [
      { ...page, page: 0 },
      { ...page, items: 'x' },
      { ...page, soChuaDoc: -1 },
      { ...page, total: 1.5 },
      null,
    ])
      expect(() => parseNotificationPage(bad)).toThrow(UnexpectedResponseError);
  });
});

describe('bảng liên kết kiểu × vai trò (WTB-11)', () => {
  const lichHen = { kieu: 'LichHen', maLichHen: 'CP/7' } as const;
  it('WTB-11 lịch hẹn ⇒ trang chi tiết lịch của đúng vai trò (đường dẫn từ shared/routes)', () => {
    expect(notificationLinkPath(lichHen, 'BenhNhan')).toBe(
      patientAppointmentDetailPath('CP/7'),
    );
    expect(notificationLinkPath(lichHen, 'LeTan')).toBe(
      receptionAppointmentDetailPath('CP/7'),
    );
    expect(notificationLinkPath(lichHen, 'BacSi')).toBe(
      doctorAppointmentDetailPath('CP/7'),
    );
    expect(notificationLinkPath(lichHen, 'QuanTriVien')).toBe(
      adminAppointmentDetailPath('CP/7'),
    );
  });

  it('WTB-11 ví, nghỉ phép, đổi chi nhánh: đúng ô có đích; ô không có đích ⇒ null; liên kết null ⇒ null', () => {
    const table = (kieu: 'Vi' | 'NghiPhep' | 'ThayDoiChiNhanh') =>
      (['BenhNhan', 'LeTan', 'BacSi', 'QuanTriVien'] as const).map((role) =>
        notificationLinkPath({ kieu }, role),
      );
    expect(table('Vi')).toEqual([
      PATIENT_WALLET_PATH,
      null,
      null,
      ADMIN_WITHDRAWALS_PATH,
    ]);
    expect(table('NghiPhep')).toEqual([
      null,
      null,
      DOCTOR_PATHS.leave,
      ADMIN_APPROVALS_PATH,
    ]);
    // Ô Admin của "đổi chi nhánh" là [cần điền] tới notification F3
    expect(table('ThayDoiChiNhanh')).toEqual([
      PATIENT_APPOINTMENTS_PATH,
      null,
      null,
      null,
    ]);
    expect(notificationLinkPath(null, 'BenhNhan')).toBeNull();
  });
});

describe('thời gian giờ Việt Nam (WTB-06)', () => {
  const at = Date.parse('2026-11-20T03:00:00.000Z');
  it('WTB-06 tuyệt đối đổi UTC sang giờ Việt Nam, qua nửa đêm đổi ngày', () => {
    expect(formatAbsolute('2026-11-20T01:05:00.000Z')).toBe('08:05 20/11/2026');
    expect(formatAbsolute('2026-11-20T17:30:00.000Z')).toBe('00:30 21/11/2026');
  });

  it('WTB-06 tương đối: dưới 1 phút, phút, giờ, ngày; từ 7 ngày ⇒ null; tương lai ⇒ "Vừa xong"', () => {
    const ago = (ms: number) => new Date(at - ms).toISOString();
    expect(formatRelative(ago(59_000), at)).toBe('Vừa xong');
    expect(formatRelative(ago(60_000), at)).toBe('1 phút trước');
    expect(formatRelative(ago(59 * 60_000), at)).toBe('59 phút trước');
    expect(formatRelative(ago(3_600_000), at)).toBe('1 giờ trước');
    expect(formatRelative(ago(23 * 3_600_000), at)).toBe('23 giờ trước');
    expect(formatRelative(ago(86_400_000), at)).toBe('1 ngày trước');
    expect(formatRelative(ago(6 * 86_400_000), at)).toBe('6 ngày trước');
    expect(formatRelative(ago(7 * 86_400_000), at)).toBeNull();
    expect(formatRelative(ago(-60_000), at)).toBe('Vừa xong');
  });
});

describe('câu lỗi khi tải (WTB-10, PLAN 5.11)', () => {
  it('WTB-10 mạng và quá giờ ⇒ câu kết nối; 400 ⇒ bộ lọc; 404 ⇒ không tìm thấy; còn lại ⇒ sự cố hệ thống', () => {
    const api = (status: number, maLoi: string) =>
      new ApiError(status, { maLoi, thongBao: 'x' });
    expect(loadErrorMessage(new NetworkError())).toBe(LOAD_ERROR_TEXT.network);
    expect(loadErrorMessage(new TimeoutError())).toBe(LOAD_ERROR_TEXT.network);
    expect(loadErrorMessage(api(400, 'DU_LIEU_KHONG_HOP_LE'))).toBe(
      LOAD_ERROR_TEXT.invalid,
    );
    expect(loadErrorMessage(api(404, 'KHONG_TIM_THAY'))).toBe(
      LOAD_ERROR_TEXT.notFound,
    );
    expect(loadErrorMessage(api(500, 'LOI_HE_THONG'))).toBe(
      LOAD_ERROR_TEXT.server,
    );
    expect(loadErrorMessage(new UnexpectedResponseError(200))).toBe(
      LOAD_ERROR_TEXT.server,
    );
  });
});
