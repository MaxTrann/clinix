import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../../../../shared/api/errors';
import { RatingSection } from './rating-section';
import { detailOf, RATING } from './testing/render-sections';

// doctor-exam F6, WDG-01, WDG-08, WDG-15, WDG-17: thẻ "Đánh giá bác sĩ" ở cột phải (Figma `422:2` đến `425:2`). Trạng thái cho thẳng qua props (không qua mạng; luồng đủ ở `patient-exam-sections.test.tsx`). `fetch` bị khoá: thẻ không được tự gọi API khi chưa mở form.
type Props = ComponentProps<typeof RatingSection>;

afterEach(() => vi.unstubAllGlobals());

function renderSection(props: Partial<Props> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Thẻ không được gọi fetch khi chưa gửi');
    }),
  );
  const handlers = {
    onRated: vi.fn(),
    onAlreadyRated: vi.fn(),
    onRetry: vi.fn(),
  };
  const base: Props = {
    state: { status: 'ready', data: detailOf() },
    maLichHen: 'CLX-S1',
    rated: null,
    notice: null,
    ...handlers,
  };
  const view = render(<RatingSection {...base} {...props} />);
  return {
    ...handlers,
    ...view,
    // Cùng cây React: giữ state của thẻ (form đang mở) khi props đổi
    rerenderWith: (next: Partial<Props>) =>
      view.rerender(<RatingSection {...base} {...props} {...next} />),
  };
}

const rateNow = () => screen.queryByRole('button', { name: 'Đánh giá ngay' });
const ready = (
  overrides: Parameters<typeof detailOf>[0] = {},
): Props['state'] => ({
  status: 'ready',
  data: detailOf(overrides),
});

