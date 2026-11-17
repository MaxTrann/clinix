import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminReviewItem } from '../api/admin-review-types';
import { HideDialog } from './hide-dialog';
import { ReviewRowActions } from './review-row-actions';
import { ReviewStars } from './review-stars';
import { ReviewsNotice } from './reviews-notice';

// doctor-exam F8, WKD-28 [đề xuất]: bố cục, trợ năng và khoá TÊN LỚP của hộp "Ẩn đánh giá", nút `Ẩn` ở hàng và thông báo. `vitest` chạy `css: false` nên KÍCH THƯỚC THẬT chỉ Chromium thấy (đo ở TRACKING 28.8); ở đây khoá tên lớp của phần có ý nghĩa.
// Gốc rem của dự án là 15 px nên khớp Figma `571:2` bằng px tường minh. MỖI lớp một khẳng định riêng (`not.toHaveClass(a, b)` yếu: AI-BUG-052). Ô nhập KHÔNG có lớp focus riêng: viền focus do lớp nền tảng `styles/index.css` lo. Dữ liệu giả.
const FOCUS_CLASS =
  /(?:^|\s)(?:focus|focus-visible|focus-within|ring|outline)[\w:-]*/;

function noOwnFocusClass(container: HTMLElement) {
  const offenders = [...container.querySelectorAll('[class]')]
    .map((element) => element.getAttribute('class') ?? '')
    .filter((value) => FOCUS_CLASS.test(value));
  expect(offenders).toEqual([]);
}

const ITEM: AdminReviewItem = {
  danhGiaId: '41',
  bacSi: { bacSiId: '11', hoTen: 'Nguyễn Minh Anh' },
  chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' },
  nguoiDanhGia: { hoTen: 'Vũ Thị F' },
  soSao: 4,
  nhanXet: 'Tốt, sẽ giới thiệu cho bạn bè.',
  thoiDiemTao: '2026-05-28T03:00:00.000Z',
  biAn: false,
};

function renderDialog() {
  const view = render(
    <HideDialog
      item={ITEM}
      returnFocusRef={{ current: null }}
      onClose={vi.fn()}
      onHidden={vi.fn()}
      onSettled={vi.fn()}
      onReload={vi.fn()}
    />,
  );
  return { ...view, box: screen.getByRole('dialog', { name: 'Ẩn đánh giá' }) };
}

