import type { EntityManager } from 'typeorm';
import { ACCOUNT_FROM_SQL } from '../../accounts/account-visibility.js';
import {
  AccountResendRepository,
  LOCK_ACCOUNT_SQL,
  READ_TARGET_SQL,
} from '../account-resend.repository.js';

// Task B20 (admin) — SQL của repository (manager giả, không DB). Mã TKB20-nn là [đề xuất]; mã PLAN ghi kèm (TK-44, mục 2.4 của kế hoạch).
// `escapeQueryWithParameters` mô phỏng TypeORM: đổi `:tên` thành `?`, gom giá trị theo thứ tự xuất hiện.
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

describe('TKB20-08 (TK-44, mục 2.4) — SQL của repository (manager giả, không DB)', () => {
  it('câu khoá: FOR UPDATE theo khoá chính của tai_khoan, KHÔNG nối bảng nào khác (không khoá bac_si, le_tan, quan_tri_vien, chi_nhanh)', () => {
    expect(LOCK_ACCOUNT_SQL).toBe(
      'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
    );
    expect(LOCK_ACCOUNT_SQL).not.toMatch(/JOIN|FOR SHARE|LOCK IN SHARE/i);
  });

  it('lockAccount chạy ĐÚNG câu khoá với id là THAM SỐ (không nối vào chuỗi)', async () => {
    const { manager, query } = fakeManager();
    await new AccountResendRepository().lockAccount(
      manager,
      '10; DROP TABLE tai_khoan',
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(LOCK_ACCOUNT_SQL, [
      '10; DROP TABLE tai_khoan',
    ]);
  });

  it('câu đọc đích: ACCOUNT_FROM_SQL của B17, điều kiện tầm nhìn đứng sau id, id là THAM SỐ, KHÔNG khoá, KHÔNG đọc mật khẩu hay mã xác thực', async () => {
    const row = {
      taiKhoanId: '10',
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      chiNhanhId: '7',
      hoTen: 'Phạm Thị Lan',
      email: 'lan@example.com',
    };
    const { manager, query } = fakeManager([row]);
    const target = await new AccountResendRepository().findVisible(
      manager,
      visibility,
      '10; DROP TABLE tai_khoan',
    );
    expect(target).toEqual(row);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(ACCOUNT_FROM_SQL);
    expect(sql).toContain('WHERE t.tai_khoan_id = ? AND (bs.chi_nhanh_id = ?)');
    expect(sql).not.toContain('DROP');
    expect(sql).not.toMatch(/FOR UPDATE|FOR SHARE|LOCK IN SHARE/i);
    expect(sql).not.toMatch(/mat_khau_bam|ma_xac_thuc|ma_bam/i);
    // Thứ tự giá trị = thứ tự `?`: id trước, rồi tham số của điều kiện tầm nhìn.
    expect(values).toEqual(['10; DROP TABLE tai_khoan', '7']);
  });

  it('câu đọc chọn đủ sáu cột cần (id, loại, trạng thái, chi nhánh, họ tên, email) với bí danh khớp ResendTarget', () => {
    for (const alias of [
      'AS taiKhoanId',
      'AS loaiTaiKhoan',
      'AS trangThai',
      'AS chiNhanhId',
      'AS hoTen',
      'AS email',
    ]) {
      expect(READ_TARGET_SQL).toContain(alias);
    }
  });

  it('không có hàng ⇒ findVisible trả null (không tồn tại và ngoài tầm nhìn cùng MỘT kết quả, Q40)', async () => {
    const { manager } = fakeManager([]);
    await expect(
      new AccountResendRepository().findVisible(manager, visibility, '10'),
    ).resolves.toBeNull();
  });
});
