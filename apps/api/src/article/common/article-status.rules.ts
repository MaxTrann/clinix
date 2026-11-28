import { toSecond } from '../../common/time/time.js';
import type { TrangThaiBaiViet } from '../entities/enums.js';

// Vòng đời bài viết (PLAN article 5.3, MH1 đến MH4). Hàm THUẦN: "bây giờ" do nơi gọi đưa vào (nowVN(), đồng hồ giả được).

/** Bảng chuyển trạng thái hợp lệ: tự do giữa ba trạng thái (MH4); chuyển sang đúng trạng thái đang có không đổi gì (xử lý ở `planStatusChange`). */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<TrangThaiBaiViet, readonly TrangThaiBaiViet[]>
> = {
  BanNhap: ['DaXuatBan', 'LuuTruAn'],
  DaXuatBan: ['BanNhap', 'LuuTruAn'],
  LuuTruAn: ['BanNhap', 'DaXuatBan'],
};

/** Tạo bài mới chỉ ở `BanNhap` hay `DaXuatBan` (MH1: không tạo thẳng `LuuTruAn`). */
export function canCreateWithStatus(status: TrangThaiBaiViet): boolean {
  return status === 'BanNhap' || status === 'DaXuatBan';
}

/** MH2: bài ở trạng thái KẾT QUẢ `DaXuatBan` phải có nội dung (kể cả khi chỉ sửa nội dung của bài đang xuất bản). */
export function needsContent(resultStatus: TrangThaiBaiViet): boolean {
  return resultStatus === 'DaXuatBan';
}

export interface StatusPlan {
  /** Trạng thái có đổi không (cùng trạng thái thì không: 200 không đổi gì, chống bấm đúp). */
  statusChanged: boolean;
  /** Giá trị `thoi_diem_xuat_ban` sau khi đổi: đặt MỘT lần ở lần đầu sang `DaXuatBan`, về sau GIỮ NGUYÊN (MH3). */
  thoiDiemXuatBan: Date | null;
}

/**
 * Kế hoạch đổi trạng thái. `thoi_diem_xuat_ban` chỉ được đặt khi chuyển sang `DaXuatBan` mà cột còn NULL (cắt giây theo `toSecond`);
 * lưu trữ rồi xuất bản lại, hay sửa nội dung, đều giữ nguyên giá trị cũ.
 */
export function planStatusChange(
  current: TrangThaiBaiViet,
  next: TrangThaiBaiViet,
  currentPublishedAt: Date | null,
  now: Date,
): StatusPlan {
  if (current === next)
    return { statusChanged: false, thoiDiemXuatBan: currentPublishedAt };
  if (next === 'DaXuatBan' && currentPublishedAt === null)
    return { statusChanged: true, thoiDiemXuatBan: toSecond(now) };
  return { statusChanged: true, thoiDiemXuatBan: currentPublishedAt };
}
