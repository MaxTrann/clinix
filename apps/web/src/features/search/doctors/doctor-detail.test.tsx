import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import {
  createFakeAuthApi,
  createFakeLocks,
} from '../../../test/fake-auth-api';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import type { DoctorDetail } from '../api/search-types';
import { NO_DESCRIPTION_MESSAGE } from './doctor-detail-panels';
import { BOOKING_GUIDE_STEPS } from './doctor-detail-text';
import { DOCTOR_NOT_FOUND_MESSAGE } from './doctor-detail-page';

// search F7. Mã ca TBS-20 (PLAN search mục 7.4) và TBS-22 (lỗi/mất mạng).
const STORAGE_KEY = 'clinix.chiNhanhDangChon';
const DETAIL: DoctorDetail = {
  bacSiId: '100',
  hoTen: 'Nguyễn Minh Anh',
  chucDanh: 'ThS_BS',
  soNamKinhNghiem: 8,
  moTaChuyenMon: 'Chuyên sâu điều trị tăng huyết áp.',
  chuyenKhoa: { chuyenKhoaId: '10', ten: 'Tim mạch' },
  chiNhanh: {
    chiNhanhId: '1',
    ten: 'Chi nhánh Sài Gòn',
    diaChi: '1 Đường Mẫu',
    lichHoatDong: [1, 2, 3, 4, 5, 6, 7].map((thuTrongTuan) => ({
      thuTrongTuan,
      hoatDong:
        thuTrongTuan === 7
          ? null
          : { sang: { tu: '07:30', den: '12:00' }, chieu: null },
    })),
  },
  dichVu: { dichVuKhamId: '20', ten: 'Tim mạch', thoiLuong: 30 },
  gia: {
    giaMacDinh: '300000.00',
    phuPhi: '0.00',
    giaKham: '300000.00',
    mucDatCoc: '100000.00',
  },
  danhGia: { diemTrungBinh: '4.30', soDanhGia: 7 },
};

let api: ReturnType<typeof createFakeAuthApi>;
let detail: DoctorDetail | 'NOT_FOUND' | 'ERROR';
let detailUrls: string[];

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ chiNhanhId: '1', nguon: 'NguoiDung' }),
  );
  api = createFakeAuthApi();
  detail = DETAIL;
  detailUrls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname;
      if (!path.includes('/public/')) return api.fetch(input, init);
      if (path.endsWith('/public/clinic-info')) {
        return jsonResponse(200, {
          tenThuongHieu: 'CLINIX',
          diaChiTruSo: null,
          duongDayNong: '1900 1234',
          email: null,
        });
      }
      if (path.endsWith('/public/branches')) {
        return jsonResponse(200, {
          items: [],
          total: 0,
          page: 1,
          pageSize: 100,
        });
      }
      if (/\/public\/doctors\/[^/]+$/.test(path)) {
        detailUrls.push(path);
        if (detail === 'NOT_FOUND') {
          return jsonResponse(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' });
        }
        if (detail === 'ERROR') {
          return jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' });
        }
        return jsonResponse(200, detail);
      }
      return jsonResponse(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' });
    }),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createFakeLocks(),
  });
  setAuthState({ status: 'unauthenticated' });
});

