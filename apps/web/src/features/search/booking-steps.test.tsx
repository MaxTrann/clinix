import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import * as api from './api/search-service';
import type { ServiceGroupItem, ServiceItem } from './api/search-types';
import { resetSelectedBranchForTest } from '../../shared/branch-selection';
import { LOGIN_PATH, type VaiTro } from '../auth';
import { resetAuthForTest } from '../auth/auth-session';
import { setAuthState } from '../auth/auth-store';
import { DoctorListPage } from './doctors/doctor-list-page';
import { ServiceGroupPage } from './services/service-group-page';
import { ServiceListPage } from './services/service-list-page';

vi.mock('./api/search-service');

// search UI PR-B (G7): thanh 6 bước ở đặt lịch Bước 1 đến 3 và dải nhắc đăng nhập ở Bước 1 (TRACKING search mục 8).
// Mã UIB-01 đến UIB-07 là [đề xuất]. Mức W (`css: false`): khoá cấu trúc, liên kết, chữ và TÊN LỚP; kích thước thật chỉ Chromium thấy.
const GROUPS: ServiceGroupItem[] = [
  {
    nhomDichVuId: '1',
    ten: 'Khám chuyên khoa',
    soDichVu: 8,
    giaTu: '200000.00',
    sapTrienKhai: false,
  },
  {
    nhomDichVuId: '3',
    ten: 'Tầm soát ung thư',
    soDichVu: 0,
    giaTu: null,
    sapTrienKhai: true,
  },
];
const SERVICES: ServiceItem[] = [
  {
    dichVuKhamId: '10',
    ten: 'Tim mạch',
    nhomDichVu: { id: '1', ten: 'Khám chuyên khoa' },
    thoiLuong: 30,
    giaMacDinh: '300000.00',
    mucDatCoc: '100000.00',
    soBacSi: 2,
  },
];

const LABELS = [
  'Nhóm dịch vụ',
  'Dịch vụ khám',
  'Bác sĩ & giờ',
  'Người khám',
  'Xác nhận',
  'Hoàn tất',
];
const BANNER_TEXT =
  'Bạn có thể xem dịch vụ và lịch trống trước. Cần đăng nhập để hoàn tất đặt lịch ở bước 4.';
const BANNER_PATTERN = /Bạn có thể xem dịch vụ và lịch trống trước/;

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  window.localStorage.clear();
  resetSelectedBranchForTest();
  vi.mocked(api.getServiceGroups).mockResolvedValue({ items: GROUPS });
  vi.mocked(api.getServices).mockResolvedValue({ items: SERVICES });
  vi.mocked(api.getDoctors).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  vi.mocked(api.getBranches).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 100,
  });
});

function openAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dat-lich" element={<ServiceGroupPage />} />
        <Route path="/dat-lich/nhom/:groupId" element={<ServiceListPage />} />
        <Route
          path="/dat-lich/nhom/:groupId/dich-vu/:serviceId"
          element={<DoctorListPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const STEP1 = '/dat-lich';
const STEP2 = '/dat-lich/nhom/1';
const STEP3 = '/dat-lich/nhom/1/dich-vu/10';

function getStepper() {
  return screen.getByRole('navigation', { name: 'Các bước đặt lịch' });
}
function itemsOf(nav: HTMLElement) {
  return within(nav).getAllByRole('listitem');
}
function linkNames(nav: HTMLElement) {
  return within(nav)
    .queryAllByRole('link')
    .map((link) => link.getAttribute('aria-label'));
}

describe('search UI PR-B — thanh 6 bước ở Bước 1 đến 3 (UIB-01 đến UIB-04)', () => {
  it('UIB-01 Bước 1: sáu nhãn Figma theo thứ tự, mục 1 đang thực hiện, mục 2 đến 6 chưa thực hiện, KHÔNG liên kết nào', () => {
    openAt(STEP1);
    const items = itemsOf(getStepper());
    expect(items).toHaveLength(6);
    items.forEach((item, index) => {
      expect(within(item).getByText(LABELS[index])).toBeInTheDocument();
    });
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    expect(items[0].textContent).toContain('đang thực hiện');
    items.slice(1).forEach((item) => {
      expect(item).not.toHaveAttribute('aria-current');
      expect(item.textContent).toContain('chưa thực hiện');
    });
    expect(linkNames(getStepper())).toEqual([]);
  });

  it('UIB-02 Bước 2: mục 2 đang thực hiện; mục 1 đã hoàn thành kèm liên kết "Quay lại bước 1: Nhóm dịch vụ" về /dat-lich; mục 3 đến 6 không liên kết', () => {
    openAt(STEP2);
    const nav = getStepper();
    const items = itemsOf(nav);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0].textContent).toContain('đã hoàn thành');
    expect(linkNames(nav)).toEqual(['Quay lại bước 1: Nhóm dịch vụ']);
    expect(within(nav).getByRole('link')).toHaveAttribute('href', '/dat-lich');
    items.slice(2).forEach((item) => {
      expect(within(item).queryByRole('link')).toBeNull();
      expect(item.textContent).toContain('chưa thực hiện');
    });
  });

  it('UIB-03 Bước 3: mục 3 đang thực hiện; liên kết bước 1 về /dat-lich, bước 2 về /dat-lich/nhom/<id nhóm>; mục 4 đến 6 không liên kết', () => {
    openAt(STEP3);
    const nav = getStepper();
    const items = itemsOf(nav);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Quay lại bước 1: Nhóm dịch vụ',
      'Quay lại bước 2: Dịch vụ khám',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/dat-lich',
      '/dat-lich/nhom/1',
    ]);
    items.slice(3).forEach((item) => {
      expect(within(item).queryByRole('link')).toBeNull();
    });
  });

  it.each(['a/b', 'x y', '100%', 'q?x=1&y=2#f'])(
    'UIB-04 id nhóm lạ %j ở Bước 3: liên kết bước 2 được mã hoá, giải mã lại đúng id, không vỡ URL',
    (groupId) => {
      openAt(`/dat-lich/nhom/${encodeURIComponent(groupId)}/dich-vu/10`);
      const link = within(getStepper()).getByRole('link', {
        name: 'Quay lại bước 2: Dịch vụ khám',
      });
      const href = link.getAttribute('href') as string;
      expect(href).toBe(`/dat-lich/nhom/${encodeURIComponent(groupId)}`);
      const segments = href.split('/').filter(Boolean);
      expect(segments).toHaveLength(3);
      expect(decodeURIComponent(segments[2])).toBe(groupId);
      expect(href).not.toContain('?');
      expect(href).not.toContain('#');
    },
  );
});

describe('search UI PR-B — thứ tự trên trang (UIB-05)', () => {
  it('UIB-05 Bước 1: thanh bước là con đầu của main, đứng trước H1 (duy nhất) và H1 cách thanh bước mt-8', () => {
    openAt(STEP1);
    const main = screen.getByRole('main');
    const nav = getStepper();
    expect(main.firstElementChild).toBe(nav);
    const h1s = within(main).getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(nav.nextElementSibling).toBe(h1s[0]);
    expect(h1s[0]).toHaveClass('mt-8');
  });

  it.each([
    ['Bước 2', STEP2, 'Chọn lại nhóm dịch vụ'],
    ['Bước 3', STEP3, 'Chọn lại dịch vụ khám'],
  ])(
    'UIB-05 %s: thanh bước, rồi liên kết "Chọn lại…" (mt-8), rồi H1 duy nhất',
    async (_name, path, backName) => {
      openAt(path);
      const main = screen.getByRole('main');
      const nav = getStepper();
      expect(main.firstElementChild).toBe(nav);
      const back = await screen.findByRole('link', { name: backName });
      expect(nav.nextElementSibling).toBe(back);
      expect(back).toHaveClass('mt-8');
      const h1s = within(main).getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(back.nextElementSibling).toBe(h1s[0]);
    },
  );
});

