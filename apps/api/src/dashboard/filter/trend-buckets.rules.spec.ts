import { buildTrend } from './trend-buckets.rules.js';

// dashboard B2 — DXH-03 (PLAN dashboard 7.4; Q5, T8): gom điểm xu hướng theo ngày (tới 62 ngày) hay theo tuần thứ Hai đến Chủ nhật, cắt hai đầu, đủ điểm 0.

const none = new Map<string, number>();

describe('dashboard B2 — gom điểm xu hướng (hàm thuần)', () => {
  it('DXH-03: 62 ngày ⇒ 62 điểm theo NGÀY; 63 ngày ⇒ theo TUẦN', () => {
    // 01/12/2026 đến 31/01/2027 là 62 ngày
    const daily = buildTrend(
      { tuNgay: '2026-12-01', denNgay: '2027-01-31' },
      none,
    );
    expect(daily.donVi).toBe('Ngay');
    expect(daily.diem).toHaveLength(62);
    expect(daily.diem[0]).toStrictEqual({
      tuNgay: '2026-12-01',
      denNgay: '2026-12-01',
      soLuong: 0,
    });
    expect(daily.diem.at(-1)?.denNgay).toBe('2027-01-31');
    const weekly = buildTrend(
      { tuNgay: '2026-12-01', denNgay: '2027-02-01' },
      none,
    );
    expect(weekly.donVi).toBe('Tuan');
  });

  it('DXH-03: khoảng bắt đầu GIỮA tuần ⇒ tuần đầu và tuần cuối bị cắt theo hai đầu; tuần giữa đủ thứ Hai đến Chủ nhật; tuần không có lịch là 0', () => {
    // 02/12/2026 là thứ Tư; 04/02/2027 là thứ Năm
    const perDay = new Map([
      ['2026-12-02', 2],
      ['2026-12-06', 1],
      ['2026-12-07', 4],
      ['2027-02-04', 3],
    ]);
    const trend = buildTrend(
      { tuNgay: '2026-12-02', denNgay: '2027-02-04' },
      perDay,
    );
    expect(trend.donVi).toBe('Tuan');
    expect(trend.diem[0]).toStrictEqual({
      tuNgay: '2026-12-02',
      denNgay: '2026-12-06',
      soLuong: 3,
    });
    expect(trend.diem[1]).toStrictEqual({
      tuNgay: '2026-12-07',
      denNgay: '2026-12-13',
      soLuong: 4,
    });
    expect(trend.diem[2]).toStrictEqual({
      tuNgay: '2026-12-14',
      denNgay: '2026-12-20',
      soLuong: 0,
    });
    expect(trend.diem.at(-1)).toStrictEqual({
      tuNgay: '2027-02-01',
      denNgay: '2027-02-04',
      soLuong: 3,
    });
    // Các điểm nối liền, không hở không chồng, và tổng bằng tổng từng ngày
    for (let i = 1; i < trend.diem.length; i += 1) {
      const previousEnd = new Date(`${trend.diem[i - 1]?.denNgay}T00:00:00Z`);
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      expect(trend.diem[i]?.tuNgay).toBe(
        previousEnd.toISOString().slice(0, 10),
      );
    }
    expect(trend.diem.reduce((sum, point) => sum + point.soLuong, 0)).toBe(10);
  });

  it('DXH-03: khoảng bắt đầu đúng thứ Hai và kết thúc đúng Chủ nhật ⇒ mọi tuần đủ bảy ngày', () => {
    // 07/12/2026 thứ Hai, 14/02/2027 Chủ nhật: 70 ngày, 10 tuần
    const trend = buildTrend(
      { tuNgay: '2026-12-07', denNgay: '2027-02-14' },
      none,
    );
    expect(trend.diem).toHaveLength(10);
    expect(trend.diem.every((point) => point.soLuong === 0)).toBe(true);
    expect(trend.diem.at(-1)).toStrictEqual({
      tuNgay: '2027-02-08',
      denNgay: '2027-02-14',
      soLuong: 0,
    });
  });

  it('DXH-03: một ngày ⇒ một điểm', () => {
    expect(
      buildTrend(
        { tuNgay: '2026-12-04', denNgay: '2026-12-04' },
        new Map([['2026-12-04', 5]]),
      ),
    ).toStrictEqual({
      donVi: 'Ngay',
      diem: [{ tuNgay: '2026-12-04', denNgay: '2026-12-04', soLuong: 5 }],
    });
  });
});
