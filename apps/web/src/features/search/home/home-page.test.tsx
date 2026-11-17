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

const heroChips = () => {
  const row = screen.getByText('Gợi ý:').parentElement;
  if (!row) throw new Error('không có hàng chip gợi ý');
  return within(row).getAllByRole('link');
};

it('UIS-03 (search F14, G2): hero có hai vòng tròn trang trí ĐẶC trắng 8% (270 px và 180 px sát đáy), không còn vòng chỉ có viền', () => {
  openHome();
  const hero = screen.getByRole('region', {
    name: /Đặt lịch khám đúng bác sĩ/,
  });
  const circles = Array.from(hero.firstElementChild?.children ?? []);
  expect(hero.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  expect(circles).toHaveLength(2);
  expect(circles[0]).toHaveClass('size-72', 'right-20', 'top-10');
  expect(circles[1]).toHaveClass('size-48', 'left-10', 'bottom-0');
  for (const circle of circles) {
    expect(circle).toHaveClass('rounded-full', 'bg-white/8');
    expect(circle).not.toHaveClass('border');
  }
});

it('UIS-03: số liệu hero theo Figma 257:87: nhãn sát ngay dưới số (không khe `mt-1`, hero khớp 583 px của Figma)', async () => {
  openHome();
  const term = await screen.findByText('Dịch vụ khám', { selector: 'dt' });
  expect(term).toHaveClass('order-2', 'text-sm');
  expect(term).not.toHaveClass('mt-1');
});

it('UIS-03: chip gợi ý = hai nhóm dịch vụ đầu đang cung cấp (bỏ nhóm sắp triển khai) rồi chip tĩnh "Chuyên khoa" (Figma 257:81 đến 257:85)', async () => {
  vi.mocked(api.getServiceGroups).mockResolvedValue({
    items: [
      {
        nhomDichVuId: '6',
        ten: 'Nhóm sắp mở',
        soDichVu: 0,
        giaTu: null,
        sapTrienKhai: true,
      },
      ...['Khám chuyên khoa', 'Khám tổng quát', 'Khám từ xa'].map(
        (ten, index) => ({
          nhomDichVuId: String(index + 1),
          ten,
          soDichVu: 2,
          giaTu: '200000.00',
          sapTrienKhai: false,
        }),
      ),
    ],
  });
  openHome();
  await waitFor(() => expect(heroChips()).toHaveLength(3));
  const chips = heroChips();
  expect(chips.map((chip) => chip.textContent)).toEqual([
    'Khám chuyên khoa',
    'Khám tổng quát',
    'Chuyên khoa',
  ]);
  expect(chips.map((chip) => chip.getAttribute('href'))).toEqual([
    '/dat-lich/nhom/1',
    '/dat-lich/nhom/2',
    '/chuyen-khoa',
  ]);
  for (const chip of chips)
    expect(chip).toHaveClass('rounded-full', 'border', 'px-3', 'py-1.5');
});

it('UIS-03: nhóm dịch vụ lỗi ⇒ chỉ còn chip tĩnh "Chuyên khoa"; hero vẫn dùng được', async () => {
  vi.mocked(api.getServiceGroups).mockRejectedValue(new Error('failed'));
  openHome();
  const services = screen.getByRole('region', { name: 'Chọn dịch vụ khám' });
  await within(services).findByRole('alert');
  expect(heroChips().map((chip) => chip.textContent)).toEqual(['Chuyên khoa']);
});

it('UIS-03: chưa có nhóm dịch vụ nào, hoặc chỉ có nhóm sắp triển khai ⇒ chỉ còn chip tĩnh "Chuyên khoa"', async () => {
  vi.mocked(api.getServiceGroups).mockResolvedValue({ items: [] });
  const first = openHome();
  await screen.findByText('Chưa có nhóm dịch vụ nào.');
  expect(heroChips().map((chip) => chip.textContent)).toEqual(['Chuyên khoa']);
  first.unmount();
  vi.mocked(api.getServiceGroups).mockResolvedValue({
    items: [
      {
        nhomDichVuId: '6',
        ten: 'Nhóm sắp mở',
        soDichVu: 0,
        giaTu: null,
        sapTrienKhai: true,
      },
    ],
  });
  openHome();
  await screen.findByText('Sắp triển khai');
  expect(heroChips().map((chip) => chip.textContent)).toEqual(['Chuyên khoa']);
});

it('UIS-05 (search F14, G3): thẻ nhóm dịch vụ theo Figma 257:120, 257:169: dòng giá `text-xs`, nhóm sắp triển khai có viền ĐỨT và chip xám', async () => {
  openHome();
  const services = screen.getByRole('region', { name: 'Chọn dịch vụ khám' });
  const comingSoon = await within(services).findByText('Sắp triển khai');
  expect(comingSoon).toHaveClass(
    'rounded-full',
    'bg-gray-200',
    'px-2.5',
    'py-1',
    'text-xs',
    'font-medium',
  );
  expect(comingSoon.closest('li')?.firstElementChild).toHaveClass(
    'border-dashed',
    'bg-gray-50',
    'rounded-2xl',
  );
  const price = within(services).getByText('200.000đ');
  expect(price).toHaveClass('font-medium');
  expect(price.parentElement).toHaveClass('text-xs');
});

it('UIS-05: thẻ chuyên khoa theo Figma 257:199: mô tả `text-xs` luôn chừa 30 px (kể cả khi trống), "N bác sĩ" là chip kèm mũi tên', async () => {
  vi.mocked(api.getSpecialties).mockResolvedValue({
    ...page([
      { ...specialty, moTa: null, soBacSi: 3 },
      { ...specialty, chuyenKhoaId: '2', ten: 'Nhi khoa', moTa: 'Mô tả nhi' },
    ]),
    soCoBacSi: 1,
  });
  openHome();
  const specialties = screen.getByRole('region', { name: 'Chuyên khoa' });
  const withDoctors = (
    await within(specialties).findByText('3 bác sĩ')
  ).closest('li');
  if (!withDoctors) throw new Error('không có thẻ chuyên khoa');
  expect(within(withDoctors).getByText('3 bác sĩ')).toHaveClass(
    'rounded-full',
    'bg-brand-soft',
    'px-2.5',
    'py-1',
    'text-xs',
    'font-medium',
  );
  expect(
    within(withDoctors)
      .getByText('3 bác sĩ')
      .parentElement?.querySelector('svg'),
  ).toHaveClass('size-4');
  const empty = withDoctors.querySelector('p.min-h-8');
  expect(empty).toHaveClass('text-xs', 'leading-4', 'line-clamp-2');
  expect(empty?.textContent).toBe('');
  const soon = within(specialties).getByText('Sắp có bác sĩ');
  expect(soon).toHaveClass('rounded-full', 'bg-gray-100', 'text-gray-700');
  expect(within(specialties).getByText('Mô tả nhi')).toHaveClass(
    'min-h-8',
    'text-xs',
  );
});

it('UIS-06 (search F14, G3): tab sắp xếp cao 37,5 px (`h-10`), nút cuộn tròn 37,5 px (`size-10`) theo Figma 257:394', async () => {
  openHome();
  const doctors = screen.getByRole('region', { name: 'Đội ngũ bác sĩ' });
  await within(doctors).findByText('Chưa có đánh giá');
  for (const name of ['Nhiều kinh nghiệm', 'Được yêu thích']) {
    expect(within(doctors).getByRole('button', { name })).toHaveClass(
      'h-10',
      'rounded-full',
      'px-4',
      'font-medium',
    );
  }
  for (const name of ['Bác sĩ trước', 'Bác sĩ tiếp']) {
    expect(within(doctors).getByRole('button', { name })).toHaveClass(
      'size-10',
      'rounded-full',
    );
  }
});

it('UIS-06: thẻ bác sĩ theo Figma 257:409: ảnh cao 192 px, bo 8 px, chữ 11/14/13 px; chưa có đánh giá thì không có huy hiệu sao', async () => {
  openHome();
  const doctors = screen.getByRole('region', { name: 'Đội ngũ bác sĩ' });
  const card = (await within(doctors).findByText('Chưa có đánh giá')).closest(
    'li',
  );
  if (!card) throw new Error('không có thẻ bác sĩ');
  expect(card).toHaveClass('rounded-[8px]');
  expect(card.querySelector('[aria-hidden="true"]')).toHaveClass('h-[192px]');
  expect(within(card).getByText('Tim mạch')).toHaveClass('text-[11px]');
  expect(within(card).getByRole('heading', { level: 3 })).toHaveClass(
    'text-[14px]',
    'font-bold',
  );
  expect(within(card).getByText('200.000đ')).toHaveClass('text-[13px]');
  expect(within(card).getByRole('link', { name: /Xem hồ sơ/ })).toHaveClass(
    'text-[12px]',
    'px-[14px]',
    'py-[6px]',
  );
  expect(card.querySelector('.rounded-full')).toBeNull();
});

it('UIS-06: có điểm đánh giá ⇒ huy hiệu sao ở góc ảnh (điểm một chữ số lẻ, số lượt cho trình đọc màn hình), không còn dòng "Chưa có đánh giá"', async () => {
  vi.mocked(api.getDoctors).mockResolvedValue(
    page([{ ...doctor, danhGia: { diemTrungBinh: '4.86', soDanhGia: 7 } }]),
  );
  openHome();
  const doctors = screen.getByRole('region', { name: 'Đội ngũ bác sĩ' });
  const badge = await within(doctors).findByText('4.9');
  expect(badge.closest('span')).toHaveClass(
    'absolute',
    'right-2.5',
    'top-2.5',
    'rounded-full',
  );
  expect(
    within(doctors).getByText('(7 đánh giá)', { exact: false }),
  ).toHaveClass('sr-only');
  expect(within(doctors).queryByText('Chưa có đánh giá')).toBeNull();
});

it('UIA-06 (search UI PR-A, G1): nút "Đặt lịch khám" cuối Trang chủ cam theo token (`bg-cta`) với chữ gray-900; biểu tượng lịch là icon `currentColor` (không còn ảnh nét trắng trên nền cam)', () => {
  openHome();
  const process = screen.getByRole('region', {
    name: 'Đặt lịch khám tại CLINIX',
  });
  const link = within(process).getByRole('link', { name: 'Đặt lịch khám' });
  expect(link).toHaveClass('bg-cta', 'text-gray-900', 'hover:bg-cta-hover');
  expect(link).not.toHaveClass('bg-brand-strong');
  expect(link).not.toHaveClass('text-white');
  expect(link.querySelector('img')).toBeNull();
  expect(link.querySelector('svg')).toHaveClass('size-5');
  // Ô số của bốn bước vẫn xanh `brand-strong` (không phải nút CTA)
  const steps = within(process).getAllByRole('listitem');
  expect(steps[0].querySelector('.size-10')).toHaveClass('bg-brand-strong');
});

it('UIA-07 (search UI PR-A, G2): ba số liệu của hero vàng `text-amber-300` (3,65:1 trên #007595; chữ lớn 28 px đậm), nhãn giữ trắng, phần nhấn của h1 giữ vàng', async () => {
  openHome();
  const hero = screen.getByRole('region', {
    name: /Đặt lịch khám đúng bác sĩ/,
  });
  const numbers = await within(hero).findAllByRole('definition');
  const labels = within(hero).getAllByRole('term');
  expect(numbers).toHaveLength(3);
  expect(labels).toHaveLength(3);
  for (const number of numbers) {
    expect(number).toHaveClass('text-amber-300', 'text-3xl', 'font-bold');
    expect(number).not.toHaveClass('text-white');
  }
  for (const label of labels) {
    expect(label).not.toHaveClass('text-amber-300');
  }
  expect(within(hero).getByText('đúng bác sĩ, đúng giờ')).toHaveClass(
    'text-amber-300',
  );
});

it('UIA-08 (search UI PR-A, G3): nền hero dùng lớp gradient `hero-gradient` (vùng chữ phẳng, phía phải chuyển sang #0092b8 rồi #00bba7), giữ màu nền dự phòng `bg-brand-strong` và chữ trắng', () => {
  openHome();
  const hero = screen.getByRole('region', {
    name: /Đặt lịch khám đúng bác sĩ/,
  });
  expect(hero).toHaveClass('hero-gradient', 'bg-brand-strong', 'text-white');
  // Nền trang trí không bắt sự kiện và vẫn có đúng hai vòng tròn trắng 8% (UIS-03)
  expect(hero.firstElementChild).toHaveClass('pointer-events-none');
  expect(hero.firstElementChild?.children).toHaveLength(2);
});

it('UIS-07 (search F14, G3): khối quy trình theo Figma 257:849: nút "Đặt lịch khám" và ô số bước bo 13,375 px, đoạn mô tả dòng 1,625', () => {
  openHome();
  const process = screen.getByRole('region', {
    name: 'Đặt lịch khám tại CLINIX',
  });
  expect(
    within(process).getByRole('link', { name: 'Đặt lịch khám' }),
  ).toHaveClass('rounded-[13.375px]', 'px-8', 'py-3');
  const steps = within(process).getAllByRole('listitem');
  expect(steps).toHaveLength(4);
  for (const step of steps) {
    expect(step.querySelector('.size-10')).toHaveClass('rounded-[13.375px]');
    expect(step.querySelector('p')).toHaveClass('leading-relaxed');
  }
});
