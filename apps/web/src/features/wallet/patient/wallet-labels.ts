import {
  absoluteAmount,
  formatSignedVnd,
  formatVnd,
} from '../../../shared/money/format-vnd';
import type {
  WalletTransaction,
  WalletTransactionType,
  WithdrawalStatus,
} from '../api/wallet-types';

// Chữ và màu cho một dòng lịch sử ví (payment F1). Hàm THUẦN để test riêng; component chỉ đọc kết quả.
// Chữ có trong Figma `417:2`, `437:2`: "Nạp ví", "Đặt cọc", "Yêu cầu rút", "Thành công", "Chờ duyệt". Các chữ còn lại là [đề xuất] (Figma không có frame).

export type Tone = 'success' | 'danger' | 'warning' | 'neutral';

// Bộ lọc "Tất cả giao dịch" ở đầu bảng (Figma `417:375`). `null` = không lọc.
export const TYPE_FILTER_OPTIONS: {
  value: WalletTransactionType | null;
  label: string;
}[] = [
  { value: null, label: 'Tất cả giao dịch' },
  { value: 'Nap', label: 'Nạp ví' },
  { value: 'ThanhToan', label: 'Đặt cọc' },
  { value: 'HoanTien', label: 'Hoàn tiền' },
  { value: 'Rut', label: 'Rút tiền' },
];

const WITHDRAWAL_STATUS: Record<
  WithdrawalStatus,
  { label: string; tone: Tone }
> = {
  ChoDuyet: { label: 'Chờ duyệt', tone: 'warning' },
  DaDuyet: { label: 'Đã duyệt', tone: 'success' },
  TuChoi: { label: 'Từ chối', tone: 'danger' },
};

export function withdrawalStatusLabel(status: WithdrawalStatus): {
  label: string;
  tone: Tone;
} {
  return WITHDRAWAL_STATUS[status];
}

// Yêu cầu rút CHƯA trừ số dư (chờ duyệt hoặc bị từ chối): dòng không có trong sổ cái
const isPendingWithdrawal = (tx: WalletTransaction) =>
  tx.trangThai === 'ChoDuyet' || tx.trangThai === 'TuChoi';

function statusOf(tx: WalletTransaction): { label: string; tone: Tone } {
  switch (tx.trangThai) {
    case 'ThanhCong':
      return { label: 'Thành công', tone: 'success' };
    case 'DangXuLy':
      // Quá cửa sổ chờ: KHÔNG gọi là thất bại (IPN có thể còn tới muộn), chỉ báo chưa có kết quả (PLAN 4.7 #2, WVI-01)
      return tx.quaCuaSo
        ? { label: 'Chưa nhận kết quả', tone: 'neutral' }
        : { label: 'Đang xử lý', tone: 'warning' };
    case 'ThatBai':
      return { label: 'Thất bại', tone: 'danger' };
    default:
      return withdrawalStatusLabel(tx.trangThai);
  }
}

function typeLabelOf(tx: WalletTransaction): string {
  switch (tx.loai) {
    case 'Nap':
      return 'Nạp ví';
    case 'ThanhToan':
      return 'Đặt cọc';
    case 'HoanTien':
      return 'Hoàn tiền';
    case 'Rut':
      return isPendingWithdrawal(tx) ? 'Yêu cầu rút' : 'Rút tiền';
  }
}

// Ô tròn biểu tượng của cột Loại: tiền vào xanh, cọc đỏ, rút cam (Figma `417:409`, `417:434`, `437:407`)
export type TypeIcon = 'in' | 'out' | 'withdraw';

function typeIconOf(tx: WalletTransaction): TypeIcon {
  if (tx.loai === 'Rut') return 'withdraw';
  return tx.loai === 'ThanhToan' ? 'out' : 'in';
}

export interface TransactionView {
  typeLabel: string;
  typeIcon: TypeIcon;
  amountText: string;
  amountTone: Tone;
  statusLabel: string;
  statusTone: Tone;
}

/**
 * Chỉ dòng ĐÃ RA SỔ (`ThanhCong`) mới có dấu và màu (+ xanh, − đỏ): số dư đã đổi thật. Nạp đang xử lý/thất bại và yêu cầu rút chưa duyệt hiện số tiền
 * KHÔNG dấu, màu trung tính (Figma `437:2`: "Yêu cầu rút … 100.000đ"), vì số dư chưa đổi.
 */
export function describeTransaction(tx: WalletTransaction): TransactionView {
  const status = statusOf(tx);
  const booked = tx.trangThai === 'ThanhCong';
  const negative = tx.soTien.startsWith('-');
  return {
    typeLabel: typeLabelOf(tx),
    typeIcon: typeIconOf(tx),
    amountText: booked
      ? formatSignedVnd(tx.soTien)
      : formatVnd(absoluteAmount(tx.soTien)),
    amountTone: booked ? (negative ? 'danger' : 'success') : 'neutral',
    statusLabel: status.label,
    statusTone: status.tone,
  };
}

// Ngày giờ theo giờ Việt Nam, không theo múi giờ máy (máy người dùng có thể ở múi khác)
const VIETNAM_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function vietnamParts(iso: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of VIETNAM_PARTS.formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return parts;
}

/** ISO UTC ⇒ "08/10/2026" theo ngày ở Việt Nam. */
export function formatVietnamDate(iso: string): string {
  const { day, month, year } = vietnamParts(iso);
  return `${day}/${month}/${year}`;
}

/** ISO UTC ⇒ "08:05" theo giờ Việt Nam. */
export function formatVietnamTime(iso: string): string {
  const { hour, minute } = vietnamParts(iso);
  return `${hour}:${minute}`;
}
