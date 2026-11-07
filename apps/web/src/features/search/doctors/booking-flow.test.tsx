import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
import type {
  DoctorItem,
  ServiceGroupItem,
  ServiceItem,
} from '../api/search-types';
import { DOCTOR_EMPTY_MESSAGE } from './doctor-results';
import { PRICE_NOT_NUMBER_MESSAGE } from './doctor-filter-rules';
import { COMING_SOON_NOTE } from '../services/service-group-page';

// search F5. Mã ca TBS-16…TBS-19, TBS-22 lấy từ PLAN search mục 7.4.
const STORAGE_KEY = 'clinix.chiNhanhDangChon';
const BRANCH = {
  chiNhanhId: '1',
  ten: 'Chi nhánh Sài Gòn',
  diaChi: '1 Đường Mẫu',
  toaDoLat: null,
  toaDoLng: null,
};

const GROUPS: ServiceGroupItem[] = [
  {
    nhomDichVuId: '5',
    ten: 'Khám theo chuyên khoa',
    soDichVu: 8,
    giaTu: '200000.00',
    sapTrienKhai: false,
  },
  {
    nhomDichVuId: '6',
    ten: 'Tầm soát ung thư',
    soDichVu: 0,
    giaTu: null,
    sapTrienKhai: true,
  },
];

const SERVICES: ServiceItem[] = [
  {
    dichVuKhamId: '20',
    ten: 'Tim mạch',
    nhomDichVu: { id: '5', ten: 'Khám theo chuyên khoa' },
    thoiLuong: 30,
    giaMacDinh: '300000.00',
    mucDatCoc: '100000.00',
    soBacSi: 1,
  },
  {
    dichVuKhamId: '21',
    ten: 'Nội tổng quát',
    nhomDichVu: { id: '5', ten: 'Khám theo chuyên khoa' },
    thoiLuong: 30,
    giaMacDinh: '200000.00',
    mucDatCoc: '0.00',
    soBacSi: 0,
  },
];

const DOCTOR: DoctorItem = {
  bacSiId: '100',
  hoTen: 'Nguyễn Minh Anh',
  chucDanh: 'BS_CKII',
  soNamKinhNghiem: 12,
  chuyenKhoa: { chuyenKhoaId: '10', ten: 'Tim mạch' },
  chiNhanh: {
    chiNhanhId: '1',
    ten: 'Chi nhánh Sài Gòn',
    diaChi: '1 Đường Mẫu',
  },
  dichVu: { dichVuKhamId: '20', ten: 'Tim mạch', thoiLuong: 30 },
  gia: {
    giaMacDinh: '300000.00',
    phuPhi: '50000.00',
    giaKham: '350000.00',
    mucDatCoc: '100000.00',
  },
  danhGia: { diemTrungBinh: null, soDanhGia: 0 },
};

