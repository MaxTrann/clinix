import { request } from '../../../../shared/api/client';
import { UnexpectedResponseError } from '../../../../shared/api/errors';

// Hợp đồng `POST /doctor/appointments/:maLichHen/complete` (doctor-exam B1, PLAN 5.4, Q5): thân rỗng; 200 `{ maLichHen, trangThai: 'HoanThanh' }`. Lỗi: 404 `KHONG_TIM_THAY`, 409
// `CHUYEN_TRANG_THAI_KHONG_HOP_LE` (kèm `chiTiet.tuTrangThai`), 403, 401, 503 `HE_THONG_DANG_BAN`. API KHÔNG idempotent: gọi lần hai khi đã hoàn thành ⇒ 409. Câu chữ theo mã lỗi ở `exam-messages.ts`.
export interface CompleteResult {
  maLichHen: string;
  trangThai: 'HoanThanh';
}

function isCompleteResult(value: unknown): value is CompleteResult {
  if (typeof value !== 'object' || value === null) return false;
  const { maLichHen, trangThai } = value as Record<string, unknown>;
  return typeof maLichHen === 'string' && trangThai === 'HoanThanh';
}

// Không `json`: thân rỗng, không `Content-Type` (thân lạ là 400 `TRUONG_KHONG_DUOC_PHEP`). Mã lịch đi qua `encodeURIComponent`.
// 200 sai hình dạng ⇒ `UnexpectedResponseError`, nơi gọi coi là "chưa rõ" (máy chủ có thể đã lưu) chứ không phải thành công.
export async function completeAppointment(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<CompleteResult> {
  const body = await request<unknown>(
    `/doctor/appointments/${encodeURIComponent(maLichHen)}/complete`,
    { method: 'POST', signal },
  );
  if (!isCompleteResult(body)) throw new UnexpectedResponseError(200);
  return body;
}
