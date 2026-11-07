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
import type { SpecialtyDetail, SpecialtySummary } from '../api/search-types';
import { SPECIALTY_EMPTY_MESSAGE } from './specialty-list-page';
import { SPECIALTY_NOT_FOUND_MESSAGE } from './specialty-detail-page';

// search F4. Mã ca TCK-09 (danh sách), TCK-10 (chi tiết) lấy từ PLAN search mục 7.2.
const STORAGE_KEY = 'clinix.chiNhanhDangChon';
const BRANCH = {
  chiNhanhId: '1',
  ten: 'Chi nhánh Sài Gòn',
  diaChi: '1 Đường Mẫu',
  toaDoLat: null,
  toaDoLng: null,
};

const TIM_MACH: SpecialtySummary = {
  chuyenKhoaId: '10',
  ten: 'Tim mạch',
  moTa: 'Khám và điều trị bệnh tim.',
  anhDaiDien: 'https://example.com/tim.jpg',
  soBacSi: 2,
};
const NHI: SpecialtySummary = {
  chuyenKhoaId: '11',
  ten: 'Nhi khoa',
  moTa: null,
  anhDaiDien: null,
  soBacSi: 0,
};

let api: ReturnType<typeof createFakeAuthApi>;
let items: SpecialtySummary[];
let detail: SpecialtyDetail | 'NOT_FOUND' | 'ERROR';
let listFails: boolean;
let calls: { url: string; headers: Headers }[];

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  // Đã có lựa chọn ⇒ khung công khai không xin vị trí (CNC-05)
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ chiNhanhId: '1', nguon: 'NguoiDung' }),
  );
  api = createFakeAuthApi();
  items = [TIM_MACH, NHI];
  detail = { ...TIM_MACH };
  listFails = false;
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes('/public/')) return api.fetch(input, init);
      calls.push({ url, headers: new Headers(init?.headers) });
      if (url.includes('/public/clinic-info')) {
        return Promise.resolve(
          jsonResponse(200, {
            tenThuongHieu: 'CLINIX',
            diaChiTruSo: null,
            duongDayNong: null,
            email: null,
          }),
        );
      }
      if (url.includes('/public/branches')) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [BRANCH],
            total: 1,
            page: 1,
            pageSize: 100,
          }),
        );
      }
      // Phần bác sĩ của chi nhánh chi tiết (F6) có test riêng; ở đây chỉ cần trả rỗng
      if (url.includes('/public/doctors')) {
        return Promise.resolve(
          jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 }),
        );
      }
      if (/\/public\/specialties\/[^?]+/.test(url)) {
        if (detail === 'NOT_FOUND') {
          return Promise.resolve(
            jsonResponse(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
          );
        }
        if (detail === 'ERROR') {
          return Promise.resolve(
            jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
          );
        }
        return Promise.resolve(jsonResponse(200, detail));
      }
      if (listFails) {
        return Promise.resolve(
          jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
        );
      }
      const q = new URL(url, 'http://localhost').searchParams.get('q');
      const shown = q
        ? items.filter((item) =>
            item.ten.toLowerCase().includes(q.toLowerCase()),
          )
        : items;
      return Promise.resolve(
        jsonResponse(200, {
          items: shown,
          total: shown.length,
          page: 1,
          pageSize: 100,
          soCoBacSi: shown.filter((item) => item.soBacSi > 0).length,
        }),
      );
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

const listCalls = () =>
  calls.filter((call) => /\/public\/specialties(\?|$)/.test(call.url));

describe('Trang Chuyên khoa', () => {
  it('TCK-09 hiện tiêu đề, số lượng, thẻ có ảnh (alt), "N bác sĩ" / "Sắp có bác sĩ"', async () => {
    renderAt('/chuyen-khoa');
    expect(
      await screen.findByText(
        '2 chuyên khoa, 1 chuyên khoa hiện đã có bác sĩ.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Khám chuyên khoa' }),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Tim mạch')).toHaveAttribute(
      'src',
      'https://example.com/tim.jpg',
    );
    // Chuyên khoa không ảnh: không có thẻ img
    expect(screen.queryByAltText('Nhi khoa')).not.toBeInTheDocument();
    expect(screen.getByText('2 bác sĩ')).toBeInTheDocument();
    expect(screen.getByText('Sắp có bác sĩ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tim mạch/ })).toHaveAttribute(
      'href',
      '/chuyen-khoa/10',
    );
  });

  it('TCK-09 mặc định lọc theo chi nhánh đang chọn và không gắn token (CC-08)', async () => {
    renderAt('/chuyen-khoa');
    await screen.findByText('Tim mạch');
    const first = listCalls()[0];
    expect(new URL(first.url, 'http://x').searchParams.get('chiNhanhId')).toBe(
      '1',
    );
    expect(first.headers.get('Authorization')).toBeNull();
  });

  it('TCK-09 gõ vào ô tìm: gửi q sau khi ngừng gõ, một lần cho một cụm gõ', async () => {
    renderAt('/chuyen-khoa');
    await screen.findByText('Nhi khoa');
    const before = listCalls().length;
    const box = screen.getByRole('searchbox', { name: 'Tìm chuyên khoa' });
    fireEvent.change(box, { target: { value: 't' } });
    fireEvent.change(box, { target: { value: 'tim' } });
    // Đang tải thì danh sách tạm ẩn: chờ đến khi kết quả cuối (chỉ còn Tim mạch) hiện ra
    await vi.waitFor(() => {
      expect(screen.getByText('Tim mạch')).toBeInTheDocument();
      expect(screen.queryByText('Nhi khoa')).not.toBeInTheDocument();
    });
    const added = listCalls().slice(before);
    expect(
      added.filter(
        (call) => new URL(call.url, 'http://x').searchParams.get('q') === 'tim',
      ),
    ).toHaveLength(1);
    expect(
      added.some(
        (call) => new URL(call.url, 'http://x').searchParams.get('q') === 't',
      ),
    ).toBe(false);
  });

  it('TCK-09 / A1: không có kết quả ⇒ thông báo; "Xoá bộ lọc" xoá từ khoá và về Toàn quốc', async () => {
    renderAt('/chuyen-khoa');
    await screen.findByText('Tim mạch');
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'zzz' },
    });
    expect(
      await screen.findByText(SPECIALTY_EMPTY_MESSAGE),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(await screen.findByText('Tim mạch')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'),
    ).toEqual({ chiNhanhId: null, nguon: 'NguoiDung' });
    const last = listCalls().at(-1)!;
    expect(new URL(last.url, 'http://x').searchParams.has('chiNhanhId')).toBe(
      false,
    );
  });

  it('TCK-09 lỗi máy chủ ⇒ thông báo + "Thử lại" tải lại được', async () => {
    listFails = true;
    renderAt('/chuyen-khoa');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Đã có lỗi xảy ra/)).toBeInTheDocument();
    listFails = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Tim mạch')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('TCK-09 đang tải ⇒ hiện trạng thái đang tải', () => {
    renderAt('/chuyen-khoa');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
  });

  it('menu "Chuyên khoa" trên header là liên kết tới /chuyen-khoa', async () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(
      within(nav).getByRole('link', { name: 'Chuyên khoa' }),
    ).toHaveAttribute('href', '/chuyen-khoa');
  });
});

