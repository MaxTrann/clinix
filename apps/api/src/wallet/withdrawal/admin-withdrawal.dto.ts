import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TRANG_THAI_YEU_CAU_RUT_TIEN,
  type TrangThaiYeuCauRutTien,
} from '../entities/wallet-enums.js';
import {
  WITHDRAWAL_ADMIN_DEFAULT_PAGE_SIZE,
  WITHDRAWAL_ADMIN_MAX_PAGE_SIZE,
  WITHDRAWAL_NOTE_MAX,
} from '../wallet.constants.js';

// Query, thân và hình dạng trả về của các route Quản trị viên về rút tiền (payment B12; PLAN 5.8, 5.11 #10, #11). Tiền là chuỗi decimal, id BIGINT là chuỗi.

/** Query danh sách. `trangThai` bỏ trống = tất cả. Khoá lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`. */
export class AdminWithdrawalsQueryDto {
  @IsOptional()
  @IsIn(TRANG_THAI_YEU_CAU_RUT_TIEN)
  trangThai?: TrangThaiYeuCauRutTien;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trang: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WITHDRAWAL_ADMIN_MAX_PAGE_SIZE)
  kichThuoc: number = WITHDRAWAL_ADMIN_DEFAULT_PAGE_SIZE;

  get offset(): number {
    return (this.trang - 1) * this.kichThuoc;
  }
}

export interface AdminWithdrawalsQuery {
  trangThai?: TrangThaiYeuCauRutTien;
  trang: number;
  kichThuoc: number;
  offset: number;
}

/** Thân của `approve` và `reject`: chỉ `ghiChu` tuỳ chọn (L11: không có cột, đi vào thông báo và nhật ký). Chuỗi chỉ toàn khoảng trắng coi như không có. */
export class WithdrawalDecisionDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(WITHDRAWAL_NOTE_MAX)
  ghiChu?: string;
}

/** Một dòng danh sách: chỉ họ tên của Bệnh nhân (không email, không SĐT; XRT-12). */
export interface AdminWithdrawalItem {
  maYeuCau: string;
  benhNhan: { hoTen: string };
  soTien: string;
  trangThai: TrangThaiYeuCauRutTien;
  thoiDiemYeuCau: string;
  thoiDiemXuLy: string | null;
}

export interface AdminWithdrawalCounts {
  tatCa: number;
  choDuyet: number;
  daDuyet: number;
  tuChoi: number;
}

export interface AdminWithdrawalsPage {
  items: AdminWithdrawalItem[];
  total: number;
  trang: number;
  kichThuoc: number;
  demTheoTrangThai: AdminWithdrawalCounts;
}

export interface AdminLedgerEntry {
  thoiDiem: string;
  loai: string;
  soTien: string;
}

export interface AdminWithdrawalDetail extends AdminWithdrawalItem {
  soDuHienTai: string;
  soTienDangGiu: string;
  giaoDichGanDay: AdminLedgerEntry[];
}

export interface WithdrawalDecided {
  maYeuCau: string;
  trangThai: TrangThaiYeuCauRutTien;
}
