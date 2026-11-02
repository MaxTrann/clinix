export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ServiceGroup {
  nhomDichVuId: string;
  ten: string;
  thuTuHienThi: number;
}

export interface ServiceCatalogItem {
  dichVuKhamId: string;
  nhomDichVuId: string;
  tenNhom: string;
  ten: string;
  thoiLuong: number;
  giaMacDinh: string;
}

export interface ServiceGroupInput {
  ten: string;
  thuTuHienThi: number;
}

export interface ServiceInput {
  nhomDichVuId: string;
  ten: string;
  thoiLuong: number;
  giaMacDinh: string;
}

export interface CatalogListQuery {
  page: number;
  pageSize: number;
  q?: string;
}