afterEach(() => {
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const openTab = (name: string) =>
  fireEvent.click(screen.getByRole('tab', { name }));

describe('Trang Chi tiết bác sĩ', () => {
  it('TBS-20 đầu trang: chức danh, chuyên khoa, điểm, kinh nghiệm, thời lượng, chi nhánh, giá, cọc; breadcrumb', async () => {
    renderAt('/bac-si/100');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'ThS.BS. Nguyễn Minh Anh',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('4.3 (7 đánh giá)')).toBeInTheDocument();
    expect(screen.getByText('8 năm kinh nghiệm')).toBeInTheDocument();
    expect(screen.getByText('30 phút/lượt')).toBeInTheDocument();
    expect(screen.getByText('Cọc 100.000đ')).toBeInTheDocument();
    const crumbs = within(
      screen.getByRole('navigation', { name: 'Đường dẫn' }),
    );
    expect(crumbs.getByRole('link', { name: 'Bác sĩ' })).toHaveAttribute(
      'href',
      '/bac-si',
    );
    expect(detailUrls[0]).toMatch(/\/public\/doctors\/100$/);
  });

  it('TBS-20 khối "Thông tin khám": không có "Đặt trước tối đa", "Nhắn tin" vô hiệu, có hotline', async () => {
    renderAt('/bac-si/100');
    // Chờ bằng text: truy vấn role theo tên chậm trên cây DOM lớn của cả khung công khai
    await screen.findByText('Thông tin khám', { selector: 'h2' });
    expect(screen.queryByText(/Đặt trước tối đa/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Nhắn tin với bác sĩ' }),
    ).toBeDisabled();
    // Hotline hiện ở khối "Hỗ trợ đặt lịch" (chân trang cũng có số này nên có thể hai chỗ)
    expect(await screen.findByText('Hỗ trợ đặt lịch')).toBeInTheDocument();
    expect(
      within(screen.getByRole('complementary')).getByText('1900 1234'),
    ).toBeInTheDocument();
  });

  it('TBS-20 năm tab; mở đầu là Lịch khám chừa chỗ (không có khung giờ)', async () => {
    renderAt('/bac-si/100');
    await screen.findByRole('tablist');
    const names = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(names).toEqual([
      'Lịch khám',
      'Giới thiệu',
      'Phòng khám',
      'Hướng dẫn',
      'Đánh giá',
    ]);
    expect(screen.getByRole('tab', { name: 'Lịch khám' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText('Lịch khám sẽ hiển thị ở bước đặt lịch'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Buổi sáng')).not.toBeInTheDocument();
  });

  it('TBS-20 tab Giới thiệu: có mô tả; không có mô tả ⇒ thông báo', async () => {
    renderAt('/bac-si/100');
    await screen.findByRole('tablist');
    openTab('Giới thiệu');
    expect(
      screen.getByText('Chuyên sâu điều trị tăng huyết áp.'),
    ).toBeInTheDocument();
  });

  it('TBS-20 tab Giới thiệu khi moTaChuyenMon là null', async () => {
    detail = { ...DETAIL, moTaChuyenMon: null };
    renderAt('/bac-si/100');
    await screen.findByRole('tablist');
    openTab('Giới thiệu');
    expect(screen.getByText(NO_DESCRIPTION_MESSAGE)).toBeInTheDocument();
  });

  it('TBS-20 tab Phòng khám: địa chỉ và giờ làm việc gộp theo ngày', async () => {
    renderAt('/bac-si/100');
    await screen.findByRole('tablist');
    openTab('Phòng khám');
    expect(
      screen.getByText('Thứ 2 – Thứ 7: 07:30 – 12:00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Chủ nhật: Nghỉ')).toBeInTheDocument();
  });

  it('TBS-20 tab Hướng dẫn: đủ 5 bước', async () => {
    renderAt('/bac-si/100');
    await screen.findByRole('tablist');
    openTab('Hướng dẫn');
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(
      BOOKING_GUIDE_STEPS.length,
    );
    expect(screen.getByText(BOOKING_GUIDE_STEPS[4])).toBeInTheDocument();
  });

  it('TBS-20 tab Đánh giá: điểm + số lượt; chưa có đánh giá ⇒ "Chưa có đánh giá"', async () => {
    renderAt('/bac-si/100');
    await screen.findByRole('tablist');
    openTab('Đánh giá');
    expect(
      screen.getByText(/7 đánh giá/, { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('TBS-20 chưa có đánh giá', async () => {
    detail = { ...DETAIL, danhGia: { diemTrungBinh: null, soDanhGia: 0 } };
    renderAt('/bac-si/100');
    await screen.findByRole('tablist');
    openTab('Đánh giá');
    expect(
      screen.getAllByText('Chưa có đánh giá').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('TBS-20 phím mũi tên chuyển tab; nút "Chọn ngày khám" về tab Lịch khám', async () => {
    renderAt('/bac-si/100');
    const first = await screen.findByRole('tab', { name: 'Lịch khám' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Giới thiệu' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chọn ngày khám' }));
    expect(screen.getByRole('tab', { name: 'Lịch khám' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('TBS-13/TBS-20 bác sĩ không tồn tại ⇒ 404 có thông báo và đường về đội ngũ bác sĩ', async () => {
    detail = 'NOT_FOUND';
    renderAt('/bac-si/999');
    expect(
      await screen.findByText(DOCTOR_NOT_FOUND_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Xem đội ngũ bác sĩ' }),
    ).toHaveAttribute('href', '/bac-si');
  });

  it('TBS-22 lỗi 500: báo lỗi và "Thử lại" tải lại được', async () => {
    detail = 'ERROR';
    renderAt('/bac-si/100');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    detail = DETAIL;
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('heading', { level: 1 }),
    ).toBeInTheDocument();
  });

  it('TBS-19/F7 thẻ bác sĩ ở danh sách có liên kết "Xem hồ sơ" tới /bac-si/:id', async () => {
    const item = {
      bacSiId: '100',
      hoTen: DETAIL.hoTen,
      chucDanh: DETAIL.chucDanh,
      soNamKinhNghiem: 8,
      chuyenKhoa: DETAIL.chuyenKhoa,
      chiNhanh: {
        chiNhanhId: '1',
        ten: 'Chi nhánh Sài Gòn',
        diaChi: '1 Đường Mẫu',
      },
      dichVu: DETAIL.dichVu,
      gia: DETAIL.gia,
      danhGia: DETAIL.danhGia,
    };
    const original = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (
          new URL(String(input), 'http://localhost').pathname.endsWith(
            '/public/doctors',
          )
        ) {
          return Promise.resolve(
            jsonResponse(200, {
              items: [item],
              total: 1,
              page: 1,
              pageSize: 20,
            }),
          );
        }
        return original(input, init);
      }),
    );
    renderAt('/bac-si');
    expect(
      await screen.findByRole('link', { name: /Xem hồ sơ/ }),
    ).toHaveAttribute('href', '/bac-si/100');
  });
});