describe('doctor-exam F8 — khung hộp "Ẩn đánh giá" (WKD-28; Figma 571:836)', () => {
  it('WKD-28 hộp rộng tối đa 420 px (Figma `571:836`, không phải 480 của hộp chi tiết), có nút ×, thân cuộn dọc TRONG hộp và chân nút nằm ngoài vùng cuộn', () => {
    const { box } = renderDialog();
    expect(box).toHaveClass('max-w-[420px]');
    expect(box).not.toHaveClass('max-w-[480px]');
    const form = box.querySelector('form')!;
    expect(form).toHaveClass('min-h-0');
    expect(form).toHaveClass('flex-col');
    const body = form.firstElementChild as HTMLElement;
    expect(body).toHaveClass('overflow-y-auto');
    expect(body).toHaveClass('px-[22.5px]');
    expect(body).toHaveClass('py-[18.75px]');
    expect(body).toHaveClass('gap-[15px]');
    const footer = form.lastElementChild as HTMLElement;
    expect(footer).not.toHaveClass('overflow-y-auto');
    expect(footer).toHaveClass('border-t');
    expect(footer).toHaveClass('justify-end');
    expect(footer).toHaveClass('gap-[7.5px]');
    expect(footer).toHaveClass('px-[22.5px]');
    expect(footer).toHaveClass('py-[15px]');
  });

  it('WKD-28 khung tóm tắt: nền `gray-50`, viền `gray-100`, bo 13,375; tên bác sĩ `gray-800` đậm vừa; dòng người đặt `gray-500` 11,25; nhận xét một dòng (`truncate`) `gray-600`; sao 12 px', () => {
    const { box } = renderDialog();
    const doctor = within(box).getByText('Nguyễn Minh Anh');
    const card = doctor.parentElement as HTMLElement;
    expect(card).toHaveClass('bg-gray-50');
    expect(card).toHaveClass('border-gray-100');
    expect(card).toHaveClass('rounded-[13.375px]');
    expect(card).toHaveClass('px-[15px]');
    expect(card).toHaveClass('py-[11.25px]');
    expect(doctor).toHaveClass('font-medium');
    expect(doctor).toHaveClass('text-gray-800');
    expect(doctor).toHaveClass('wrap-anywhere');
    const meta = within(box).getByText('· Vũ Thị F · 28/05/2026');
    expect(meta).toHaveClass('text-gray-500');
    expect(meta).toHaveClass('text-[11.25px]');
    expect(meta).toHaveClass('wrap-anywhere');
    expect(meta).not.toHaveClass('text-xs');
    const comment = within(box).getByText('Tốt, sẽ giới thiệu cho bạn bè.');
    expect(comment).toHaveClass('truncate');
    expect(comment).toHaveClass('text-gray-600');
    expect(comment).toHaveClass('text-[11.25px]');
    for (const star of within(box)
      .getByRole('img', { name: '4 sao' })
      .querySelectorAll('svg')) {
      expect(star).toHaveClass('size-[12px]');
      expect(star).not.toHaveClass('size-[13px]');
      expect(star).not.toHaveClass('size-[16px]');
    }
  });

  it('WKD-28 khung cảnh báo: nền `amber-50`, viền `amber-100`, chữ `gray-600` 13,125 dòng 18,75 (Figma `571:871`)', () => {
    const { box } = renderDialog();
    const warning = within(box).getByText(
      /Đánh giá sẽ không còn hiển thị công khai/,
    );
    expect(warning).toHaveClass('bg-amber-50');
    expect(warning).toHaveClass('border-amber-100');
    expect(warning).toHaveClass('text-gray-600');
    expect(warning).toHaveClass('text-[13.125px]');
    expect(warning).toHaveClass('leading-[18.75px]');
    expect(warning).toHaveClass('rounded-[13.375px]');
    expect(warning).not.toHaveClass('bg-white');
  });

  it('WKD-28 ô lý do: nhãn `gray-700` đậm vừa, ô `rows` 3 cao tối thiểu 76,6, bo 13,375, viền `gray-300`, gợi ý `gray-500` (ADR 0004), `aria-invalid` đổi viền đỏ; KHÔNG lớp focus riêng ở bất kỳ phần tử nào của hộp', () => {
    const { box } = renderDialog();
    const label = within(box).getByText(/^Lý do ẩn/, { selector: 'label' });
    expect(label).toHaveClass('font-medium');
    expect(label).toHaveClass('text-gray-700');
    expect(label).toHaveClass('text-[13.125px]');
    const input = within(box).getByLabelText(/^Lý do ẩn/);
    expect(input).toHaveAttribute('rows', '3');
    expect(input).toHaveClass('min-h-[76.6px]');
    expect(input).toHaveClass('rounded-[13.375px]');
    expect(input).toHaveClass('border-gray-300');
    expect(input).toHaveClass('placeholder:text-gray-500');
    expect(input).toHaveClass('aria-[invalid=true]:border-danger');
    expect(input).toHaveClass('px-[15px]');
    expect(input).toHaveClass('py-[9.375px]');
    expect(input).toHaveClass('text-[13.125px]');
    expect(input).toHaveClass('leading-[18.75px]');
    expect(input).toHaveClass('resize-y');
    expect(input).not.toHaveClass('focus:ring-2');
    noOwnFocusClass(box);
  });

  it('WKD-28 hai nút chân hộp: cao 33,75, bo 13,375; `Hủy` nền `gray-100` chữ `gray-700`; `Xác nhận ẩn` nền `danger-strong` (6,42:1; KHÔNG `#e7000b` 4,36:1) chữ trắng, biểu tượng mắt gạch 15 `aria-hidden`; mờ khi `disabled`', () => {
    const { box } = renderDialog();
    const cancel = within(box).getByRole('button', { name: 'Hủy' });
    expect(cancel).toHaveClass('h-[33.75px]');
    expect(cancel).toHaveClass('rounded-[13.375px]');
    expect(cancel).toHaveClass('bg-gray-100');
    expect(cancel).toHaveClass('text-gray-700');
    expect(cancel).toHaveClass('px-[15px]');
    expect(cancel).not.toHaveClass('bg-danger-strong');
    const confirm = within(box).getByRole('button', { name: 'Xác nhận ẩn' });
    expect(confirm).toHaveClass('h-[33.75px]');
    expect(confirm).toHaveClass('bg-danger-strong');
    expect(confirm).toHaveClass('text-white');
    expect(confirm).toHaveClass('gap-[5.625px]');
    expect(confirm).toHaveClass('disabled:opacity-60');
    expect(confirm).not.toHaveClass('bg-[#e7000b]');
    expect(confirm).not.toHaveClass('bg-gray-100');
    const icon = confirm.querySelector('svg')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('lucide-eye-off');
    expect(icon).toHaveClass('size-[15px]');
  });

  it('WKD-28 bộ đếm cỡ 11,25 cách ô 6,5 và nằm bên phải; lỗi theo ô `danger-strong` 11,25 `role="alert"` nằm bên trái cùng hàng với bộ đếm', () => {
    const { box } = renderDialog();
    const counter = within(box).getByText('0/255');
    expect(counter).toHaveClass('text-[11.25px]');
    expect(counter).toHaveClass('ml-auto');
    expect(counter.parentElement).toHaveClass('mt-[6.5px]');
    expect(counter.parentElement).toHaveClass('justify-between');
    fireEvent.click(within(box).getByRole('button', { name: 'Xác nhận ẩn' }));
    const error = within(box).getByRole('alert');
    expect(error).toHaveClass('text-danger-strong');
    expect(error).toHaveClass('text-[11.25px]');
    expect(error.parentElement).toBe(counter.parentElement);
  });
});

