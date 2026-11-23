import { ServerCrash, WifiOff, type LucideIcon } from 'lucide-react';
import { NetworkError, TimeoutError } from '../api/errors';

// Bộ chữ chung của màn lỗi 500 (cả trang) và khối lỗi nhỏ `ErrorState` (doctor UX4, G18, T9). Một nguồn duy nhất để hai nơi luôn cùng icon và tiêu đề.
// T9: MỘT màn 500 có HAI biến thể chữ: (1) sự cố hệ thống; (2) mất kết nối HOẶC quá thời gian (cùng một tiêu đề, câu phân biệt hai trường hợp).
// Chữ do UX4 đề xuất, Đại duyệt 23/11/2026. Chọn biến thể CHỈ theo loại lỗi (`instanceof`): không bao giờ đọc `.message`, `thongBao`, `requestId`, `chiTiet`,
// nên không thể in chi tiết lỗi ra màn hình.

export type ErrorVariant = 'system' | 'connection';

export const ERROR_VARIANTS: Record<
  ErrorVariant,
  { icon: LucideIcon; title: string }
> = {
  system: { icon: ServerCrash, title: 'Hệ thống đang gặp sự cố' },
  connection: { icon: WifiOff, title: 'Không kết nối được tới hệ thống' },
};

// Câu trên màn cả trang. Khối lỗi nhỏ KHÔNG dùng các câu này mà giữ câu cũ của `errorMessageFor` (dùng chung với nhiều form).
const SYSTEM_PAGE_MESSAGE =
  'Hệ thống chưa xử lý được yêu cầu. Vui lòng thử lại sau ít phút.';
const NETWORK_PAGE_MESSAGE = 'Hãy kiểm tra kết nối mạng rồi bấm Thử lại.';
const TIMEOUT_PAGE_MESSAGE =
  'Yêu cầu mất quá nhiều thời gian. Hãy bấm Thử lại sau ít phút.';

// Mọi thứ không phải lỗi mạng (5xx, `LOI_HE_THONG`, phản hồi không phải JSON, lỗi render, lỗi lạ) đều là sự cố hệ thống
export function errorVariantOf(error: unknown): ErrorVariant {
  return error instanceof NetworkError || error instanceof TimeoutError
    ? 'connection'
    : 'system';
}

export function pageMessageFor(error: unknown): string {
  if (error instanceof NetworkError) return NETWORK_PAGE_MESSAGE;
  if (error instanceof TimeoutError) return TIMEOUT_PAGE_MESSAGE;
  return SYSTEM_PAGE_MESSAGE;
}
