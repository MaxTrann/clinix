import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { PATIENT_APPOINTMENTS_PATH } from '../../../../shared/routes/booking-paths';
import { DONE_TEXT } from './done-messages';

// Trang chủ công khai (route `index` của khung công khai ở `router/routes.tsx`). `booking-paths.ts` không có hằng này và các trang khác của web viết thẳng "/";
// F7 giữ hằng cục bộ để không chạm file dùng chung (TRACKING 3.36 câu (a)).
export const HOME_PATH = '/';

// Hai nút của Bước 6 (Figma `453:2`, WZ-11), căn phải: `Về trang chủ` (viền) và `Xem lịch hẹn của tôi` (nền brand, mũi tên). Không có "Quay lại" (F3), không QR, in, tải.
// Viền nút dùng `gray-500` ≥ 3:1 thay `#d1d5dc` của Figma (cùng quyết định của F4, F5). Là liên kết thường: Bước 6 chỉ đọc nên không có gì để chặn bấm đúp.
export function DoneActions() {
  return (
    <nav
      aria-label={DONE_TEXT.nextLabel}
      className="mt-5 flex flex-wrap justify-end gap-3"
    >
      <Link
        to={HOME_PATH}
        className="inline-flex min-h-11 items-center rounded-xl border border-gray-500 bg-white px-5 font-semibold text-gray-800"
      >
        {DONE_TEXT.home}
      </Link>
      <Link
        to={PATIENT_APPOINTMENTS_PATH}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-strong px-5 font-semibold text-white"
      >
        {DONE_TEXT.myAppointments}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </nav>
  );
}
