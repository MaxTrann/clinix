import { request } from '../../../../shared/api/client';
import { UnexpectedResponseError } from '../../../../shared/api/errors';
import type { ExamRecordNote, SaveBody } from '../exam-record-form';

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

// Hợp đồng `PUT /doctor/appointments/:maLichHen/exam-record` (doctor-exam B2, PLAN 5.5; Q2, Q3): thân `SaveBody` (ba chuỗi, ngày `YYYY-MM-DD` hoặc `null`, token `capNhatLanCuoi` đã thấy hoặc `null`);
// 200 trả đúng năm khoá của hồ sơ với `capNhatLanCuoi` MỚI. Lỗi: 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong, ma }]` (không giá trị), 404 `KHONG_TIM_THAY`, 409 `KHONG_THE_GHI_HO_SO_KHAM`,
// 409 `HO_SO_KHAM_DA_THAY_DOI`, 403, 401, 503 `HE_THONG_DANG_BAN`. Không idempotent vì có token: gửi lại cùng thân sau khi lần đầu đã lưu nhận 409. Câu chữ theo mã lỗi ở `exam-messages.ts`.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function readSavedRecord(value: unknown): ExamRecordNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const {
    trieuChung,
    chanDoanSoBo,
    huongXuLy,
    ngayTaiKhamDuKien,
    capNhatLanCuoi,
  } = value as Record<string, unknown>;
  const dateOk =
    ngayTaiKhamDuKien === null ||
    (typeof ngayTaiKhamDuKien === 'string' &&
      DATE_ONLY.test(ngayTaiKhamDuKien));
  if (
    typeof trieuChung !== 'string' ||
    typeof chanDoanSoBo !== 'string' ||
    typeof huongXuLy !== 'string' ||
    !dateOk ||
    typeof capNhatLanCuoi !== 'string' ||
    !ISO_DATE_TIME.test(capNhatLanCuoi)
  ) {
    return null;
  }
  // Chép đúng năm khoá: khoá thừa của máy chủ không đi tiếp
  return {
    trieuChung,
    chanDoanSoBo,
    huongXuLy,
    ngayTaiKhamDuKien: ngayTaiKhamDuKien as string | null,
    capNhatLanCuoi,
  };
}

// Mã lịch đi qua `encodeURIComponent`. 200 sai hình dạng ⇒ `UnexpectedResponseError`: nơi gọi coi là "chưa rõ" (máy chủ có thể đã lưu), KHÔNG phải thành công. Nội dung hồ sơ là dữ liệu sức khoẻ: không vào log hay URL.
export async function saveExamRecord(
  maLichHen: string,
  body: SaveBody,
  signal?: AbortSignal,
): Promise<ExamRecordNote> {
  const saved = await request<unknown>(
    `/doctor/appointments/${encodeURIComponent(maLichHen)}/exam-record`,
    { method: 'PUT', json: body, signal },
  );
  const note = readSavedRecord(saved);
  if (note === null) throw new UnexpectedResponseError(200);
  return note;
}
