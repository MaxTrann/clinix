import { formatVnd } from '../specialties/format-vnd';

// API trả tiền là chuỗi decimal ("300000.00"); chỉ bỏ phần thập phân để hiển thị, không tính toán trên số thực (H4).
export function formatMoney(amount: string): string {
  return formatVnd(Number(amount.split('.')[0]));
}

// Cọc "0.00" ⇒ "Không cần cọc"
export function isNoDeposit(amount: string): boolean {
  return Number(amount.split('.')[0]) === 0;
}
