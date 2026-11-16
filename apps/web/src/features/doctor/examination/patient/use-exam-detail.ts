import { useRemote } from '../../../../shared/hooks/use-remote';
import { getPatientExamDetail } from '../api/exam-api';
import type { ExamDetail } from '../api/patient-exam-types';

// Bước C: chi tiết của ca đang chọn (`?ca=`), lấy THEO MÃ (không dựng từ dòng danh sách) nên mở thẳng `?ca=` cũng chạy. Đổi ca ⇒ yêu cầu cũ bị huỷ và ngăn phải về "đang tải" ngay (không bao giờ hiện chi tiết của ca trước cho ca sau).
// Không ca nào được chọn ⇒ không gọi API (kết quả `null`).
export function useExamDetail(maLichHen: string | null) {
  return useRemote<ExamDetail | null>(
    (signal) =>
      maLichHen === null
        ? Promise.resolve(null)
        : getPatientExamDetail(maLichHen, signal),
    [maLichHen ?? ''],
  );
}
