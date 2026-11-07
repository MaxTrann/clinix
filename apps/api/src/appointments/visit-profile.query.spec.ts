import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  isVisitProfileUsable,
  lockVisitProfile,
} from './visit-profile.query.js';

// Task B5 — khoá và kiểm hồ sơ đi khám với EntityManager giả (PLAN patient Q13, NT-18; TRACKING B5-B, B5-G).
// MySQL thật (NT-18 đủ ba trường hợp): appointments.int-spec.ts. Mã ca RDA-nn là [đề xuất].
function build(rows: unknown[] = []) {
  const query = vi.fn((_sql: string, _params: unknown[]) =>
    Promise.resolve(rows),
  );
  const em = { query } as unknown as EntityManager;
  return { em, query };
}

describe('lockVisitProfile', () => {
  it('RDA-04 (NT-18) hồ sơ bản thân (null) luôn dùng được và KHÔNG truy vấn gì', async () => {
    const { em, query } = build();

    expect(await lockVisitProfile(em, '5', null)).toBe('active');
    expect(await isVisitProfileUsable(em, '5', null)).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('RDA-04 (NT-18, H3) câu ĐỌC CÓ KHOÁ: FOR UPDATE, có benh_nhan_id trong chính câu SQL, tham số theo thứ tự (hồ sơ, bệnh nhân)', async () => {
    const { em, query } = build([{ trangThaiHieuLuc: 1 }]);

    await lockVisitProfile(em, '5', '9007199254740993');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toMatch(/FOR UPDATE\s*$/);
    expect(sql).toContain('ho_so_nguoi_than_id = ?');
    expect(sql).toContain('benh_nhan_id = ?');
    // Id là CHUỖI, không bao giờ qua Number
    expect(params).toStrictEqual(['9007199254740993', '5']);
  });

  it.each([
    { rows: [], expected: 'missing', usable: false },
    { rows: [{ trangThaiHieuLuc: 0 }], expected: 'inactive', usable: false },
    { rows: [{ trangThaiHieuLuc: 1 }], expected: 'active', usable: true },
  ] as const)(
    'RDA-04 (NT-18) $rows ⇒ $expected, isVisitProfileUsable = $usable',
    async ({ rows, expected, usable }) => {
      const { em } = build([...rows]);

      expect(await lockVisitProfile(em, '5', '77')).toBe(expected);
      expect(await isVisitProfileUsable(em, '5', '77')).toBe(usable);
    },
  );
});
