import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  isVisitProfileUsable,
  lockVisitProfile,
  readVisitProfile,
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

// Task B7 — `readVisitProfile`: cùng ba kết quả nhưng ĐỌC THƯỜNG (không khoá) cho `POST /booking/checks` (BCK-07, phần đơn vị; MySQL thật ở create/visit-profile-read.int-spec.ts).
describe('readVisitProfile', () => {
  it('BCK-07 hồ sơ bản thân (null) luôn dùng được và KHÔNG truy vấn gì', async () => {
    const { em, query } = build();

    expect(await readVisitProfile(em, '5', null)).toBe('active');
    expect(query).not.toHaveBeenCalled();
  });

  it('BCK-07 (H3) câu ĐỌC THƯỜNG: KHÔNG có FOR UPDATE hay FOR SHARE, có benh_nhan_id trong chính câu SQL, tham số (hồ sơ, bệnh nhân) là CHUỖI', async () => {
    const { em, query } = build([{ trangThaiHieuLuc: 1 }]);

    await readVisitProfile(em, '5', '9007199254740993');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).not.toMatch(/\bFOR\s+(UPDATE|SHARE)\b/i);
    expect(sql).not.toMatch(/\bLOCK\s+IN\s+SHARE\s+MODE\b/i);
    expect(sql).toContain('ho_so_nguoi_than_id = ?');
    expect(sql).toContain('benh_nhan_id = ?');
    expect(params).toStrictEqual(['9007199254740993', '5']);
  });

  it.each([
    { rows: [], expected: 'missing' },
    { rows: [{ trangThaiHieuLuc: 0 }], expected: 'inactive' },
    { rows: [{ trangThaiHieuLuc: 1 }], expected: 'active' },
    { rows: [{ trangThaiHieuLuc: '1' }], expected: 'active' },
  ] as const)('BCK-07 $rows ⇒ $expected', async ({ rows, expected }) => {
    const { em } = build([...rows]);

    expect(await readVisitProfile(em, '5', '77')).toBe(expected);
  });

  it('BCK-07 hàm khoá cũ KHÔNG đổi: vẫn FOR UPDATE (ràng buộc của B5 và B8)', async () => {
    const { em, query } = build([{ trangThaiHieuLuc: 1 }]);

    await lockVisitProfile(em, '5', '77');

    expect(query.mock.calls[0]?.[0]).toMatch(/FOR UPDATE\s*$/);
  });
});
