import { AppException } from '../../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../../common/errors/error-codes.js';
import { EXAM_ERROR_CODES } from '../examination.constants.js';
import type { HiddenRatingView } from './rating-hide.dto.js';

// MỘT ánh xạ duy nhất từ kết quả có kiểu của thân giao dịch sang kết quả API (doctor-exam B8; PLAN 5.8; nếp `rating.failure.ts`, A8). Bên trong giao dịch chỉ trả KẾT QUẢ CÓ KIỂU; đổi sang lỗi ở đây,
// SAU khi giao dịch đã đóng. Hàm thuần. 400 (lý do), 404 (không có hay ngoài phạm vi) do `RatingHideService` ném TRƯỚC giao dịch; `HE_THONG_DANG_BAN` (503) do `withBookingTransaction` khi hết lượt thử lại.
//  - `Hidden` ⇒ 200 `{ danhGiaId, biAn: true }`.
//  - `AlreadyHidden` ⇒ 409 `DANH_GIA_DA_AN` (lần ẩn thứ hai, kể cả hai Quản trị viên cùng lúc). KHÔNG `chiTiet`: không lộ lý do cũ hay người ẩn.
//  - `NotFound` ⇒ 404 `KHONG_TIM_THAY` (đánh giá biến mất giữa đọc thường và khoá: không xảy ra ở DB thật vì không có đường xoá).

export type HideOutcome =
  { kind: 'Hidden' } | { kind: 'AlreadyHidden' } | { kind: 'NotFound' };

export function hideResult(
  danhGiaId: string,
  outcome: HideOutcome,
): HiddenRatingView {
  switch (outcome.kind) {
    case 'Hidden':
      return { danhGiaId, biAn: true };
    case 'AlreadyHidden':
      throw new AppException(409, EXAM_ERROR_CODES.RATING_ALREADY_HIDDEN);
    case 'NotFound':
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
  }
}
