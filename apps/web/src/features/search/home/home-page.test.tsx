import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import * as api from '../api/search-service';
import type { DoctorItem, SpecialtySummary } from '../api/search-types';
import {
  resetSelectedBranchForTest,
  useSelectedBranch,
} from '../../../shared/branch-selection';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { DoctorTeamPage } from '../doctors/doctor-team-page';
import { HomePage } from './home-page';

vi.mock('../api/search-service');

const specialty: SpecialtySummary = {
  chuyenKhoaId: '1',
  ten: 'Tim mạch',
  moTa: 'Mô tả mẫu',
  anhDaiDien: null,
  soBacSi: 0,
};
const doctor: DoctorItem = {
  bacSiId: '10',
  hoTen: 'Bác sĩ mẫu',
  chucDanh: 'BS',
  soNamKinhNghiem: 12,
  chuyenKhoa: { chuyenKhoaId: '1', ten: 'Tim mạch' },
  chiNhanh: { chiNhanhId: '2', ten: 'Chi nhánh mẫu', diaChi: 'Địa chỉ mẫu' },
  dichVu: { dichVuKhamId: '3', ten: 'Khám tim', thoiLuong: 30 },
  gia: {
    giaMacDinh: '200000.00',
    phuPhi: '0.00',
    giaKham: '200000.00',
    mucDatCoc: '0.00',
  },
  danhGia: { diemTrungBinh: null, soDanhGia: 0 },
};
const page = <T,>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 8,
});

function BranchControl() {
  const { select } = useSelectedBranch();
  return (
    <button onClick={() => select('2', 'NguoiDung')}>Chọn chi nhánh mẫu</button>
  );
}

function openHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <BranchControl />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/bac-si" element={<DoctorTeamPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  window.localStorage.clear();
  resetSelectedBranchForTest();
  vi.mocked(api.getOverview).mockResolvedValue({
    soChuyenKhoa: 9,
    soBacSi: 17,
    soDichVu: 21,
  });
  vi.mocked(api.getServiceGroups).mockResolvedValue({
    items: [
      {
        nhomDichVuId: '5',
        ten: 'Khám chuyên khoa',
        soDichVu: 3,
        giaTu: '200000.00',
        sapTrienKhai: false,
      },
      {
        nhomDichVuId: '6',
        ten: 'Nhóm sắp mở',
        soDichVu: 0,
        giaTu: null,
        sapTrienKhai: true,
      },
    ],
  });
  vi.mocked(api.getSpecialties).mockResolvedValue({
    ...page([specialty]),
    soCoBacSi: 0,
  });
  vi.mocked(api.getDoctors).mockResolvedValue(page([doctor]));
  vi.mocked(api.getBranches).mockResolvedValue(page([]));
});

it('TCH-02: đủ khối Q21, số liệu API, trạng thái chưa có dịch vụ/bác sĩ, liên kết đúng; ẩn cẩm nang và bỏ số phút giữ chỗ', async () => {
  openHome();
  const services = screen.getByRole('region', { name: 'Chọn dịch vụ khám' });
  expect(
    await within(services).findByText('Sắp triển khai'),
  ).toBeInTheDocument();
  expect(
    within(services).getByRole('link', { name: /Khám chuyên khoa/ }),
  ).toHaveAttribute('href', '/dat-lich/nhom/5');
  expect(
    within(services).queryByRole('link', { name: /Nhóm sắp mở/ }),
  ).toBeNull();
  expect(
    within(services).getByRole('link', { name: /Xem tất cả/ }),
  ).toHaveAttribute('href', '/dat-lich');
  const specialties = screen.getByRole('region', { name: 'Chuyên khoa' });
  expect(
    await within(specialties).findByText('Sắp có bác sĩ'),
  ).toBeInTheDocument();
  expect(
    within(specialties).getByRole('link', { name: /Tim mạch/ }),
  ).toHaveAttribute('href', '/chuyen-khoa/1');
  expect(
    within(specialties).getByRole('link', { name: /Xem tất cả/ }),
  ).toHaveAttribute('href', '/chuyen-khoa');
  const doctors = screen.getByRole('region', { name: 'Đội ngũ bác sĩ' });
  expect(
    await within(doctors).findByText('Chưa có đánh giá'),
  ).toBeInTheDocument();
  expect(
    within(doctors).getByRole('link', { name: /Xem hồ sơ/ }),
  ).toHaveAttribute('href', '/bac-si/10');
  expect(
    within(doctors).getByRole('link', { name: 'Xem tất cả bác sĩ' }),
  ).toHaveAttribute('href', '/bac-si');
  expect(screen.getAllByRole('definition')).toHaveLength(3);
  expect(screen.getByText('17')).toBeInTheDocument();
  expect(screen.getByText('21')).toBeInTheDocument();
  expect(
    within(
      screen.getByRole('region', { name: 'Đặt lịch khám tại CLINIX' }),
    ).getAllByRole('listitem'),
  ).toHaveLength(4);
  expect(screen.queryByText(/Giữ chỗ 15 phút/)).toBeNull();
  expect(screen.queryByRole('heading', { name: /Cẩm nang/ })).toBeNull();
});

