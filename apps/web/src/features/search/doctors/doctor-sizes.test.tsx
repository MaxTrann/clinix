import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import * as api from '../api/search-service';
import type {
  BranchSummary,
  DoctorDetail,
  DoctorItem,
  SpecialtySummary,
} from '../api/search-types';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { doctorDisplayName } from '../format/doctor-title';
import { DoctorCard, DoctorRating, SCHEDULE_PLACEHOLDER } from './doctor-card';
import { DoctorDetailPage } from './doctor-detail-page';
import { DoctorFilters } from './doctor-filters';
import { DEFAULT_SORT, type DoctorFilterValues } from './doctor-filter-rules';
import { DoctorTeamPage } from './doctor-team-page';

vi.mock('../api/search-service');

// search F14, nhóm G6 (B1 đến B5): trang Bác sĩ theo Figma 260:2 (thẻ ngang 260:162, bộ lọc 260:67) và 653:2 (chi tiết). Mã UIS-10 là [đề xuất].
// Mức W (`css: false`): khoá LỚP CSS và ca chức năng; số đo thật (getBoundingClientRect) ghi ở TRACKING mục 6.
// Gốc `html` 15 px: `p-5` = 18,75; `gap-4` = 15; `gap-5` = 18,75; `gap-3` = 11,25; `h-12` = 45; `size-24` = 90; `mt-5` = 18,75; `mt-6` = 22,5.
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
  dichVu: { dichVuKhamId: '20', ten: 'Khám tim', thoiLuong: 30 },
  gia: {
    giaMacDinh: '300000.00',
    phuPhi: '0.00',
    giaKham: '300000.00',
    mucDatCoc: '100000.00',
  },
  danhGia: { diemTrungBinh: '4.30', soDanhGia: 7 },
};
const BRANCH: BranchSummary = {
  chiNhanhId: '1',
  ten: 'Chi nhánh Sài Gòn',
  diaChi: '1 Đường Mẫu',
  toaDoLat: null,
  toaDoLng: null,
};
const SPECIALTY: SpecialtySummary = {
  chuyenKhoaId: '10',
  ten: 'Tim mạch',
  moTa: null,
  anhDaiDien: null,
  soBacSi: 1,
};
const VALUES: DoctorFilterValues = {
  chiNhanhId: '',
  chuyenKhoaId: '',
  q: '',
  giaTu: '',
  giaDen: '',
  diemTu: '',
  sapXep: DEFAULT_SORT,
};
const page = <T,>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});

function renderCard(doctor: DoctorItem = DOCTOR) {
  render(
    <MemoryRouter>
      <ul>
        <DoctorCard doctor={doctor} />
      </ul>
    </MemoryRouter>,
  );
  return screen.getByRole('listitem');
}

describe('tên bác sĩ hiển thị theo Figma (UIS-10, B3)', () => {
  it('UIS-10 BS.CKI và BS.CKII KHÔNG chấm sau số La Mã; mọi chức danh khác có chấm; mã lạ hiện nguyên mã rồi chấm', () => {
    expect(doctorDisplayName('BS_CKII', 'Trần Quốc Huy')).toBe(
      'BS.CKII Trần Quốc Huy',
    );
    expect(doctorDisplayName('BS_CKI', 'Phạm Đức Anh')).toBe(
      'BS.CKI Phạm Đức Anh',
    );
    expect(doctorDisplayName('ThS_BS', 'Nguyễn Minh Anh')).toBe(
      'ThS.BS. Nguyễn Minh Anh',
    );
    expect(doctorDisplayName('TS_BS', 'Lê Quang Hùng')).toBe(
      'TS.BS. Lê Quang Hùng',
    );
    expect(doctorDisplayName('PGS_TS_BS', 'A')).toBe('PGS.TS.BS. A');
    expect(doctorDisplayName('BS', 'Nguyễn Văn Cường')).toBe(
      'BS. Nguyễn Văn Cường',
    );
    expect(doctorDisplayName('MOI', 'B')).toBe('MOI. B');
  });
});

