import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseAdminReviewDetail } from '../api/admin-review-readers';
import type { AdminReviewPage } from '../api/admin-review-types';
import { ReviewDetailBody } from './review-detail-body';
import { ReviewStars } from './review-stars';
import { ReviewStatusPill } from './review-status-pill';
import { ReviewsFilters } from './reviews-filters';
import { ReviewsHeader } from './reviews-header';
import { ReviewsTable } from './reviews-table';
import { EMPTY_FILTERS } from './use-reviews';
import { detailBody, item } from './testing/render-reviews-page';

// doctor-exam F7, WKD-19 [đề xuất]: bố cục, trợ năng và khoá TÊN LỚP. `vitest` chạy `css: false` nên KÍCH THƯỚC THẬT chỉ Chromium thấy (đo ở TRACKING 26.8); ở đây khoá tên lớp của phần có ý nghĩa. MỖI lớp một khẳng định riêng
// (`not.toHaveClass(a, b)` yếu: AI-BUG-052). Ô nhập KHÔNG có lớp focus riêng: viền focus do lớp nền tảng `styles/index.css` lo. Dữ liệu giả.
const FOCUS_CLASS =
  /(?:^|\s)(?:focus|focus-visible|focus-within|ring|outline)[\w:-]*/;

function noOwnFocusClass(container: HTMLElement) {
  const offenders = [...container.querySelectorAll('[class]')]
    .map((element) => element.getAttribute('class') ?? '')
    .filter((value) => FOCUS_CLASS.test(value));
  expect(offenders).toEqual([]);
}

describe('doctor-exam F7 — sao và nhãn trạng thái (WKD-19)', () => {
  it('WKD-19 sao: năm sao, `role="img"` có tên "n sao", từng sao `aria-hidden`; sao đặc `amber-600`, sao viền `gray-500` (ký hiệu ≥ 3:1, ADR 0004)', () => {
    render(<ReviewStars value={3} />);
    const group = screen.getByRole('img', { name: '3 sao' });
    const stars = [...group.querySelectorAll('svg')];
    expect(stars).toHaveLength(5);
    for (const star of stars)
      expect(star).toHaveAttribute('aria-hidden', 'true');
    for (const star of stars.slice(0, 3)) {
      expect(star).toHaveClass('fill-current');
      expect(star).toHaveClass('text-amber-600');
      expect(star).not.toHaveClass('text-gray-500');
    }
    for (const star of stars.slice(3)) {
      expect(star).toHaveClass('text-gray-500');
      expect(star).not.toHaveClass('fill-current');
      expect(star).not.toHaveClass('text-amber-600');
    }
  });

  it('WKD-19 sao: cỡ 13 px ở bảng, 16 px ở hộp (Figma `514:407`, `570:892`); 0 và 5 sao đủ năm biểu tượng', () => {
    const { rerender } = render(<ReviewStars value={5} />);
    for (const star of screen.getByRole('img').querySelectorAll('svg')) {
      expect(star).toHaveClass('size-[13px]');
      expect(star).not.toHaveClass('size-[16px]');
    }
    rerender(<ReviewStars value={1} large />);
    for (const star of screen.getByRole('img').querySelectorAll('svg')) {
      expect(star).toHaveClass('size-[16px]');
      expect(star).not.toHaveClass('size-[13px]');
    }
  });

  it('WKD-19 nhãn trạng thái: "Hiển thị" xanh (`success`) và "Đã ẩn" đỏ (`danger-strong`); khác nhau cả chữ lẫn biểu tượng (không chỉ màu)', () => {
    const { container, rerender } = render(<ReviewStatusPill hidden={false} />);
    const shown = container.firstElementChild as HTMLElement;
    expect(shown).toHaveTextContent('Hiển thị');
    expect(shown).toHaveClass('bg-success-soft');
    expect(shown).toHaveClass('text-success');
    expect(shown).toHaveClass('border-success-surface');
    expect(shown).toHaveClass('rounded-full');
    expect(shown).not.toHaveClass('bg-danger-soft');
    expect(shown).not.toHaveClass('text-danger-strong');
    const shownIcon = shown.querySelector('svg')!;
    expect(shownIcon).toHaveAttribute('aria-hidden', 'true');
    expect(shownIcon).toHaveClass('lucide-eye');

    rerender(<ReviewStatusPill hidden />);
    const hidden = container.firstElementChild as HTMLElement;
    expect(hidden).toHaveTextContent('Đã ẩn');
    expect(hidden).toHaveClass('bg-danger-soft');
    expect(hidden).toHaveClass('text-danger-strong');
    expect(hidden).toHaveClass('border-red-100');
    expect(hidden).not.toHaveClass('bg-success-soft');
    expect(hidden).not.toHaveClass('text-success');
    expect(hidden.querySelector('svg')).toHaveClass('lucide-eye-off');
  });
});

