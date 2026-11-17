import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import * as api from '../api/search-service';
import type { SpecialtyDetail, SpecialtySummary } from '../api/search-types';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { BOOKING_PATH } from '../search-paths';
import { SpecialtyDetailPage } from './specialty-detail-page';
import { SpecialtyListPage } from './specialty-list-page';

vi.mock('../api/search-service');

// search F14, nhóm G5 (K1 đến K8): trang Chuyên khoa theo Figma 217:2 và 259:2. Mã UIS-09 là [đề xuất] (PLAN search F14).
// Mức W (`css: false`): khoá LỚP CSS và ca chức năng; số đo thật (getBoundingClientRect) ghi ở TRACKING mục 6.
// Gốc `html` 15 px: `py-10` = 37,5; `mt-5` = 18,75; `mt-1.5` = 5,625; `mt-6` = 22,5; `mt-8` = 30; `gap-5` = 18,75; `max-w-112` = 420.
const TIM_MACH: SpecialtySummary = {
  chuyenKhoaId: '10',
  ten: 'Tim mạch',
  moTa: 'Khám và điều trị bệnh tim.',
  anhDaiDien: null,
  soBacSi: 2,
};
const NHI: SpecialtySummary = {
  chuyenKhoaId: '11',
  ten: 'Nhi khoa',
  moTa: null,
  anhDaiDien: null,
  soBacSi: 0,
};
const page = <T,>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});

