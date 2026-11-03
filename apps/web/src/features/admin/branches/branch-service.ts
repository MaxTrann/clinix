import { request } from '../../../shared/api/client';
import { listServices } from '../service-catalog/service-catalog-service';
import type { ServiceCatalogItem } from '../service-catalog/service-catalog-types';
import type {
  Branch,
  BranchListQuery,
  BranchServiceOption,
  CreateBranchInput,
  PagedResult,
} from './branch-types';

const SERVICE_PAGE_SIZE = 100;

export function listBranches(
  query: BranchListQuery,
  signal?: AbortSignal,
): Promise<PagedResult<Branch>> {
  return request('/admin/branches', {
    query: { page: query.page, pageSize: query.pageSize, q: query.q },
    signal,
  });
}

export function createBranch(input: CreateBranchInput): Promise<Branch> {
  return request('/admin/branches', { method: 'POST', json: input });
}

export async function listAllAvailableServices(
  signal?: AbortSignal,
): Promise<BranchServiceOption[]> {
  const firstPage = await listServices(
    { page: 1, pageSize: SERVICE_PAGE_SIZE },
    signal,
  );
  const services: ServiceCatalogItem[] = [...firstPage.items];
  const pageCount = Math.ceil(firstPage.total / SERVICE_PAGE_SIZE);

  for (let page = 2; page <= pageCount; page += 1) {
    const nextPage = await listServices(
      { page, pageSize: SERVICE_PAGE_SIZE },
      signal,
    );
    services.push(...nextPage.items);
  }

  return services.map(({ dichVuKhamId, ten, tenNhom }) => ({
    dichVuKhamId,
    ten,
    tenNhom,
  }));
}