describe('doctor-exam F6 — thẻ đánh giá: `Đánh giá ngay` CHỈ khi `coTheDanhGia` (WDG-01)', () => {
  it('WDG-01 chưa đánh giá (`coTheDanhGia: true`) ⇒ câu "Bạn chưa đánh giá bác sĩ cho buổi khám này." và nút `Đánh giá ngay`; chưa có form', () => {
    renderSection();
    expect(
      screen.getByRole('region', { name: 'Đánh giá bác sĩ' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Bạn chưa đánh giá bác sĩ cho buổi khám này.'),
    ).toBeInTheDocument();
    expect(rateNow()).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('WDG-01 đã đánh giá (`coTheDanhGia: false`) ⇒ KHÔNG nút, KHÔNG câu "chưa đánh giá"', () => {
    renderSection({
      state: ready({ danhGia: RATING, coTheDanhGia: false }),
    });
    expect(rateNow()).toBeNull();
    expect(screen.queryByText(/chưa đánh giá/)).toBeNull();
  });

  it('WDG-01 không dữ liệu (`ready` mà `null`), đang tải, lỗi ⇒ KHÔNG nút', () => {
    const { unmount } = renderSection({
      state: { status: 'ready', data: null },
    });
    expect(rateNow()).toBeNull();
    unmount();
    const loading = renderSection({ state: { status: 'loading' } });
    expect(rateNow()).toBeNull();
    loading.unmount();
    renderSection({ state: { status: 'error', error: new NetworkError() } });
    expect(rateNow()).toBeNull();
  });

  it('WDG-01 bấm `Đánh giá ngay` ⇒ mở form tại chỗ (câu và nút biến mất), tiêu điểm vào ô sao đầu', () => {
    renderSection();
    fireEvent.click(rateNow()!);
    expect(
      screen.getByRole('radiogroup', { name: 'Số sao' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(rateNow()).toBeNull();
    expect(screen.queryByText(/chưa đánh giá/)).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: '1 sao' }),
    );
  });
});

describe('doctor-exam F6 — thẻ đánh giá: huỷ, đã đánh giá, đang tải, lỗi (WDG-08, WDG-15)', () => {
  it('WDG-15 `Huỷ` đóng form, trả tiêu điểm về `Đánh giá ngay`; mở lại là form TRỐNG (sao và nhận xét cũ bỏ hết)', () => {
    renderSection();
    fireEvent.click(rateNow()!);
    fireEvent.click(screen.getByRole('radio', { name: '3 sao' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Nội dung sẽ bỏ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(rateNow()).toBeInTheDocument();
    expect(document.activeElement).toBe(rateNow());

    fireEvent.click(rateNow()!);
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(
      screen
        .getAllByRole('radio')
        .filter((element) => element.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(0);
  });

  it('WDG-08 đã đánh giá ⇒ hiện đánh giá (sao, nhãn, ngày, nhận xét), KHÔNG form, KHÔNG `Đánh giá ngay`', () => {
    renderSection({ state: ready({ danhGia: RATING, coTheDanhGia: false }) });
    expect(screen.getByRole('img', { name: '5 sao' })).toBeInTheDocument();
    expect(screen.getByText('Xuất sắc')).toBeInTheDocument();
    expect(screen.getByText('10/06/2026')).toBeInTheDocument();
    expect(screen.getByText(RATING.nhanXet!)).toBeInTheDocument();
    expect(rateNow()).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('WDG-08 vừa gửi xong (`rated`) ⇒ hiện đánh giá vừa gửi dù chi tiết đã tải còn `coTheDanhGia: true`; KHÔNG nút, KHÔNG form', () => {
    renderSection({ rated: { ...RATING, soSao: 2, nhanXet: null } });
    expect(screen.getByRole('img', { name: '2 sao' })).toBeInTheDocument();
    expect(screen.getByText('Tệ')).toBeInTheDocument();
    expect(rateNow()).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('WDG-08 gửi xong khi form đang mở ⇒ form biến mất (không còn gửi lần hai)', () => {
    const view = renderSection();
    fireEvent.click(rateNow()!);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    view.rerenderWith({ rated: RATING, notice: 'sent' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(rateNow()).toBeNull();
  });

  it('WDG-15 `notice`: "Đã gửi đánh giá của bạn." (`sent`) hay "Bạn đã đánh giá buổi khám này." (`already`) là `role="status"` và NHẬN TIÊU ĐIỂM; không hiện khi chưa có đánh giá để hiện', () => {
    const sent = renderSection({ rated: RATING, notice: 'sent' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Đã gửi đánh giá của bạn.');
    expect(document.activeElement).toBe(status);
    expect(status).toHaveClass('text-success');
    sent.unmount();

    const already = renderSection({
      state: ready({ danhGia: RATING, coTheDanhGia: false }),
      notice: 'already',
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Bạn đã đánh giá buổi khám này.',
    );
    already.unmount();

    renderSection({ notice: 'sent' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('WDG-15 đang tải ⇒ "Đang tải đánh giá..." (`role="status"`), thẻ vẫn có tiêu đề; lỗi ⇒ hộp lỗi và `Thử lại` gọi `onRetry`', () => {
    const loading = renderSection({ state: { status: 'loading' } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải đánh giá...',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Đánh giá bác sĩ' }),
    ).toBeInTheDocument();
    loading.unmount();

    const failing = renderSection({
      state: { status: 'error', error: new NetworkError() },
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(failing.onRetry).toHaveBeenCalledTimes(1);
  });

  it('WDG-15 lỗi 404 `KHONG_TIM_THAY` ⇒ câu riêng, KHÔNG `Thử lại`', () => {
    renderSection({
      state: {
        status: 'error',
        error: new ApiError(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không tìm thấy ca khám này.',
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('doctor-exam F6 — thẻ đánh giá: khoá tên lớp (WDG-17)', () => {
  it('WDG-17 nút `Đánh giá ngay`: `bg-brand-strong` (không `bg-brand`), chữ trắng 15 (`text-base`) đậm, cao `h-12`, đệm `px-6`, bo 13,375; câu `text-gray-600`', () => {
    renderSection();
    const button = rateNow()!;
    expect(button).toHaveClass('bg-brand-strong');
    expect(button).not.toHaveClass('bg-brand');
    expect(button).toHaveClass('text-white');
    expect(button).toHaveClass('text-base');
    expect(button).toHaveClass('font-semibold');
    expect(button).toHaveClass('h-12');
    expect(button).toHaveClass('px-6');
    expect(button).toHaveClass('rounded-[13.375px]');
    expect(screen.getByText(/chưa đánh giá/)).toHaveClass('text-gray-600');
  });

  it('WDG-17 khung thẻ: viền `border-gray-200`, bo `rounded-2xl`, tiêu đề `h2` cùng lớp các thẻ khác (`px-5 py-3.5 font-semibold`), biểu tượng `aria-hidden`', () => {
    renderSection();
    const card = screen.getByRole('region', { name: 'Đánh giá bác sĩ' });
    expect(card).toHaveClass('border-gray-200');
    expect(card).toHaveClass('rounded-2xl');
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveClass('px-5');
    expect(heading).toHaveClass('py-3.5');
    expect(heading).toHaveClass('font-semibold');
    expect(heading.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
