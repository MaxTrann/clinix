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

/** Danh sách dài máy chủ cắt còn tối đa 50 dòng, kèm tổng số */
export interface Capped<T> {
  items: T[];
  tong: number;
}

/** Lý do một lịch hẹn bị ảnh hưởng (B8): ngày chuyển nghỉ, ngoài giờ nhận khám mới, dịch vụ bị bỏ */
export type ImpactReason = 'NgayNghi' | 'NgoaiGioHoatDong' | 'BoDichVu';

export interface AffectedAppointment {
  lichHenId: string;
  maLichHen: string;
  /** 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam */
  thoiGian: string;
  lyDoAnhHuong: ImpactReason;
}

export interface AffectedShift {
  lichLamViecId: string;
  bacSiId: string;
  /** 'YYYY-MM-DD' */
  ngay: string;
  ca: string;
}

export interface FreeSlotOutside {
  khungGioId: string;
  ngayGio: string;
  bacSiId: string;
  ca: string;
}

/** Phần đã lưu ngay khi sửa chi nhánh (Q2): tên, địa chỉ, tọa độ luôn lưu ngay; lịch và dịch vụ chỉ lưu ngay khi không có ảnh hưởng */
export type SavedPart =
  'ten' | 'diaChi' | 'toaDo' | 'lichHoatDong' | 'dichVuKham';

/** Phản hồi của `PATCH /admin/branches/:id` (B8) */
export interface BranchUpdateResult {
  chiNhanh: Branch;
  daLuu: SavedPart[];
  yeuCau: null | {
    yeuCauThayDoiChiNhanhId: string;
    trangThai: 'ChoDuyet';
    thuThayDoi: number[];
    dichVuThem: string[];
    dichVuBo: string[];
  };
  anhHuong: {
    lichHen: Capped<AffectedAppointment>;
    ca: Capped<AffectedShift>;
  };
  canhBao: { khungGioTrongNgoaiLich: Capped<FreeSlotOutside> };
}
