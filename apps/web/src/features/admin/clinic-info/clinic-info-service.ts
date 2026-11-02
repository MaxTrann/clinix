import { request } from '../../../shared/api/client';
import type { ClinicInfo, ClinicInfoInput } from './clinic-info-types';

export function getClinicInfo(signal?: AbortSignal): Promise<ClinicInfo> {
  return request<ClinicInfo>('/admin/clinic-info', { signal });
}

export function updateClinicInfo(
  input: ClinicInfoInput,
): Promise<ClinicInfo> {
  return request<ClinicInfo>('/admin/clinic-info', {
    method: 'PUT',
    json: input,
  });
}
