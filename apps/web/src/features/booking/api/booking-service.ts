import { request } from '../../../shared/api/client';
import { parseCheckSummary, parseRelatives } from './booking-readers';
import type {
  BookingSummary,
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
    await request<unknown>('booking/checks', {
      method: 'POST',
      json: { khungGioId, hoSoNguoiThanId },
      signal,
    }),
  );
}
