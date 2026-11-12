import { request } from '../../../shared/api/client';
import type { EligibilityResult } from './booking-types';

// Mọi lời gọi của module booking đi qua `request()` (lớp API client duy nhất). Route của Bệnh nhân nên GẮN access token
// (khác `search`, nơi mọi route công khai dùng `skipAuthToken`).

// Cổng vào luồng đặt lịch (A4). CHỈ ĐỌC: không giữ chỗ, không ghi gì.
export function getEligibility(
  signal?: AbortSignal,
): Promise<EligibilityResult> {
  return request<EligibilityResult>('booking/eligibility', { signal });
}
