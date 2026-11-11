import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../../../shared/api/errors';
import { errorMessageFor } from '../../../../../shared/api/error-message';
import { SHIFT_LABELS } from '../../../../../shared/schedule/shift-labels';
import { formatDate } from '../../../../../shared/schedule/week';
import type {
  ShiftViolation,
  ViolationDetail,
} from '../../../api/shift-assignment-api';
import { ASSIGN_MESSAGES } from './assign-form';

// Mã lỗi → câu chữ của phân công và gỡ ca (PLAN doctor 5.14; câu `[đề xuất]`, chờ nhóm duyệt). Chọn theo `maLoi`, KHÔNG dùng `thongBao` của API.
const weekdayName = (value?: number) =>
  value === 7 ? 'Chủ nhật' : value ? `Thứ ${value + 1}` : '';

const hoursText = (range: { tu: string; den: string } | null) =>
  range ? `${range.tu}–${range.den}` : null;

// Câu của MỘT vi phạm (A1–A4 và trùng ca). `chiTiet` có thể thiếu: câu vẫn đọc được.
export function describeViolationCode(
  maLoi: string,
  chiTiet?: ViolationDetail,
): string {
  const weekday = weekdayName(chiTiet?.thuTrongTuan);
  switch (maLoi) {
    case 'NGAY_PHAN_CONG_DA_QUA':
      return ASSIGN_MESSAGES.datePast;
    case 'CA_DA_KET_THUC':
      return 'Ca này đã kết thúc trong hôm nay.';
    case 'CA_DA_PHAN_CONG':
      return 'Bác sĩ đã có ca này trong ngày đó.';
    case 'CHI_NHANH_NGHI':
      return weekday
        ? `Chi nhánh nghỉ vào ${weekday}.`
        : 'Chi nhánh nghỉ ngày này.';
    case 'CHI_NHANH_CHUA_KHAI_BAO':
      return 'Chi nhánh chưa khai báo lịch hoạt động ngày này.';
    case 'CA_KHONG_TON_TAI': {
      const parts = [
        hoursText(chiTiet?.khoang?.sang ?? null) &&
          `sáng ${hoursText(chiTiet?.khoang?.sang ?? null)}`,
        hoursText(chiTiet?.khoang?.chieu ?? null) &&
          `chiều ${hoursText(chiTiet?.khoang?.chieu ?? null)}`,
      ].filter(Boolean);
      const base = `Chi nhánh không nhận khám ca này${weekday ? ` vào ${weekday}` : ''}`;
      return parts.length > 0
        ? `${base} (giờ nhận khám: ${parts.join(', ')}).`
        : `${base}.`;
    }
    case 'NGOAI_GIO_HOAT_DONG':
      return 'Khung giờ nằm ngoài giờ nhận khám của chi nhánh.';
    case 'CA_KHONG_DU_MOT_KHUNG_GIO':
      return 'Ca này ngắn hơn một lượt khám nên không tạo được khung giờ.';
    default:
      return 'Không phân công được ca này.';
  }
}

/** Một dòng vi phạm: "Tên bác sĩ · Thứ 2, 12/10/2026 · Ca sáng: câu". `doctorName` tra tên từ id (không có thì "Bác sĩ #id"). */
export function describeViolation(
  violation: ShiftViolation,
  doctorName: (bacSiId: string) => string | undefined,
): string {
  const who = doctorName(violation.bacSiId) ?? `Bác sĩ #${violation.bacSiId}`;
  const day = `${weekdayName(violation.chiTiet?.thuTrongTuan)}${violation.chiTiet?.thuTrongTuan ? ', ' : ''}${formatDate(violation.ngay)}`;
  return `${who} · ${day} · ${SHIFT_LABELS[violation.ca]}: ${describeViolationCode(violation.maLoi, violation.chiTiet)}`;
}

const OTHER_MESSAGES: Record<string, string> = {
  QUA_NHIEU_CA:
    'Quá nhiều ca trong một lần. Hãy rút ngắn khoảng ngày hoặc bớt bác sĩ, thứ, ca.',
  KHOANG_NGAY_KHONG_HOP_LE: ASSIGN_MESSAGES.dateRange,
  BAC_SI_KHONG_PHAN_CONG_DUOC: 'Tài khoản bác sĩ đang ngừng hoạt động.',
  KHONG_TIM_THAY:
    'Không tìm thấy bác sĩ hoặc bác sĩ nằm ngoài phạm vi của bạn.',
  DU_LIEU_KHONG_HOP_LE:
    'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các ô đã chọn.',
};

export const ASSIGN_UNCERTAIN_MESSAGE =
  'Chưa rõ việc phân công đã được ghi chưa (mất kết nối hoặc quá thời gian chờ). Hãy xem lại lịch rồi thử lại nếu cần; ca đã có sẽ được báo là trùng.';

export interface AssignFailure {
  message: string;
  // Các vi phạm kèm theo (409): tối đa 50 cái đầu; `total` là tổng số thật
  violations: ShiftViolation[];
  total: number;
}

/** Biến lỗi khi phân công thành câu + danh sách vi phạm (WA-03). Phân công là tất cả hoặc không: có vi phạm thì KHÔNG ca nào được ghi. */
export function describeAssignError(error: unknown): AssignFailure {
  if (error instanceof ApiError) {
    const detail = error.chiTiet as
      { viPham?: ShiftViolation[]; tongSoViPham?: number } | undefined;
    if (Array.isArray(detail?.viPham)) {
      return {
        message:
          'Có ca không phân công được nên chưa ca nào được ghi. Hãy sửa các điểm dưới đây rồi thử lại.',
        violations: detail.viPham,
        total: detail.tongSoViPham ?? detail.viPham.length,
      };
    }
    return {
      message: OTHER_MESSAGES[error.maLoi] ?? errorMessageFor(error),
      violations: [],
      total: 0,
    };
  }
  if (error instanceof NetworkError || error instanceof TimeoutError)
    return { message: ASSIGN_UNCERTAIN_MESSAGE, violations: [], total: 0 };
  return { message: errorMessageFor(error), violations: [], total: 0 };
}

// Gỡ ca (Q8; PLAN 5.14)
const REMOVE_MESSAGES: Record<string, string> = {
  CA_DANG_CO_LICH_HEN:
    'Ca đã có khung giờ được đặt hoặc từng có lịch hẹn nên không gỡ được.',
  CA_DA_QUA: 'Không thể gỡ ca đã qua.',
  KHONG_TIM_THAY: 'Không tìm thấy ca (có thể đã được gỡ).',
};

export interface RemoveFailure {
  message: string;
  // 404: ca đã không còn (gỡ ở nơi khác): nơi gọi nên tải lại lưới
  gone: boolean;
}

export function describeRemoveError(error: unknown): RemoveFailure {
  if (error instanceof ApiError) {
    return {
      message: REMOVE_MESSAGES[error.maLoi] ?? errorMessageFor(error),
      gone: error.maLoi === 'KHONG_TIM_THAY',
    };
  }
  if (error instanceof NetworkError || error instanceof TimeoutError)
    return {
      message:
        'Chưa rõ ca đã được gỡ chưa (mất kết nối hoặc quá thời gian chờ). Hãy tải lại lịch để xem.',
      gone: false,
    };
  return { message: errorMessageFor(error), gone: false };
}
