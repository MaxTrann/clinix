// Kiểu dữ liệu của API nhắn tin (chat B2, B4; PLAN chat 5.6). Id BIGINT là chuỗi; thời điểm là ISO UTC (nơi hiển thị đổi sang giờ Việt Nam).
// Phần gửi tin, bắt đầu trò chuyện (chat B3) do F3, F4 thêm khi dùng.

export const CHAT_ROLES = ['BenhNhan', 'BacSi', 'LeTan'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const CONVERSATION_KINDS = ['BenhNhan_BacSi', 'BenhNhan_LeTan'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const REPLY_STATUSES = ['ChoTraLoi', 'DaTraLoi'] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

export const RELATIONSHIPS = ['DaTungKham', 'ChuaTungKham'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

/** Bộ lọc danh sách: `tat-ca`, `chua-doc` cho mọi vai trò; `bac-si`, `le-tan` chỉ Bệnh nhân. */
export const CONVERSATION_FILTERS = [
  'tat-ca',
  'chua-doc',
  'bac-si',
  'le-tan',
] as const;
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export interface ChatPartner {
  vaiTro: ChatRole;
  tenHienThi: string;
  /** Chỉ có khi người xem là Lễ tân (Q23). */
  soDienThoai?: string;
}

export interface ConversationListItem {
  id: string;
  loai: ConversationKind;
  doiTac: ChatPartner;
  tinCuoi: {
    id: string;
    trichDan: string;
    nguoiGuiHienThi: string;
    thoiDiemGui: string;
  };
  /** Trần 100 (hiện "99+"). */
  soTinChuaDoc: number;
  /** Chỉ cho Lễ tân; vai trò khác `null`. */
  trangThaiTraLoi: ReplyStatus | null;
  traLoiBoi: string | null;
  /** Chỉ hội thoại bác sĩ; hộp thư chung `null`. */
  quanHe: Relationship | null;
}

export interface ConversationPage {
  items: ConversationListItem[];
  /** Con trỏ `truoc` cho trang sau; `null` = hết. */
  truocTiepTheo: string | null;
}

export interface ConversationDetail {
  id: string;
  loai: ConversationKind;
  doiTac: ChatPartner;
  quanHe: Relationship | null;
  banner: boolean;
  coTheGui: boolean;
  lyDoKhongGui: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG' | null;
}

export interface ChatFileInfo {
  ten: string;
  loai: string;
  dungLuong: number;
}

export interface ChatMessage {
  id: string;
  laCuaToi: boolean;
  nguoiGui: { vaiTro: ChatRole; tenHienThi: string };
  noiDung: string;
  tep: ChatFileInfo | null;
  thoiDiemGui: string;
  /** Chỉ có ở tin của chính mình (gửi lại cùng mã); tin người khác `null`. */
  maGui: string | null;
}

export interface MessagePage {
  /** Theo id TĂNG dần. */
  items: ChatMessage[];
  coThem: boolean;
}

/** Một trong hai con trỏ (không dùng cùng lúc); không có = trang mới nhất. */
export type MessageCursor = { truoc: string } | { sau: string } | null;
