import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppointmentTransitionService } from '../../../appointments/state/appointment-transition.service.js';
import { withBookingTransaction } from '../../../appointments/locking/booking-transaction.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../../common/time/time.js';
import { ExamNotifier } from '../notifications/exam-notifier.js';
import type { ExamCompletionResult } from './exam-completion.dto.js';
import { completionResult } from './exam-completion.failure.js';
import { readOwnedAppointment } from './exam-completion.repository.js';

// Xác nhận hoàn thành ca khám của BÁC SĨ (doctor-exam B1; PLAN 5.3, 5.4; Q5, Q17; HTK b1–b5, A1). Đây là CHỖ DUY NHẤT trong `doctor/` được nhắc `AppointmentTransitionService` và chỉ để gọi
// `complete` (PD-19 và AR-07); `UPDATE lich_hen` vẫn ở `appointments/state/` (AR-06, HD-08).
//
// Luồng (đúng thứ tự khoá của PLAN 5.3, không bao giờ xin tầng 1 đến 5):
//  1. Đọc THƯỜNG lịch theo mã VÀ `bac_si_id` = token, NGOÀI giao dịch. Không có ⇒ 404 `KHONG_TIM_THAY` (cùng thân với mã sai dạng và lịch của bác sĩ khác) và KHÔNG mở giao dịch ghi.
//  2. `withBookingTransaction` (READ COMMITTED, thử lại ≤ 2 cho 1213 và 1205): `complete` khoá `lich_hen` theo khoá chính, kiểm sở hữu rồi trạng thái, `UPDATE`; CHỈ KHI `Completed` mới ghi
//     `thong_bao` bằng đúng `em` đó. `complete` đứng TRƯỚC mọi ghi bảng có khoá ngoại tới `lich_hen`, kể cả `thong_bao` (H1: ghi trước rồi khoá X là tự nâng khoá, deadlock). Thân KHÔNG ném
//     `AppException` (ném thì lần hoàn thành bị hoàn tác theo, bài học A8) và chạy lại được: không giữ trạng thái giữa các lần, không tác dụng phụ ngoài `em`. Lỗi ghi thông báo ⇒ hoàn tác
//     cả hoàn thành (Q17).
//  3. SAU giao dịch đổi kết quả sang lỗi API ở MỘT chỗ (`completionResult`).
// KHÔNG kiểm hồ sơ khám (quyết định 17/10/2026), KHÔNG kiểm thời gian (`complete` không có; HTK-06), KHÔNG nhật ký, KHÔNG đụng `khung_gio` (vẫn `DaDat`), KHÔNG `email_thong_bao`.
// `bacSiId` CHỈ từ access token (điều kiện (3) của `complete`). Mốc `now` MỘT lần ngoài giao dịch (HD-08: không `NOW()`).

/** Nhãn của giao dịch cho cảnh báo thử lại (chỉ tên luồng, không dữ liệu). */
export const EXAM_COMPLETE_LABEL = 'exam-complete';

@Injectable()
export class ExamCompletionService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AppointmentTransitionService)
    private readonly transition: AppointmentTransitionService,
    @Inject(ExamNotifier) private readonly notifier: ExamNotifier,
  ) {}

  /** `maLichHen` đã chuẩn hoá chữ hoa (`ParseAppointmentCodePipe`); `bacSiId` là `user.accountId`. Ném `AppException` 404, 409 hoặc 503. */
  async complete(
    bacSiId: string,
    maLichHen: string,
  ): Promise<ExamCompletionResult> {
    const owned = await readOwnedAppointment(this.db, maLichHen, bacSiId);
    if (owned === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    const now = toSecond(nowVN());

    const outcome = await withBookingTransaction(
      this.db,
      async (em) => {
        const result = await this.transition.complete(em, {
          lichHenId: owned.lichHenId,
          bacSiId,
        });
        if (result.kind === 'Completed')
          await this.notifier.notifyCompleted(em, {
            lichHenId: owned.lichHenId,
            taiKhoanId: owned.benhNhanId,
            maLichHen: owned.maLichHen,
            now,
          });
        return result;
      },
      { label: EXAM_COMPLETE_LABEL },
    );
    return completionResult(outcome, owned.maLichHen);
  }
}
