import type { ServiceCatalogItem } from '../service-catalog/service-catalog-types';

export interface BranchPeriod {
  batDau: string;
  ketThuc: string;
}

export interface BranchSchedule {
  thuTrongTuan: number;
  hoatDong: boolean | null;
  sang: BranchPeriod | null;
  chieu: BranchPeriod | null;
}

export interface BranchService {
  dichVuKhamId: string;
  ten: string;
}

export interface Branch {
  chiNhanhId: string;
  ten: string;
  diaChi: string;
  toaDoLat: string | null;
  toaDoLng: string | null;
  lichHoatDong: BranchSchedule[];
  dichVuKham: BranchService[];
  coYeuCauDangMo: boolean;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BranchListQuery {
  page: number;
  pageSize: number;
  q?: string;
}

export interface BranchPeriodInput {
  batDau: string;
  ketThuc: string;
}

export interface BranchScheduleInput {
  thuTrongTuan: number;
  hoatDong: boolean;
  sang?: BranchPeriodInput;
  chieu?: BranchPeriodInput;
}

export interface CreateBranchInput {
  ten: string;
  diaChi: string;
  toaDoLat?: string;
  toaDoLng?: string;
  lichHoatDong: BranchScheduleInput[];
  dichVuKhamIds: string[];
}

export type BranchServiceOption = Pick<
  ServiceCatalogItem,
  'dichVuKhamId' | 'ten' | 'tenNhom'
>;
