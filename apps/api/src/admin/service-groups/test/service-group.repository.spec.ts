import 'reflect-metadata';
import type { DataSource, EntityManager } from 'typeorm';
import { ServiceGroupListDto } from '../service-group.dto.js';
import { ServiceGroupRepository } from '../service-group.repository.js';

// PR3-A04: câu danh sách nhóm đếm dịch vụ trong CÙNG câu có LIMIT (không N+1). DataSource giả, không cần MySQL.
describe('B2 repository — PR3-A04 số dịch vụ theo nhóm', () => {
  interface Call {
    sql: string;
    parameters: unknown[];
  }
  const setup = (answers: unknown[][]) => {
    const calls: Call[] = [];
    const queue = [...answers];
    const manager = {
      query: vi.fn((sql: string, parameters: unknown[] = []) => {
        calls.push({ sql: sql.replace(/\s+/gu, ' ').trim(), parameters });
        return Promise.resolve(queue.shift() ?? []);
      }),
    } as unknown as EntityManager;
    const transaction = vi.fn(
      (_level: string, work: (m: EntityManager) => Promise<unknown>) =>
        work(manager),
    );
    const repo = new ServiceGroupRepository({
      transaction,
    } as unknown as DataSource);
    return { repo, calls, transaction };
  };
  const query = (values: Partial<ServiceGroupListDto> = {}) =>
    Object.assign(new ServiceGroupListDto(), values);
  const row = (id: number, soDichVu: unknown) => ({
    nhomDichVuId: String(id),
    ten: `Nhóm ${id}`,
    thuTuHienThi: id,
    soDichVu,
  });

  it('PR3-A04: driver trả COUNT dạng chuỗi hay số đều ra số nguyên; nhóm rỗng ra 0', async () => {
    const { repo } = setup([
      [row(1, '3'), row(2, '0'), row(3, 5)],
      [{ total: '3' }],
    ]);

    const result = await repo.list(query());

    expect(result.items.map((item) => item.soDichVu)).toEqual([3, 0, 5]);
    for (const item of result.items)
      expect(typeof item.soDichVu).toBe('number');
    expect(result).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(result.items[0]).toEqual({
      nhomDichVuId: '1',
      ten: 'Nhóm 1',
      thuTuHienThi: 1,
      soDichVu: 3,
    });
  });

  it.each([1, 25])(
    'PR3-A04: %i nhóm vẫn đúng 2 câu trong MỘT giao dịch REPEATABLE READ (không N+1)',
    async (count) => {
      const items = Array.from({ length: count }, (_x, i) => row(i + 1, i));
      const { repo, calls, transaction } = setup([items, [{ total: count }]]);

      const result = await repo.list(query({ pageSize: 100 }));

      expect(result.items).toHaveLength(count);
      expect(calls).toHaveLength(2);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(transaction.mock.calls[0]![0]).toBe('REPEATABLE READ');
    },
  );

  it('PR3-A04: câu danh sách nối LEFT JOIN, đếm theo id dịch vụ, nhóm theo nhóm, giữ thứ tự và LIMIT', async () => {
    const { repo, calls } = setup([[], [{ total: 0 }]]);

    await repo.list(query({ page: 3, pageSize: 10 }));

    const items = calls[0]!;
    expect(items.sql).toContain(
      'FROM nhom_dich_vu g LEFT JOIN dich_vu_kham d ON d.nhom_dich_vu_id = g.nhom_dich_vu_id',
    );
    expect(items.sql).toContain('COUNT(d.dich_vu_kham_id) AS soDichVu');
    expect(items.sql).toContain(
      'GROUP BY g.nhom_dich_vu_id, g.ten, g.thu_tu_hien_thi',
    );
    expect(items.sql).toMatch(
      /ORDER BY g\.thu_tu_hien_thi ASC, g\.ten ASC, g\.nhom_dich_vu_id ASC LIMIT \? OFFSET \?$/u,
    );
    expect(items.sql).not.toContain('WHERE');
    expect(items.parameters).toEqual([10, 20]);
  });

  it('PR3-A04: lọc q áp vào cả hai câu (LIKE trên g.ten với escape), câu total KHÔNG nối bảng dịch vụ', async () => {
    const { repo, calls } = setup([[], [{ total: 0 }]]);

    await repo.list(query({ q: '50%_!', page: 2, pageSize: 5 }));

    const [items, total] = calls as [Call, Call];
    expect(items.sql).toContain("WHERE g.ten LIKE ? ESCAPE '!'");
    expect(items.parameters).toEqual(['%50!%!_!!%', 5, 5]);
    expect(total.sql).toBe(
      "SELECT COUNT(*) AS total FROM nhom_dich_vu WHERE ten LIKE ? ESCAPE '!'",
    );
    expect(total.sql).not.toContain('JOIN');
    expect(total.parameters).toEqual(['%50!%!_!!%']);
  });
});