describe('thẻ bác sĩ ngang theo Figma 260:162 (UIS-10)', () => {
  it('UIS-10 hai cột 517 : 621, bo 15, viền; cột trái đệm 18,75 có kẻ dọc; cột phải chừa vùng khung giờ với câu chờ', () => {
    const card = renderCard();
    expect(card).toHaveClass(
      'grid',
      'overflow-hidden',
      'rounded-[15px]',
      'border',
      'md:grid-cols-[517fr_621fr]',
    );
    expect(card).not.toHaveClass('rounded-xl');
    expect(card).not.toHaveClass('p-5');
    const [left, right] = Array.from(card.children);
    expect(left).toHaveClass('p-5', 'md:border-r', 'md:border-gray-100');
    expect(right).toHaveClass('bg-gray-50/60', 'p-5');
    expect(
      within(right as HTMLElement).getByText(SCHEDULE_PLACEHOLDER),
    ).toBeInTheDocument();
  });

  it('UIS-10 ảnh chữ 72 px bo 15; chuyên khoa 11,25 medium; tên 16,875 semibold qua doctorDisplayName', () => {
    const card = within(renderCard());
    expect(card.getByText('MA')).toHaveClass(
      'size-[72px]',
      'rounded-[15px]',
      'border',
    );
    expect(card.getByText('Tim mạch')).toHaveClass(
      'text-xs',
      'font-medium',
      'leading-[15px]',
      'text-brand-strong',
    );
    const name = card.getByRole('heading', {
      name: 'ThS.BS. Nguyễn Minh Anh',
      level: 2,
    });
    expect(name).toHaveClass('text-lg', 'font-semibold', 'leading-snug');
  });

  it('UIS-10 hai dòng biểu tượng 15 px: kinh nghiệm rồi chi nhánh; chữ 13,125; khe dòng 5,625', () => {
    const card = within(renderCard());
    const experience = card.getByText('8 năm kinh nghiệm');
    const branch = card.getByText('Chi nhánh Sài Gòn');
    expect(experience.parentElement).toHaveClass('text-sm', 'text-gray-600');
    expect(experience).toHaveClass('flex', 'gap-2');
    expect(branch).toHaveClass('pt-1.5');
    expect(experience.querySelector('svg')).toHaveClass('size-4');
    expect(branch.querySelector('svg')).toHaveClass('size-4');
    expect(
      experience.compareDocumentPosition(branch) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('UIS-10 khối giá: kẻ ngang trên, nhãn "Giá khám" 11 px, giá 15 semibold, chip cọc có viền (amber khi cọc, không viền khi không cần)', () => {
    const card = within(renderCard());
    const label = card.getByText('Giá khám');
    expect(label).toHaveClass('text-[11px]', 'leading-[16.5px]');
    expect(label.parentElement).toHaveClass(
      'border-t',
      'border-gray-100',
      'pt-4',
      'mt-4',
    );
    expect(card.getByText('300.000đ')).toHaveClass(
      'text-base',
      'font-semibold',
      'text-brand-strong',
    );
    const chip = card.getByText('Cọc 100.000đ');
    expect(chip).toHaveClass(
      'rounded-full',
      'border-amber-200',
      'bg-warning-soft',
      'px-2',
      'py-0.5',
      'text-[11px]',
    );
  });

  it('UIS-10 không cần cọc ⇒ chip "Không cần cọc" màu thành công, không có chữ "Cọc"', () => {
    const card = within(
      renderCard({ ...DOCTOR, gia: { ...DOCTOR.gia, mucDatCoc: '0.00' } }),
    );
    expect(card.getByText('Không cần cọc')).toHaveClass(
      'bg-success-soft',
      'text-success',
      'rounded-full',
    );
    expect(card.queryByText(/^Cọc /)).toBeNull();
  });

  it('UIS-10 hai nút NẰM NGANG trong cùng một hàng (khe 7,5), cao 45, bo 9,375; "Xem hồ sơ" trước, "Nhắn tin" vô hiệu sau', () => {
    const card = within(renderCard());
    const link = card.getByRole('link', { name: /Xem hồ sơ/ });
    const message = card.getByRole('button', { name: 'Nhắn tin' });
    expect(link).toHaveAttribute('href', '/bac-si/100');
    expect(message).toBeDisabled();
    expect(link.parentElement).toBe(message.parentElement);
    expect(link.parentElement).toHaveClass('flex', 'gap-2', 'pt-4');
    expect(link.parentElement).not.toHaveClass('flex-col');
    expect(link).toHaveClass('h-12', 'rounded-[0.625rem]', 'bg-brand-soft');
    expect(message).toHaveClass('h-12', 'rounded-[0.625rem]', 'border');
    expect(
      link.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(message.querySelector('svg')).toHaveClass('size-4');
  });

  it('UIS-10 điểm đánh giá: sao vàng, "4.3" đậm và "(7 đánh giá)" nhạt là phần tử riêng (ẩn với trình đọc), câu đầy đủ một lần cho trình đọc', () => {
    const card = within(renderCard());
    const spoken = card.getByText('4.3 (7 đánh giá)');
    expect(spoken).toHaveClass('sr-only');
    const row = spoken.parentElement as HTMLElement;
    expect(row).toHaveClass('gap-1', 'text-xs');
    expect(row.querySelector('svg')).toHaveClass('size-3.5', 'fill-amber-400');
    expect(card.getByText('4.3')).toHaveClass('font-semibold', 'text-gray-600');
    expect(card.getByText('4.3')).toHaveAttribute('aria-hidden', 'true');
    expect(card.getByText('(7 đánh giá)')).toHaveClass('text-gray-500');
  });

  it('UIS-10 chưa có điểm ⇒ sao xám + "Chưa có đánh giá", không có câu cho trình đọc', () => {
    const card = within(
      renderCard({
        ...DOCTOR,
        danhGia: { diemTrungBinh: null, soDanhGia: 0 },
      }),
    );
    const none = card.getByText('Chưa có đánh giá');
    expect(none.parentElement?.querySelector('svg')).toHaveClass(
      'text-gray-300',
    );
    expect(none.parentElement?.querySelector('.sr-only')).toBeNull();
  });

  it('UIS-10 DoctorRating cỡ lớn (đầu chi tiết): sao 15, chữ 13,125, "4.3" đậm gray-900', () => {
    render(<DoctorRating rating="4.30" count={7} large />);
    const spoken = screen.getByText('4.3 (7 đánh giá)');
    const row = spoken.parentElement as HTMLElement;
    expect(row).toHaveClass('gap-1.5', 'text-sm');
    expect(row.querySelector('svg')).toHaveClass('size-4');
    expect(screen.getByText('4.3')).toHaveClass('font-bold', 'text-gray-900');
  });
});

describe('bộ lọc bác sĩ theo Figma 260:67 (UIS-10)', () => {
  const renderFilters = (withSpecialties: boolean) =>
    render(
      <DoctorFilters
        values={VALUES}
        errors={{}}
        branches={[BRANCH]}
        specialties={withSpecialties ? [SPECIALTY] : undefined}
        keywordPlaceholder="Tìm theo tên bác sĩ hoặc chuyên khoa"
        onChange={() => undefined}
      />,
    );

  it('UIS-10 khung viền bo 15 đệm 18,75; hàng 1 theo Figma: "Tìm bác sĩ" (2 phần), "Chuyên khoa", "Chi nhánh", khe 11,25', () => {
    renderFilters(true);
    const form = screen.getByRole('search', { name: 'Bộ lọc bác sĩ' });
    expect(form).toHaveClass('rounded-[15px]', 'border', 'p-5', 'bg-white');
    const row1 = form.firstElementChild as HTMLElement;
    expect(row1).toHaveClass('grid', 'gap-3', 'md:grid-cols-[2fr_1fr_1fr]');
    const labels = Array.from(row1.querySelectorAll('label')).map(
      (label) => label.textContent,
    );
    expect(labels).toEqual(['Tìm bác sĩ', 'Chuyên khoa', 'Chi nhánh']);
  });

  it('UIS-10 chi tiết chuyên khoa và bước 3 (không có ô chuyên khoa): hàng 1 chỉ còn "Tìm bác sĩ" + "Chi nhánh" (2 : 1)', () => {
    renderFilters(false);
    const row1 = screen.getByRole('search').firstElementChild as HTMLElement;
    expect(row1).toHaveClass('md:grid-cols-[2fr_1fr]');
    expect(row1).not.toHaveClass('md:grid-cols-[2fr_1fr_1fr]');
    expect(
      Array.from(row1.querySelectorAll('label')).map((l) => l.textContent),
    ).toEqual(['Tìm bác sĩ', 'Chi nhánh']);
    expect(screen.queryByLabelText('Chuyên khoa')).toBeNull();
  });

  it('UIS-10 nhãn 11,25 đậm vừa gray-500; ô cao 45, bo 13,375, chữ 13,125; kính lúp 15 ở trái, chevron 15 ở phải; ô tìm đệm trái 37,5', () => {
    renderFilters(true);
    for (const name of ['Tìm bác sĩ', 'Chuyên khoa', 'Chi nhánh']) {
      expect(screen.getByText(name, { selector: 'label' })).toHaveClass(
        'block',
        'text-xs',
        'font-medium',
        'text-gray-500',
      );
    }
    const search = screen.getByLabelText('Tìm bác sĩ');
    expect(search).toHaveAttribute('type', 'search');
    expect(search).toHaveClass(
      'h-12',
      'rounded-[13.375px]',
      'border-gray-200',
      'text-sm',
      'pl-[37.5px]',
    );
    expect(search.previousElementSibling).toHaveClass(
      'size-4',
      'left-3.5',
      'top-4',
    );
    for (const label of ['Chuyên khoa', 'Chi nhánh']) {
      const select = screen.getByLabelText(label);
      expect(select).toHaveClass(
        'h-12',
        'rounded-[13.375px]',
        'appearance-none',
        'pl-3',
        'pr-9',
      );
      expect(select.nextElementSibling).toHaveClass(
        'size-4',
        'right-3.5',
        'top-4',
        'pointer-events-none',
      );
    }
  });

  it('UIS-10 hàng 2: bốn ô của Q12 (sắp xếp, giá từ, giá đến, đánh giá) cùng kiểu ô, 4 cột từ lg, cách hàng 1 là 15 px', () => {
    renderFilters(true);
    const row2 = screen.getByRole('search').lastElementChild as HTMLElement;
    expect(row2).toHaveClass('mt-4', 'grid', 'gap-3', 'lg:grid-cols-4');
    expect(
      Array.from(row2.querySelectorAll('label')).map((l) => l.textContent),
    ).toEqual(['Sắp xếp', 'Giá từ (đ)', 'Giá đến (đ)', 'Đánh giá']);
    for (const label of ['Sắp xếp', 'Giá từ (đ)', 'Giá đến (đ)', 'Đánh giá']) {
      expect(screen.getByLabelText(label)).toHaveClass(
        'h-12',
        'rounded-[13.375px]',
      );
    }
  });

  it('UIS-10 báo lỗi giá vẫn nằm dưới ô, aria-invalid và role="alert" như trước', () => {
    render(
      <DoctorFilters
        values={{ ...VALUES, giaTu: 'abc' }}
        errors={{ giaTu: 'Giá phải là số không âm' }}
        branches={[]}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Giá từ (đ)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Giá phải là số không âm',
    );
  });
});

describe('trang Đội ngũ bác sĩ theo Figma 260:2 (UIS-10)', () => {
  function openTeam() {
    return render(
      <MemoryRouter initialEntries={['/bac-si']}>
        <Routes>
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
    vi.mocked(api.getDoctors).mockResolvedValue(page([DOCTOR, DOCTOR]));
    // Thẻ nay có lưới khung giờ (search PR-C2): một lời gọi `getDoctorSlots` cho cả trang
    vi.mocked(api.getDoctorSlots).mockResolvedValue(
      new Map([
        [
          DOCTOR.bacSiId,
          {
            bacSiId: DOCTOR.bacSiId,
            trangThaiNgay: 'KhongCoLich',
            khungGio: [],
          },
        ],
      ]),
    );
    vi.mocked(api.getBranches).mockResolvedValue(page([BRANCH]));
    vi.mocked(api.getSpecialties).mockResolvedValue({
      ...page([SPECIALTY]),
      soCoBacSi: 1,
    });
  });

  it('UIS-10 nhịp dọc: đệm 30; đường dẫn → H1 18,75 (đậm); H1 → mô tả 5,625; mô tả → bộ lọc 22,5; bộ lọc → kết quả 22,5; không còn khung thừa quanh bộ lọc', async () => {
    openTeam();
    const h1 = await screen.findByRole('heading', {
      name: 'Đội ngũ bác sĩ',
      level: 1,
    });
    expect(screen.getByRole('main')).toHaveClass('py-8');
    expect(h1).toHaveClass('mt-5', 'text-3xl', 'font-bold');
    expect(h1).not.toHaveClass('font-semibold');
    expect(screen.getByText(/Tìm bác sĩ phù hợp/)).toHaveClass('mt-1.5');
    const form = screen.getByRole('search');
    expect(form.parentElement).toHaveClass('mt-6');
    expect(form.parentElement).not.toHaveClass('border');
    expect(form.parentElement).not.toHaveClass('p-5');
    await screen.findAllByRole('heading', { level: 2 });
    // Giữa bộ lọc và kết quả nay có dải "Ngày khám" (search PR-C2): bộ lọc → dải 18,75; dải → kết quả vẫn 22,5
    const strip = form.parentElement?.nextElementSibling as HTMLElement;
    expect(strip).toHaveClass('mt-5');
    expect(within(strip).getByText('Ngày khám')).toBeInTheDocument();
    const results = strip.nextElementSibling as HTMLElement;
    expect(results).toHaveClass('mt-6');
  });

  it('UIS-10 danh sách: dòng đếm cách thẻ 15 (mb-4), thẻ cách nhau 18,75 (gap-5); đường dẫn "Trang chủ" rồi "Bác sĩ" là trang hiện tại', async () => {
    openTeam();
    // Dòng đếm của Đội ngũ bác sĩ nay có hậu tố "· lịch Hôm nay d/m" (Figma 260:2; search PR-C2)
    const count = await screen.findByText(
      /^2 bác sĩ · lịch Hôm nay \d{1,2}\/\d{1,2}$/,
    );
    expect(count).toHaveClass('mb-4');
    expect(count.nextElementSibling).toHaveClass('gap-5');
    expect(count.nextElementSibling).not.toHaveClass('gap-4');
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(within(nav).getByText('Bác sĩ')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(nav.querySelectorAll('svg')).toHaveLength(1);
  });

  it('UIS-10 ô chuyên khoa có mặt, ô tìm dùng gợi ý "theo tên bác sĩ hoặc chuyên khoa" của Figma', async () => {
    openTeam();
    const search = await screen.findByLabelText('Tìm bác sĩ');
    expect(search).toHaveAttribute(
      'placeholder',
      'Tìm theo tên bác sĩ hoặc chuyên khoa',
    );
    expect(screen.getByLabelText('Chuyên khoa')).toBeInTheDocument();
  });
});

const DETAIL: DoctorDetail = {
  ...DOCTOR,
  chucDanh: 'BS_CKII',
  hoTen: 'Trần Quốc Huy',
  moTaChuyenMon: null,
  chiNhanh: { ...DOCTOR.chiNhanh, lichHoatDong: [] },
};

describe('trang Chi tiết bác sĩ theo Figma 653:2 (UIS-10)', () => {
  function openDetail(detail: DoctorDetail = DETAIL) {
    vi.mocked(api.getDoctorDetail).mockResolvedValue(detail);
    return render(
      <MemoryRouter initialEntries={['/bac-si/100']}>
        <Routes>
          <Route path="/bac-si/:id" element={<DoctorDetailPage />} />
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
    vi.mocked(api.getClinicInfo).mockResolvedValue({
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: null,
      duongDayNong: '1900 1234',
      email: null,
    });
  });

  it('UIS-10 chia hai cột: cột phải 365 px, khe 22,5; đường dẫn dùng doctorDisplayName (không chấm sau CKII); chưa tải xong thì hai mục', async () => {
    openDetail();
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(2);
    const h1 = await screen.findByRole('heading', {
      name: 'BS.CKII Trần Quốc Huy',
      level: 1,
    });
    const grid = h1.closest('section')?.parentElement?.parentElement;
    expect(grid).toHaveClass(
      'grid',
      'gap-6',
      'lg:grid-cols-[minmax(0,1fr)_365px]',
    );
    expect(grid).not.toHaveClass('lg:grid-cols-[1fr_22rem]');
    expect(within(nav).getByText('BS.CKII Trần Quốc Huy')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('main').firstElementChild).toBe(nav);
  });

  it('UIS-10 thẻ đầu: bo 15 đệm 22,5, ảnh chữ 90 bo 15, H1 22,5 đậm, chuyên khoa 13,125 medium, giá 15 semibold + chip cọc', async () => {
    openDetail();
    const h1 = await screen.findByRole('heading', { level: 1 });
    const card = h1.closest('section') as HTMLElement;
    expect(card).toHaveClass('rounded-[15px]', 'border', 'p-6');
    expect(card).not.toHaveClass('rounded-xl');
    expect(screen.getByText('QH')).toHaveClass(
      'size-24',
      'rounded-[15px]',
      'border',
    );
    expect(h1).toHaveClass('text-2xl', 'font-bold', 'leading-tight');
    expect(h1).not.toHaveClass('text-3xl');
    expect(h1).not.toHaveClass('font-semibold');
    expect(screen.getByText('Tim mạch', { selector: 'p' })).toHaveClass(
      'text-sm',
      'font-medium',
      'text-brand-strong',
    );
    const price = within(card).getAllByText('300.000đ')[0];
    expect(price).toHaveClass(
      'text-base',
      'font-semibold',
      'text-brand-strong',
    );
    expect(within(card).getByText('Cọc 100.000đ')).toHaveClass(
      'border-amber-200',
      'text-[11px]',
    );
  });

  it('UIS-10 hàng thông tin: điểm (cỡ lớn), kinh nghiệm, "N phút/lượt", chi nhánh; khe 18,75; ghi chú dữ liệu minh họa có biểu tượng, bo 13,375', async () => {
    openDetail();
    await screen.findByRole('heading', { level: 1 });
    const spoken = screen.getByText('4.3 (7 đánh giá)');
    const row = spoken.closest('div') as HTMLElement;
    expect(row).toHaveClass('gap-x-5', 'text-sm');
    expect(spoken.parentElement).toHaveClass('gap-1.5', 'text-sm');
    for (const text of [
      '8 năm kinh nghiệm',
      '30 phút/lượt',
      'Chi nhánh Sài Gòn',
    ]) {
      const item = screen.getByText(text, { selector: 'span' });
      expect(item).toHaveClass('flex', 'gap-1.5');
      expect(item.querySelector('svg')).toHaveClass('size-4');
    }
    const note = screen.getByText(/dữ liệu minh họa, chưa được CLINIX/);
    expect(note).toHaveClass(
      'flex',
      'gap-2',
      'rounded-[13.375px]',
      'border',
      'bg-gray-50',
      'px-3',
      'py-2.5',
      'text-xs',
    );
    expect(note.querySelector('svg')).toHaveClass('size-4');
  });

  it('UIS-10 tab cao 45, đệm 18,75, chữ 13,125 đậm vừa; tab đang chọn viền dưới brand; kẻ dưới dải tab gray-100', async () => {
    openDetail();
    await screen.findByRole('heading', { level: 1 });
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('border-b', 'border-gray-100');
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) {
      expect(tab).toHaveClass(
        'h-12',
        'border-b-2',
        'px-5',
        'text-sm',
        'font-medium',
      );
      expect(tab).not.toHaveClass('px-4');
      expect(tab).not.toHaveClass('py-3');
    }
    expect(tabs[0]).toHaveClass('border-brand', 'text-brand-strong');
    expect(tabs[1]).toHaveClass('border-transparent');
    expect(list.parentElement).toHaveClass('rounded-[15px]');
  });

  it('UIS-10 khối "Thông tin khám": thẻ bo 15 đệm 18,75; H2 18,75 semibold; hàng nhãn/giá trị khe 11,25; hai nút cao 45 bo 13,375 có biểu tượng (xanh giữ theo ADR 0004)', async () => {
    openDetail();
    await screen.findByRole('heading', { level: 1 });
    const h2 = screen.getByRole('heading', {
      name: 'Thông tin khám',
      level: 2,
    });
    expect(h2).toHaveClass('text-xl', 'font-semibold', 'leading-normal');
    const card = h2.parentElement as HTMLElement;
    expect(card).toHaveClass('rounded-[15px]', 'border', 'p-5');
    expect(card.parentElement).toHaveClass('gap-4');
    const list = card.querySelector('dl') as HTMLElement;
    expect(list).toHaveClass('mt-4', 'flex-col', 'gap-3');
    expect(within(list).getByText('Dịch vụ').querySelector('svg')).toHaveClass(
      'size-4',
    );
    expect(within(list).getByText('Đặt cọc').querySelector('svg')).toHaveClass(
      'size-4',
    );
    expect(
      within(list).getByText('Giá khám', { selector: 'dt' }),
    ).toBeInTheDocument();
    const choose = screen.getByRole('button', { name: 'Chọn ngày khám' });
    expect(choose).toHaveClass(
      'h-12',
      'rounded-[13.375px]',
      // Cam theo token `cta` với chữ gray-900 (search UI PR-A, G1; trước đó `bg-brand-strong` + `text-white`)
      'bg-cta',
      'hover:bg-cta-hover',
      'text-gray-900',
      'gap-2',
    );
    expect(choose).not.toHaveClass('bg-brand-strong');
    expect(choose).not.toHaveClass('text-white');
    expect(choose.querySelector('svg')).toHaveClass('size-4');
    const message = screen.getByRole('button', { name: 'Nhắn tin với bác sĩ' });
    expect(message).toBeDisabled();
    expect(message).toHaveClass('h-12', 'rounded-[13.375px]', 'mt-2');
    expect(message.querySelector('svg')).toHaveClass('size-4');
  });

  it('UIS-10 khối địa chỉ: H2 18,75 có biểu tượng 15; có hotline mới có "Hỗ trợ đặt lịch"; chưa có hotline thì ẩn', async () => {
    openDetail();
    const address = await screen.findByRole('heading', {
      name: 'Địa chỉ phòng khám',
      level: 2,
    });
    expect(address).toHaveClass(
      'flex',
      'gap-2',
      'text-xl',
      'font-semibold',
      'leading-normal',
    );
    expect(address.querySelector('svg')).toHaveClass('size-4');
    const support = await screen.findByRole('heading', {
      name: 'Hỗ trợ đặt lịch',
      level: 2,
    });
    expect(support.querySelector('svg')).toHaveClass('size-4');
    expect(screen.getByText('1900 1234')).toBeInTheDocument();
  });

  it('UIS-10 không có hotline ⇒ không có "Hỗ trợ đặt lịch"', async () => {
    vi.mocked(api.getClinicInfo).mockResolvedValue({
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: null,
      duongDayNong: null,
      email: null,
    });
    openDetail();
    await screen.findByRole('heading', { name: 'Địa chỉ phòng khám' });
    expect(
      screen.queryByRole('heading', { name: 'Hỗ trợ đặt lịch' }),
    ).toBeNull();
  });
});
