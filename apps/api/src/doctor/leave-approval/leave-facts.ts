import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { LeaveNotificationInput } from '../notifications/leave-notifier.js';
import { APPROVAL_ERROR_CODES } from './admin-leave.constants.js';
import type { AdminLeaveRow } from './admin-leave.repository.js';

// Phần dùng chung của Duyệt (B15) và Từ chối (B14): lỗi chung, dữ kiện nhật ký, nội dung thông báo. Không có lý do xin nghỉ của Bác sĩ ở đâu cả (Q34, H10).

export const leaveNotFound = () =>
  new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

export const leaveAlreadyHandled = () =>
  new AppException(409, APPROVAL_ERROR_CODES.ALREADY_HANDLED, {
    thongBao: 'Yêu cầu đã được xử lý.',
  });

/** Ca tối không bao giờ được phân công (Q6); gặp nó là dữ liệu hỏng ⇒ hoàn tác và báo lỗi hệ thống thay vì ghi nhật ký sai. */
export function shiftOf(row: AdminLeaveRow): 'CaSang' | 'CaChieu' | null {
  if (row.ca === 'CaToi')
    throw new Error(
      'Yêu cầu nghỉ theo ca tối không thể tồn tại: ' + row.yeuCauNghiPhepId,
    );
  return row.ca;
}

/** Dữ kiện của yêu cầu ghi vào `nhat_ky_hanh_dong.chi_tiet_thay_doi` (danh sách trắng `LeaveRequestFacts`). */
export function leaveAuditFacts(row: AdminLeaveRow) {
  return {
    bac_si_id: row.bacSiId,
    ngay_bat_dau: row.tuNgay,
    ngay_ket_thuc: row.denNgay,
    ca: shiftOf(row),
  };
}

/** Đầu vào chung của `LeaveNotifier` (người nhận là Bác sĩ của yêu cầu). */
export function leaveNotification(row: AdminLeaveRow): LeaveNotificationInput {
  return {
    bacSiId: row.bacSiId,
    chiNhanhId: row.chiNhanhId,
    tenBacSi: row.bacSiHoTen,
    ngayBatDau: row.tuNgay,
    ngayKetThuc: row.denNgay,
    ca: row.ca,
  };
}
