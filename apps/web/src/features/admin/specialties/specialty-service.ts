import { LONG_TIMEOUT_MS, request } from '../../../shared/api/client';
import type {
  PagedSpecialties,
  Specialty,
  SpecialtyImageUpload,
  SpecialtyInput,
  SpecialtyListQuery,
  SpecialtyStatus,
} from './specialty-types';

export function listSpecialties(
  query: SpecialtyListQuery,
  signal?: AbortSignal,
): Promise<PagedSpecialties> {
  return request('/admin/specialties', {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      trangThaiHoatDong: query.trangThaiHoatDong,
    },
    signal,
  });
}

export function createSpecialty(input: SpecialtyInput): Promise<Specialty> {
  return request('/admin/specialties', { method: 'POST', json: input });
}

export function updateSpecialty(
  id: string,
  input: SpecialtyInput,
): Promise<Specialty> {
  return request(`/admin/specialties/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: input,
  });
}

export function setSpecialtyStatus(
  id: string,
  trangThaiHoatDong: SpecialtyStatus,
): Promise<Specialty> {
  return request(`/admin/specialties/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    json: { trangThaiHoatDong },
  });
}

export function uploadSpecialtyImage(
  file: File,
  signal?: AbortSignal,
): Promise<SpecialtyImageUpload> {
  const body = new FormData();
  body.append('file', file);
  return request('/admin/uploads/specialty-image', {
    method: 'POST',
    body,
    signal,
    timeoutMs: LONG_TIMEOUT_MS,
  });
}