function openList() {
  return render(
    <MemoryRouter initialEntries={['/chuyen-khoa']}>
      <Routes>
        <Route path="/chuyen-khoa" element={<SpecialtyListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openDetail(detail: SpecialtyDetail) {
  vi.mocked(api.getSpecialtyDetail).mockResolvedValue(detail);
  return render(
    <MemoryRouter initialEntries={[`/chuyen-khoa/${detail.chuyenKhoaId}`]}>
      <Routes>
        <Route path="/chuyen-khoa/:id" element={<SpecialtyDetailPage />} />
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
  vi.mocked(api.getSpecialties).mockResolvedValue({
    ...page([TIM_MACH, NHI]),
    soCoBacSi: 1,
  });
  vi.mocked(api.getDoctors).mockResolvedValue(page([]));
  vi.mocked(api.getBranches).mockResolvedValue(page([]));
});

describe('trang Chuyên khoa theo Figma 217:2 (UIS-09)', () => {
  it('UIS-09 khung và nhịp dọc: đệm 37,5, đường dẫn → H1 18,75, H1 → dòng đếm 5,625, → ô tìm 22,5 (rộng 420), → lưới 30', async () => {
    openList();
    const h1 = await screen.findByRole('heading', {
      name: 'Khám chuyên khoa',
      level: 1,
    });
    const main = screen.getByRole('main');
    expect(main).toHaveClass('max-w-320', 'px-8', 'py-10');
    expect(main).not.toHaveClass('py-8');
    expect(h1).toHaveClass('mt-5', 'text-3xl', 'font-bold');
    expect(h1).not.toHaveClass('font-semibold');
    expect(h1).not.toHaveClass('mt-3');
    const count = await screen.findByText(/2 chuyên khoa, 1 chuyên khoa/);
    expect(count).toHaveClass('mt-1.5');
    const searchWrap = screen
      .getByRole('searchbox')
      .closest('div')?.parentElement;
    expect(searchWrap).toHaveClass('mt-6', 'max-w-112');
    // `ol` của đường dẫn cũng là list: lưới thẻ là `ul` đầu tiên trong `main`
    const grid = main.querySelector('ul') as HTMLElement;
    expect(grid.parentElement).toHaveClass('mt-8');
    expect(grid).toHaveClass('gap-5', 'lg:grid-cols-4');
  });

  it('UIS-09 đường dẫn dùng Breadcrumb: Trang chủ (liên kết) rồi Chuyên khoa là trang hiện tại, ngăn bằng chevron', async () => {
    openList();
    await screen.findByRole('heading', { name: 'Khám chuyên khoa', level: 1 });
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(
      within(nav).getByRole('link', { name: 'Trang chủ' }),
    ).toHaveAttribute('href', '/');
    expect(within(nav).getByText('Chuyên khoa')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(nav.querySelectorAll('svg')).toHaveLength(1);
  });

  it('UIS-09 ô tìm là SearchField 45 px có kính lúp, vẫn có nhãn "Tìm chuyên khoa" cho trình đọc màn hình', async () => {
    openList();
    await screen.findByRole('heading', { name: 'Khám chuyên khoa', level: 1 });
    const input = screen.getByLabelText('Tìm chuyên khoa');
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveClass('h-12', 'rounded-[13.375px]', 'pl-[41.25px]');
    expect(input.parentElement?.querySelector('svg')).toHaveClass('size-5');
    expect(screen.getByText('Tìm chuyên khoa')).toHaveClass('sr-only');
  });

  it('UIS-09 thẻ chuyên khoa: tên h2 16,875 semibold, bo 15, mô tả 11,25 luôn chừa 30 px (kể cả khi trống), chip "N bác sĩ" kèm mũi tên', async () => {
    openList();
    const tim = (
      await screen.findByRole('heading', { name: 'Tim mạch', level: 2 })
    ).closest('a') as HTMLElement;
    expect(tim).toHaveClass('rounded-2xl');
    expect(tim).not.toHaveClass('rounded-xl');
    expect(within(tim).getByRole('heading', { name: 'Tim mạch' })).toHaveClass(
      'text-lg',
      'font-semibold',
    );
    const desc = within(tim).getByText('Khám và điều trị bệnh tim.');
    expect(desc).toHaveClass('min-h-8', 'text-xs', 'line-clamp-2');
    const chip = within(tim).getByText('2 bác sĩ');
    expect(chip).toHaveClass('rounded-full', 'bg-brand-soft', 'px-2.5', 'py-1');
    expect(tim.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);

    const nhi = screen
      .getByRole('heading', { name: 'Nhi khoa', level: 2 })
      .closest('a') as HTMLElement;
    // Không mô tả: đoạn mô tả vẫn có mặt (rỗng) với min-h-8 để chip không nhảy lên
    const emptyDesc = nhi.querySelector('p');
    expect(emptyDesc).not.toBeNull();
    expect(emptyDesc).toHaveClass('min-h-8');
    expect(emptyDesc).toHaveTextContent('');
    expect(within(nhi).getByText('Sắp có bác sĩ')).toHaveClass(
      'bg-gray-100',
      'text-gray-700',
    );
  });
});

const DETAIL: SpecialtyDetail = {
  ...TIM_MACH,
  moTa: 'Khám và điều trị bệnh tim.',
  giaKhamTu: { giaKham: 350000, mucDatCoc: 100000 },
};

describe('trang Chi tiết chuyên khoa theo Figma 259:2 (UIS-09)', () => {
  it('UIS-09 thẻ đầu: viền, bo 15, cột ảnh 220 + cột chữ, đệm chữ 22,5; H1 22,5 đậm; mô tả 15 px dòng 1,625', async () => {
    openDetail(DETAIL);
    const h1 = await screen.findByRole('heading', {
      name: 'Tim mạch',
      level: 1,
    });
    const card = h1.closest('section') as HTMLElement;
    expect(card).toHaveClass(
      'rounded-[15px]',
      'border',
      'overflow-hidden',
      'md:grid-cols-[220px_minmax(0,1fr)]',
    );
    expect(card).not.toHaveClass('md:flex-row');
    expect(card).not.toHaveClass('gap-6');
    expect(h1.parentElement).toHaveClass('p-6');
    expect(h1).toHaveClass('text-2xl', 'font-bold');
    expect(h1).not.toHaveClass('text-3xl');
    expect(h1).not.toHaveClass('font-semibold');
    expect(screen.getByText('Khám và điều trị bệnh tim.')).toHaveClass(
      'leading-relaxed',
      'text-gray-600',
    );
    // cột ảnh: đệm 15 quanh ảnh
    expect(card.firstElementChild).toHaveClass('p-[15px]');
  });

  it('UIS-09 chip "N bác sĩ" lớn (px 11,25, py 5,625) và chip "Giá khám từ …" có viền xám; giữ nguyên chữ giá + cọc', async () => {
    openDetail(DETAIL);
    const count = await screen.findByText('2 bác sĩ');
    expect(count).toHaveClass('px-3', 'py-1.5', 'bg-brand-soft');
    const price = screen.getByText(/Giá khám từ 350\.000đ · cọc 100\.000đ/);
    expect(price).toHaveClass(
      'rounded-full',
      'border',
      'border-gray-200',
      'bg-gray-50',
      'px-3',
      'py-1.5',
      'text-xs',
    );
    expect(count.parentElement).toHaveClass('mt-4', 'gap-2');
  });

  it('UIS-09 có bác sĩ ⇒ nút "Đặt lịch khám" tới /dat-lich: cao 45, bo 13,375, cam + chữ gray-900 (8,31:1), có biểu tượng lịch', async () => {
    openDetail(DETAIL);
    const link = await screen.findByRole('link', { name: 'Đặt lịch khám' });
    expect(link).toHaveAttribute('href', BOOKING_PATH);
    expect(link).toHaveClass(
      'h-12',
      'rounded-[13.375px]',
      // Cam theo token `cta` (search UI PR-A, G1; trước đó `bg-amber-500`)
      'bg-cta',
      'hover:bg-cta-hover',
      'text-gray-900',
      'px-5',
      'gap-2',
      'mt-5',
    );
    expect(link).not.toHaveClass('bg-amber-500');
    expect(link).not.toHaveClass('text-white');
    expect(link.querySelector('svg')).toHaveClass('size-4');
  });

  it('UIS-09 không có bác sĩ (soBacSi = 0) ⇒ KHÔNG có nút "Đặt lịch khám", chip "Sắp có bác sĩ" và không chip giá', async () => {
    openDetail({ ...NHI, giaKhamTu: null });
    await screen.findByRole('heading', { name: 'Nhi khoa', level: 1 });
    expect(screen.queryByRole('link', { name: 'Đặt lịch khám' })).toBeNull();
    expect(screen.getByText('Sắp có bác sĩ')).toHaveClass('px-3', 'py-1.5');
    expect(screen.queryByText(/Giá khám từ/)).toBeNull();
    // Không mô tả ⇒ ẩn đoạn mô tả (không đoạn rỗng)
    expect(
      screen.getByRole('heading', { name: 'Nhi khoa', level: 1 })
        .nextElementSibling,
    ).not.toHaveClass('leading-relaxed');
  });

  it('UIS-09 đường dẫn: Trang chủ, Chuyên khoa (liên kết) rồi tên chuyên khoa là trang hiện tại; chưa tải xong thì chỉ hai mục', async () => {
    openDetail(DETAIL);
    // Chưa tải xong: hai mục, "Chuyên khoa" còn là liên kết
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(nav).getByRole('link', { name: 'Chuyên khoa' }),
    ).toHaveAttribute('href', '/chuyen-khoa');
    await screen.findByRole('heading', { name: 'Tim mạch', level: 1 });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3);
    expect(within(nav).getByText('Tim mạch')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('UIS-09 phần bác sĩ: H2 18,75 đậm, cách thẻ đầu 22,5 (mt-6)', async () => {
    openDetail(DETAIL);
    const h2 = await screen.findByRole('heading', {
      name: 'Bác sĩ chuyên khoa Tim mạch',
      level: 2,
    });
    expect(h2).toHaveClass('text-xl', 'font-bold');
    expect(h2).not.toHaveClass('text-2xl');
    expect(h2).not.toHaveClass('font-semibold');
    expect(h2.closest('section')).toHaveClass('mt-6');
    expect(h2.closest('section')).not.toHaveClass('mt-10');
  });

  it('UIS-09 khung chi tiết vẫn 1200/30, đệm dọc 30 (Figma 259:52 cách đỉnh 30) và đường dẫn → thẻ 18,75', async () => {
    openDetail(DETAIL);
    const h1 = await screen.findByRole('heading', {
      name: 'Tim mạch',
      level: 1,
    });
    const main = screen.getByRole('main');
    expect(main).toHaveClass('max-w-320', 'px-8', 'py-8');
    expect(h1.closest('section')?.parentElement).toHaveClass('mt-5');
  });
});
