import { LONG_TIMEOUT_MS, request } from '../../../shared/api/client';
import {
  parseCheckConfirmation,
  parseCheckSummary,
  parseCreatedAppointment,
  parseRelatives,
} from './booking-readers';
import type {
  BookingConfirmation,
  BookingSummary,
  CreateAppointmentBody,
  CreatedAppointment,
  EligibilityResult,
  VisitRelative,
} from './booking-types';

// Mọi lời gọi của module booking đi qua `request()` (lớp API client duy nhất). Route của Bệnh nhân nên GẮN access token
// (khác `search`, nơi mọi route công khai dùng `skipAuthToken`).

// Cổng vào luồng đặt lịch (A4). CHỈ ĐỌC: không giữ chỗ, không ghi gì.
export function getEligibility(
  signal?: AbortSignal,
): Promise<EligibilityResult> {
  return request<EligibilityResult>('booking/eligibility', { signal });
}

// Hồ sơ người thân của Bệnh nhân đang đăng nhập (patient B3), CHỈ đọc, không phân trang. Client RIÊNG của booking: `features/` không import chéo nên không dùng
// `features/patient`. Trả các hồ sơ ĐANG HIỆU LỰC (bộ đọc bỏ hồ sơ ngừng sử dụng).
export async function getRelatives(
  signal?: AbortSignal,
): Promise<VisitRelative[]> {
  return parseRelatives(
    await request<unknown>('patient/relatives', { signal }),
  );
}

// Kiểm không khoá (B7): CHỈ ĐỌC, không giữ chỗ, không ghi gì. `hoSoNguoiThanId = null` là hồ sơ BẢN THÂN. `checks` KHÔNG nhận `lyDoKham` (chỉ tạo lịch mới nhận).
// Id là chuỗi, đi nguyên vẹn (id lớn hơn 2^53 mà ép `Number` sẽ trỏ nhầm hồ sơ khác).
export async function postCheck(
  khungGioId: string,
  hoSoNguoiThanId: string | null,
  signal?: AbortSignal,
): Promise<BookingSummary> {
  return parseCheckSummary(
    await requestCheck(khungGioId, hoSoNguoiThanId, signal),
  );
}

// Cùng lời gọi `checks` cho Bước 5 (booking F5): đọc ĐỦ 12 khoá của `tomTat` (giá, cọc, chính sách hoàn, chi nhánh…) thay vì ba khoá của Bước 4.
export async function postCheckConfirmation(
  khungGioId: string,
  hoSoNguoiThanId: string | null,
  signal?: AbortSignal,
): Promise<BookingConfirmation> {
  return parseCheckConfirmation(
    await requestCheck(khungGioId, hoSoNguoiThanId, signal),
  );
}

function requestCheck(
  khungGioId: string,
  hoSoNguoiThanId: string | null,
  signal?: AbortSignal,
): Promise<unknown> {
  return request<unknown>('booking/checks', {
    method: 'POST',
    json: { khungGioId, hoSoNguoiThanId },
    signal,
  });
}

// TẠO lịch hẹn và giữ chỗ (B8; booking F5). KHÔNG idempotent: mỗi lần gọi là đúng một `fetch`, không bao giờ tự gửi lại (nơi gọi quyết định, và chỉ khi người dùng bấm).
// Thân đúng ba khoá, `null` giữ `null` (backend nhận cả hai; không `''`). KHÔNG truyền `signal`: rời trang không huỷ một `POST` ghi mà máy chủ vẫn xử lý, nên việc "không kéo
// người dùng quay lại" do nơi gọi lo bằng `usePageActive`. Chờ tối đa `LONG_TIMEOUT_MS` (45 giây, nhỏ hơn `proxy_read_timeout` 60 giây của nginx) thay vì 15 giây: hết giờ
// giả biến một lần thành công chậm thành "chưa rõ" [đề xuất; độ trễ thật của route này chưa đo, X3]. 201 sai hình dạng ném `UnexpectedResponseError` (nơi gọi coi là "chưa rõ").
export async function createAppointment(
  body: CreateAppointmentBody,
): Promise<CreatedAppointment> {
  return parseCreatedAppointment(
    await request<unknown>('booking/appointments', {
      method: 'POST',
      json: {
        khungGioId: body.khungGioId,
        hoSoNguoiThanId: body.hoSoNguoiThanId,
        lyDoKham: body.lyDoKham,
      },
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  );
}
