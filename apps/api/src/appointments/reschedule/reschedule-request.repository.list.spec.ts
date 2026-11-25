import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  buildCountSql,
  buildDetailSql,
  buildPageSql,
} from './reschedule-request-list.sql.js';
import type {
  RescheduleRequestDetailRow,
  RescheduleRequestFilter,
  RescheduleRequestItemRow,
} from './reschedule-request-list.types.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';

// reschedule B8 — ba phương thức ĐỌC của `RescheduleRequestRepository` (HDL-32, hợp đồng cho B9; không DB): mỗi phương thức gửi ĐÚNG câu và tham số của hàm dựng SQL, qua `em` của người gọi, và chuyển kết quả.
// `insert` và `findLatest` của B5 giữ nguyên chữ (spec của B5: reschedule-request.repository.spec.ts, kể cả XDL-29). Chạy thật trên MySQL: reschedule-request-list.int-spec.ts.
const FILTER: RescheduleRequestFilter = {
  states: ['DaDuyet', 'TuChoi'],
  chiNhanhId: '5',
  bacSiId: '31',
  maLichHen: null,
};
const repository = new RescheduleRequestRepository();

function emReturning(result: unknown) {
  const query = vi.fn((..._args: unknown[]) => Promise.resolve(result));
  return { em: { query } as unknown as EntityManager, query };
}

describe('countByStates', () => {
  it.each([
    [[{ total: '45' }], 45], // SUM của MySQL là DECIMAL nên ra chuỗi
    [[{ total: 7 }], 7],
    [[{ total: '0' }], 0],
    [[], 0],
  ])(
    'kết quả %j ⇒ %i, câu và tham số đúng của hàm dựng',
    async (rows, expected) => {
      const { em, query } = emReturning(rows);
      expect(await repository.countByStates(em, FILTER)).toBe(expected);
      const built = buildCountSql(FILTER);
      expect(query.mock.calls).toStrictEqual([[built.sql, built.params]]);
    },
  );
});

describe('findPage', () => {
  it('gửi câu trang với (limit, offset) và trả nguyên các hàng thô', async () => {
    const rows = [{ yeuCauId: '1' }] as unknown as RescheduleRequestItemRow[];
    const { em, query } = emReturning(rows);
    expect(await repository.findPage(em, FILTER, 'DESC', 20, 40)).toBe(rows);
    const built = buildPageSql(FILTER, 'DESC', 20, 40);
    expect(query.mock.calls).toStrictEqual([[built.sql, built.params]]);
  });

  it('chiều sắp xếp ASC khác DESC ở câu gửi đi', async () => {
    const { em, query } = emReturning([]);
    await repository.findPage(em, FILTER, 'ASC', 20, 0);
    await repository.findPage(em, FILTER, 'DESC', 20, 0);
    expect(query.mock.calls[0]?.[0]).not.toBe(query.mock.calls[1]?.[0]);
  });
});

describe('HDL-32 findDetail (hợp đồng cho B9)', () => {
  it('trả hàng đầu tiên, câu có điều kiện chi nhánh TRONG SQL khi có phạm vi', async () => {
    const row = {
      yeuCauId: '9',
      lichHenId: '100',
      khungGioMongMuonId: '31',
    } as unknown as RescheduleRequestDetailRow;
    const { em, query } = emReturning([row]);
    expect(await repository.findDetail(em, '5', '9')).toBe(row);
    const built = buildDetailSql('5', '9');
    expect(query.mock.calls).toStrictEqual([[built.sql, built.params]]);
    expect(built.sql).toContain('lh.chi_nhanh_id = ?');
    expect(built.params).toStrictEqual(['5', '9']);
  });

  it('Toàn hệ thống (chiNhanhId undefined): không điều kiện chi nhánh', async () => {
    const { em, query } = emReturning([]);
    await repository.findDetail(em, undefined, '9');
    expect(query.mock.calls[0]?.[1]).toStrictEqual(['9']);
    expect(String(query.mock.calls[0]?.[0])).not.toContain(
      'lh.chi_nhanh_id = ?',
    );
  });

  it('không có hàng (không tồn tại hay ngoài phạm vi: cùng kết quả) ⇒ null', async () => {
    const { em } = emReturning([]);
    expect(await repository.findDetail(em, '5', '9')).toBeNull();
  });

  it('chỉ ĐỌC: không câu nào có INSERT, UPDATE, DELETE hay khoá', async () => {
    const { em, query } = emReturning([]);
    await repository.countByStates(em, FILTER);
    await repository.findPage(em, FILTER, 'ASC', 20, 0);
    await repository.findDetail(em, '5', '9');
    for (const [sql] of query.mock.calls)
      expect(String(sql)).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b|FOR\s+(?:UPDATE|SHARE)/i,
      );
  });
});
