// Lớp CSS dùng chung của thẻ gợi ý. Chỉ dùng cặp màu đã đo ở ADR 0004 (cùng cặp với `reply-view.tsx`): `brand-strong` trên trắng 5,28:1,
// chữ trắng trên `brand-strong`. KHÔNG dùng `focus:`, `ring`, `outline` (khung tiêu điểm mặc định của trình duyệt được giữ).

// Nút phụ (viền xám, chữ `brand-strong`)
export const PILL_CLASS =
  'inline-flex min-h-9 items-center rounded-xl border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-brand-strong hover:bg-gray-50';

// Ô bật tắt (ngày, ca): tắt là viền xám, bật là nền `brand-strong` chữ trắng
export const CHIP_CLASS =
  'inline-flex min-h-9 items-center rounded-xl border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 hover:bg-gray-50';
export const CHIP_ON_CLASS =
  'inline-flex min-h-9 items-center rounded-xl border border-brand-strong bg-brand-strong px-3 py-1 text-sm font-medium text-white';

export const LINK_CLASS = 'font-medium text-brand-strong underline';
