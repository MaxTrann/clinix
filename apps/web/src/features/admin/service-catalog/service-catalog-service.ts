import { request } from '../../../shared/api/client';
import { readServiceGroupPage } from './service-group-reader';
import type {
  CatalogListQuery,
  PagedResult,
  ServiceCatalogItem,
  ServiceGroup,
  ServiceGroupInput,
  ServiceGroupListItem,
  ServiceInput,
} from './service-catalog-types';

// Đọc bằng bộ đọc chặt: phản hồi sai hình dạng ném UnexpectedResponseError (hộp lỗi), không vẽ dữ liệu dở
export async function listServiceGroups(
  query: CatalogListQuery,
  signal?: AbortSignal,
): Promise<PagedResult<ServiceGroupListItem>> {
  return readServiceGroupPage(
    await request('/admin/service-groups', {
      query: { page: query.page, pageSize: query.pageSize, q: query.q },
      signal,
    }),
  );
}

export function createServiceGroup(
  input: ServiceGroupInput,
): Promise<ServiceGroup> {
  return request('/admin/service-groups', { method: 'POST', json: input });
}

export function updateServiceGroup(
  id: string,
  input: ServiceGroupInput,
): Promise<ServiceGroup> {
  return request(`/admin/service-groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: input,
  });
}

export function deleteServiceGroup(id: string): Promise<void> {
  return request(`/admin/service-groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function listServices(
  query: CatalogListQuery,
  signal?: AbortSignal,
): Promise<PagedResult<ServiceCatalogItem>> {
  return request('/admin/services', {
    query: { page: query.page, pageSize: query.pageSize, q: query.q },
    signal,
  });
}

export function createService(
  input: ServiceInput,
): Promise<ServiceCatalogItem> {
  return request('/admin/services', { method: 'POST', json: input });
}

export function updateService(
  id: string,
  input: ServiceInput,
): Promise<ServiceCatalogItem> {
  return request(`/admin/services/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: input,
  });
}
