import { NavLink, Outlet } from 'react-router';
import { ADMIN_RESCHEDULE_REQUESTS_PATH } from '../../../../shared/routes/booking-paths';
import { ADMIN_LEAVE_APPROVALS_PATH } from './approvals-paths';

const TAB =
  'inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `${TAB} ${
    isActive
      ? 'border-brand-strong text-brand-strong'
      : 'border-transparent text-gray-600 hover:text-gray-900'
  }`;

// Trang host "Duyệt yêu cầu" (Figma `582:2`): tiêu đề + hai tab, nội dung tab là route con (`<Outlet />`). Tab "Yêu cầu đổi lịch" (reschedule F5) là liên kết tới route con của module booking: đường dẫn lấy từ
// `shared/routes/booking-paths` vì doctor không được import booking (WHT-10); trang của route con do router/ truyền vào `createAdminApprovalsRoutes`.
export function ApprovalsHostPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-900">Duyệt yêu cầu</h1>
      <nav aria-label="Loại yêu cầu" className="flex border-b border-gray-200">
        <NavLink to={ADMIN_LEAVE_APPROVALS_PATH} className={tabClass}>
          Yêu cầu nghỉ phép
        </NavLink>
        <NavLink to={ADMIN_RESCHEDULE_REQUESTS_PATH} className={tabClass}>
          Yêu cầu đổi lịch
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
