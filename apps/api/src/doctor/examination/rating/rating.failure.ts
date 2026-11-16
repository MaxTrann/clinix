import { AppException } from '../../../common/errors/app.exception.js';
import { EXAM_ERROR_CODES } from '../examination.constants.js';
import type { RatingView } from './rating.dto.js';

// MỘT ánh xạ duy nhất từ kết quả có kiểu của thân giao dịch sang kết quả API (doctor-exam B6; PLAN 5.7 bước 3, 4). Bên trong giao dịch chỉ trả KẾT QUẢ CÓ KIỂU; đổi sang lỗi ở đây, SAU khi giao dịch đã
// đóng (nếp A8). Hàm thuần. 404 (không phải của mình), 409 chưa hoàn thành và 400 do `RatingService` ném TRƯỚC giao dịch; `HE_THONG_DANG_BAN` (503) do `withBookingTransaction` khi hết lượt thử lại.
//  - `Rated` ⇒ 201 `RatingView`.
//  - `AlreadyRated` ⇒ 409 `DA_DANH_GIA` (1062 trên UNIQUE `lich_hen_id`: lần gửi thứ hai, kể cả hai lần cùng lúc; đánh giá cũ không đổi).

export type RatingOutcome =
  { kind: 'Rated'; rating: RatingView } | { kind: 'AlreadyRated' };

export function ratingResult(outcome: RatingOutcome): RatingView {
  switch (outcome.kind) {
    case 'Rated':
      return outcome.rating;
    case 'AlreadyRated':
      throw new AppException(409, EXAM_ERROR_CODES.ALREADY_RATED);
  }
}
