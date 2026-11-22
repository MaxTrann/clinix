import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminMe } from '../admin-me';
import { AdminMeProvider } from '../admin-me-context';
import {
  BRANCH,
  SYSTEM,
  apiError,
  json,
} from '../patient-accounts/testing/patient-accounts-test-kit';
import { DoctorProfilesPage } from './doctor-profiles-page';
import type { DoctorDetail } from './doctor-profile-types';

// Admin F7 — màn Quản lý hồ sơ bác sĩ, ở mức trang với API giả (DỮ LIỆU GIẢ) đúng hợp đồng B12, B13.
// BS-41 (bị chặn: hiện danh sách, giữ dữ liệu, không lưu), BS-42 (học vị điền sẵn; ô chi nhánh khoá với Chi nhánh), BS-43 (phía giao diện: tìm, lọc),
// HSF-02 đến HSF-05 [đề xuất mã]: danh sách theo Figma 535:2, panel Hồ sơ 536:2, lưu thành công, lỗi tải và mất mạng.

const doctor = (over: Partial<DoctorDetail> = {}): DoctorDetail => ({
  taiKhoanId: '7',
  hoTen: 'Nguyễn Minh Anh',
  email: 'bs7@example.test',
  soDienThoai: '0900000007',
  ngaySinh: '1990-11-08',
  anhDaiDien: null,
  trangThaiTaiKhoan: 'DangHoatDong',
  chucDanh: 'ThS_BS',
  hocVi: 'ThS',
  soNamKinhNghiem: 8,
  moTaChuyenMon: 'Chuyên sâu tim mạch.',
  chuyenKhoa: {
    chuyenKhoaId: '1',
    ten: 'Tim mạch',
    trangThaiHoatDong: 'DangHoatDong',
  },
  chiNhanh: { chiNhanhId: '5', ten: 'Chi nhánh Quận 3' },
  dichVuKham: { dichVuKhamId: '11', ten: 'Khám tim mạch' },
  giaMacDinh: '300000.00',
  phuPhi: '50000.00',
  giaKham: '350000.00',
  ...over,
});

interface Recorded {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

function installApi(
  options: {
    doctors?: DoctorDetail[];
    patch?: (body: unknown) => Response | Promise<Response>;
  } = {},
) {
  const doctors = options.doctors ?? [doctor()];
  const requests: Recorded[] = [];
  const handle = (r: Recorded): Response | Promise<Response> => {
    if (r.method === 'GET' && r.path === '/admin/doctors')
      return json({
        items: doctors,
        total: doctors.length,
        page: Number(r.search.get('page')),
        pageSize: 20,
      });
    const one = /^\/admin\/doctors\/(\w+)$/.exec(r.path);
    if (one && r.method === 'GET') {
      const found = doctors.find((d) => d.taiKhoanId === one[1]);
      return found ? json(found) : apiError(404, 'KHONG_TIM_THAY');
    }
    if (one && r.method === 'PATCH')
      return options.patch?.(r.body) ?? json(doctors[0]);
    if (r.path === '/admin/options/specialties')
      return json({
        items: [
          { chuyenKhoaId: '1', ten: 'Tim mạch' },
          { chuyenKhoaId: '2', ten: 'Nhi khoa' },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      });
    if (r.path === '/admin/branches')
      return json({
        items: [
          {
            chiNhanhId: '5',
            ten: 'Chi nhánh Quận 3',
            dichVuKham: [
              { dichVuKhamId: '11', ten: 'Khám tim mạch' },
              { dichVuKhamId: '13', ten: 'Khám tổng quát' },
            ],
          },
          {
            chiNhanhId: '6',
            ten: 'Chi nhánh Quận 1',
            dichVuKham: [{ dichVuKhamId: '12', ten: 'Khám nhi' }],
          },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      });
    if (r.path === '/admin/services')
      return json({
        items: [
          { dichVuKhamId: '11', giaMacDinh: '300000.00' },
          { dichVuKhamId: '12', giaMacDinh: '250000.00' },
          { dichVuKhamId: '13', giaMacDinh: '200000.00' },
        ],
        total: 3,
        page: 1,
        pageSize: 100,
      });
    return apiError(404, 'KHONG_TIM_THAY');
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const r: Recorded = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        search: url.searchParams,
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      };
      requests.push(r);
      return handle(r);
    }),
  );
  return {
    requests,
    lists: () =>
      requests.filter((r) => r.method === 'GET' && r.path === '/admin/doctors'),
    patches: () => requests.filter((r) => r.method === 'PATCH'),
  };
}

function renderPage(scope: AdminMe = SYSTEM) {
  return render(
    <MemoryRouter>
      <AdminMeProvider value={scope}>
        <DoctorProfilesPage />
      </AdminMeProvider>
    </MemoryRouter>,
  );
}

