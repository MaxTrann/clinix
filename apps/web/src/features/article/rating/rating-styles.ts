// Lớp Tailwind của khối đánh giá. Chỉ token có sẵn và KHÔNG viết `focus:`, `ring-*`, `outline-*` (viền focus do lớp base `styles/index.css` vẽ, FG-05).
// Vùng bấm tối thiểu 44 px bằng `min-h-[44px]`: gốc `html` là 15 px nên `min-h-11` chỉ được 41,25 px (đo ở doctor UX4; ABU-08 quét cấm `min-h-11`).
// Khai riêng trong `rating/` (không import `public/article-public-styles.ts`: luật ABU-08); cùng giá trị với chip thẻ của F2.
const BUTTON_BASE =
  'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-medium aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

// Nút đang chọn (`aria-pressed="true"`): nền đậm; nút chưa chọn: nền trắng
export const RATING_ON = `${BUTTON_BASE} border-brand-strong bg-brand-strong text-white`;
export const RATING_OFF = `${BUTTON_BASE} border-gray-300 bg-white text-gray-700`;

export const RATING_TITLE_CLASS = 'text-base font-semibold text-gray-900';
// Hai nút xuống dòng ở màn hẹp (375 px)
export const RATING_BUTTONS_CLASS = 'mt-3 flex flex-wrap gap-3';
// Chế độ chỉ xem số đếm
export const RATING_COUNTS_CLASS =
  'mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700';
// Dòng báo lỗi cạnh nút (nếp `wallet/patient/withdraw-panel.tsx`)
export const RATING_ERROR_CLASS = 'mt-3 text-sm text-danger';
// Liên kết nằm riêng một dòng, vùng bấm 44 px
export const RATING_LINK_CLASS =
  'inline-flex min-h-[44px] items-center text-sm font-medium text-brand-strong hover:underline';
