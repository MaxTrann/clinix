import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import * as api from '../api/search-service';
import type { ServiceGroupItem, ServiceItem } from '../api/search-types';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { DoctorListPage } from '../doctors/doctor-list-page';
import { ServiceGroupPage } from './service-group-page';
import { ServiceListPage } from './service-list-page';

vi.mock('../api/search-service');

// search F14, nhóm G7 (D1 đến D5): Đặt lịch bước 1–3 theo Figma 444:2, 445:2, 446:2. Mã UIS-11 là [đề xuất] (PLAN search F14).
// Mức W (`css: false`): khoá LỚP CSS và trạng thái; số đo thật (getBoundingClientRect) ghi ở TRACKING mục 6.
// Gốc `html` 15 px: `gap-4` = 15; `size-12` = 45; `size-6` = 22,5; `mt-2` = 7,5; `mt-6` = 22,5; `-ml-2` = −7,5; `min-h-12` = 45.
const GROUPS: ServiceGroupItem[] = [
  {
    nhomDichVuId: '1',
    ten: 'Khám chuyên khoa',
    soDichVu: 8,
    giaTu: '200000.00',
    sapTrienKhai: false,
  },
  {
    nhomDichVuId: '2',
    ten: 'Khám tổng quát',
    soDichVu: 2,
    giaTu: '500000.00',
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
  {
    dichVuKhamId: '11',
    ten: 'Nội tổng quát',
    nhomDichVu: { id: '1', ten: 'Khám chuyên khoa' },
    thoiLuong: 30,
    giaMacDinh: '200000.00',
    mucDatCoc: '0.00',
    soBacSi: 1,
  },
];

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

function openGroups() {
  return render(
    <MemoryRouter initialEntries={['/dat-lich']}>
      <Routes>
        <Route path="/dat-lich" element={<ServiceGroupPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openServices() {
  return render(
    <MemoryRouter initialEntries={['/dat-lich/nhom/1']}>
      <Routes>
        <Route path="/dat-lich/nhom/:groupId" element={<ServiceListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Đặt lịch bước 1 "Nhóm dịch vụ" theo Figma 444:2 (UIS-11)', () => {
  it('UIS-11 H1 22,5 đậm, mô tả cách H1 3,75, lưới cách mô tả 22,5; ba cột, khe 15', async () => {
    openGroups();
    const h1 = await screen.findByRole('heading', {
      name: 'Đặt lịch khám bệnh',
      level: 1,
    });
    expect(h1).toHaveClass('text-2xl', 'font-bold');
    expect(h1).not.toHaveClass('text-3xl');
    expect(h1).not.toHaveClass('font-semibold');
    expect(screen.getByText(/Chọn nhóm dịch vụ phù hợp/)).toHaveClass('mt-1');
    await screen.findByText('Khám chuyên khoa');
    // Từ search UI PR-B trang có thêm danh sách `ol` của thanh bước nên lấy lưới theo thẻ nhóm, không theo vai trò `list`
    const grid = screen
      .getByText('Khám chuyên khoa')
      .closest('ul') as HTMLElement;
    expect(grid.parentElement).toHaveClass('mt-6');
    expect(grid).toHaveClass('grid', 'gap-4', 'md:grid-cols-3');
    expect(grid).not.toHaveClass('gap-5');
  });

  it('UIS-11 thẻ nhóm: bo 15, đệm 18,75, cột dọc; ô biểu tượng 45 bo 13,375 biểu tượng 22,5; tên 16,875 semibold', async () => {
    openGroups();
    const title = await screen.findByRole('heading', {
      name: 'Khám chuyên khoa',
      level: 2,
    });
    const card = title.closest('a') as HTMLElement;
    expect(card).toHaveClass(
      'flex',
      'h-full',
      'flex-col',
      'rounded-[15px]',
      'border',
      'p-5',
    );
    expect(card).not.toHaveClass('rounded-xl');
    expect(card).not.toHaveClass('block');
    const box = card.firstElementChild as HTMLElement;
    expect(box).toHaveClass('size-12', 'rounded-[13.375px]', 'bg-brand-soft');
    expect(box).not.toHaveClass('size-11');
    expect(box).not.toHaveClass('rounded-xl');
    expect(box.querySelector('svg')).toHaveClass('size-6');
    expect(title).toHaveClass(
      'mt-3',
      'text-lg',
      'font-semibold',
      'text-gray-900',
    );
  });

  it('UIS-11 chân thẻ NEO ĐÁY (mt-auto): "N dịch vụ · từ giá" bên trái, "Chọn" semibold bên phải', async () => {
    openGroups();
    const card = (
      await screen.findByRole('heading', { name: 'Khám chuyên khoa', level: 2 })
    ).closest('a') as HTMLElement;
    const price = within(card).getByText('200.000đ');
    expect(price).toHaveClass('font-bold', 'text-brand-strong');
    const footer = price.closest('div') as HTMLElement;
    expect(footer).toHaveClass(
      'mt-auto',
      'flex',
      'items-center',
      'justify-between',
      'pt-4',
      'font-medium',
    );
    expect(footer).not.toHaveClass('mt-6');
    expect(within(card).getByText('Chọn')).toHaveClass(
      'font-semibold',
      'text-brand-strong',
    );
  });

  it('UIS-11 nhóm "Sắp triển khai": thẻ xám LIỀN (không viền đứt, khác Trang chủ), không phải liên kết; chip xám đậm, ghi chú neo đáy', async () => {
    openGroups();
    const title = await screen.findByRole('heading', {
      name: 'Tầm soát ung thư',
      level: 2,
    });
    const card = title.closest('li') as HTMLElement;
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(card).toHaveClass(
      'flex',
      'flex-col',
      'rounded-[15px]',
      'border',
      'bg-gray-50',
    );
    expect(card).not.toHaveClass('border-dashed');
    expect(card).not.toHaveClass('rounded-xl');
    expect(within(card).queryByRole('link')).toBeNull();
    expect(title).toHaveClass('text-gray-600');
    expect(title).not.toHaveClass('text-gray-900');
    expect(within(card).getByText('Sắp triển khai')).toHaveClass(
      'bg-gray-200',
      'rounded-full',
      'px-2',
      'py-0.5',
      'text-xs',
      'font-medium',
    );
    expect(
      within(card).getByText('Chưa thể đặt lịch online cho nhóm này.'),
    ).toHaveClass('mt-auto', 'pt-4', 'text-sm', 'font-medium');
    expect(
      within(card).getByRole('heading', { level: 2 }).previousElementSibling,
    ).toHaveClass('size-12');
  });
});

describe('Đặt lịch bước 2 "Dịch vụ khám" theo Figma 445:2 (UIS-11)', () => {
  it('UIS-11 nút quay lại: chữ 15 đậm vừa, cao tối thiểu 45, lệch trái 7,5 để biểu tượng thẳng lề; H1 cách nút 7,5', async () => {
    openServices();
    const back = await screen.findByRole('link', {
      name: 'Chọn lại nhóm dịch vụ',
    });
    expect(back).toHaveAttribute('href', '/dat-lich');
    expect(back).toHaveClass(
      '-ml-2',
      'min-h-12',
      'px-2',
      'gap-1.5',
      'text-base',
      'font-medium',
    );
    expect(back).not.toHaveClass('text-sm');
    expect(back).not.toHaveClass('gap-1');
    expect(back.querySelector('svg')).toHaveClass('size-4');
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveClass('mt-2', 'text-2xl', 'font-bold');
    expect(h1).not.toHaveClass('mt-4');
    expect(h1).not.toHaveClass('text-3xl');
  });

  it('UIS-11 lưới hai cột khe 15; thẻ dịch vụ bo 15, cột dọc; tên 16,875 semibold cách hàng giá 15', async () => {
    openServices();
    const title = await screen.findByRole('heading', {
      name: 'Tim mạch',
      level: 2,
    });
    const grid = title.closest('ul') as HTMLElement;
    expect(grid).toHaveClass('grid', 'gap-4', 'md:grid-cols-2');
    expect(grid).not.toHaveClass('gap-5');
    const card = title.closest('a') as HTMLElement;
    expect(card).toHaveClass('flex', 'h-full', 'flex-col', 'rounded-[15px]');
    expect(card).not.toHaveClass('rounded-xl');
    expect(card).not.toHaveClass('block');
    expect(card).toHaveAttribute('href', '/dat-lich/nhom/1/dich-vu/10');
    expect(title).toHaveClass(
      'mb-4',
      'text-lg',
      'font-semibold',
      'leading-snug',
    );
  });

  it('UIS-11 hàng giá neo đáy: kẻ trên, chữ 14/21, "Giá dịch vụ:" + giá đậm, "Cọc:" + số tiền semibold; ghi chú phụ phí 11,25', async () => {
    openServices();
    const card = (
      await screen.findByRole('heading', { name: 'Tim mạch', level: 2 })
    ).closest('a') as HTMLElement;
    const row = within(card)
      .getByText('300.000đ')
      .closest('div') as HTMLElement;
    expect(row).toHaveClass(
      'mt-auto',
      'border-t',
      'border-gray-100',
      'pt-3',
      'text-[14px]',
      'leading-[21px]',
    );
    expect(row).not.toHaveClass('mt-4');
    expect(row).not.toHaveClass('text-sm');
    expect(within(card).getByText('300.000đ')).toHaveClass('text-gray-900');
    expect(within(card).getByText('100.000đ')).toHaveClass(
      'font-semibold',
      'text-warning',
    );
    const note = within(card).getByText(
      'Phụ phí bác sĩ (nếu có) sẽ được cộng thêm khi chọn bác sĩ',
    );
    expect(note).toHaveClass('pt-1', 'text-xs', 'font-medium');
    expect(note).not.toHaveClass('mt-2');
  });

  it('UIS-11 không cần cọc ⇒ "Không cần cọc" semibold màu thành công, không còn số tiền cọc', async () => {
    openServices();
    const card = (
      await screen.findByRole('heading', { name: 'Nội tổng quát', level: 2 })
    ).closest('a') as HTMLElement;
    expect(within(card).getByText('Không cần cọc')).toHaveClass(
      'font-semibold',
      'text-success',
    );
    expect(within(card).queryByText('100.000đ')).toBeNull();
  });

  it('UIS-11 câu "Tiền cọc được trừ…" 13 px dòng 19,5, cách lưới 11,25', async () => {
    openServices();
    const note = await screen.findByText(
      'Tiền cọc được trừ vào giá khám; phần còn lại thanh toán tại quầy.',
    );
    expect(note).toHaveClass('mt-3', 'text-[13px]', 'leading-[19.5px]');
    expect(note).not.toHaveClass('mt-4');
    expect(note).not.toHaveClass('text-sm');
  });
});

describe('Đặt lịch bước 3 "Bác sĩ" theo Figma 446:2 (UIS-11)', () => {
  it('UIS-11 nút "Chọn lại dịch vụ khám" và H1 "Chọn bác sĩ" cùng kiểu với bước 2; bộ lọc Q12 vẫn có', async () => {
    render(
      <MemoryRouter initialEntries={['/dat-lich/nhom/1/dich-vu/10']}>
        <Routes>
          <Route
            path="/dat-lich/nhom/:groupId/dich-vu/:serviceId"
            element={<DoctorListPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const back = await screen.findByRole('link', {
      name: 'Chọn lại dịch vụ khám',
    });
    expect(back).toHaveAttribute('href', '/dat-lich/nhom/1');
    expect(back).toHaveClass(
      '-ml-2',
      'min-h-12',
      'px-2',
      'gap-1.5',
      'text-base',
      'font-medium',
    );
    const h1 = screen.getByRole('heading', { name: 'Chọn bác sĩ', level: 1 });
    expect(h1).toHaveClass('mt-2', 'text-2xl', 'font-bold');
    expect(h1).not.toHaveClass('text-3xl');
    expect(h1).not.toHaveClass('font-semibold');
    expect(
      screen.getByRole('search', { name: 'Bộ lọc bác sĩ' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('max-w-4xl', 'px-4', 'py-10');
  });
});
