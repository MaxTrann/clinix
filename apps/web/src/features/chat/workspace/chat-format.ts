import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import type {
  ChatRole,
  ConversationKind,
  ConversationListItem,
  Relationship,
} from '../api/chat-types';

// Hàm THUẦN cho khung nhắn tin (chat F3; PLAN chat 5.9, 5.13, 5.14): giờ Việt Nam, ngăn ngày, số chưa đọc, nhãn dòng, câu lỗi theo `maLoi`.
// Không đọc `thongBao` hay chi tiết lỗi của máy chủ: câu hiển thị chỉ chọn theo `maLoi` (và `loi[].ma`), nên không thể lặp lại nội dung tin ra màn hình.

/** Trần nội dung (điểm mã) như lõi gửi (PLAN 5.5); bộ đếm hiện từ `CHAT_COUNTER_FROM` trở đi ("đếm ký tự khi gần 2000"). */
export const CHAT_CONTENT_MAX = 2000;
export const CHAT_COUNTER_FROM = 1800;

const VN_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function vnParts(time: number) {
  const parts = Object.fromEntries(
    VN_DATE.formatToParts(new Date(time)).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    ddMM: `${parts.day}/${parts.month}`,
    hhmm: `${parts.hour}:${parts.minute}`,
  };
}

/** Khoá ngày theo giờ Việt Nam (`yyyy-MM-dd`) để gom tin vào từng ngăn ngày. */
export function vnDayKey(iso: string): string {
  return vnParts(Date.parse(iso)).day;
}

/** Giờ "HH:mm" theo giờ Việt Nam (máy người dùng ở múi giờ nào cũng vậy). */
export function formatClock(iso: string): string {
  return vnParts(Date.parse(iso)).hhmm;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Nhãn ngăn ngày: "Hôm nay", "Hôm qua", còn lại "dd/MM" (PLAN 5.13). */
export function dayDividerLabel(iso: string, now: number): string {
  const day = vnDayKey(iso);
  if (day === vnParts(now).day) return 'Hôm nay';
  if (day === vnParts(now - DAY_MS).day) return 'Hôm qua';
  return vnParts(Date.parse(iso)).ddMM;
}

/** Giờ ở dòng danh sách: hôm nay "HH:mm", ngày khác "dd/MM". */
export function listTimeLabel(iso: string, now: number): string {
  const parts = vnParts(Date.parse(iso));
  return parts.day === vnParts(now).day ? parts.hhmm : parts.ddMM;
}

/** Số tin chưa đọc ở một dòng: ẩn khi 0, "99+" khi quá 99 (API trần 100). */
export function unreadText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

export const KIND_LABELS: Record<ConversationKind, string> = {
  BenhNhan_BacSi: 'Bác sĩ',
  BenhNhan_LeTan: 'Lễ tân',
};

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  DaTungKham: 'Đã từng khám',
  ChuaTungKham: 'Chưa từng khám',
};

/** Nhãn trả lời của hộp thư Lễ tân (Q15): "Chờ trả lời" hay "Đã trả lời · {tên}" (máy chủ đã đổi chính mình thành "Bạn"). */
export function replyLabel(item: ConversationListItem): string | null {
  if (item.trangThaiTraLoi === 'ChoTraLoi') return 'Chờ trả lời';
  if (item.trangThaiTraLoi === 'DaTraLoi')
    return item.traLoiBoi ? `Đã trả lời · ${item.traLoiBoi}` : 'Đã trả lời';
  return null;
}

/** Tên truy cập của một dòng: tên đối tác kèm số chưa đọc (PLAN 5.13 "Trợ năng"). */
export function rowLabel(item: ConversationListItem): string {
  const unread = item.soTinChuaDoc;
  if (unread <= 0) return item.doiTac.tenHienThi;
  return `${item.doiTac.tenHienThi}, ${unread > 99 ? 'hơn 99' : unread} tin chưa đọc`;
}

/** Số điểm mã của nội dung sau khi cắt hai đầu, như lõi gửi đếm (emoji ngoài BMP là một). */
export function contentLength(text: string): number {
  return Array.from(text.normalize('NFC').trim()).length;
}

