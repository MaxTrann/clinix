import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type {
  KieuLienKet,
  NhomSuKien,
} from '../catalog/notification-catalog.js';

// Hợp đồng API Trung tâm thông báo (notification B2; PLAN notification 5.4, Q11 đến Q13; use case 2.4.59).

/** Ba bộ lọc của danh sách (tab Tất cả, Chưa đọc, Đã đọc). */
export const TRANG_THAI_DOC_VALUES = ['tat-ca', 'chua-doc', 'da-doc'] as const;
export type TrangThaiDocFilter = (typeof TRANG_THAI_DOC_VALUES)[number];

/**
 * `GET /notifications?page=&pageSize=&trangThaiDoc=`. `page` mặc định 1, `pageSize` mặc định 20, tối đa 100 (PageQueryDto dùng chung).
 * Giá trị lạ (`abc`, rỗng, `CHUA-DOC`) ⇒ 400 `DU_LIEU_KHONG_HOP_LE` với `loi[{truong: 'trangThaiDoc', ma: 'IS_IN'}]` (mã ràng buộc có sẵn, không đặt mã mới: 5.11).
 * Không có trường `taiKhoanId`: tài khoản chỉ lấy từ token; gửi `?taiKhoanId=` là 400 do `forbidNonWhitelisted` (QTB-04).
 */
export class NotificationListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(TRANG_THAI_DOC_VALUES)
  trangThaiDoc: TrangThaiDocFilter = 'tat-ca';
}

/**
 * Liên kết trung tính theo vai trò: web tự dựng đường dẫn. Lịch hẹn mang mã lịch (không bao giờ id nội bộ).
 * Hội thoại (chat B6) mang id hội thoại: chat dùng id công khai ở mọi route (PLAN chat 5.6), quyền xem do API chat kiểm lại.
 */
export type NotificationLink =
  | { kieu: 'LichHen'; maLichHen: string }
  | { kieu: 'HoiThoai'; hoiThoaiId: string }
  | { kieu: Exclude<NonNullable<KieuLienKet>, 'LichHen' | 'HoiThoai'> };

/** Một thông báo: danh sách trắng tám khoá (TTB-01, HTB-01). Không có `taiKhoanId`, `lichHenId`, id yêu cầu hay trạng thái thư. */
export interface NotificationItem {
  id: string;
  /** Phần gốc của `loai_su_kien` (bỏ hậu tố `:v{n}`). */
  loai: string;
  /** `null` khi mã không có trong danh mục (dữ liệu cũ hay mã lạ) `[đề xuất]`. */
  nhom: NhomSuKien | null;
  tieuDe: string;
  /** Nguyên văn `thong_bao.noi_dung` (không cắt, không thoát: web hiển thị dạng chữ). */
  noiDung: string;
  daDoc: boolean;
  /** `toISOString()` (UTC); web đổi sang giờ Việt Nam. */
  thoiDiemTao: string;
  lienKet: NotificationLink | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  /** Tổng theo bộ lọc đang chọn. */
  total: number;
  page: number;
  pageSize: number;
  /** LUÔN là tổng chưa đọc của tài khoản, không theo bộ lọc (TTB-02). */
  soChuaDoc: number;
}

export interface UnreadCountResponse {
  soChuaDoc: number;
}

export interface MarkReadResponse {
  id: string;
  daDoc: true;
  soChuaDoc: number;
}

export interface MarkAllReadResponse {
  daDanhDau: number;
  soChuaDoc: number;
}
