import { AppException } from '../../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../../common/errors/error-codes.js';
import type { CompleteOutcome } from '../../../appointments/state/appointment-transition.service.js';
import { invalidTransitionException } from '../../../appointments/status/status-failure.js';
import type { ExamCompletionResult } from './exam-completion.dto.js';

// MỘT ánh xạ duy nhất từ kết quả có kiểu của `complete` sang kết quả API (doctor-exam B1; PLAN 5.4 bước 3). Bên trong giao dịch chỉ trả KẾT QUẢ CÓ KIỂU; đổi sang lỗi ở đây,
// SAU khi giao dịch đã đóng (nếp A8: ném trong giao dịch thì lần ghi đã làm bị hoàn tác theo). Hàm thuần; cố ý KHÔNG nhắc tên lớp dịch vụ chuyển trạng thái của booking
// (PD-19 chỉ cho đúng một file là `exam-completion.service.ts`): chỉ dùng KIỂU `CompleteOutcome`. `HE_THONG_DANG_BAN` (503) do `withBookingTransaction` ném khi hết lượt thử lại.
//  - `Completed` ⇒ `{ maLichHen, trangThai: 'HoanThanh' }` (200).
//  - `NotAssigned` ⇒ 404 `KHONG_TIM_THAY` CÙNG thân với mã sai dạng (pipe) và lịch của bác sĩ khác.
//  - `InvalidState` ⇒ 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` kèm `chiTiet { tuTrangThai, denTrangThai: 'HoanThanh' }`, cùng hình dạng với route override của booking. Bấm lần hai
//    (lịch đã `HoanThanh`) cũng ra mã này: API KHÔNG idempotent 200 (2.4 A1); giao diện coi `tuTrangThai === 'HoanThanh'` là "ca đã hoàn thành".
export function completionResult(
  outcome: CompleteOutcome,
  maLichHen: string,
): ExamCompletionResult {
  switch (outcome.kind) {
    case 'Completed':
      return { maLichHen, trangThai: 'HoanThanh' };
    case 'NotAssigned':
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    case 'InvalidState':
      throw invalidTransitionException(outcome.trangThai, 'HoanThanh');
  }
}
