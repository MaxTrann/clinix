import { Link } from 'react-router';
import { ROLE_HOME_PATHS } from '../../auth';

// Thanh tab của mục "Nhân sự & Tài khoản" (admin F8; Figma gom hai tab vào một trang). Mỗi tab là một trang riêng có tiêu đề riêng; thanh này nằm ở CẢ HAI trang
// để chuyển qua lại. Tab hiện tại được truyền vào (không đọc đường dẫn) nên không phụ thuộc cách trang được gắn vào bộ định tuyến.

export const ADMIN_STAFF_PATH = `${ROLE_HOME_PATHS.QuanTriVien}/nhan-su`;
export const ADMIN_PATIENTS_PATH = `${ROLE_HOME_PATHS.QuanTriVien}/tai-khoan-benh-nhan`;

export type AccountTab = 'staff' | 'patients';

const TABS: { id: AccountTab; label: string; to: string }[] = [
  { id: 'staff', label: 'Nhân sự', to: ADMIN_STAFF_PATH },
  { id: 'patients', label: 'Tài khoản bệnh nhân', to: ADMIN_PATIENTS_PATH },
];

const TAB_BASE =
  '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap';

export function AccountTabs({ current }: { current: AccountTab }) {
  return (
    <nav
      aria-label="Nhân sự và tài khoản"
      className="flex border-b border-gray-200"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          aria-current={tab.id === current ? 'page' : undefined}
          className={`${TAB_BASE} ${
            tab.id === current
              ? 'border-brand text-brand-strong'
              : 'border-transparent text-gray-600'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
