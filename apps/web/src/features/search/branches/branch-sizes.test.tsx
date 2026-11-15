import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import * as api from '../api/search-service';
import type { BranchDetail, BranchSummary } from '../api/search-types';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { BranchDetailPage } from './branch-detail-page';
import { BranchListPage } from './branch-list-page';

vi.mock('../api/search-service');

// search F14, nhóm G8 (C1): trang Chi nhánh. CHƯA có frame Figma: nhịp dọc, đường dẫn, ô tìm, thẻ theo trang Chuyên khoa như THAM CHIẾU
// GIÁN TIẾP (không phải Figma). Mã UIS-12 là [đề xuất] (PLAN search F14). Mức W (`css: false`): khoá LỚP CSS và ngữ nghĩa.
// Gốc `html` 15 px: `py-10` = 37,5; `mt-5` = 18,75; `mt-1.5` = 5,625; `mt-6` = 22,5; `mt-8` = 30; `max-w-112` = 420.
const BRANCH: BranchSummary = {
  chiNhanhId: '1',
  ten: 'Chi nhánh Sài Gòn',
  diaChi: '1 Đường Mẫu, Quận 1',
  toaDoLat: null,
  toaDoLng: null,
};
const DETAIL: BranchDetail = {
  ...BRANCH,
  lichHoatDong: [],
  dichVuKham: [{ dichVuKhamId: '3', ten: 'Khám tim' }],
  soBacSi: 2,
};

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  window.localStorage.clear();
  resetSelectedBranchForTest();
  vi.mocked(api.searchBranches).mockResolvedValue({
    items: [BRANCH, { ...BRANCH, chiNhanhId: '2', ten: 'Chi nhánh Quận 3' }],
    total: 2,
    page: 1,
    pageSize: 100,
  });
  vi.mocked(api.getBranchDetail).mockResolvedValue(DETAIL);
});

function openList() {
  return render(
    <MemoryRouter initialEntries={['/chi-nhanh']}>
      <Routes>
        <Route path="/chi-nhanh" element={<BranchListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openDetail() {
  return render(
    <MemoryRouter initialEntries={['/chi-nhanh/1']}>
      <Routes>
        <Route path="/chi-nhanh/:id" element={<BranchDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('trang Chi nhánh — tham chiếu gián tiếp từ Chuyên khoa (UIS-12)', () => {
  it('UIS-12 nhịp dọc như Chuyên khoa: đệm 37,5; đường dẫn → H1 18,75 (đậm); H1 → dòng đếm 5,625; → ô tìm 22,5 (rộng 420); → lưới 30', async () => {
    openList();
    const h1 = await screen.findByRole('heading', {
      name: 'Chi nhánh',
      level: 1,
    });
    const main = screen.getByRole('main');
    expect(main).toHaveClass('max-w-320', 'px-8', 'py-10');
    expect(main).not.toHaveClass('py-8');
    expect(h1).toHaveClass('mt-5', 'text-3xl', 'font-bold');
    expect(h1).not.toHaveClass('font-semibold');
    expect(h1).not.toHaveClass('mt-3');
    expect(await screen.findByText('2 chi nhánh.')).toHaveClass('mt-1.5');
    const searchWrap = screen
      .getByRole('searchbox')
      .closest('div')?.parentElement;
    expect(searchWrap).toHaveClass('mt-6', 'max-w-112');
    expect(searchWrap).not.toHaveClass('mt-5');
    expect(searchWrap).not.toHaveClass('max-w-md');
    const grid = main.querySelector('ul') as HTMLElement;
    expect(grid.parentElement).toHaveClass('mt-8');
    expect(grid).toHaveClass('gap-5', 'lg:grid-cols-3');
  });

  it('UIS-12 đường dẫn dùng Breadcrumb (chevron, "Chi nhánh" là trang hiện tại); ô tìm là SearchField 45 px có kính lúp, vẫn có nhãn "Tìm chi nhánh"', async () => {
    openList();
    await screen.findByRole('heading', { name: 'Chi nhánh', level: 1 });
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(
      within(nav).getByRole('link', { name: 'Trang chủ' }),
    ).toHaveAttribute('href', '/');
    expect(within(nav).getByText('Chi nhánh')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(nav.querySelectorAll('svg')).toHaveLength(1);
    const input = screen.getByLabelText('Tìm chi nhánh');
    expect(input).toHaveClass('h-12', 'rounded-[13.375px]', 'pl-[41.25px]');
    expect(input.parentElement?.querySelector('svg')).toHaveClass('size-5');
    expect(input).toHaveAttribute(
      'placeholder',
      'Tìm theo tên hoặc địa chỉ, ví dụ: Quận 3',
    );
  });

  it('UIS-12 thẻ chi nhánh: bo 15 (như thẻ chuyên khoa), tên 16,875 semibold; liên kết tới chi tiết', async () => {
    openList();
    const title = await screen.findByRole('heading', {
      name: 'Chi nhánh Sài Gòn',
      level: 2,
    });
    const card = title.closest('a') as HTMLElement;
    expect(card).toHaveClass('rounded-2xl', 'border', 'p-4');
    expect(card).not.toHaveClass('rounded-xl');
    expect(card).toHaveAttribute('href', '/chi-nhanh/1');
    expect(title).toHaveClass('text-lg', 'font-semibold');
    expect(title).not.toHaveClass('text-base');
  });

  it('UIS-12 chi tiết: đường dẫn Trang chủ, Chi nhánh (liên kết về /chi-nhanh) rồi tên chi nhánh là trang hiện tại; chưa tải xong thì hai mục', async () => {
    openDetail();
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(nav).getByRole('link', { name: 'Chi nhánh' }),
    ).toHaveAttribute('href', '/chi-nhanh');
    await screen.findByRole('heading', { name: 'Chi nhánh Sài Gòn', level: 1 });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3);
    expect(within(nav).getByText('Chi nhánh Sài Gòn')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('UIS-12 chi tiết: khung 1200/30, đệm 30; đường dẫn → nội dung 18,75; H1 22,5 đậm như chi tiết chuyên khoa', async () => {
    openDetail();
    const h1 = await screen.findByRole('heading', {
      name: 'Chi nhánh Sài Gòn',
      level: 1,
    });
    const main = screen.getByRole('main');
    expect(main).toHaveClass('max-w-320', 'px-8', 'py-8');
    expect(h1).toHaveClass('text-2xl', 'font-bold');
    expect(h1).not.toHaveClass('text-3xl');
    expect(h1).not.toHaveClass('font-semibold');
    expect(h1.closest('section')?.parentElement).toHaveClass('mt-5');
  });
});
