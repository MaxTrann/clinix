// Kiểu dữ liệu của API nhắn tin (chat B2, B4; PLAN chat 5.6). Id BIGINT là chuỗi; thời điểm là ISO UTC (nơi hiển thị đổi sang giờ Việt Nam).
// Gửi tin vào hội thoại đã có (chat B3) do F3 thêm; bắt đầu trò chuyện (bác sĩ, chi nhánh), chi nhánh mặc định do F4 thêm.

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

/** Thân 201/200 của gửi tin (PLAN 5.6). */
export interface SendResult {
  hoiThoaiId: string;
  tinNhan: ChatMessage;
}

/** Đầu khung TRƯỚC tin đầu (`GET /chat/doctors/:id`, `GET /chat/branches/:id`; chat B3): cùng khoá với chi tiết hội thoại, `hoiThoaiId` = `null` khi chưa có. */
export interface StartHeader {
  hoiThoaiId: string | null;
  loai: ConversationKind;
  doiTac: ChatPartner;
  quanHe: Relationship | null;
  banner: boolean;
  coTheGui: boolean;
  lyDoKhongGui: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG' | null;
}

export const DEFAULT_BRANCH_SOURCES = [
  'LichHenSapToi',
  'LichHenDaKham',
] as const;
export type DefaultBranchSource = (typeof DEFAULT_BRANCH_SOURCES)[number];

/** Chi nhánh gợi ý để nhắn lễ tân (Q4, MH2); `null` ⇒ web dùng chi nhánh đang chọn ở trình duyệt (MH1). */
export interface DefaultBranch {
  chiNhanhId: string | null;
  nguon: DefaultBranchSource | null;
}

/** Một dòng của bộ chọn chi nhánh (chỉ các khoá chat dùng từ `GET /public/branches`). */
export interface BranchOption {
  chiNhanhId: string;
  ten: string;
  diaChi: string;
}
