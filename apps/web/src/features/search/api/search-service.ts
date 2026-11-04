import { request } from '../../../shared/api/client';
import type { ClinicInfo } from './search-types';

// Mọi lời gọi của module search đi qua đây và dùng `skipAuthToken`: route công khai không đọc token, nên không gắn
// Authorization và không kích hoạt làm mới phiên khi token cũ hết hạn (H7, CC-08).
const PUBLIC_OPTIONS = { skipAuthToken: true } as const;

export function getClinicInfo(signal?: AbortSignal): Promise<ClinicInfo> {
  return request<ClinicInfo>('public/clinic-info', {
    ...PUBLIC_OPTIONS,
    signal,
  });
}