describe('Trang Chi tiết chuyên khoa', () => {
  it('TCK-10 hiện ảnh, tên, mô tả, số bác sĩ; chưa có giaKhamTu ⇒ ẩn dòng giá', async () => {
    renderAt('/chuyen-khoa/10');
    expect(
      await screen.findByRole('heading', { name: 'Tim mạch' }),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Tim mạch')).toBeInTheDocument();
    expect(screen.getByText('Khám và điều trị bệnh tim.')).toBeInTheDocument();
    expect(screen.getByText('2 bác sĩ')).toBeInTheDocument();
    expect(screen.queryByText(/Giá khám từ/)).not.toBeInTheDocument();
    const url = new URL(
      calls.find((c) => /specialties\/10/.test(c.url))!.url,
      'http://x',
    );
    expect(url.searchParams.get('chiNhanhId')).toBe('1');
  });

  it('TCK-10 có giaKhamTu ⇒ "Giá khám từ 350.000đ · cọc 100.000đ"', async () => {
    detail = { ...TIM_MACH, giaKhamTu: { giaKham: 350000, mucDatCoc: 100000 } };
    renderAt('/chuyen-khoa/10');
    expect(
      await screen.findByText(/Giá khám từ 350\.000đ · cọc 100\.000đ/),
    ).toBeInTheDocument();
  });

  it('TCK-10 không ảnh, không mô tả ⇒ ẩn mô tả, không ảnh vỡ; không bác sĩ ⇒ "Sắp có bác sĩ"', async () => {
    detail = { ...NHI, giaKhamTu: null };
    renderAt('/chuyen-khoa/11');
    expect(
      await screen.findByRole('heading', { name: 'Nhi khoa' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Sắp có bác sĩ')).toBeInTheDocument();
    expect(screen.queryByText(/Giá khám từ/)).not.toBeInTheDocument();
  });

  it('TCK-10 404 ⇒ "Không tìm thấy chuyên khoa này." kèm đường về danh sách', async () => {
    detail = 'NOT_FOUND';
    renderAt('/chuyen-khoa/999');
    expect(
      await screen.findByText(SPECIALTY_NOT_FOUND_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Xem tất cả chuyên khoa' }),
    ).toHaveAttribute('href', '/chuyen-khoa');
  });

  it('TCK-10 lỗi máy chủ (không phải 404) ⇒ thông báo lỗi chung, không nói "không tìm thấy"', async () => {
    detail = 'ERROR';
    renderAt('/chuyen-khoa/10');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    expect(screen.queryByText(SPECIALTY_NOT_FOUND_MESSAGE)).toBeNull();
  });
});
