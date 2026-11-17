import { request } from '../../../../shared/api/client';
import { UnexpectedResponseError } from '../../../../shared/api/errors';
import type { ExamRecordNote, SaveBody } from '../exam-record-form';
import {
  parseAdminReviewDetail,
  parseAdminReviewPage,
} from './admin-review-readers';
import type {
  AdminReviewDetail,
  AdminReviewPage,
  AdminReviewQuery,
} from './admin-review-types';
import {
  parseExamDetail,
  parseExamListPage,
  parseRatingResult,
} from './patient-exam-readers';
import type {
  ExamDetail,
  ExamListPage,
  ExamListQuery,
  ExamRating,
  RatingBody,
} from './patient-exam-types';

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

// Hợp đồng `GET /patient/exam-records` (doctor-exam B4, PLAN 5.6): query `nguoiKham` (`BanThan` hoặc id hồ sơ người thân), `nam`, `thang`, `pageSize` (tối đa 50); KHÔNG thân. 200 qua bộ đọc CHẶT (khoá lạ bị bỏ, sai hình dạng ⇒
// `UnexpectedResponseError`). Client bỏ khoá `undefined`, nên "tất cả người khám" và "cả năm" là vắng khoá. Dữ liệu sức khoẻ: không vào log hay URL của trình duyệt (chỉ là query gửi đi).
export async function getPatientExamRecords(
  query: ExamListQuery,
  signal?: AbortSignal,
): Promise<ExamListPage> {
  const body = await request<unknown>('/patient/exam-records', {
    query: {
      nguoiKham: query.nguoiKham,
      nam: query.nam,
      thang: query.thang,
      pageSize: query.pageSize,
    },
    signal,
  });
  return parseExamListPage(body);
}

// Hợp đồng `GET /patient/exam-records/:maLichHen` (doctor-exam B5): mọi lỗi "không thấy" là CÙNG 404 `KHONG_TIM_THAY`. Mã lịch đi qua `encodeURIComponent`.
export async function getPatientExamDetail(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<ExamDetail> {
  const body = await request<unknown>(
    `/patient/exam-records/${encodeURIComponent(maLichHen)}`,
    { signal },
  );
  return parseExamDetail(body);
}

// Hợp đồng `POST /patient/exam-records/:maLichHen/rating` (doctor-exam B6, PLAN 5.7; Q7, Q19): thân `{ soSao, nhanXet? }`; 201 đúng ba khoá `{ soSao, nhanXet (null khi trống), thoiDiemTao }`. Lỗi: 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong, ma }]`, 404
// `KHONG_TIM_THAY`, 409 `LICH_HEN_CHUA_HOAN_THANH`, 409 `DA_DANH_GIA`, 503 `HE_THONG_DANG_BAN`, 403, 401. API KHÔNG idempotent: gửi lần hai (bấm đúp, mất mạng rồi gửi lại) nhận 409 `DA_DANH_GIA`, nên nơi gọi KHÔNG BAO GIỜ tự gửi lại.
// Mã lịch đi qua `encodeURIComponent`. 201 sai hình dạng ⇒ `UnexpectedResponseError`: nơi gọi coi là "chưa rõ" (máy chủ có thể đã lưu), KHÔNG phải thành công. Nhận xét là dữ liệu của người dùng: không vào log hay URL (chỉ nằm trong thân gửi đi).
export async function submitRating(
  maLichHen: string,
  body: RatingBody,
  signal?: AbortSignal,
): Promise<ExamRating> {
  const created = await request<unknown>(
    `/patient/exam-records/${encodeURIComponent(maLichHen)}/rating`,
    { method: 'POST', json: body, signal },
  );
  return parseRatingResult(created);
}

// Hợp đồng `GET /admin/doctor-ratings` (doctor-exam B7, PLAN 5.8; Quản trị viên, cả hai phạm vi): query `trangThai` (`HienThi` | `DaAn`), `soSao`, `bacSiId`, `chiNhanhId` (chỉ Toàn hệ thống), `q` (≤ 100), `page`, `pageSize` (≤ 50); KHÔNG thân.
// 200 qua bộ đọc CHẶT (khoá lạ bị bỏ, sai hình dạng ⇒ `UnexpectedResponseError`). Client bỏ khoá `undefined`. Tên người đặt và nhận xét là dữ liệu người dùng: không vào log hay URL của trình duyệt (chỉ là query gửi đi; `q` KHÔNG lên URL của trang).
export async function listAdminReviews(
  query: AdminReviewQuery,
  signal?: AbortSignal,
): Promise<AdminReviewPage> {
  const body = await request<unknown>('/admin/doctor-ratings', {
    query: {
      trangThai: query.trangThai,
      soSao: query.soSao,
      bacSiId: query.bacSiId,
      chiNhanhId: query.chiNhanhId,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    },
    signal,
  });
  return parseAdminReviewPage(body);
}

// Hợp đồng `GET /admin/doctor-ratings/:id` (B7): mọi lỗi "không thấy" (không có, sai dạng id, ngoài phạm vi) là CÙNG 404 `KHONG_TIM_THAY`. Id là BIGINT dạng chuỗi, đi qua `encodeURIComponent`; không tự gửi lại.
export async function getAdminReview(
  danhGiaId: string,
  signal?: AbortSignal,
): Promise<AdminReviewDetail> {
  const body = await request<unknown>(
    `/admin/doctor-ratings/${encodeURIComponent(danhGiaId)}`,
    { signal },
  );
  return parseAdminReviewDetail(body);
}
