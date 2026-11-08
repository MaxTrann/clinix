import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
import type { DoctorItem, SpecialtySummary } from '../api/search-types';
import { DOCTOR_EMPTY_MESSAGE } from './doctor-results';

// search F6. Mã ca TBS-21 (PLAN search mục 7.4): "Đội ngũ bác sĩ" và danh sách trong chi tiết chuyên khoa
// dùng cùng thẻ/bộ lọc, không bắt chọn dịch vụ.
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
  moTa: null,
  anhDaiDien: null,
  soBacSi: 1,
};
const NHI: SpecialtySummary = {
  chuyenKhoaId: '11',
  ten: 'Nhi khoa',
  moTa: null,
  anhDaiDien: null,
  soBacSi: 0,
};
const DOCTOR: DoctorItem = {
  bacSiId: '100',
  hoTen: 'Nguyễn Minh Anh',
  chucDanh: 'ThS_BS',
  soNamKinhNghiem: 8,
  chuyenKhoa: { chuyenKhoaId: '10', ten: 'Tim mạch' },
  chiNhanh: {
    chiNhanhId: '1',
    ten: 'Chi nhánh Sài Gòn',
    diaChi: '1 Đường Mẫu',
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
let doctors: DoctorItem[];
let doctorCalls: URL[];
let specialtiesFail: boolean;

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
  doctors = [DOCTOR];
  doctorCalls = [];
  specialtiesFail = false;
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
          duongDayNong: null,
          email: null,
        });
      }
      if (path.endsWith('/public/branches')) {
        return jsonResponse(200, {
          items: [BRANCH],
          total: 1,
          page: 1,
          pageSize: 100,
        });
      }
      if (path.endsWith('/public/doctors')) {
        doctorCalls.push(url);
        return jsonResponse(200, {
          items: doctors,
          total: doctors.length,
          page: 1,
          pageSize: 20,
        });
      }
      if (path.endsWith('/public/specialties')) {
        if (specialtiesFail) {
          return jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' });
        }
        return jsonResponse(200, {
          items: [TIM_MACH, NHI],
          total: 2,
          page: 1,
          pageSize: 100,
          soCoBacSi: 1,
        });
      }
      if (/\/public\/specialties\/10$/.test(path)) {
        return jsonResponse(200, { ...TIM_MACH });
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

describe('Trang Đội ngũ bác sĩ', () => {
  it('TCH-05 / Q20: gợi ý dịch vụ lọc bác sĩ bằng id từ URL; đổi dịch vụ trên cùng trang không giữ bộ lọc cũ', async () => {
    const router = renderAt('/bac-si?dichVuKhamId=20');
    await screen.findByText(/Nguyễn Minh Anh/);
    expect(doctorCalls[0].searchParams.get('dichVuKhamId')).toBe('20');
    await act(async () => {
      await router.navigate('/bac-si?dichVuKhamId=21');
    });
    await waitFor(() =>
      expect(doctorCalls.at(-1)?.searchParams.get('dichVuKhamId')).toBe('21'),
    );
    await act(async () => {
      await router.navigate('/bac-si?q=tim');
    });
    await waitFor(() =>
      expect(doctorCalls.at(-1)?.searchParams.get('q')).toBe('tim'),
    );
    expect(doctorCalls.at(-1)?.searchParams.has('dichVuKhamId')).toBe(false);
  });

  it('TBS-21 hiện bác sĩ ngay, không bắt chọn dịch vụ; cùng thẻ với F5', async () => {
    renderAt('/bac-si');
    expect(
      await screen.findByRole('heading', { name: 'Đội ngũ bác sĩ' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4.3 (7 đánh giá)')).toBeInTheDocument();
    const first = doctorCalls[0];
    expect(first.searchParams.has('dichVuKhamId')).toBe(false);
    expect(first.searchParams.get('chiNhanhId')).toBe('1');
    expect(first.searchParams.has('chuyenKhoaId')).toBe(false);
  });

  it('TBS-21 có ô tìm theo tên hoặc chuyên khoa, ô chuyên khoa, chi nhánh, giá, đánh giá, sắp xếp', async () => {
    renderAt('/bac-si');
    await screen.findByText(/Nguyễn Minh Anh/);
    expect(
      screen.getByPlaceholderText('Tìm theo tên bác sĩ hoặc chuyên khoa'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('option', { name: 'Nhi khoa' }),
    ).toBeInTheDocument();
    for (const label of [
      'Chuyên khoa',
      'Chi nhánh',
      'Giá từ (đ)',
      'Giá đến (đ)',
      'Đánh giá',
      'Sắp xếp',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('TBS-21 chọn chuyên khoa hoặc gõ từ khoá ⇒ gọi lại API với đúng tham số', async () => {
    renderAt('/bac-si');
    await screen.findByText(/Nguyễn Minh Anh/);
    await screen.findByRole('option', { name: 'Nhi khoa' });
    fireEvent.change(screen.getByLabelText('Chuyên khoa'), {
      target: { value: '11' },
    });
    await waitFor(() =>
      expect(
        doctorCalls[doctorCalls.length - 1].searchParams.get('chuyenKhoaId'),
      ).toBe('11'),
    );
    fireEvent.change(
      screen.getByPlaceholderText('Tìm theo tên bác sĩ hoặc chuyên khoa'),
      { target: { value: 'tim' } },
    );
    await waitFor(() =>
      expect(doctorCalls[doctorCalls.length - 1].searchParams.get('q')).toBe(
        'tim',
      ),
    );
  });

  it('TBS-21 rỗng: thông báo + "Xoá bộ lọc", không gợi ý chọn dịch vụ', async () => {
    doctors = [];
    renderAt('/bac-si');
    expect(await screen.findByText(DOCTOR_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Xoá bộ lọc' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/chọn dịch vụ khác/)).not.toBeInTheDocument();
  });

  it('TBS-22 không tải được danh sách chuyên khoa: danh sách bác sĩ vẫn dùng được', async () => {
    specialtiesFail = true;
    renderAt('/bac-si');
    expect(await screen.findByText(/Nguyễn Minh Anh/)).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Tất cả chuyên khoa' }),
    ).toBeInTheDocument();
  });
});

describe('Chi tiết chuyên khoa: bác sĩ của chuyên khoa', () => {
  it('TBS-21 danh sách chỉ của chuyên khoa đó, cố định chuyên khoa, không có ô chọn chuyên khoa', async () => {
    renderAt('/chuyen-khoa/10');
    expect(
      await screen.findByRole('heading', {
        name: 'Bác sĩ chuyên khoa Tim mạch',
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    ).toBeInTheDocument();
    const first = doctorCalls[0];
    expect(first.searchParams.get('chuyenKhoaId')).toBe('10');
    expect(first.searchParams.has('dichVuKhamId')).toBe(false);
    expect(screen.queryByLabelText('Chuyên khoa')).not.toBeInTheDocument();
  });

  it('TBS-21 đổi bộ lọc vẫn giữ chuyên khoa', async () => {
    renderAt('/chuyen-khoa/10');
    await screen.findByText(/Nguyễn Minh Anh/);
    fireEvent.change(screen.getByLabelText('Sắp xếp'), {
      target: { value: 'giaTangDan' },
    });
    await waitFor(() => {
      const last = doctorCalls[doctorCalls.length - 1];
      expect(last.searchParams.get('sapXep')).toBe('giaTangDan');
      expect(last.searchParams.get('chuyenKhoaId')).toBe('10');
    });
  });
});