let api: ReturnType<typeof createFakeAuthApi>;
let doctors: DoctorItem[];
let doctorsFail: boolean;
let doctorCalls: URL[];
// Cho phép test giữ một phản hồi bác sĩ lại để thử "kết quả cũ về muộn"
let holdDoctors: ((url: URL) => Promise<void> | null) | null;

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
  doctorsFail = false;
  doctorCalls = [];
  holdDoctors = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (!url.pathname.includes('/public/')) return api.fetch(input, init);
      if (url.pathname.endsWith('/public/clinic-info')) {
        return jsonResponse(200, {
          tenThuongHieu: 'CLINIX',
          diaChiTruSo: null,
          duongDayNong: null,
          email: null,
        });
      }
      if (url.pathname.endsWith('/public/branches')) {
        return jsonResponse(200, {
          items: [BRANCH],
          total: 1,
          page: 1,
          pageSize: 100,
        });
      }
      if (url.pathname.endsWith('/public/service-groups')) {
        return jsonResponse(200, { items: GROUPS });
      }
      if (url.pathname.endsWith('/public/services')) {
        return jsonResponse(200, { items: SERVICES });
      }
      if (url.pathname.endsWith('/public/doctors')) {
        doctorCalls.push(url);
        const held = holdDoctors?.(url);
        if (held) await held;
        if (doctorsFail) {
          return jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' });
        }
        return jsonResponse(200, {
          items: doctors,
          total: doctors.length,
          page: 1,
          pageSize: 20,
        });
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

const DOCTORS_PATH = '/dat-lich/nhom/5/dich-vu/20';

describe('Luồng chọn dịch vụ → bác sĩ', () => {
  it('TBS-16 bước 1: thẻ nhóm, "Sắp triển khai" không bấm được', async () => {
    renderAt('/dat-lich');
    expect(
      await screen.findByRole('link', { name: /Khám theo chuyên khoa/ }),
    ).toHaveAttribute('href', '/dat-lich/nhom/5');
    expect(screen.getByText(/8 dịch vụ/)).toBeInTheDocument();
    expect(screen.getByText('200.000đ')).toBeInTheDocument();
    // Nhóm sắp triển khai: có nhãn + ghi chú, không có liên kết
    expect(screen.getByText('Sắp triển khai')).toBeInTheDocument();
    expect(screen.getByText(COMING_SOON_NOTE)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Tầm soát ung thư/ }),
    ).not.toBeInTheDocument();
  });

  it('TBS-16 bước 2: dịch vụ, giá/cọc, "Không cần cọc", chọn dịch vụ sang danh sách bác sĩ, "Chọn lại" quay về', async () => {
    renderAt('/dat-lich/nhom/5');
    expect(
      await screen.findByRole('heading', { name: 'Khám theo chuyên khoa' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('100.000đ')).toBeInTheDocument();
    expect(screen.getByText('Không cần cọc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tim mạch/ })).toHaveAttribute(
      'href',
      DOCTORS_PATH,
    );
    expect(
      screen.getByRole('link', { name: 'Chọn lại nhóm dịch vụ' }),
    ).toHaveAttribute('href', '/dat-lich');
  });

  it('TBS-16 bước 3: tên dịch vụ, "Chọn lại dịch vụ khám" quay về bước 2', async () => {
    renderAt(DOCTORS_PATH);
    expect(
      await screen.findByText('Tim mạch', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Chọn lại dịch vụ khám' }),
    ).toHaveAttribute('href', '/dat-lich/nhom/5');
  });

  it('TBS-16 dịch vụ không thuộc nhóm: báo không tìm thấy', async () => {
    renderAt('/dat-lich/nhom/5/dich-vu/999');
    expect(
      await screen.findByText('Không tìm thấy dịch vụ này.'),
    ).toBeInTheDocument();
  });

  it('TBS-17 chi nhánh điền sẵn chi nhánh đang chọn; lọc dịch vụ theo id, không gắn token', async () => {
    renderAt(DOCTORS_PATH);
    await screen.findByText(/Nguyễn Minh Anh/);
    expect(screen.getByLabelText('Chi nhánh')).toHaveValue('1');
    const first = doctorCalls[0];
    expect(first.searchParams.get('dichVuKhamId')).toBe('20');
    expect(first.searchParams.get('chiNhanhId')).toBe('1');
    expect(first.searchParams.get('sapXep')).toBe('kinhNghiem');
  });

  it('TBS-17 nhập tên/giá/đánh giá ⇒ gọi lại API với đúng tham số', async () => {
    renderAt(DOCTORS_PATH);
    await screen.findByText(/Nguyễn Minh Anh/);
    fireEvent.change(screen.getByLabelText('Tên bác sĩ'), {
      target: { value: 'minh' },
    });
    fireEvent.change(screen.getByLabelText('Giá từ (đ)'), {
      target: { value: '100000' },
    });
    fireEvent.change(screen.getByLabelText('Giá đến (đ)'), {
      target: { value: '400000' },
    });
    fireEvent.change(screen.getByLabelText('Đánh giá'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('Chi nhánh'), {
      target: { value: '' },
    });
    await waitFor(() => {
      const last = doctorCalls[doctorCalls.length - 1];
      expect(last.searchParams.get('q')).toBe('minh');
      expect(last.searchParams.get('giaTu')).toBe('100000');
      expect(last.searchParams.get('giaDen')).toBe('400000');
      expect(last.searchParams.get('diemTu')).toBe('4');
      expect(last.searchParams.has('chiNhanhId')).toBe(false);
    });
  });

  it('TBS-17 lỗi ô giá: báo dưới ô và không gọi API với giá sai', async () => {
    renderAt(DOCTORS_PATH);
    await screen.findByText(/Nguyễn Minh Anh/);
    const before = doctorCalls.length;
    fireEvent.change(screen.getByLabelText('Giá từ (đ)'), {
      target: { value: '-5' },
    });
    expect(await screen.findByText(PRICE_NOT_NUMBER_MESSAGE)).toBeVisible();
    // Giá từ > giá đến cũng báo lỗi
    fireEvent.change(screen.getByLabelText('Giá từ (đ)'), {
      target: { value: '500' },
    });
    fireEvent.change(screen.getByLabelText('Giá đến (đ)'), {
      target: { value: '100' },
    });
    expect(
      await screen.findByText('Giá từ phải nhỏ hơn hoặc bằng giá đến'),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(doctorCalls.length).toBe(before);
  });

  it('TBS-17 đổi bộ lọc liên tục: kết quả cũ về muộn không đè kết quả mới', async () => {
    renderAt(DOCTORS_PATH);
    await screen.findByText(/Nguyễn Minh Anh/);
    // Yêu cầu có q=cu bị giữ lại đến khi test cho chạy
    let release: () => void = () => {};
    holdDoctors = (url) =>
      url.searchParams.get('q') === 'cu'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    doctors = [{ ...DOCTOR, hoTen: 'Bác Sĩ Cũ' }];
    fireEvent.change(screen.getByLabelText('Tên bác sĩ'), {
      target: { value: 'cu' },
    });
    await waitFor(() =>
      expect(doctorCalls.some((u) => u.searchParams.get('q') === 'cu')).toBe(
        true,
      ),
    );
    doctors = [{ ...DOCTOR, hoTen: 'Bác Sĩ Mới' }];
    fireEvent.change(screen.getByLabelText('Tên bác sĩ'), {
      target: { value: 'moi' },
    });
    expect(await screen.findByText(/Bác Sĩ Mới/)).toBeInTheDocument();
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Bác Sĩ Cũ/)).not.toBeInTheDocument();
    expect(screen.getByText(/Bác Sĩ Mới/)).toBeInTheDocument();
  });

  it('TBS-18 rỗng: thông báo, "Xoá bộ lọc" và "Chọn dịch vụ khác"', async () => {
    doctors = [];
    renderAt(DOCTORS_PATH);
    expect(await screen.findByText(DOCTOR_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Xoá bộ lọc' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Chọn dịch vụ khác' }),
    ).toHaveAttribute('href', '/dat-lich/nhom/5');
  });

  it('TBS-19 thẻ bác sĩ: chức danh, kinh nghiệm, chi nhánh, giá, cọc, chữ viết tắt, chưa đánh giá, không khung giờ', async () => {
    renderAt(DOCTORS_PATH);
    expect(
      await screen.findByRole('heading', { name: 'BS.CKII. Nguyễn Minh Anh' }),
    ).toBeInTheDocument();
    expect(screen.getByText('12 năm kinh nghiệm')).toBeInTheDocument();
    const card = within(
      screen
        .getByRole('heading', { name: 'BS.CKII. Nguyễn Minh Anh' })
        .closest('li') as HTMLElement,
    );
    expect(card.getByText('Chi nhánh Sài Gòn')).toBeInTheDocument();
    expect(screen.getByText('350.000đ')).toBeInTheDocument();
    expect(screen.getByText('Cọc 100.000đ')).toBeInTheDocument();
    expect(screen.getByText('Chưa có đánh giá')).toBeInTheDocument();
    expect(screen.getByText('MA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nhắn tin' })).toBeDisabled();
    expect(screen.queryByText('Buổi sáng')).not.toBeInTheDocument();
  });

  it('TBS-19 có đánh giá và không cần cọc', async () => {
    doctors = [
      {
        ...DOCTOR,
        danhGia: { diemTrungBinh: '4.30', soDanhGia: 3 },
        gia: { ...DOCTOR.gia, mucDatCoc: '0.00' },
      },
    ];
    renderAt(DOCTORS_PATH);
    expect(await screen.findByText('4.3 (3 đánh giá)')).toBeInTheDocument();
    expect(screen.getByText('Không cần cọc')).toBeInTheDocument();
  });

  it('TBS-22 lỗi 500: báo lỗi, giữ bộ lọc, "Thử lại" tải lại được', async () => {
    doctorsFail = true;
    renderAt(DOCTORS_PATH);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tên bác sĩ'), {
      target: { value: 'an' },
    });
    expect(screen.getByLabelText('Tên bác sĩ')).toHaveValue('an');
    doctorsFail = false;
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText(/Nguyễn Minh Anh/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tên bác sĩ')).toHaveValue('an');
  });
});
