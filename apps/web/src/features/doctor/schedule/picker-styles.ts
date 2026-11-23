// Lớp CSS của hộp chọn tuần/tháng (doctor UX5, G2). Tách thành hằng để test tương phản (`picker-styles.test.ts`, DUX5-14) đọc ĐÚNG chuỗi lớp đang dùng.
// Chỉ token và bậc `gray` có sẵn (ADR 0004); KHÔNG `focus:`, `ring-*`, `outline-*` (viền focus do `styles/index.css` vẽ, bộ quét `focus-hygiene`).
// Gốc chữ là 15 px nên `size-11` = 41,25 px, đủ ≥ 40 px cho đầu ngón tay.

// Ô ngày và ô tháng là `div role="gridcell"` chứ KHÔNG phải `button`: `useModalDialog` tính mọi `button` chưa `disabled` là điểm dừng Tab (kể cả `tabindex="-1"`),
// nên lưới dùng roving tabindex bằng nút sẽ làm bẫy Tab thoát khỏi hộp. Ô gridcell có `tabindex` là mẫu lịch của ARIA APG.
export const CELL_BASE =
  'flex size-11 select-none items-center justify-center justify-self-center rounded-lg border text-sm transition-colors';
export const MONTH_CELL_BASE =
  'flex h-11 w-full select-none items-center justify-center rounded-lg border text-sm transition-colors';

// Trạng thái của ô: ngày thường, ngày của tháng liền kề (mờ hơn nhưng vẫn ≥ 4,5:1), ô thuộc kỳ đang xem (nền riêng và chữ đậm, không chỉ đổi màu), ô ngoài khoảng.
export const CELL_STATE = {
  normal: 'cursor-pointer text-gray-900 hover:bg-gray-100',
  outside: 'cursor-pointer text-gray-600 hover:bg-gray-100',
  viewed: 'cursor-pointer bg-brand-soft font-semibold text-brand-strong',
  disabled: 'cursor-not-allowed text-gray-400',
} as const;

// Hôm nay: viền đậm (kèm `aria-current="date"`); ô khác có viền trong suốt để mọi ô cùng kích thước
export const CELL_BORDER = {
  today: 'border-brand-strong',
  other: 'border-transparent',
} as const;

// Nút ‹ › đổi tháng (hoặc năm) của hộp; `aria-disabled` ở sát biên (không `disabled` để focus không rơi khỏi nút vừa bấm)
export const NAV_BUTTON =
  'inline-flex size-11 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 aria-disabled:cursor-not-allowed aria-disabled:text-gray-400 aria-disabled:hover:bg-transparent';

export const WEEKDAY_HEADER =
  'flex h-8 items-center justify-center text-xs font-medium text-gray-600';
