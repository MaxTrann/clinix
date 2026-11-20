import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateBy,
} from 'class-validator';
import { redactText } from '../../common/logging/sanitize.js';
import {
  TRANG_THAI_YEU_CAU_RUT_TIEN,
  type TrangThaiYeuCauRutTien,
} from '../entities/wallet-enums.js';
import {
  WALLET_ERROR_CODES,
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

/**
 * Thân của `approve` và `reject`: chỉ `ghiChu` tuỳ chọn (L11: không có cột, đi vào thông báo và nhật ký). Chuỗi chỉ toàn khoảng trắng coi như không có.
 * `ghiChu` KHÔNG được giống bí mật (mật khẩu, token, băm, `khoá=giá trị`) theo ĐÚNG bộ kiểm `redactText` mà nhật ký dùng: nếu không, `AuditService` ném
 * `AUDIT_SENSITIVE_DATA`, cả giao dịch hoàn tác và người dùng nhận 500 (lỗi đã ghi ở TRACKING payment, B13 quyết định 6). Sai ⇒ `NOI_DUNG_KHONG_HOP_LE` ở `loi[].ma`.
 */
export class WithdrawalDecisionDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(WITHDRAWAL_NOTE_MAX)
  @ValidateBy({
    name: 'isNotSecretLike',
    validator: {
      // Kiểu khác chuỗi để `IsString` báo; ở đây chỉ xét chữ
      validate: (value: unknown) =>
        typeof value !== 'string' || redactText(value) === value,
      defaultMessage: () => WALLET_ERROR_CODES.CONTENT_REJECTED,
    },
  })
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
