import type { Tone } from './wallet-labels';

// Màu theo sắc thái cho chữ số tiền và nhãn trạng thái (payment F1). Figma `417:2`: xanh `#16a34a`, đỏ `#dc2626`, nhãn "Thành công" `#dcfce7`/`#15803d`,
// "Chờ duyệt" `#fef9c3`/`#b45309` (`437:421`). Chữ số tiền dùng token của ADR 0004 vì tương phản: green-600 trên trắng chỉ ≈ 3,3:1 nên lấy `success` (green-700).
export const AMOUNT_TONE: Record<Tone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-gray-700',
};

export const BADGE_TONE: Record<Tone, string> = {
  success: 'bg-green-100 text-green-700',
  danger: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-amber-700',
  neutral: 'bg-gray-100 text-gray-600',
};
