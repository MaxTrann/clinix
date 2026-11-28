import { describe, expect, it } from 'vitest';
import type { TrendPoint } from '../api/dashboard-api';
import {
  axisLabel,
  axisScale,
  barPercent,
  labelledIndexes,
  pointLabel,
  trendSummary,
} from './trend-scale';

// dashboard F2 — hàm thuần của biểu đồ xu hướng (PLAN dashboard 7.7: DBD-01, DBD-02, DBD-03). Dữ liệu giả.

const day = (tuNgay: string, soLuong: number): TrendPoint => ({
  tuNgay,
  denNgay: tuNgay,
  soLuong,
});

describe('dashboard F2 — thang trục (DBD-01)', () => {
  it('DBD-01: bước "đẹp", đỉnh trục ≥ số lớn nhất, vạch bắt đầu ở 0', () => {
    expect(axisScale(3)).toEqual({ top: 3, ticks: [0, 1, 2, 3] });
    expect(axisScale(7)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] });
    expect(axisScale(120)).toEqual({ top: 150, ticks: [0, 50, 100, 150] });
    expect(axisScale(1)).toEqual({ top: 1, ticks: [0, 1] });
  });

  it('DBD-01 (biên): toàn 0 ⇒ đỉnh 0, chỉ vạch 0; chiều cao cột 0, không NaN hay Infinity', () => {
    expect(axisScale(0)).toEqual({ top: 0, ticks: [0] });
    expect(barPercent(0, 0)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
    expect(barPercent(3, 4)).toBe(75);
  });
});

describe('dashboard F2 — nhãn (DBD-03)', () => {
  it('DBD-03: đơn vị ngày ⇒ "dd/mm" và ngày đầy đủ; tuần ⇒ ngày đầu tuần và "Tuần … – …"', () => {
    const week: TrendPoint = {
      tuNgay: '2026-11-30',
      denNgay: '2026-12-06',
      soLuong: 4,
    };
    expect(axisLabel(day('2026-12-03', 1))).toBe('03/12');
    expect(pointLabel(day('2026-12-03', 1), 'Ngay')).toBe('03/12/2026');
    expect(axisLabel(week)).toBe('30/11');
    expect(pointLabel(week, 'Tuan')).toBe('Tuần 30/11/2026 – 06/12/2026');
  });

  it('DBD-03: tuần bị cắt ở đầu khoảng (bắt đầu giữa tuần) vẫn ghi đúng hai đầu máy chủ trả', () => {
    expect(
      pointLabel(
        { tuNgay: '2026-12-03', denNgay: '2026-12-06', soLuong: 0 },
        'Tuan',
      ),
    ).toBe('Tuần 03/12/2026 – 06/12/2026');
  });

  it('DBD-01: nhãn trục ngang tối đa khoảng 7 nhãn: 7 điểm ⇒ đủ 7; 62 ⇒ cách 9; 53 ⇒ cách 8; 1 ⇒ [0]; 0 ⇒ []', () => {
    expect(labelledIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(labelledIndexes(62)).toEqual([0, 9, 18, 27, 36, 45, 54]);
    expect(labelledIndexes(53)).toEqual([0, 8, 16, 24, 32, 40, 48]);
    expect(labelledIndexes(1)).toEqual([0]);
    expect(labelledIndexes(0)).toEqual([]);
  });
});

describe('dashboard F2 — tên truy cập (DBD-02)', () => {
  it('DBD-02: chuỗi D0 ⇒ tổng 9 và ngày cao nhất 01/12 (điểm đầu khi bằng nhau)', () => {
    const d0 = [3, 2, 1, 2, 0, 0, 1].map((n, i) => day(`2026-12-0${i + 1}`, n));
    expect(trendSummary(d0, 'Ngay')).toBe(
      'Xu hướng đăng ký khám theo ngày: tổng 9 lịch đặt mới; cao nhất 3 lịch, ngày 01/12/2026.',
    );
    expect(
      trendSummary([day('2026-12-01', 2), day('2026-12-02', 2)], 'Ngay'),
    ).toContain('ngày 01/12/2026');
  });

  it('DBD-02: theo tuần ⇒ nêu tuần cao nhất; toàn 0 hay không điểm ⇒ câu "chưa có"', () => {
    expect(
      trendSummary(
        [
          { tuNgay: '2026-11-30', denNgay: '2026-12-06', soLuong: 1200 },
          { tuNgay: '2026-12-07', denNgay: '2026-12-13', soLuong: 5 },
        ],
        'Tuan',
      ),
    ).toBe(
      'Xu hướng đăng ký khám theo tuần: tổng 1.205 lịch đặt mới; cao nhất 1.200 lịch, tuần 30/11/2026 – 06/12/2026.',
    );
    expect(trendSummary([day('2026-12-01', 0)], 'Ngay')).toBe(
      'Xu hướng đăng ký khám theo ngày: chưa có lịch đặt mới nào.',
    );
    expect(trendSummary([], 'Tuan')).toBe(
      'Xu hướng đăng ký khám theo tuần: chưa có lịch đặt mới nào.',
    );
  });
});
