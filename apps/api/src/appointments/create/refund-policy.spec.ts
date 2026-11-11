import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  buildRefundPolicySnapshot,
  RefundPolicyReader,
  toRefundPolicyView,
} from './refund-policy.js';

// Task B7 — chính sách hoàn tiền của `tomTat` (BCK-03; TRACKING booking 3.18 B7-E, câu (i)). Hàm thuần dựng snapshot và bản nhìn API, cùng `RefundPolicyReader` với `EntityManager` giả
// (không DB). Bảng `moc_hoan_tien` thật: refund-policy.int-spec.ts (BCK-04). Mã BCK-nn là [đề xuất].
const tier = (soGioTruocToiThieu: number, tyLeHoan: number) => ({
  soGioTruocToiThieu,
  tyLeHoan,
});

describe('buildRefundPolicySnapshot: ba trường hợp (Q15, Q16)', () => {
  it('BCK-03 cọc 0 ⇒ null, dù bảng có mốc (không chính sách khi không cọc)', () => {
    expect(buildRefundPolicySnapshot('0.00', [tier(24, 100)])).toBeNull();
    expect(buildRefundPolicySnapshot('0.00', [])).toBeNull();
  });

  it('BCK-03 cọc > 0 và chưa có mốc ⇒ mảng RỖNG (= không hoàn), khác null', () => {
    const snapshot = buildRefundPolicySnapshot('50000.00', []);

    expect(snapshot).toStrictEqual([]);
    expect(snapshot).not.toBeNull();
  });

  it('BCK-03 cọc > 0 có mốc ⇒ giảm dần theo số giờ, dù đầu vào lộn thứ tự', () => {
    const snapshot = buildRefundPolicySnapshot('50000.00', [
      tier(2, 50),
      tier(24, 100),
      tier(0, 0),
    ]);

    expect(snapshot).toStrictEqual([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
      { so_gio_truoc_toi_thieu: 0, ty_le_hoan: 0 },
    ]);
  });

  it('BCK-03 snapshot giữ khoá snake_case của schema và là SỐ NGUYÊN (không thành chuỗi)', () => {
    const [first] = buildRefundPolicySnapshot('1.00', [tier(24, 100)]) ?? [];

    expect(Object.keys(first ?? {})).toStrictEqual([
      'so_gio_truoc_toi_thieu',
      'ty_le_hoan',
    ]);
    expect(typeof first?.so_gio_truoc_toi_thieu).toBe('number');
    expect(typeof first?.ty_le_hoan).toBe('number');
  });

  it('BCK-03 không đổi đầu vào (mảng mốc giữ nguyên thứ tự)', () => {
    const input = Object.freeze([tier(2, 50), tier(24, 100)]);

    expect(() => buildRefundPolicySnapshot('10.00', input)).not.toThrow();
    expect(input.map((t) => t.soGioTruocToiThieu)).toStrictEqual([2, 24]);
  });

  it.each([
    { tienCoc: '0.00', coChinhSach: false },
    { tienCoc: '0', coChinhSach: false },
    { tienCoc: '0.0', coChinhSach: false },
    { tienCoc: '00', coChinhSach: false },
    { tienCoc: '0.01', coChinhSach: true },
    { tienCoc: '0.10', coChinhSach: true },
    { tienCoc: '1', coChinhSach: true },
    { tienCoc: '50000.00', coChinhSach: true },
  ])(
    'BCK-03 biên của cọc "$tienCoc" (so bằng toCents, không bằng số thực) ⇒ có chính sách: $coChinhSach',
    ({ tienCoc, coChinhSach }) => {
      const snapshot = buildRefundPolicySnapshot(tienCoc, []);

      expect(snapshot !== null).toBe(coChinhSach);
    },
  );

  it('BCK-03 cọc không phải số tiền ⇒ ném lỗi (dữ liệu hỏng không được coi là 0)', () => {
    expect(() => buildRefundPolicySnapshot('abc', [])).toThrow();
    expect(() => buildRefundPolicySnapshot('-1.00', [])).toThrow();
  });
});

describe('toRefundPolicyView: bản nhìn API (camelCase)', () => {
  it('BCK-03 null ⇒ null; mảng rỗng ⇒ mảng rỗng (hai ý nghĩa khác nhau không được lẫn)', () => {
    expect(toRefundPolicyView(null)).toBeNull();
    expect(toRefundPolicyView([])).toStrictEqual([]);
  });

  it('BCK-03 đổi snake_case sang camelCase, giữ thứ tự và kiểu số', () => {
    const view = toRefundPolicyView([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
    ]);

    expect(view).toStrictEqual([
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
    ]);
  });

  it('BCK-03 hai dạng chiếu từ CÙNG một mảng: snapshot rồi bản nhìn khớp từng mốc', () => {
    const snapshot = buildRefundPolicySnapshot('10.00', [
      tier(2, 50),
      tier(24, 100),
    ]);
    const view = toRefundPolicyView(snapshot);

    expect(view).toStrictEqual([
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
    ]);
  });
});

function build(rows: unknown[] = []) {
  const query = vi.fn((_sql: string, _params: unknown[]) =>
    Promise.resolve(rows),
  );
  return { em: { query } as unknown as EntityManager, query };
}

describe('RefundPolicyReader (đơn vị, em giả)', () => {
  it('BCK-04 cọc 0 ⇒ null và KHÔNG truy vấn bảng moc_hoan_tien', async () => {
    const { em, query } = build([{ soGioTruocToiThieu: 24, tyLeHoan: 100 }]);

    expect(await new RefundPolicyReader().read(em, '7', '0.00')).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('BCK-04 cọc > 0: MỘT câu SELECT chỉ đọc, lọc theo ĐÚNG dịch vụ (tham số chuỗi), sắp giảm dần, không khoá', async () => {
    const { em, query } = build([
      { soGioTruocToiThieu: '2', tyLeHoan: '50' },
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
    ]);

    const snapshot = await new RefundPolicyReader().read(
      em,
      '9007199254740993',
      '50000.00',
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(sql).toContain('FROM moc_hoan_tien');
    expect(sql).toContain('dich_vu_kham_id = ?');
    expect(sql).toMatch(/ORDER BY so_gio_truoc_toi_thieu DESC/);
    expect(sql).not.toMatch(/\bFOR\s+(UPDATE|SHARE)\b/i);
    expect(params).toStrictEqual(['9007199254740993']);
    // MySQL có thể trả số dạng chuỗi: đã đổi sang số nguyên và sắp giảm dần
    expect(snapshot).toStrictEqual([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
    ]);
  });

  it('BCK-04 cọc > 0 và bảng không có mốc của dịch vụ ⇒ mảng rỗng', async () => {
    const { em } = build([]);

    expect(await new RefundPolicyReader().read(em, '7', '10.00')).toStrictEqual(
      [],
    );
  });
});
