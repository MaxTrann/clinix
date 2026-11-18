import type { DataSource } from 'typeorm';
import { NhatKyHanhDong } from '../../admin/entities/nhat-ky-hanh-dong.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AuditEntry } from '../audit-entry.js';
import { AuditRepository } from '../audit.repository.js';
import { AuditService } from '../audit.service.js';
import {
  paymentAuditEntries,
  specialRefundEntry,
  withdrawalApprovedEntry,
} from '../testing/payment-audit-entries.js';

// payment P5 — TDT-06, TDT-07 trên MySQL 8.4 THẬT: `AuditService.record` ghi bốn hành động mới vào nhat_ky_hanh_dong và đọc lại đúng cột, đúng payload (PLAN payment 5.6, 5.8; Q17).
// Chưa có service nghiệp vụ (B12, B13, B15 gọi sau): actor và chi nhánh là dữ liệu thật từ AdminFixtures; `targetId` là số minh hoạ vì `ma_doi_tuong` không có khoá ngoại (đối tượng đa hình).
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});
const service = new AuditService(new AuditRepository());
const auditRows = () => db.getRepository(NhatKyHanhDong).find();

/** Quản trị viên Toàn hệ thống (người duyệt) và một chi nhánh (của lịch gốc khi hoàn đặc biệt); tên, SĐT, email riêng để kiểm "không có trong nhật ký". */
async function world() {
  const branch = await fx.branch();
  const admin = await fx.admin(undefined, {
    hoTen: 'Quản trị Nguyễn Văn Duyệt',
    soDienThoai: '0911222333',
    email: 'quan.tri.rieng@example.com',
  });
  return { branch, admin };
}

/** Gắn id thật: actor là Quản trị viên; chi nhánh thật chỉ cho HoanTienDacBiet (ba hành động kia không có chi nhánh). */
function withRealIds(
  entry: AuditEntry,
  w: Awaited<ReturnType<typeof world>>,
  targetId: string,
): AuditEntry {
  return {
    ...entry,
    actorId: w.admin.account.taiKhoanId,
    branchId: entry.branchId === null ? null : w.branch.chiNhanhId,
    targetId,
  } as AuditEntry;
}

describe('TDT-06, TDT-07 — ghi bốn hành động payment vào nhat_ky_hanh_dong (MySQL thật)', () => {
  it('năm biến thể: đúng hành động, loại đối tượng, mã đối tượng, chi nhánh, kết quả và payload khứ hồi nguyên vẹn; không tên, SĐT, email của Quản trị viên', async () => {
    const w = await world();
    const entries = paymentAuditEntries().map((entry, index) =>
      withRealIds(entry, w, String(9000 + index)),
    );
    await db.transaction(async (manager) => {
      for (const entry of entries) await service.record(manager, entry);
    });

    const rows = await auditRows();
    expect(rows).toHaveLength(entries.length);
    for (const entry of entries) {
      const row = rows.find((r) => r.maDoiTuong === entry.targetId)!;
      expect(row, entry.action).toMatchObject({
        taiKhoanId: w.admin.account.taiKhoanId,
        chiNhanhId: entry.branchId,
        hanhDong: entry.action,
        loaiDoiTuong: entry.targetType,
        ketQua: 'ThanhCong',
        chiTietThayDoi: entry.changes,
      });
      const text = JSON.stringify(row.chiTietThayDoi);
      for (const forbidden of [
        w.admin.account.hoTen,
        w.admin.account.soDienThoai,
        w.admin.account.email,
      ])
        expect(text).not.toContain(forbidden);
    }
    // HoanTienDacBiet mang chi nhánh của lịch gốc; ba hành động kia không có chi nhánh
    expect(
      rows.filter((r) => r.chiNhanhId !== null).map((r) => r.hanhDong),
    ).toEqual(['HoanTienDacBiet']);
  });

  it('TDT-06 lý do 255 ký tự có dấu và emoji khứ hồi nguyên vẹn qua cột json', async () => {
    const w = await world();
    const lyDo = 'Hoàn tiền vì bác sĩ nghỉ đột xuất 🙂 ạ. '
      .repeat(10)
      .slice(0, 255);
    expect(lyDo.length).toBe(255);
    const entry = withRealIds(
      specialRefundEntry({
        changes: { so_tien: '9999999999.99', ly_do: lyDo },
      }),
      w,
      '9100',
    );
    await db.transaction((manager) => service.record(manager, entry));
    expect((await auditRows())[0]!.chiTietThayDoi).toEqual(entry.changes);
  });

  it('TDT-07 payload sai (khoá so_tai_khoan) ⇒ AUDIT_ENTRY_INVALID, không có dòng nhật ký và giao dịch ngoài hoàn tác', async () => {
    const w = await world();
    const good = withRealIds(withdrawalApprovedEntry(), w, '9200');
    const bad = {
      ...good,
      changes: { ...good.changes, so_tai_khoan: '0123456789' },
    } as unknown as AuditEntry;
    await expect(
      db.transaction(async (manager) => {
        // Ghi hợp lệ trước trong CÙNG giao dịch: phải bị hoàn tác cùng lần ghi sai
        await service.record(manager, good);
        await service.record(manager, bad);
      }),
    ).rejects.toThrow('AUDIT_ENTRY_INVALID');
    expect(await auditRows()).toHaveLength(0);
  });
});
