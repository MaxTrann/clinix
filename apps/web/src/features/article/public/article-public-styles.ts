// Lớp Tailwind dùng chung của trang công khai bài viết. Chỉ token có sẵn và KHÔNG viết `focus:`, `ring-*`, `outline-*` (viền focus do lớp base `styles/index.css` vẽ, FG-05).
// Vùng bấm tối thiểu 44 px bằng `min-h-[44px]`: gốc `html` là 15 px nên `min-h-11` chỉ được 41,25 px (đo ở doctor UX4).

// Khung rộng của trang công khai: 1200 px đệm 30 px (gốc 15 px nên 1 đơn vị = 3,75 px). Khai lại ở đây vì `features/search/index.ts` không xuất `PUBLIC_CONTAINER` (T17; ghi nợ lặp nhỏ).
export const PUBLIC_CONTAINER = 'mx-auto max-w-320 px-8';

// Lưới thẻ bài: một cột ở màn hẹp (375 px), hai ở `sm`, ba ở `lg`; khối trang chủ bốn ở `lg`
export const ARTICLE_GRID =
  'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';
export const HOME_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4';

const CHIP_BASE =
  'inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium';
export const CHIP_ON = `${CHIP_BASE} border-brand-strong bg-brand-strong text-white`;
export const CHIP_OFF = `${CHIP_BASE} border-gray-300 bg-white text-gray-700`;

export const BUTTON_SECONDARY_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 disabled:opacity-60';

// Liên kết chữ có vùng bấm 44 px (liên kết nằm riêng một dòng)
export const TEXT_LINK_CLASS =
  'inline-flex min-h-[44px] items-center text-sm font-medium text-brand-strong hover:underline';
