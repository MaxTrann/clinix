import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  LOAI_GIAO_DICH_VI,
  type LoaiGiaoDichVi,
  type TrangThaiYeuCauRutTien,
} from '../entities/wallet-enums.js';
import type { TopupGateway } from '../wallet.constants.js';
import {
  WALLET_HISTORY_DEFAULT_PAGE_SIZE,
  WALLET_HISTORY_MAX_PAGE_SIZE,
} from '../wallet.constants.js';

// Query và hình dạng trả về của `GET /patient/wallet` và `GET /patient/wallet/transactions` (payment B1; PLAN 5.11 #1, #2; L9, L10). Tiền là chuỗi decimal, id BIGINT là chuỗi.

/**
 * Query của lịch sử giao dịch. KHÔNG có `benhNhanId`: chủ ví chỉ lấy từ access token; gửi lên hay khoá lạ nào là 400 `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted` toàn cục).
 * Không kế thừa `PageQueryDto` vì plan đặt tên `trang`, `kichThuoc`.
 */
export class WalletTransactionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trang: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WALLET_HISTORY_MAX_PAGE_SIZE)
  kichThuoc: number = WALLET_HISTORY_DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsIn(LOAI_GIAO_DICH_VI)
  loai?: LoaiGiaoDichVi;

  get offset(): number {
    return (this.trang - 1) * this.kichThuoc;
  }
}

/** Đầu vào của service (getter `offset` mất khi chuyển đối tượng thường nên controller lấy ra). */
export interface WalletTransactionsQuery {
  trang: number;
  kichThuoc: number;
  offset: number;
  loai?: LoaiGiaoDichVi;
}

export interface WithdrawalSummary {
  maYeuCau: string;
  soTien: string;
  trangThai: TrangThaiYeuCauRutTien;
  thoiDiemYeuCau: string;
}

/** `GET /patient/wallet`: ĐÚNG bảy khoá (danh sách trắng; không lộ `vi_noi_bo_id`). */
export interface WalletOverview {
  soDuKhaDung: string;
  soTienDangGiu: string;
  soDu: string;
  napChoXacNhan: string;
  yeuCauRutGanNhat: WithdrawalSummary | null;
  hanMucNap: { toiThieu: string; toiDa: string };
  congThanhToan: TopupGateway[];
}

/** Trạng thái một dòng lịch sử: sổ cái luôn `ThanhCong`; nạp chưa ra sổ `DangXuLy`/`ThatBai`; yêu cầu rút `ChoDuyet`/`TuChoi`. */
export type WalletTransactionStatus =
  'ThanhCong' | 'DangXuLy' | 'ThatBai' | TrangThaiYeuCauRutTien;

/**
 * Một dòng lịch sử: ĐÚNG bảy khoá. `id` có tiền tố theo nguồn (`vi-`, `nap-`, `rut-`) vì ba bảng đánh số riêng; KHÔNG lộ `vi_noi_bo_id`, `ma_giao_dich_cong`, id nội bộ khác.
 * `soTien` CÓ DẤU. `quaCuaSo`: nạp `DangXuLy` quá cửa sổ chờ (web hiện "Chưa nhận kết quả"); các dòng khác luôn `false`.
 */
export interface WalletTransactionItem {
  id: string;
  thoiDiem: string;
  loai: LoaiGiaoDichVi;
  noiDung: string;
  soTien: string;
  trangThai: WalletTransactionStatus;
  quaCuaSo: boolean;
}

export interface WalletTransactionsPage {
  items: WalletTransactionItem[];
  total: number;
  trang: number;
  kichThuoc: number;
}
