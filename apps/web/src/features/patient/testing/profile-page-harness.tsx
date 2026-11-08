import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { resetAuthForTest, restoreSession } from '../../auth/auth-session';
import { PatientLayout } from '../shell/patient-layout';
import { PatientProfilePage } from '../pages/patient-profile-page';
import {
  SAMPLE_ADMIN,
  SAMPLE_PROFILE,
  SAMPLE_RECEPTIONIST,
  createFakeProfileApi,
  type FakeProfileData,
  type FakeRelative,
} from './fake-profile-api';

// Dựng trang "Hồ sơ người khám" trong khung Bệnh nhân với phiên đăng nhập thật (qua fake auth) và `/api/profile` giả
// (patient F3; dùng chung cho hai file test của trang). Không có ở bộ xuất của module: chỉ test dùng.
export const FORM_NAME = 'Chỉnh sửa thông tin bản thân';

export interface HarnessOptions {
  initial?: Partial<FakeProfileData>;
  // Danh sách người thân ban đầu (patient F6); mặc định rỗng, như ba file test cũ của auth và router
  relatives?: FakeRelative[];
  // Chạy sau khi phiên đã đăng nhập và trước khi render: để giữ, làm lỗi hoặc bật đồng hồ giả cho yêu cầu đầu tiên
  before?: (api: Awaited<ReturnType<typeof setUpApi>>) => void;
  // false: render trang trực tiếp, không bọc khung Bệnh nhân (khung gỡ trang đi khi phiên bị xoá, che mất hành vi của chính trang)
  withLayout?: boolean;
}

// Fake auth + fake /api/profile, phiên đã đăng nhập (có access token). Chưa render gì.
// `vaiTro` mặc định BenhNhan (F3, F6, F7); trang Lễ tân (patient F4) truyền 'LeTan', trang Quản trị viên (patient F5) truyền 'QuanTriVien':
// tên ở thanh bên là tên hồ sơ mẫu của vai trò đó.
export async function setUpApi(
  initial: Partial<FakeProfileData> = {},
  relatives: FakeRelative[] = [],
  vaiTro: 'BenhNhan' | 'LeTan' | 'QuanTriVien' = 'BenhNhan',
) {
  resetAuthForTest();
  const account = {
    vaiTro,
    hoTen: {
      BenhNhan: SAMPLE_PROFILE.hoTen,
      LeTan: SAMPLE_RECEPTIONIST.hoTen,
      QuanTriVien: SAMPLE_ADMIN.hoTen,
    }[vaiTro],
    daXacMinhEmail: true,
  };
  const auth = createFakeAuthApi(account);
  const profile = createFakeProfileApi(auth.fetch, initial, relatives);
  vi.stubGlobal('fetch', vi.fn(profile.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  auth.startSession();
  await restoreSession();
  return { auth, account, profile };
}

export async function renderProfilePage(options: HarnessOptions = {}) {
  const api = await setUpApi(options.initial, options.relatives);
  options.before?.(api);

  const page = <PatientProfilePage />;
  const router = createMemoryRouter(
    options.withLayout === false
      ? [{ path: '/benh-nhan/ho-so-nguoi-kham', element: page }]
      : [
          {
            path: '/benh-nhan',
            element: <PatientLayout items={[]} />,
            children: [{ path: 'ho-so-nguoi-kham', element: page }],
          },
        ],
    { initialEntries: ['/benh-nhan/ho-so-nguoi-kham'] },
  );
  const view = render(<RouterProvider router={router} />);
  return { ...api, router, ...view };
}

// Ô của form sửa, tìm theo vai trò và tên (không theo class). "Hủy" cũng có ở khối đổi mật khẩu nên nút của form tìm trong form.
export const form = () => screen.getByRole('form', { name: FORM_NAME });
export const nameInput = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: /Họ và tên/ });
export const phoneInput = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: /Số điện thoại/ });
export const genderSelect = () =>
  screen.getByRole<HTMLSelectElement>('combobox', { name: /Giới tính/ });
export const birthInput = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: /Ngày sinh/ });
export const addressInput = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: /Địa chỉ/ });
export const saveButton = () =>
  within(form()).getByRole<HTMLButtonElement>('button', {
    name: /Lưu thay đổi|Đang lưu/,
  });
export const cancelButton = () =>
  within(form()).getByRole<HTMLButtonElement>('button', { name: 'Hủy' });

export const typeInto = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });

export async function openEditForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Chỉnh sửa' }));
  return screen.findByRole('form', { name: FORM_NAME });
}
