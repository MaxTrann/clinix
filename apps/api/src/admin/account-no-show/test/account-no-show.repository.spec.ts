import type { DataSource, EntityManager } from 'typeorm';
import { ACCOUNT_FROM_SQL } from '../../accounts/account-visibility.js';
import {
  AccountNoShowRepository,
  CLEAR_FLAG_SQL,
  LOCK_COUNTER_SQL,
} from '../account-no-show.repository.js';

// Manager giả: `escapeQueryWithParameters` mô phỏng TypeORM (đổi `:tên` thành `?`, gom giá trị theo thứ tự xuất hiện).
function fakeManager(queryResult: unknown = []) {
  const query = vi.fn().mockResolvedValue(queryResult);
  const manager = {
    query,
    connection: {
      driver: {
        escapeQueryWithParameters: (
          sql: string,
          parameters: Record<string, unknown>,
        ): [string, unknown[]] => {
          const values: unknown[] = [];
          const text = sql.replace(/:(\w+)/g, (_whole, name: string) => {
            values.push(parameters[name]);
            return '?';
          });
          return [text, values];
        },
      },
    },
  } as unknown as EntityManager;
  return { manager, query };
}

const visibility = {
  sql: '(bs.chi_nhanh_id = :accountBranchId)',
  parameters: { accountBranchId: '7' },
};

describe('TKB19-06 (TK-30, PLAN 5.6, mục 2.4) — SQL và giao dịch của repository (manager giả, không DB)', () => {
  it('giao dịch mở ở READ COMMITTED (không khoá khoảng với hàng benh_nhan chưa có)', async () => {
    const transaction = vi.fn(
      (_level: string, work: (m: EntityManager) => Promise<string>) =>
        work({} as EntityManager),
    );
    const repository = new AccountNoShowRepository({
      transaction,
    } as unknown as DataSource);
    await repository.transaction(() => Promise.resolve('xong'));
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]![0]).toBe('READ COMMITTED');
  });

  it('câu đọc đích: dùng ACCOUNT_FROM_SQL của B17, điều kiện tầm nhìn đứng sau id, id là THAM SỐ (không nối vào chuỗi)', async () => {
    const { manager, query } = fakeManager([{ loaiTaiKhoan: 'BenhNhan' }]);
    const repository = new AccountNoShowRepository({} as DataSource);
    const kind = await repository.findVisibleKind(
      manager,
      visibility,
      '10; DROP TABLE tai_khoan',
    );
    expect(kind).toBe('BenhNhan');
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(ACCOUNT_FROM_SQL);
    expect(sql).toContain('WHERE t.tai_khoan_id = ? AND (bs.chi_nhanh_id = ?)');
    expect(sql).not.toContain('DROP');
    expect(sql).not.toMatch(/FOR UPDATE|FOR SHARE/i);
    // Thứ tự giá trị = thứ tự `?`: id trước, rồi tham số của điều kiện tầm nhìn.
    expect(values).toEqual(['10; DROP TABLE tai_khoan', '7']);
  });

  it('không có hàng ⇒ findVisibleKind trả null (không tồn tại và ngoài tầm nhìn cùng một kết quả)', async () => {
    const { manager } = fakeManager([]);
    const repository = new AccountNoShowRepository({} as DataSource);
    await expect(
      repository.findVisibleKind(manager, visibility, '10'),
    ).resolves.toBeNull();
  });

  it('câu khoá: FOR UPDATE theo khoá chính của benh_nhan; KHÔNG đụng tai_khoan', () => {
    expect(LOCK_COUNTER_SQL).toContain('FOR UPDATE');
    expect(LOCK_COUNTER_SQL).toContain('FROM benh_nhan WHERE tai_khoan_id = ?');
    expect(LOCK_COUNTER_SQL).not.toMatch(/tai_khoan\b(?!_id)/);
    expect(LOCK_COUNTER_SQL).not.toMatch(/lich_hen/);
  });

  it('lockCounter đổi hàng thô (tinyint, int dạng chuỗi) thành số và boolean; không có hàng ⇒ null', async () => {
    const repository = new AccountNoShowRepository({} as DataSource);
    const first = fakeManager([{ khoa: 1, soLan: '3' }]);
    await expect(repository.lockCounter(first.manager, '10')).resolves.toEqual({
      khoa: true,
      soLan: 3,
    });
    expect(first.query).toHaveBeenCalledWith(LOCK_COUNTER_SQL, ['10']);
    const second = fakeManager([{ khoa: 0, soLan: 0 }]);
    await expect(repository.lockCounter(second.manager, '10')).resolves.toEqual(
      { khoa: false, soLan: 0 },
    );
    const none = fakeManager([]);
    await expect(
      repository.lockCounter(none.manager, '10'),
    ).resolves.toBeNull();
  });

  it('UPDATE: đúng MỘT cột khoa_dat_lich_do_no_show = 0, có WHERE tai_khoan_id = ? và điều kiện cờ đang bật; không đụng so_lan_no_show, trang_thai', () => {
    expect(CLEAR_FLAG_SQL.replace(/\s+/g, ' ')).toBe(
      'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 0 WHERE tai_khoan_id = ? AND khoa_dat_lich_do_no_show = 1',
    );
    expect(CLEAR_FLAG_SQL).not.toContain('so_lan_no_show');
    expect(CLEAR_FLAG_SQL).not.toContain('trang_thai');
    expect(CLEAR_FLAG_SQL).not.toContain(',');
  });

  it.each([
    [1, true],
    [0, false],
    [2, false],
    [undefined, false],
  ])(
    'clearFlag: affectedRows %s ⇒ %s (chỉ đúng 1 hàng mới là thành công)',
    async (affectedRows, expected) => {
      const { manager, query } = fakeManager({ affectedRows });
      const repository = new AccountNoShowRepository({} as DataSource);
      await expect(repository.clearFlag(manager, '10')).resolves.toBe(expected);
      expect(query).toHaveBeenCalledWith(CLEAR_FLAG_SQL, ['10']);
    },
  );
});
