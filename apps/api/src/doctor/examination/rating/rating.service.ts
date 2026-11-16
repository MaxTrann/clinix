import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { withBookingTransaction } from '../../../appointments/locking/booking-transaction.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../../common/time/time.js';
import { isDuplicateKeyError } from '../../../database/mysql-errors.js';
import { fieldErrorsException } from '../exam-record/exam-record.failure.js';
import { EXAM_ERROR_CODES } from '../examination.constants.js';
import type { RatingDto, RatingView } from './rating.dto.js';
import { ratingResult, type RatingOutcome } from './rating.failure.js';
import {
  insertRating,
  readOwnedForRating,
  readRating,
} from './rating.repository.js';
import {
  canRate,
  validateRatingInput,
  type ValidRating,
} from './rating.rules.js';

// Gửi đánh giá bác sĩ của BỆNH NHÂN (doctor-exam B6; PLAN 5.3, 5.7; Q6, Q7, Q18, Q19; DGB b1–b5, A1, A2). Không ghi nhật ký, không thông báo, không đụng `lich_hen` hay `ho_so_kham`.
//
// Luồng (không khoá tường minh: `HoanThanh` là trạng thái cuối và chủ lịch bất biến nên bản đọc ngoài giao dịch không thể cũ về nghĩa, H8; đua hai lần gửi do UNIQUE `lich_hen_id` giải quyết):
//  1. `validateRatingInput` (số sao, nhận xét): lỗi ⇒ 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[]`, CHƯA chạm DB.
//  2. Đọc THƯỜNG lịch theo `benh_nhan_id` (access token) VÀ mã, NGOÀI giao dịch. Không có ⇒ 404 `KHONG_TIM_THAY`: lịch của người khác, không có, ở MỌI trạng thái cho CÙNG kết quả. Sở hữu đi TRƯỚC trạng thái.
//  3. Lịch chưa `HoanThanh` ⇒ 409 `LICH_HEN_CHUA_HOAN_THANH` kèm `chiTiet { trangThai }`. Không mở giao dịch. Hồ sơ khám, hồ sơ người thân đã ngừng dùng, thời hạn sau Hoàn thành KHÔNG liên quan (Q6, Q18, Q7).
//  4. `withBookingTransaction` (READ COMMITTED; trần chờ khoá 3 giây và thử lại ≤ 2 cho 1213 và 1205 ⇒ 503, thay vì chờ 50 giây): `INSERT` (`INSERT` xin khoá S ngầm trên `lich_hen`, nên chờ `PUT` hồ sơ đang giữ X: X1 M3) rồi
//     đọc lại. Thân trả KẾT QUẢ CÓ KIỂU, KHÔNG ném `AppException` (ném thì lần ghi bị hoàn tác, A8) và chạy lại được: chỉ đọc biến của lần gọi (`lichHenId`, `rating`, `now` cố định).
//     1062 ở `INSERT` ⇒ `AlreadyRated` (bắt TRONG thân: ném ra thì không phải lỗi thử lại và giao dịch rollback).
//  5. SAU giao dịch đổi kết quả sang 201 hay 409 `DA_DANH_GIA` ở MỘT chỗ (`ratingResult`).
// `patientId` CHỈ từ access token; `lich_hen_id` CHỈ từ lịch đã đọc ở bước 2. Mốc `now` MỘT lần ngoài giao dịch (HD-08: không `NOW()`), cắt giây để DATETIME không làm tròn sang giây sau.

/** Nhãn của giao dịch cho cảnh báo thử lại (chỉ tên luồng, không dữ liệu). */
export const RATING_LABEL = 'exam-rating';

@Injectable()
export class RatingService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** `maLichHen` đã chuẩn hoá chữ hoa (`ParseAppointmentCodePipe`); `patientId` là `user.accountId`. Ném `AppException` 400, 404, 409 hoặc 503. */
  async submit(
    patientId: string,
    maLichHen: string,
    body: RatingDto,
  ): Promise<RatingView> {
    const checked = validateRatingInput(body);
    if (!checked.ok) throw fieldErrorsException(checked.errors);
    const owned = await readOwnedForRating(this.db, patientId, maLichHen);
    if (owned === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    if (!canRate(owned.trangThai))
      throw new AppException(409, EXAM_ERROR_CODES.NOT_COMPLETED, {
        chiTiet: { trangThai: owned.trangThai },
      });
    const now = toSecond(nowVN());
    const outcome = await withBookingTransaction(
      this.db,
      (em) => this.write(em, owned.lichHenId, checked.value, now),
      { label: RATING_LABEL },
    );
    return ratingResult(outcome);
  }

  private async write(
    em: EntityManager,
    lichHenId: string,
    rating: ValidRating,
    now: Date,
  ): Promise<RatingOutcome> {
    try {
      await insertRating(em, lichHenId, rating, now);
    } catch (error) {
      if (isDuplicateKeyError(error)) return { kind: 'AlreadyRated' };
      throw error;
    }
    const saved = await readRating(em, lichHenId);
    if (saved === null) throw new Error('Đánh giá vừa ghi không đọc lại được');
    return { kind: 'Rated', rating: saved };
  }
}
