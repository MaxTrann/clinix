import { ApiError } from '../../../../../shared/api/errors';
import { CODE_INVALID_INPUT } from '../error-kinds';

// Mã TRƯỜNG của `q` sai dạng (B8: 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong: 'q', ma: 'MA_LICH_HEN_KHONG_HOP_LE' }]`). Web chặn sớm bằng cùng mẫu (`request-code.ts`) nên đây chỉ là lưới an toàn khi hai bên lệch nhau.
const FIELD_CODE_INVALID_CODE = 'MA_LICH_HEN_KHONG_HOP_LE';

// API vừa từ chối mã lịch hẹn đã gửi (thay vì hiện khối lỗi chung kèm `Thử lại`, vô ích vì cùng yêu cầu cùng kết quả, trang báo lỗi cạnh ô tìm)
export function isCodeRejected(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.maLoi === CODE_INVALID_INPUT &&
    (error.loi?.some((item) => item.ma === FIELD_CODE_INVALID_CODE) ?? false)
  );
}
