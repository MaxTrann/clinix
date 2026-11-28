import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdminDashboard, TrendPoint } from '../api/dashboard-api';
import { TREND_EMPTY_TEXT, TrendChart } from './trend-chart';

// dashboard F2 — khối "Xu hướng đăng ký khám" (PLAN dashboard 7.7: DBD-01…DBD-04, mức GỌN). Vẽ riêng component với dữ liệu giả đúng hình dạng `xuHuong`
// của B2. DBD-04 ở đây chỉ khoá CẤU TRÚC chống tràn (happy-dom không đo bố cục); đo thật 375 px là việc của X2 (DKT).

afterEach(cleanup);

type Trend = AdminDashboard['xuHuong'];

/** `count` ngày liên tiếp từ 01/12/2026 với số đếm cho trước (lặp lại nếu thiếu). */
function days(count: number, values: number[]): Trend {
  const diem: TrendPoint[] = Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10);
    return {
      tuNgay: date,
      denNgay: date,
      soLuong: values[i % values.length] ?? 0,
    };
  });
  return { donVi: 'Ngay', diem };
}

/** `count` tuần thứ Hai đến Chủ nhật từ 30/11/2026. */
function weeks(count: number): Trend {
  const diem: TrendPoint[] = Array.from({ length: count }, (_, i) => ({
    tuNgay: new Date(Date.UTC(2026, 10, 30 + 7 * i)).toISOString().slice(0, 10),
    denNgay: new Date(Date.UTC(2026, 10, 36 + 7 * i))
      .toISOString()
      .slice(0, 10),
    soLuong: i,
  }));
  return { donVi: 'Tuan', diem };
}

const bars = () => screen.getAllByTestId('trend-bar');
const heights = () => bars().map((bar) => Number(bar.getAttribute('height')));

