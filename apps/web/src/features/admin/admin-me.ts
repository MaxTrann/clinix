import { request } from '../../shared/api/client';

export type AdminMe =
  | { phamVi: 'ToanHeThong' }
  | { phamVi: 'ChiNhanh'; chiNhanh: { id: string; ten: string } };

export function getAdminMe(signal?: AbortSignal): Promise<AdminMe> {
  return request<AdminMe>('/admin/me', { signal });
}