async function openEdit() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Xem chi tiết Nguyễn Minh Anh',
    }),
  );
  const panel = await screen.findByRole('dialog', { name: 'Hồ sơ bác sĩ' });
  fireEvent.click(
    await within(panel).findByRole('button', { name: 'Chỉnh sửa hồ sơ' }),
  );
  await within(panel).findByLabelText('Chức danh');
  return panel;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HSF-02 danh sách (Figma 535:2)', () => {
  it('hiện tên kèm chức danh, số năm KN, ngày sinh, chuyên khoa, giá khám, trạng thái', async () => {
    installApi({
      doctors: [
        doctor(),
        doctor({
          taiKhoanId: '8',
          hoTen: 'Nguyễn Hoài Nam',
          chucDanh: 'BS',
          hocVi: 'BS',
          soNamKinhNghiem: 3,
          ngaySinh: null,
          trangThaiTaiKhoan: 'NgungHoatDong',
        }),
      ],
    });
    renderPage();
    const table = await screen.findByRole('table', {
      name: 'Danh sách hồ sơ bác sĩ',
    });
    expect(within(table).getByText('ThS.BS. Nguyễn Minh Anh')).toBeTruthy();
    expect(within(table).getByText('8 năm KN')).toBeTruthy();
    expect(within(table).getByText('08/11/1990')).toBeTruthy();
    expect(within(table).getAllByText('350.000đ')).toHaveLength(2);
    expect(within(table).getByText('Hoạt động')).toBeTruthy();
    expect(within(table).getByText('BS. Nguyễn Hoài Nam')).toBeTruthy();
    expect(within(table).getByText('Vô hiệu')).toBeTruthy();
    expect(within(table).getByText('—')).toBeTruthy();
  });

  it('BS-43 ô tìm gửi `q` đã trim; lọc chuyên khoa gửi `chuyenKhoaId` và về trang 1', async () => {
    const api = installApi();
    renderPage();
    await screen.findByRole('table');
    fireEvent.change(
      screen.getByPlaceholderText('Tìm theo tên bác sĩ, email, số điện thoại…'),
      { target: { value: '  0900  ' } },
    );
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('q')).toBe('0900'),
    );
    await screen.findByRole('option', { name: 'Nhi khoa' });
    fireEvent.change(screen.getByLabelText('Lọc theo chuyên khoa'), {
      target: { value: '2' },
    });
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('chuyenKhoaId')).toBe('2'),
    );
    expect(api.lists().at(-1)?.search.get('page')).toBe('1');
  });

  it('HSF-05 không có bác sĩ: câu rỗng khác nhau khi có và không có bộ lọc; lỗi tải có "Thử lại"', async () => {
    installApi({ doctors: [] });
    renderPage();
    expect(await screen.findByText('Chưa có bác sĩ nào.')).toBeTruthy();
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    fireEvent.change(
      screen.getByPlaceholderText('Tìm theo tên bác sĩ, email, số điện thoại…'),
      { target: { value: 'x' } },
    );
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});

describe('HSF-03 panel Hồ sơ (Figma 536:2)', () => {
  it('hiện đủ dòng thông tin, nhãn học vị, giá, phụ phí, tổng giá khám, chi nhánh, giới thiệu', async () => {
    installApi();
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Xem chi tiết Nguyễn Minh Anh',
      }),
    );
    const panel = await screen.findByRole('dialog', { name: 'Hồ sơ bác sĩ' });
    await within(panel).findByText('Thông tin hồ sơ');
    for (const text of [
      'Đang hoạt động',
      'ThS.BS.',
      'Thạc sĩ',
      '8 năm',
      'Khám tim mạch',
      '300.000đ',
      '50.000đ',
      '350.000đ',
      'Chuyên sâu tim mạch.',
    ])
      expect(within(panel).getAllByText(text).length).toBeGreaterThan(0);
  });
});

