import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExamRating } from '../api/patient-exam-types';
import { RatingSummary } from './rating-summary';

// doctor-exam F6, WDG-04, WDG-08, WDG-09, WDG-16, WDG-17: đánh giá ĐÃ GỬI (Figma `424:2`, `425:2`). happy-dom không đo kích thước: khoá TÊN LỚP, MỖI lớp một khẳng định (AI-BUG-052); kích thước thật đo ở Chromium (TRACKING 24.8). Dữ liệu giả.
const RATING: ExamRating = {
  soSao: 5,
  nhanXet: 'Bác sĩ rất tận tâm, giải thích rõ ràng và chi tiết.',
  thoiDiemTao: '2026-06-10T03:00:00.000Z',
};

const starIcons = () =>
  Array.from(screen.getByRole('img', { name: /sao$/ }).querySelectorAll('svg'));

describe('doctor-exam F6 — đánh giá đã gửi: nội dung (WDG-04, WDG-16)', () => {
  it('WDG-04 5 sao ⇒ ảnh có tên "5 sao", nhãn "Xuất sắc", ngày "10/06/2026" (giờ VN), nhận xét (Figma 424:2)', () => {
    render(<RatingSummary rating={RATING} />);
    expect(screen.getByRole('img', { name: '5 sao' })).toBeInTheDocument();
    expect(screen.getByText('Xuất sắc')).toBeInTheDocument();
    expect(screen.getByText('10/06/2026')).toBeInTheDocument();
    expect(screen.getByText(RATING.nhanXet!)).toBeInTheDocument();
  });

  it('WDG-04 3 sao ⇒ nhãn "Bình thường", ba sao ĐẶC và hai sao viền; tên "3 sao"', () => {
    render(<RatingSummary rating={{ ...RATING, soSao: 3 }} />);
    expect(screen.getByRole('img', { name: '3 sao' })).toBeInTheDocument();
    expect(screen.getByText('Bình thường')).toBeInTheDocument();
    const icons = starIcons();
    expect(icons).toHaveLength(5);
    icons.slice(0, 3).forEach((icon) => {
      expect(icon).toHaveClass('fill-current');
      expect(icon).toHaveClass('text-amber-600');
    });
    icons.slice(3).forEach((icon) => {
      expect(icon).not.toHaveClass('fill-current');
      expect(icon).toHaveClass('text-gray-500');
    });
  });

  it('WDG-16 đủ năm nhãn theo số sao', () => {
    const labels = ['Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Xuất sắc'];
    labels.forEach((label, index) => {
      const { unmount } = render(
        <RatingSummary rating={{ ...RATING, soSao: index + 1 }} />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });

  it('WDG-04 nhận xét `null`, rỗng hay chỉ khoảng trắng ⇒ KHÔNG có đoạn nhận xét (chỉ hàng sao, nhãn, ngày)', () => {
    for (const nhanXet of [null, '', '   \n ']) {
      const { container, unmount } = render(
        <RatingSummary rating={{ ...RATING, nhanXet }} />,
      );
      expect(container.querySelector('p')).toBeNull();
      expect(screen.getByText('Xuất sắc')).toBeInTheDocument();
      unmount();
    }
  });

  it('WDG-16 ngày gửi theo giờ Việt Nam: 17:00Z là ngày kế; không đọc được ⇒ bỏ ngày, không "NaN"', () => {
    const { rerender, container } = render(
      <RatingSummary
        rating={{ ...RATING, thoiDiemTao: '2026-06-10T17:00:00.000Z' }}
      />,
    );
    expect(screen.getByText('11/06/2026')).toBeInTheDocument();
    rerender(<RatingSummary rating={{ ...RATING, thoiDiemTao: 'hôm qua' }} />);
    expect(container.textContent).not.toContain('NaN');
    expect(screen.queryByText(/\d{2}\/\d{2}\/\d{4}/)).toBeNull();
  });

  it('WDG-16 số sao ngoài 1 đến 5 (không xảy ra qua bộ đọc): không in nhãn bịa', () => {
    render(<RatingSummary rating={{ ...RATING, soSao: 9 }} />);
    for (const label of ['Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Xuất sắc']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });
});

describe('doctor-exam F6 — đánh giá đã gửi: an toàn và Q19 (WDG-08, WDG-09)', () => {
  it('WDG-09 `<script>`, `<img onerror>`, thực thể HTML ⇒ hiện NGUYÊN VĂN là chữ, không phần tử lạ', () => {
    const text =
      '<script>alert(1)</script><img src=x onerror=alert(1)> &amp; &lt;b&gt;';
    const { container } = render(
      <RatingSummary rating={{ ...RATING, nhanXet: text }} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img:not([role])')).toBeNull();
    expect(container.querySelector('p')!.textContent).toBe(text);
  });

  it('WDG-09 xuống dòng giữ nguyên (`whitespace-pre-wrap`), chuỗi dài không dấu cách bẻ dòng (`wrap-anywhere`), emoji nguyên vẹn', () => {
    const text = `Dòng một\nDòng hai 😀\n${'A'.repeat(1000)}`;
    const { container } = render(
      <RatingSummary rating={{ ...RATING, nhanXet: text }} />,
    );
    const paragraph = container.querySelector('p')!;
    expect(paragraph.textContent).toBe(text);
    expect(paragraph).toHaveClass('whitespace-pre-wrap');
    expect(paragraph).toHaveClass('wrap-anywhere');
  });

  it('WDG-08 (Q19) đánh giá đã bị Admin ẩn hiện Y NHƯ chưa ẩn: khoá lạ `biAn`, `lyDoAn` không đổi giao diện, không chữ "đã ẩn", không lộ lý do', () => {
    const hidden = {
      ...RATING,
      biAn: true,
      lyDoAn: 'Nội dung spam',
    } as unknown as ExamRating;
    const { container } = render(<RatingSummary rating={hidden} />);
    expect(container.textContent).not.toMatch(/ẩn/i);
    expect(container.textContent).not.toContain('spam');
    expect(screen.getByText(RATING.nhanXet!)).toBeInTheDocument();
  });
});

describe('doctor-exam F6 — đánh giá đã gửi: khoá tên lớp (WDG-17)', () => {
  it('WDG-17 nhãn mức `text-warning` (không `text-amber-700`: dùng token), ngày `text-xs` và `text-gray-500`, hàng ngày căn hai đầu `justify-between`', () => {
    const { container } = render(<RatingSummary rating={RATING} />);
    const label = screen.getByText('Xuất sắc');
    expect(label).toHaveClass('text-warning');
    expect(label).toHaveClass('font-medium');
    expect(label).toHaveClass('text-sm');
    const date = screen.getByText('10/06/2026');
    expect(date).toHaveClass('text-gray-500');
    expect(date).toHaveClass('text-xs');
    expect(container.firstElementChild!.firstElementChild).toHaveClass(
      'justify-between',
    );
  });

  it('WDG-17 nhận xét `text-sm`, `leading-relaxed`, `text-gray-800`, cách hàng sao `pt-2`; mỗi sao 22,5 (`size-6`) trong ô `p-0.5`', () => {
    const { container } = render(<RatingSummary rating={RATING} />);
    const paragraph = container.querySelector('p')!;
    expect(paragraph).toHaveClass('text-sm');
    expect(paragraph).toHaveClass('leading-relaxed');
    expect(paragraph).toHaveClass('text-gray-800');
    expect(paragraph).toHaveClass('pt-2');
    for (const icon of starIcons()) {
      expect(icon).toHaveClass('size-6');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon.parentElement).toHaveClass('p-0.5');
    }
  });
});
