export type SpecialtyStatus = 'DangHoatDong' | 'NgungHoatDong';

export interface Specialty {
  chuyenKhoaId: string;
  ten: string;
  moTa: string | null;
  anhDaiDien: string | null;
  trangThaiHoatDong: SpecialtyStatus;
  soBacSi: number;
}

export interface PagedSpecialties {
  items: Specialty[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SpecialtyListQuery {
  page: number;
  pageSize: number;
  q?: string;
  trangThaiHoatDong?: SpecialtyStatus;
}

export interface SpecialtyInput {
  ten: string;
  moTa: string | null;
  imageUploadId?: string | null;
}

export interface SpecialtyImageUpload {
  uploadId: string;
  url: string;
  expiresAt: string;
}
