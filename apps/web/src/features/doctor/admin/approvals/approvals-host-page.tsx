import { NavLink, Outlet } from 'react-router';
import { ADMIN_LEAVE_APPROVALS_PATH } from './approvals-paths';

const TAB =
  'inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors';

// Trang host "Duyệt yêu cầu" (Figma `582:2`): tiêu đề + hai tab. Tab "Yêu cầu đổi lịch" thuộc module khác nên là nút vô hiệu (Q36, WA-13);
// nội dung tab nghỉ phép là route con (`<Outlet />`). Dùng `aria-disabled` để trình đọc màn hình vẫn đọc được tab và lý do.
export function ApprovalsHostPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-900">Duyệt yêu cầu</h1>
      <nav aria-label="Loại yêu cầu" className="flex border-b border-gray-200">
        <NavLink
          to={ADMIN_LEAVE_APPROVALS_PATH}
          className={({ isActive }) =>
            `${TAB} ${
              isActive
                ? 'border-brand-strong text-brand-strong'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`
          }
        >
          Yêu cầu nghỉ phép
        </NavLink>
        <button
          type="button"
          aria-disabled="true"
          title="Chưa được triển khai"
          onClick={(event) => event.preventDefault()}
          className={`${TAB} cursor-not-allowed border-transparent text-gray-400`}
        >
          Yêu cầu đổi lịch
          <span className="sr-only"> (chưa được triển khai)</span>
        </button>
      </nav>
      <Outlet />
    </section>
  );
}