describe('dashboard F2 — số cột và chiều cao (DBD-01)', () => {
  it('DBD-01: chuỗi D0 (3, 2, 1, 2, 0, 0, 1) ⇒ 7 cột, cao tỉ lệ theo đỉnh trục 3; trục ghi 0 đến 3', () => {
    render(<TrendChart trend={days(7, [3, 2, 1, 2, 0, 0, 1])} />);
    expect(bars()).toHaveLength(7);
    const h = heights();
    expect(h[0]).toBe(100);
    expect(h[1]).toBeCloseTo(66.667, 2);
    expect(h[2]).toBeCloseTo(33.333, 2);
    expect(h[4]).toBe(0);
    // Cột cao thì `y` thấp: đáy mọi cột cùng ở 100
    for (const bar of bars())
      expect(
        Number(bar.getAttribute('y')) + Number(bar.getAttribute('height')),
      ).toBeCloseTo(100, 6);
    expect(screen.queryByText(TREND_EMPTY_TEXT)).not.toBeInTheDocument();
  });

  it('DBD-01 (biên): toàn 0 ⇒ đủ cột cao 0, không NaN, hiện trục và thông báo', () => {
    render(<TrendChart trend={days(7, [0])} />);
    expect(heights()).toEqual([0, 0, 0, 0, 0, 0, 0]);
    for (const bar of bars()) expect(bar.getAttribute('y')).toBe('100');
    expect(screen.getByText(TREND_EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.getAllByTestId('trend-axis-label')).toHaveLength(7);
  });

  it('DBD-01 (biên): một điểm ⇒ một cột cao hết vùng vẽ; không điểm nào ⇒ không cột, vẫn có thông báo', () => {
    render(<TrendChart trend={days(1, [4])} />);
    expect(heights()).toEqual([100]);
    cleanup();
    render(<TrendChart trend={{ donVi: 'Ngay', diem: [] }} />);
    expect(screen.queryAllByTestId('trend-bar')).toHaveLength(0);
    expect(screen.getByText(TREND_EMPTY_TEXT)).toBeInTheDocument();
  });

  it('DBD-01: 62 điểm ngày ⇒ 62 cột, 7 nhãn trục; 53 điểm tuần ⇒ 53 cột, mọi chiều cao hữu hạn', () => {
    render(<TrendChart trend={days(62, [4, 0, 7, 1])} />);
    expect(bars()).toHaveLength(62);
    expect(screen.getAllByTestId('trend-axis-label')).toHaveLength(7);
    expect(Math.max(...heights())).toBeCloseTo(87.5, 6); // 7 trên đỉnh trục 8
    cleanup();
    render(<TrendChart trend={weeks(53)} />);
    expect(bars()).toHaveLength(53);
    expect(heights().every(Number.isFinite)).toBe(true);
    expect(heights()[0]).toBe(0);
    expect(heights()[52]).toBeCloseTo((52 / 60) * 100, 6); // đỉnh trục 60 (bước 20)
  });
});

describe('dashboard F2 — trợ năng và bảng số (DBD-02)', () => {
  it('DBD-02: biểu đồ là `img` có tên tóm tắt; chữ trục ẩn khỏi trình đọc màn hình', () => {
    render(<TrendChart trend={days(7, [3, 2, 1, 2, 0, 0, 1])} />);
    expect(
      screen.getByRole('img', {
        name: 'Xu hướng đăng ký khám theo ngày: tổng 9 lịch đặt mới; cao nhất 3 lịch, ngày 01/12/2026.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Xu hướng đăng ký khám' }),
    ).toBeInTheDocument();
    for (const label of screen.getAllByTestId('trend-axis-label'))
      expect(label.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('DBD-02: "Xem bảng số" là nút thật (tới được bằng Tab), mở đóng bảng, `aria-expanded` và `aria-controls` đúng', () => {
    render(<TrendChart trend={days(7, [3, 2, 1, 2, 0, 0, 1])} />);
    const toggle = screen.getByRole('button', { name: 'Xem bảng số' });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const controlled = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    );
    expect(controlled).not.toBeNull();

    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Ẩn bảng số');
    const table = screen.getByRole('table', {
      name: 'Số lịch đặt mới theo ngày',
    });
    expect(controlled).toContainElement(table);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Ngày', 'Số lịch đặt mới']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.textContent)).toEqual([
      '01/12/20263',
      '02/12/20262',
      '03/12/20261',
      '04/12/20262',
      '05/12/20260',
      '06/12/20260',
      '07/12/20261',
    ]);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('DBD-02: 62 điểm ⇒ bảng đủ 62 hàng dù trục chỉ ghi 7 nhãn', () => {
    render(<TrendChart trend={days(62, [1])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bảng số' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      63,
    );
  });
});

describe('dashboard F2 — đơn vị (DBD-03)', () => {
  it('DBD-03: đơn vị tuần ⇒ chú thích "theo tuần", nhãn trục ngày đầu tuần, bảng cột "Tuần"', () => {
    render(<TrendChart trend={weeks(3)} />);
    expect(
      screen.getByText(/theo tuần \(thứ Hai đến Chủ nhật\)/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('trend-axis-label').map((el) => el.textContent),
    ).toEqual(['30/11', '07/12', '14/12']);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bảng số' }));
    const table = screen.getByRole('table', {
      name: 'Số lịch đặt mới theo tuần',
    });
    expect(within(table).getAllByRole('columnheader')[0]).toHaveTextContent(
      'Tuần',
    );
    expect(
      within(table).getByRole('rowheader', {
        name: 'Tuần 07/12/2026 – 13/12/2026',
      }),
    ).toBeInTheDocument();
  });

  it('DBD-03: đơn vị ngày ⇒ nhãn "dd/mm" của từng ngày', () => {
    render(<TrendChart trend={days(3, [1])} />);
    expect(
      screen.getAllByTestId('trend-axis-label').map((el) => el.textContent),
    ).toEqual(['01/12', '02/12', '03/12']);
  });
});

describe('dashboard F2 — chống tràn ngang (DBD-04, cấu trúc)', () => {
  it('DBD-04: SVG co theo khung (`w-full`, viewBox, không chiều rộng cố định); khối `min-w-0`; bảng cuộn trong khung', () => {
    render(<TrendChart trend={days(62, [2])} />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveClass('w-full');
    expect(svg).not.toHaveAttribute('width');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    expect(screen.getByRole('region')).toHaveClass('min-w-0');
    expect(svg.parentElement).toHaveClass('min-w-0');
    fireEvent.click(screen.getByRole('button', { name: 'Xem bảng số' }));
    expect(screen.getByRole('table').parentElement).toHaveClass(
      'overflow-auto',
    );
  });
});
