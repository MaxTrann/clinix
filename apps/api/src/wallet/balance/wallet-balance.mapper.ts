import type { LoaiGiaoDichVi } from '../entities/wallet-enums.js';
import type { TrangThaiYeuCauRutTien } from '../entities/wallet-enums.js';
import {
  TOPUP_PENDING_WINDOW_MINUTES,
  TOPUP_GATEWAYS,
  type TopupGateway,
} from '../wallet.constants.js';
import type {
  WalletTransactionItem,
  WalletTransactionStatus,
  WithdrawalSummary,
} from './wallet-balance.dto.js';

// Hàng thô của câu SQL ⇒ hình dạng trả về (payment B1; PLAN 5.11; SDV-05, SDV-08, SDV-09). Hàm THUẦN, không DB. Danh sách trắng: từng khoá được gán tường minh, không `...row`.

export interface WalletRow {
  id: string;
  soDu: string;
  soTienDangGiu: string;
}

export interface PendingTopupRow {
  tong: string | number;
}

export interface WithdrawalRow {
  maYeuCau: string;
  soTien: string;
  trangThai: TrangThaiYeuCauRutTien;
  thoiDiemYeuCau: Date;
}

/** Hàng của câu hợp ba nguồn. `nguon`: `vi` (sổ cái), `nap` (nạp chưa ra sổ), `rut` (yêu cầu rút chưa ra sổ). Các cột phụ chỉ có ở nguồn tương ứng, còn lại `null`. */
export interface HistoryRow {
  nguon: 'vi' | 'nap' | 'rut';
  id: string;
  thoiDiem: Date;
  loai: LoaiGiaoDichVi;
  soTien: string;
  trangThai: string;
  phuongThuc: string | null;
  maLichHen: string | null;
  loaiHoan: 'TuDong' | 'DacBiet' | null;
}

export function toWithdrawalSummary(row: WithdrawalRow): WithdrawalSummary {
  return {
    maYeuCau: String(row.maYeuCau),
    soTien: row.soTien,
    trangThai: row.trangThai,
    thoiDiemYeuCau: row.thoiDiemYeuCau.toISOString(),
  };
}

const isGateway = (value: string | null): value is TopupGateway =>
  TOPUP_GATEWAYS.some((gateway) => gateway === value);

/** Nạp `DangXuLy` quá cửa sổ của cổng (PLAN 4.7 #2): tuổi > cửa sổ. Đúng bằng cửa sổ vẫn còn trong cửa sổ (cùng nghĩa với `>=` ở câu tổng). */
export function isPastWindow(
  row: Pick<HistoryRow, 'trangThai' | 'phuongThuc' | 'thoiDiem'>,
  now: Date,
): boolean {
  if (row.trangThai !== 'DangXuLy' || !isGateway(row.phuongThuc)) return false;
  const windowMs = TOPUP_PENDING_WINDOW_MINUTES[row.phuongThuc] * 60_000;
  return now.getTime() - row.thoiDiem.getTime() > windowMs;
}

/** Câu "Nội dung" hiện cho người dùng, dựng từ nguồn của dòng (chữ `[đề xuất]`, nhóm duyệt cùng Figma `431:2`). */
export function describeRow(row: HistoryRow): string {
  const lich = row.maLichHen === null ? '' : ` ${row.maLichHen}`;
  const cong = row.phuongThuc === null ? '' : ` qua ${row.phuongThuc}`;
  switch (row.loai) {
    case 'Nap':
      return `Nạp tiền vào ví${cong}`;
    case 'ThanhToan':
      return `Thanh toán đặt cọc lịch hẹn${lich}`;
    case 'HoanTien':
      return row.loaiHoan === 'DacBiet'
        ? `Hoàn tiền đặc biệt lịch hẹn${lich}`
        : `Hoàn tiền cọc lịch hẹn${lich}`;
    case 'Rut':
      return 'Rút tiền từ ví';
  }
}

export function toTransactionItem(
  row: HistoryRow,
  now: Date,
): WalletTransactionItem {
  return {
    id: `${row.nguon}-${String(row.id)}`,
    thoiDiem: row.thoiDiem.toISOString(),
    loai: row.loai,
    noiDung: describeRow(row),
    soTien: row.soTien,
    trangThai: row.trangThai as WalletTransactionStatus,
    quaCuaSo: isPastWindow(row, now),
  };
}