describe('search UI PR-B — dải nhắc đăng nhập (UIB-06, UIB-07)', () => {
  it('UIB-06 Bước 1, khách, danh sách đã tải: chữ nguyên văn, "đăng nhập" là liên kết tới LOGIN_PATH, nằm ngay sau danh sách, không role, không nút', async () => {
    openAt(STEP1);
    const text = await screen.findByText(BANNER_PATTERN);
    expect(text.textContent).toBe(BANNER_TEXT);
    const link = within(text).getByRole('link', { name: 'đăng nhập' });
    expect(link).toHaveAttribute('href', LOGIN_PATH);
    expect(link).toHaveClass('font-semibold');
    expect(link).toHaveClass('underline');

    const banner = text.parentElement as HTMLElement;
    const grid = (await screen.findByText('Khám chuyên khoa')).closest('ul');
    expect(grid?.nextElementSibling).toBe(banner);
    expect(banner).not.toHaveAttribute('role');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(within(banner).queryByRole('button')).toBeNull();
    expect(banner.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('UIB-06 dải theo token cảnh báo: nền warning-soft, viền warning-line, chữ amber-900, mt-5 (mỗi lớp một khẳng định)', async () => {
    openAt(STEP1);
    const banner = (await screen.findByText(BANNER_PATTERN))
      .parentElement as HTMLElement;
    expect(banner).toHaveClass('bg-warning-soft');
    expect(banner).toHaveClass('border-warning-line');
    expect(banner).toHaveClass('text-amber-900');
    expect(banner).toHaveClass('rounded-xl');
    expect(banner).toHaveClass('border');
    expect(banner).toHaveClass('mt-5');
    expect(banner).not.toHaveClass('bg-white');
  });

  it.each<VaiTro>(['BenhNhan', 'LeTan', 'BacSi', 'QuanTriVien'])(
    'UIB-07 Bước 1: người đã đăng nhập (%s) KHÔNG thấy dải',
    async (vaiTro) => {
      setAuthState({
        status: 'authenticated',
        user: { vaiTro, hoTen: 'Nguyễn Văn A', daXacMinhEmail: true },
      });
      openAt(STEP1);
      await screen.findByText('Khám chuyên khoa');
      expect(screen.queryByText(BANNER_PATTERN)).toBeNull();
    },
  );

  it.each(['checking', 'error'] as const)(
    'UIB-07 Bước 1: trạng thái phiên "%s" (chưa biết chắc là khách) KHÔNG vẽ dải',
    async (status) => {
      setAuthState({ status });
      openAt(STEP1);
      await screen.findByText('Khám chuyên khoa');
      expect(screen.queryByText(BANNER_PATTERN)).toBeNull();
    },
  );

  it('UIB-07 phiên đổi từ "checking" sang "unauthenticated": dải hiện đúng MỘT lần, không biến lại', async () => {
    setAuthState({ status: 'checking' });
    openAt(STEP1);
    await screen.findByText('Khám chuyên khoa');
    expect(screen.queryByText(BANNER_PATTERN)).toBeNull();
    act(() => setAuthState({ status: 'unauthenticated' }));
    expect(await screen.findAllByText(BANNER_PATTERN)).toHaveLength(1);
    expect(screen.getAllByText(BANNER_PATTERN)).toHaveLength(1);
  });

  it('UIB-07 Bước 1, khách: dải KHÔNG hiện khi danh sách đang tải, bị lỗi hay rỗng', async () => {
    vi.mocked(api.getServiceGroups).mockReturnValue(new Promise(() => {}));
    const loading = openAt(STEP1);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(BANNER_PATTERN)).toBeNull();
    loading.unmount();

    vi.mocked(api.getServiceGroups).mockRejectedValue(new Error('lỗi mạng'));
    const failed = openAt(STEP1);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(BANNER_PATTERN)).toBeNull();
    failed.unmount();

    vi.mocked(api.getServiceGroups).mockResolvedValue({ items: [] });
    openAt(STEP1);
    expect(
      await screen.findByText('Chưa có nhóm dịch vụ nào.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(BANNER_PATTERN)).toBeNull();
  });

  it('UIB-07 Bước 2 và Bước 3 KHÔNG có dải dù là khách (Đại chọn chỉ Bước 1; Figma không có dải, nguồn là Make)', async () => {
    const step2 = openAt(STEP2);
    await screen.findByRole('heading', { name: 'Tim mạch', level: 2 });
    expect(screen.queryByText(BANNER_PATTERN)).toBeNull();
    step2.unmount();

    openAt(STEP3);
    await screen.findByText('Tim mạch');
    expect(screen.queryByText(BANNER_PATTERN)).toBeNull();
  });
});