describe('doctor-exam F8 — nút `Ẩn` ở hàng và thông báo (WKD-28)', () => {
  it('WKD-28 nút `Ẩn` ở hàng: viền `danger-line`, chữ `danger-strong` 11,25 (Figma `514:439`), biểu tượng mắt gạch 13,125 `aria-hidden`; nút `Xem` giữ viền `gray-200`; hai nút cách nhau 7,5; KHÔNG lớp focus riêng', () => {
    const { container } = render(
      <ReviewRowActions item={ITEM} onOpen={vi.fn()} onHide={vi.fn()} />,
    );
    const hide = screen.getByRole('button', {
      name: 'Ẩn đánh giá của Vũ Thị F về Nguyễn Minh Anh',
    });
    expect(hide).toHaveClass('border-danger-line');
    expect(hide).toHaveClass('text-danger-strong');
    expect(hide).toHaveClass('text-[11.25px]');
    expect(hide).toHaveClass('rounded-[9.375px]');
    expect(hide).toHaveClass('hover:bg-danger-soft');
    expect(hide).not.toHaveClass('border-gray-200');
    expect(hide).not.toHaveClass('text-gray-600');
    const icon = hide.querySelector('svg')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('lucide-eye-off');
    expect(icon).toHaveClass('size-[13.125px]');
    const view = screen.getByRole('button', {
      name: 'Xem đánh giá của Vũ Thị F về Nguyễn Minh Anh',
    });
    expect(view).toHaveClass('border-gray-200');
    expect(view).not.toHaveClass('border-danger-line');
    expect(hide.parentElement).toHaveClass('gap-[7.5px]');
    expect(hide.textContent).toBe('Ẩn');
    noOwnFocusClass(container);
  });

  it('WKD-28 hàng Đã ẩn: chỉ nút `Xem` (đột biến đảo điều kiện sẽ làm ca này đỏ)', () => {
    render(
      <ReviewRowActions
        item={{ ...ITEM, biAn: true }}
        onOpen={vi.fn()}
        onHide={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('Ẩn', { selector: 'button' })).toBeNull();
  });

  it('WKD-28 thông báo: `role="status"` có `tabindex="-1"` (nhận tiêu điểm bằng mã), xanh `success` cho "đã ẩn", xám cho "đã được ẩn", "không tìm thấy" và "đã tải lại" (không đỏ)', () => {
    const { rerender } = render(<ReviewsNotice notice={{ kind: 'hidden' }} />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveAttribute('tabindex', '-1');
    expect(notice).toHaveTextContent('Đã ẩn đánh giá.');
    expect(notice).toHaveClass('bg-success-soft');
    expect(notice).toHaveClass('text-success');
    expect(notice).not.toHaveClass('text-danger-strong');
    expect(document.activeElement).toBe(notice);
    for (const [kind, text] of [
      ['already', 'Đánh giá này đã được ẩn.'],
      ['gone', 'Không tìm thấy đánh giá này.'],
      ['reloaded', 'Đã tải lại danh sách.'],
    ] as const) {
      rerender(<ReviewsNotice notice={{ kind }} />);
      const next = screen.getByRole('status');
      expect(next).toHaveTextContent(text);
      expect(next).toHaveClass('bg-gray-50');
      expect(next).toHaveClass('text-gray-700');
      expect(next).not.toHaveClass('bg-success-soft');
      expect(next).not.toHaveClass('text-danger-strong');
    }
  });

  it('WKD-28 sao cỡ 12 chỉ khi `small`; mặc định 13, `large` 16 (cỡ của F7 không đổi)', () => {
    const { rerender } = render(<ReviewStars value={5} />);
    for (const star of screen.getByRole('img').querySelectorAll('svg')) {
      expect(star).toHaveClass('size-[13px]');
      expect(star).not.toHaveClass('size-[12px]');
    }
    rerender(<ReviewStars value={5} small />);
    for (const star of screen.getByRole('img').querySelectorAll('svg')) {
      expect(star).toHaveClass('size-[12px]');
      expect(star).not.toHaveClass('size-[13px]');
    }
    rerender(<ReviewStars value={5} large />);
    for (const star of screen.getByRole('img').querySelectorAll('svg')) {
      expect(star).toHaveClass('size-[16px]');
      expect(star).not.toHaveClass('size-[12px]');
    }
  });
});