it('TCH-02: tải tối đa 8 chuyên khoa/bác sĩ đầu, đổi sắp xếp gọi API; không gán ảnh giả', async () => {
  vi.mocked(api.getSpecialties).mockResolvedValue({
    ...page(
      Array.from({ length: 10 }, (_, i) => ({
        ...specialty,
        chuyenKhoaId: String(i),
        ten: `Chuyên khoa ${i}`,
      })),
    ),
    soCoBacSi: 0,
  });
  vi.mocked(api.getDoctors).mockResolvedValue(
    page(
      Array.from({ length: 10 }, (_, i) => ({
        ...doctor,
        bacSiId: String(i),
        hoTen: `Bác sĩ ${i}`,
      })),
    ),
  );
  openHome();
  const doctors = screen.getByRole('region', { name: 'Đội ngũ bác sĩ' });
  await within(doctors).findByText('BS. Bác sĩ 0');
  expect(within(doctors).getAllByRole('listitem')).toHaveLength(8);
  expect(
    within(screen.getByRole('region', { name: 'Chuyên khoa' })).getAllByRole(
      'listitem',
    ),
  ).toHaveLength(8);
  expect(api.getDoctors).toHaveBeenCalledWith(
    expect.objectContaining({ pageSize: 8, page: 1, sapXep: 'kinhNghiem' }),
    expect.any(AbortSignal),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Được yêu thích' }));
  await waitFor(() =>
    expect(api.getDoctors).toHaveBeenLastCalledWith(
      expect.objectContaining({ sapXep: 'danhGiaCao' }),
      expect.any(AbortSignal),
    ),
  );
  expect(
    screen.getByRole('button', { name: 'Được yêu thích' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(within(doctors).queryByRole('img')).toBeNull();
});

it('TCH-02: lỗi một khối vẫn hiện các khối còn lại, thử lại thành công; số liệu lỗi không giả thành 0', async () => {
  vi.mocked(api.getOverview).mockRejectedValueOnce(new Error('failed'));
  vi.mocked(api.getServiceGroups).mockRejectedValueOnce(new Error('failed'));
  openHome();
  const services = screen.getByRole('region', { name: 'Chọn dịch vụ khám' });
  await within(services).findByRole('alert');
  expect(await screen.findByText('Sắp có bác sĩ')).toBeInTheDocument();
  expect(screen.queryByText('17')).toBeNull();
  fireEvent.click(within(services).getByRole('button', { name: 'Thử lại' }));
  expect(
    await within(services).findByText('Sắp triển khai'),
  ).toBeInTheDocument();
});

it('TCH-02: danh sách rỗng có thông báo riêng; ba số 0 từ API vẫn hiện', async () => {
  vi.mocked(api.getOverview).mockResolvedValue({
    soChuyenKhoa: 0,
    soBacSi: 0,
    soDichVu: 0,
  });
  vi.mocked(api.getServiceGroups).mockResolvedValue({ items: [] });
  vi.mocked(api.getSpecialties).mockResolvedValue({
    ...page([]),
    soCoBacSi: 0,
  });
  vi.mocked(api.getDoctors).mockResolvedValue(page([]));
  openHome();
  expect(
    await screen.findByText('Chưa có nhóm dịch vụ nào.'),
  ).toBeInTheDocument();
  expect(
    await screen.findByText('Không tìm thấy chuyên khoa phù hợp.'),
  ).toBeInTheDocument();
  expect(
    await screen.findByText('Không tìm thấy bác sĩ phù hợp.'),
  ).toBeInTheDocument();
  expect(screen.getAllByText('0')).toHaveLength(3);
});

it('TCH-02: đổi chi nhánh huỷ yêu cầu cũ, bỏ kết quả muộn; overview vẫn là toàn hệ thống', async () => {
  let finish:
    ((value: Awaited<ReturnType<typeof api.getDoctors>>) => void) | undefined;
  vi.mocked(api.getDoctors).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  openHome();
  expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  const oldSignal = vi.mocked(api.getDoctors).mock.calls[0][1];
  fireEvent.click(screen.getByRole('button', { name: 'Chọn chi nhánh mẫu' }));
  await screen.findByText('BS. Bác sĩ mẫu');
  expect(oldSignal?.aborted).toBe(true);
  finish?.(page([{ ...doctor, hoTen: 'Kết quả cũ' }]));
  await waitFor(() => expect(api.getDoctors).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/Kết quả cũ/)).toBeNull();
  expect(api.getOverview).toHaveBeenCalledTimes(1);
  expect(api.getSpecialties).toHaveBeenLastCalledWith(
    { chiNhanhId: '2', pageSize: 8 },
    expect.any(AbortSignal),
  );
});

it('TCH-02 / Q20: gửi tìm kiếm chuyển sang đội ngũ bác sĩ với từ khoá đã trim', async () => {
  openHome();
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: '  tim mạch  ' },
  });
  fireEvent.submit(screen.getByRole('search'));
  await screen.findByRole('heading', { name: 'Đội ngũ bác sĩ', level: 1 });
  await waitFor(() =>
    expect(api.getDoctors).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'tim mạch' }),
      expect.any(AbortSignal),
    ),
  );
});