// Câu theo `maLoi` (PLAN 5.14; chữ `[đề xuất]`). Câu "không có quyền xem" chỉ dùng trong khung chat (404 hội thoại).
export const NO_ACCESS_MESSAGE = 'Bạn không có quyền xem hội thoại này.';
export const SEND_NETWORK_MESSAGE =
  'Chưa gửi được do mạng. Nội dung vẫn còn, hãy thử lại.';
export const SEND_SYSTEM_MESSAGE =
  'Chưa gửi được. Nội dung vẫn còn, hãy thử lại.';
export const RECIPIENT_INACTIVE_MESSAGE =
  'Tài khoản người nhận đang ngưng hoạt động nên chưa gửi được.';
/** Gợi ý nhắn lễ tân chỉ đúng với Bệnh nhân (vai trò khác không tự mở hội thoại mới) `[đề xuất]`. */
export const RECIPIENT_INACTIVE_PATIENT_HINT = 'Bạn có thể nhắn lễ tân.';
export const KEYWORD_INVALID_MESSAGE = 'Từ khoá cần từ 2 đến 100 ký tự.';
/** 403 `KHONG_DU_QUYEN`: sai vai trò, hay Lễ tân không còn phạm vi chi nhánh (QCH-08; 2.4.29 A1). */
export const FORBIDDEN_MESSAGE = 'Bạn không có quyền thực hiện thao tác này.';

const SEND_MESSAGES: Record<string, string> = {
  KHONG_TIM_THAY: NO_ACCESS_MESSAGE,
  KHONG_DU_QUYEN: FORBIDDEN_MESSAGE,
  CHAT_NGUOI_NHAN_KHONG_HOAT_DONG: RECIPIENT_INACTIVE_MESSAGE,
  CHAT_MA_GUI_DA_DUNG: 'Chưa gửi được. Vui lòng gửi lại.',
  CHAT_GUI_QUA_NHANH: 'Bạn gửi quá nhanh. Đợi một chút rồi gửi lại.',
  HE_THONG_DANG_BAN: 'Hệ thống đang bận. Thử lại sau.',
};

const FIELD_MESSAGES: Record<string, string> = {
  NOI_DUNG_TRONG: 'Tin nhắn phải có từ 1 đến 2000 ký tự.',
  NOI_DUNG_QUA_DAI: 'Tin nhắn phải có từ 1 đến 2000 ký tự.',
  // PLAN 5.14 ghi "(theo `ma`)" mà chưa có câu riêng cho ký tự lạ: câu dưới là `[đề xuất]`
  NOI_DUNG_KY_TU_KHONG_HOP_LE: 'Tin nhắn có ký tự không hợp lệ.',
};

/** Câu dưới bong bóng tin gửi lỗi. Mạng và quá giờ: máy chủ có thể đã nhận, nên "Gửi lại" dùng cùng `maGui` (A1). */
export function sendErrorMessage(error: unknown): string {
  if (error instanceof NetworkError || error instanceof TimeoutError)
    return SEND_NETWORK_MESSAGE;
  if (!(error instanceof ApiError)) return SEND_SYSTEM_MESSAGE;
  if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE') {
    const code = error.loi?.find((item) => item.truong === 'noiDung')?.ma;
    return (code && FIELD_MESSAGES[code]) || SEND_SYSTEM_MESSAGE;
  }
  return SEND_MESSAGES[error.maLoi] ?? SEND_SYSTEM_MESSAGE;
}

/** `true` khi lỗi là 404 hội thoại (không thấy hoặc không phải thành viên: máy chủ cố ý không phân biệt, T3). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.maLoi === 'KHONG_TIM_THAY';
}

/** `true` khi lỗi là 403 `KHONG_DU_QUYEN` (chat F5): hiện câu không có quyền, KHÔNG có "Thử lại" (thử lại cũng bị từ chối). */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.maLoi === 'KHONG_DU_QUYEN';
}

/** Lý do khoá ô soạn khi người nhận ngưng hoạt động; chỉ Bệnh nhân có gợi ý nhắn lễ tân. */
export function recipientInactiveReason(role: ChatRole): string {
  return role === 'BenhNhan'
    ? `${RECIPIENT_INACTIVE_MESSAGE} ${RECIPIENT_INACTIVE_PATIENT_HINT}`
    : RECIPIENT_INACTIVE_MESSAGE;
}
