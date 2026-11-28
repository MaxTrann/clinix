// Lớp Tailwind dùng chung của trang quản trị bài viết. Chỉ token có sẵn (`brand-strong`, `danger-*`, `success-*`, `warning-*`, `gray-*`) và KHÔNG viết `focus:`, `ring-*`,
// `outline-*`: viền focus do lớp base `styles/index.css` vẽ (test `focus-hygiene`, FG-05). Vùng bấm tối thiểu 44 px bằng `min-h-[44px]`: gốc `html` là 15 px nên `min-h-11` chỉ được 41,25 px.
export const LABEL_CLASS = 'text-sm font-medium text-gray-800';

export const CONTROL_CLASS =
  'block min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 aria-invalid:border-danger';

export const TEXTAREA_CLASS = `${CONTROL_CLASS} py-2`;

export const BUTTON_PRIMARY_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-brand-strong px-4 text-sm font-medium text-white disabled:opacity-70';

export const BUTTON_SECONDARY_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 disabled:opacity-60';

export const FIELD_ERROR_CLASS = 'text-sm font-medium text-danger-strong';

export const SUCCESS_NOTICE_CLASS =
  'rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm text-success';

export const ERROR_NOTICE_CLASS =
  'rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong';