describe('BS-42 panel Chỉnh sửa (Figma 537:2)', () => {
  it('đổi chức danh thì học vị điền sẵn; dịch vụ hiện kèm giá; Toàn hệ thống đổi được chi nhánh', async () => {
    installApi();
    renderPage();
    const panel = await openEdit();
    const degree = within(panel).getByLabelText('Học vị') as HTMLSelectElement;
    fireEvent.change(within(panel).getByLabelText('Chức danh'), {
      target: { value: 'PGS_TS_BS' },
    });
    expect(degree.value).toBe('PGS');
    expect(
      within(panel).getByRole('option', { name: 'Khám tổng quát – 200.000đ' }),
    ).toBeTruthy();
    expect(
      (within(panel).getByLabelText('Chi nhánh công tác') as HTMLSelectElement)
        .disabled,
    ).toBe(false);
  });

  it('Quản trị viên Chi nhánh: ô chi nhánh bị khoá, có câu giải thích', async () => {
    installApi();
    renderPage(BRANCH);
    const panel = await openEdit();
    expect(
      (within(panel).getByLabelText('Chi nhánh công tác') as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      within(panel).getByText(
        'Chỉ Quản trị viên toàn hệ thống được đổi chi nhánh của bác sĩ.',
      ),
    ).toBeTruthy();
  });
});

describe('lưu hồ sơ', () => {
  it('HSF-04 lưu thành công: gửi đủ form một lần, panel về chế độ xem với bản server trả, danh sách tải lại', async () => {
    const saved = doctor({ soNamKinhNghiem: 12, giaKham: '400000.00' });
    const api = installApi({ patch: () => json(saved) });
    renderPage();
    const panel = await openEdit();
    const listsBefore = api.lists().length;
    fireEvent.change(within(panel).getByLabelText('Kinh nghiệm (năm)'), {
      target: { value: '12' },
    });
    fireEvent.change(within(panel).getByLabelText('Giới thiệu'), {
      target: { value: '   ' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Lưu thay đổi' }),
    );
    expect(await within(panel).findByText('Đã lưu hồ sơ bác sĩ.')).toBeTruthy();
    expect(api.patches()).toHaveLength(1);
    expect(api.patches()[0]?.path).toBe('/admin/doctors/7');
    expect(api.patches()[0]?.body).toEqual({
      chucDanh: 'ThS_BS',
      hocVi: 'ThS',
      chuyenKhoaId: '1',
      dichVuKhamId: '11',
      soNamKinhNghiem: 12,
      moTaChuyenMon: null,
      chiNhanhId: '5',
    });
    expect(within(panel).getByText('12 năm')).toBeTruthy();
    await waitFor(() =>
      expect(api.lists().length).toBeGreaterThan(listsBefore),
    );
  });

  it('BS-41 bị chặn đổi chi nhánh: hiện danh sách lịch hẹn và ca, giữ dữ liệu đã nhập, vẫn ở chế độ sửa', async () => {
    installApi({
      patch: () =>
        json(
          {
            maLoi: 'DOI_CHI_NHANH_BI_CHAN',
            thongBao: 'x',
            chiTiet: {
              lichHen: {
                items: [
                  {
                    lichHenId: '90',
                    maLichHen: 'LH0090',
                    thoiGian: '2026-11-10 08:30:00',
                    trangThai: 'DaXacNhan',
                  },
                ],
                tong: 51,
              },
              ca: {
                items: [
                  { lichLamViecId: '3', ngay: '2026-11-22', ca: 'CaSang' },
                ],
                tong: 1,
              },
            },
          },
          409,
        ),
    });
    renderPage();
    const panel = await openEdit();
    fireEvent.change(within(panel).getByLabelText('Chi nhánh công tác'), {
      target: { value: '6' },
    });
    fireEvent.change(within(panel).getByLabelText('Dịch vụ khám chính'), {
      target: { value: '12' },
    });
    fireEvent.change(within(panel).getByLabelText('Giới thiệu'), {
      target: { value: 'Mô tả mới' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Lưu thay đổi' }),
    );
    const alert = await within(panel).findByRole('alert');
    expect(alert.textContent).toMatch(/^Không thể đổi chi nhánh/);
    expect(
      within(alert).getByText('Lịch hẹn đang hoạt động (51)'),
    ).toBeTruthy();
    expect(
      within(alert).getByText('LH0090 · 08:30 10/11/2026 · Đã xác nhận'),
    ).toBeTruthy();
    expect(within(alert).getByText('… và 50 lịch hẹn khác')).toBeTruthy();
    expect(within(alert).getByText('22/11/2026 · Ca sáng')).toBeTruthy();
    expect(
      (within(panel).getByLabelText('Giới thiệu') as HTMLTextAreaElement).value,
    ).toBe('Mô tả mới');
    expect(
      (within(panel).getByLabelText('Chi nhánh công tác') as HTMLSelectElement)
        .value,
    ).toBe('6');
  });

  it('HSF-05 đổi chi nhánh mà chưa chọn lại dịch vụ ⇒ báo ngay, không gửi; mất mạng ⇒ "chưa rõ" kèm nút tải lại', async () => {
    const api = installApi({
      patch: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderPage();
    const panel = await openEdit();
    fireEvent.change(within(panel).getByLabelText('Chi nhánh công tác'), {
      target: { value: '6' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Lưu thay đổi' }),
    );
    expect(
      await within(panel).findByText('Vui lòng chọn dịch vụ khám chính.'),
    ).toBeTruthy();
    expect(api.patches()).toHaveLength(0);

    fireEvent.change(within(panel).getByLabelText('Dịch vụ khám chính'), {
      target: { value: '12' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Lưu thay đổi' }),
    );
    expect(
      await within(panel).findByText(/^Chưa rõ hồ sơ đã được lưu hay chưa/),
    ).toBeTruthy();
    expect(
      within(panel).getByRole('button', { name: 'Tải lại hồ sơ' }),
    ).toBeTruthy();
  });
});
