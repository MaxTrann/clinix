import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AdminMeProvider } from '../admin-me-context';
import { DoctorProfilesPage } from '../doctor-profiles/doctor-profiles-page';
import {
  SYSTEM,
  json,
} from '../patient-accounts/testing/patient-accounts-test-kit';

// admin F8 PR2, liên kết "Nhân sự & Tài khoản" ở đầu màn Hồ sơ bác sĩ (mã NSF8-105 là [đề xuất], TRACKING admin 9A.21 mục 3). Từ F7, câu "Tạo tài khoản bác sĩ mới tại …" trỏ tạm về tab
// Bệnh nhân vì chưa có tab Nhân sự; F8 đổi đích sang `/admin/nhan-su`, nơi có nút "Tạo tài khoản nhân sự". Test đặt ở thư mục F8, KHÔNG sửa test của F7 (Trung).

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NSF8-105 liên kết tạo tài khoản bác sĩ trỏ tới tab Nhân sự', () => {
  it('NSF8-105 liên kết "Nhân sự & Tài khoản" ở đầu màn Hồ sơ bác sĩ trỏ /admin/nhan-su, KHÔNG còn trỏ tab Bệnh nhân', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ items: [], total: 0, page: 1, pageSize: 20 })),
    );
    render(
      <MemoryRouter>
        <AdminMeProvider value={SYSTEM}>
          <DoctorProfilesPage />
        </AdminMeProvider>
      </MemoryRouter>,
    );

    const link = await screen.findByRole('link', {
      name: 'Nhân sự & Tài khoản',
    });
    expect(link).toHaveAttribute('href', '/admin/nhan-su');
    expect(link).not.toHaveAttribute('href', '/admin/tai-khoan-benh-nhan');
  });
});
