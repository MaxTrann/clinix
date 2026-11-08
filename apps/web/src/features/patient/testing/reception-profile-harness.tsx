import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ROLE_HOME_PATHS } from '../../auth';
import { ReceptionProfilePage } from '../pages/reception-profile-page';
import { RECEPTION_PATHS, RECEPTION_PROFILE_SEGMENT } from '../patient-paths';
import { ReceptionLayout } from '../shell/reception-layout';
import { SAMPLE_RECEPTIONIST, type FakeProfileData } from './fake-profile-api';
import { setUpApi, type HarnessOptions } from './profile-page-harness';

// Dựng trang "Thông tin cá nhân" của Lễ tân trong khung Lễ tân với phiên đăng nhập thật (qua fake auth) và `/api/profile` giả
// (patient F4; dùng chung cho các file test của trang). Không có ở bộ xuất của module: chỉ test dùng.
// Ô, nút của form sửa dùng lại bộ chọn của `profile-page-harness.tsx` (cùng form, cùng tên).
export interface ReceptionHarnessOptions {
  // Ghi đè các khoá của `SAMPLE_RECEPTIONIST`
  initial?: Partial<FakeProfileData>;
  // Chạy sau khi phiên đã đăng nhập và trước khi render: để giữ, làm lỗi hoặc bật đồng hồ giả cho yêu cầu đầu tiên
  before?: HarnessOptions['before'];
  // false: render trang trực tiếp, không bọc khung Lễ tân (khung gỡ trang đi khi phiên bị xoá, che mất hành vi của chính trang)
  withLayout?: boolean;
}

export async function renderReceptionProfilePage(
  options: ReceptionHarnessOptions = {},
) {
  const api = await setUpApi(
    { ...SAMPLE_RECEPTIONIST, ...options.initial },
    [],
    'LeTan',
  );
  options.before?.(api);

  const page = <ReceptionProfilePage />;
  const router = createMemoryRouter(
    options.withLayout === false
      ? [{ path: RECEPTION_PATHS.profile, element: page }]
      : [
          {
            path: ROLE_HOME_PATHS.LeTan,
            element: <ReceptionLayout items={[]} />,
            children: [{ path: RECEPTION_PROFILE_SEGMENT, element: page }],
          },
        ],
    { initialEntries: [RECEPTION_PATHS.profile] },
  );
  const view = render(<RouterProvider router={router} />);
  return { ...api, router, ...view };
}

// Giá trị của một hàng xem (`dd` ngay sau `dt`), tìm theo nhãn
export const rowValue = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
// Nhãn các hàng xem theo thứ tự
export const rowLabels = () =>
  Array.from(document.querySelectorAll('dt')).map((term) => term.textContent);
// Các lần PUT /api/profile đã ghi
export const puts = (profile: {
  requests: { method: string; body: unknown }[];
}) => profile.requests.filter((request) => request.method === 'PUT');