describe('doctor-exam F7 — đầu trang và chip (WKD-19)', () => {
  it('WKD-19 đầu trang: h1 22,5 px đậm, dòng phụ `gray-500`; chip có tên nhóm, số in đậm, định dạng nghìn kiểu Việt Nam, màu theo trạng thái', () => {
    render(
      <ReviewsHeader
        subtitle="Toàn hệ thống"
        counts={{ HienThi: 1234, DaAn: 2 }}
      />,
    );
    const title = screen.getByRole('heading', { name: 'Kiểm duyệt đánh giá' });
    expect(title).toHaveClass('text-[22.5px]');
    expect(title).toHaveClass('font-bold');
    expect(screen.getByText('Toàn hệ thống')).toHaveClass('text-gray-500');
    const chips = within(
      screen.getByRole('list', { name: 'Số đánh giá theo trạng thái' }),
    ).getAllByRole('listitem');
    expect(chips.map((chip) => chip.textContent)).toEqual([
      '1.234 hiển thị',
      '2 đã ẩn',
    ]);
    expect(chips[0]).toHaveClass('bg-success-soft');
    expect(chips[0]).toHaveClass('text-success');
    expect(chips[0]).not.toHaveClass('bg-danger-soft');
    expect(chips[1]).toHaveClass('bg-danger-soft');
    expect(chips[1]).toHaveClass('text-danger-strong');
    expect(chips[1]).not.toHaveClass('bg-success-soft');
    expect(within(chips[0]).getByText('1.234')).toHaveClass('font-bold');
    for (const chip of chips) {
      expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('WKD-19 không có số đếm (chưa tải hay lỗi) ⇒ không nhóm chip', () => {
    render(<ReviewsHeader subtitle="Toàn hệ thống" counts={null} />);
    expect(
      screen.queryByRole('list', { name: 'Số đánh giá theo trạng thái' }),
    ).toBeNull();
  });
});

describe('doctor-exam F7 — thẻ lọc (WKD-19)', () => {
  const branches = [{ chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' }];
  const doctors = [{ bacSiId: '11', hoTen: 'Nguyễn Minh Anh' }];

  it('WKD-19 thẻ lọc: lưới bốn cột ở màn rộng, ô cao 38 px bo 9,375 px, nhãn chữ hoa 10 px; KHÔNG lớp focus riêng ở ô nhập', () => {
    const { container } = render(
      <ReviewsFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        branches={branches}
        doctors={doctors}
        doctorsFailed={false}
      />,
    );
    const grid = container.querySelector('.grid')!;
    expect(grid).toHaveClass('lg:grid-cols-4');
    expect(grid).toHaveClass('grid-cols-1');
    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toHaveClass('h-[38px]');
      expect(select).toHaveClass('rounded-[9.375px]');
      expect(select).toHaveClass('border-gray-200');
      expect(select.closest('label')).toHaveClass('uppercase');
      expect(select.closest('label')).toHaveClass('tracking-[1px]');
      expect(select.closest('label')).toHaveClass('text-gray-500');
    }
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    expect(screen.getByLabelText('Tìm kiếm')).toHaveAttribute(
      'placeholder',
      'Tên bệnh nhân hoặc nội dung...',
    );
    noOwnFocusClass(container);
  });

  it('WKD-19 ô chọn và ô tìm đặt lại `font-normal tracking-normal` (Chromium thấy ô kế thừa chữ đậm, giãn chữ của nhãn); ô tìm có kính lúp `aria-hidden`, chừa 30 px bên trái, chữ gợi ý `gray-500`', () => {
    render(
      <ReviewsFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        branches={branches}
        doctors={doctors}
        doctorsFailed={false}
      />,
    );
    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toHaveClass('font-normal');
      expect(select).toHaveClass('tracking-normal');
      expect(select).toHaveClass('px-[15px]');
    }
    const search = screen.getByLabelText('Tìm kiếm');
    expect(search).toHaveClass('font-normal');
    expect(search).toHaveClass('tracking-normal');
    expect(search).toHaveClass('pl-[30px]');
    expect(search).toHaveClass('h-[38px]');
    expect(search).toHaveClass('rounded-[9.375px]');
    expect(search).toHaveClass('placeholder:text-gray-500');
    const icon = search.parentElement!.querySelector('svg')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('pointer-events-none');
    expect(icon).toHaveClass('size-[13.125px]');
  });

  it('WKD-19 Admin Chi nhánh (không `branches`): ba ô chọn thay vì bốn, không ô Chi nhánh', () => {
    render(
      <ReviewsFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        doctors={doctors}
        doctorsFailed={false}
      />,
    );
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(screen.queryByLabelText('Chi nhánh')).toBeNull();
  });

  it('WKD-19 lỗi tải danh sách bác sĩ: dải `role="alert"` màu `danger-strong`', () => {
    render(
      <ReviewsFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        doctors={[]}
        doctorsFailed
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Không tải được danh sách bác sĩ.');
    expect(alert).toHaveClass('text-danger-strong');
  });
});

describe('doctor-exam F7 — bảng và hộp (WKD-19)', () => {
  it('WKD-19 bảng: nhận xét hai dòng, bẻ chuỗi dài, giữ xuống dòng; nút `Xem` có biểu tượng `aria-hidden` và KHÔNG lớp focus riêng', () => {
    const data: AdminReviewPage = {
      items: [item()],
      total: 1,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: { HienThi: 1, DaAn: 0 },
    };
    const { container } = render(
      <ReviewsTable
        data={data}
        page={1}
        onPageChange={vi.fn()}
        showBranch
        onOpen={vi.fn()}
      />,
    );
    const comment = screen.getByText(/Tốt, sẽ giới thiệu/);
    expect(comment).toHaveClass('line-clamp-2');
    expect(comment).toHaveClass('wrap-anywhere');
    expect(comment).toHaveClass('whitespace-pre-wrap');
    // Gốc rem của web là 15 px: `min-h-9` chỉ 33,75 px và `text-xs` chỉ 11,25 px, nên dùng px tường minh theo Figma (36 px; 12 px)
    expect(comment).toHaveClass('min-h-[36px]');
    expect(comment).not.toHaveClass('min-h-9');
    expect(screen.getByText('CLINIX Chi nhánh Quận 3')).toHaveClass(
      'text-[12px]',
    );
    expect(screen.getByText('28/05/2026')).toHaveClass('text-[12px]');
    expect(screen.getByText('CLINIX Chi nhánh Quận 3')).not.toHaveClass(
      'text-xs',
    );
    // Độ rộng cột là PIXEL của Figma (không phần trăm): khung hẹp thì bảng cuộn ngang trong khung thay vì bị bóp
    const widths = [...container.querySelectorAll('th')].map(
      (header) => (header as HTMLElement).style.width,
    );
    expect(widths).toEqual([
      '143.71px',
      '175.93px',
      '120.31px',
      '103.56px',
      '262.7px',
      '99.35px',
      '102.78px',
      '160.06px',
    ]);
    const view = screen.getByRole('button', {
      name: 'Xem đánh giá của Vũ Thị F về Nguyễn Minh Anh',
    });
    expect(view.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(view).toHaveClass('border-gray-200');
    noOwnFocusClass(container);
  });

  it('WKD-19 hộp: nhãn trường chữ hoa 10 px; "Nội dung" và "Lý do ẩn" bẻ chuỗi dài và giữ xuống dòng; mã lịch phông đơn cách; lưới hai cột từ màn nhỏ trở lên', () => {
    const detail = parseAdminReviewDetail(
      detailBody({ biAn: true, lyDoAn: 'Vi phạm' }),
    );
    const { container } = render(
      <ReviewDetailBody detail={detail} showBranch />,
    );
    const grid = container.querySelector('dl')!;
    expect(grid).toHaveClass('sm:grid-cols-2');
    expect(grid).toHaveClass('grid-cols-1');
    for (const label of container.querySelectorAll('dt')) {
      expect(label).toHaveClass('uppercase');
      expect(label).toHaveClass('tracking-[1px]');
      expect(label).toHaveClass('text-gray-500');
    }
    for (const body of [
      screen.getByText(/Tốt, sẽ giới thiệu/),
      screen.getByText('Vi phạm'),
    ]) {
      expect(body).toHaveClass('whitespace-pre-wrap');
      expect(body).toHaveClass('wrap-anywhere');
      expect(body).toHaveClass('bg-gray-50');
    }
    expect(screen.getByText(/CLX-20260611-00006/)).toHaveClass('font-mono');
    // Ba khối rộng ("Số sao", "Nội dung", "Lý do ẩn") cách khối trên 15 px (11,25 của lưới + 3,75), nhãn cao 15 px
    const wide = [...container.querySelectorAll('dl > div')].filter((field) =>
      field.className.includes('sm:col-span-2'),
    );
    expect(wide).toHaveLength(3);
    for (const field of wide) {
      expect(field).toHaveClass('pt-[3.75px]');
      expect(field.querySelector('dt')).toHaveClass('leading-[15px]');
    }
    expect(wide[0].querySelector('dd')).toHaveClass('pt-[5.625px]');
    expect(wide[1].querySelector('dd')).toHaveClass('pt-0');
    expect(wide[2].querySelector('dd')).toHaveClass('pt-0');
    noOwnFocusClass(container);
  });
});
