import {
  Building2,
  CalendarDays,
  ChevronRight,
  RefreshCw,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { ADMIN_RESCHEDULE_REQUESTS_PATH } from '../../../shared/routes/booking-paths';
import { ADMIN_WITHDRAWALS_PATH } from '../../../shared/routes/wallet-paths';
import type { AdminDashboard } from '../api/dashboard-api';
import { formatCount } from '../format';

// Khối "Việc cần xử lý" (Figma `507:538`; PLAN dashboard 5.6 (7), 5.11; Q6, MH1, T10). Một dòng mỗi loại yêu cầu đang chờ duyệt, số 0 vẫn hiện (chữ nhạt),
// mỗi dòng là liên kết tới trang duyệt. Không phụ thuộc bộ lọc ngày. Khác Figma có chủ đích (PLAN L10): KHÔNG có dòng "Danh sách chờ" (F-4, ngoài phạm vi),
// thêm dòng "Thay đổi chi nhánh" (một trong bốn loại chờ duyệt của Q6).

/** Trang duyệt nghỉ phép (module doctor). Viết chữ để không import chéo `features/`; ca DWB-07 khoá giá trị. */
export const ADMIN_LEAVE_APPROVALS_PATH = '/admin/duyet-yeu-cau/nghi-phep';
/** Trang "Duyệt yêu cầu" (host của nghỉ phép và đổi lịch): liên kết "Xem tất cả". */
export const ADMIN_APPROVALS_PATH = '/admin/duyet-yeu-cau';
/** Trang Thông tin phòng khám mở thẳng tab Chi nhánh (T10), nơi có khối yêu cầu thay đổi chi nhánh. */
export const ADMIN_BRANCH_CHANGES_PATH =
  '/admin/thong-tin-phong-kham?tab=chi-nhanh';

interface PendingRow {
  label: string;
  note: string;
  count: number;
  to: string;
  icon: LucideIcon;
  /** Lớp HẰNG của ô biểu tượng (màu theo Figma) */
  tone: string;
}

export function PendingList({
  pending,
  isSystemAdmin,
  filteredByBranch,
}: {
  pending: AdminDashboard['choDuyet'];
  isSystemAdmin: boolean;
  /** Toàn hệ thống đang lọc một chi nhánh: số rút tiền vẫn là số toàn hệ thống (MH1) nên ghi rõ */
  filteredByBranch: boolean;
}) {
  const rows: PendingRow[] = [
    {
      label: 'Nghỉ phép bác sĩ',
      note: 'Chờ duyệt',
      count: pending.nghiPhep,
      to: ADMIN_LEAVE_APPROVALS_PATH,
      icon: CalendarDays,
      tone: 'bg-amber-50 text-amber-500',
    },
    {
      label: 'Đổi lịch hẹn',
      note: 'Chờ duyệt',
      count: pending.doiLich,
      to: ADMIN_RESCHEDULE_REQUESTS_PATH,
      icon: RefreshCw,
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Thay đổi chi nhánh',
      // Quản trị viên Chi nhánh thấy yêu cầu của chi nhánh mình nhưng không duyệt được (Q6)
      note: isSystemAdmin
        ? 'Chờ duyệt'
        : 'Chờ Quản trị viên Toàn hệ thống duyệt',
      count: pending.thayDoiChiNhanh,
      to: ADMIN_BRANCH_CHANGES_PATH,
      icon: Building2,
      tone: 'bg-purple-50 text-purple-500',
    },
  ];
  // `null` (Quản trị viên Chi nhánh) ⇒ ẩn hẳn dòng, không hiện 0 (DCD-02, DWB-07)
  if (pending.rutTien !== null)
    rows.push({
      label: 'Yêu cầu rút tiền',
      note: filteredByBranch ? 'Chờ duyệt · toàn hệ thống' : 'Chờ duyệt',
      count: pending.rutTien,
      to: ADMIN_WITHDRAWALS_PATH,
      icon: Wallet,
      tone: 'bg-green-50 text-green-600',
    });

  return (
    <section
      aria-labelledby="dashboard-pending-title"
      className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5"
    >
      <h2
        id="dashboard-pending-title"
        className="text-sm font-semibold text-text-primary"
      >
        Việc cần xử lý
      </h2>
      <p className="mt-0.5 text-xs text-text-muted">
        Không phụ thuộc bộ lọc ngày.
      </p>
      <ul className="mt-3 flex flex-col gap-0.5">
        {rows.map(({ label, note, count, to, icon: Icon, tone }) => (
          <li key={label}>
            <Link
              to={to}
              aria-label={`Mở ${label}: ${count} yêu cầu ${note.toLowerCase()}`}
              className="flex min-h-11 items-center gap-3 rounded-xl p-2.5 hover:bg-gray-50"
            >
              <span
                aria-hidden="true"
                className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${tone}`}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-primary">
                  {label}
                </span>
                <span className="block text-xs text-text-muted">{note}</span>
              </span>
              <span
                className={`text-base font-bold ${count === 0 ? 'text-gray-300' : 'text-text-primary'}`}
              >
                {formatCount(count)}
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 text-gray-400"
              />
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to={ADMIN_APPROVALS_PATH}
        className="mt-3 border-t border-gray-100 pt-3 text-center text-sm font-medium text-brand-strong hover:underline"
      >
        Xem tất cả →
      </Link>
    </section>
  );
}
