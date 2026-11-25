import type { DataSource } from 'typeorm';
import { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { NhatKyHanhDong } from '../../admin/entities/nhat-ky-hanh-dong.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AuditEntry } from '../audit-entry.js';
import { AuditRepository } from '../audit.repository.js';
import { AuditService } from '../audit.service.js';
import {
  proxyRescheduleEntry,
  requestApprovedEntry,
  requestRejectedEntry,
  rescheduleAuditEntries,
} from '../testing/reschedule-audit-entries.js';

// reschedule P2 — NDL-17…NDL-20 trên MySQL 8.4 THẬT: `AuditService.record` ghi hai hành động đổi lịch vào nhat_ky_hanh_dong và đọc lại đúng cột, đúng payload (PLAN reschedule 5.11; Q6, Q9).
// Chưa có luồng nghiệp vụ (B7, B9 gọi sau): actor và chi nhánh là dữ liệu thật từ AdminFixtures; `targetId` là số minh hoạ vì `ma_doi_tuong` không có khoá ngoại (đối tượng đa hình).
// "Hành động gốc" của ca hoàn tác là một câu UPDATE tên chi nhánh (như C2-04 ở audit.int-spec): Audit lỗi thì UPDATE đó phải mất theo, đúng nguyên tắc 2.4.70 A1.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});
const service = new AuditService(new AuditRepository());
const auditRows = () => db.getRepository(NhatKyHanhDong).find();
const MISSING_ID = '9223372036854775807';

/** Chi nhánh của lịch, Lễ tân (đổi hộ) và Quản trị viên (xử lý yêu cầu); tên, SĐT, email riêng để kiểm "không có trong nhật ký". */
async function world() {
  const branch = await fx.branch();
  const personal = (label: string, phone: string) => ({
    hoTen: `${label} Nguyễn Văn Riêng`,
    soDienThoai: phone,
    email: `${phone}@example.com`,
  });
  const receptionist = await fx.receptionist(
    branch,
    personal('Lễ tân', '0911222333'),
  );
  const admin = await fx.admin(undefined, personal('Quản trị', '0944555666'));
  return { branch, receptionist, admin };
}

/** Gắn id thật: Lễ tân là người đổi hộ, Quản trị viên là người xử lý yêu cầu; cả hai mang chi nhánh thật của lịch. */
function withRealIds(
  entry: AuditEntry,
  w: Awaited<ReturnType<typeof world>>,
  targetId: string,
): AuditEntry {
  const actor = entry.action === 'DoiLichHo' ? w.receptionist : w.admin;
  return {
    ...entry,
    actorId: actor.account.taiKhoanId,
    branchId: w.branch.chiNhanhId,
    targetId,
  } as AuditEntry;
}

describe('NDL-17 — ghi hai hành động đổi lịch vào nhat_ky_hanh_dong (MySQL thật)', () => {
  it('ba biến thể: đúng hành động, loại đối tượng, mã đối tượng, chi nhánh, kết quả và payload khứ hồi nguyên vẹn; không tên, SĐT, email của người thao tác', async () => {
    const w = await world();
    const entries = rescheduleAuditEntries().map((entry, index) =>
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
        taiKhoanId: entry.actorId,
        chiNhanhId: w.branch.chiNhanhId,
        hanhDong: entry.action,
        loaiDoiTuong: entry.targetType,
        ketQua: 'ThanhCong',
        chiTietThayDoi: entry.changes,
      });
      const text = JSON.stringify(row.chiTietThayDoi);
      for (const forbidden of [
        w.receptionist.account.hoTen,
        w.receptionist.account.soDienThoai,
        w.receptionist.account.email,
        w.admin.account.hoTen,
        w.admin.account.soDienThoai,
        w.admin.account.email,
      ])
        expect(text).not.toContain(forbidden);
    }
    // Từ chối KHÔNG có khoá ma_lich_hen_moi; duyệt CÓ
    const [proxy, approved, rejected] = ['9000', '9001', '9002'].map(
      (id) => rows.find((r) => r.maDoiTuong === id)!.chiTietThayDoi,
    );
    expect(proxy).toHaveProperty('ly_do');
    expect(approved).toHaveProperty('ma_lich_hen_moi');
    expect(rejected).not.toHaveProperty('ma_lich_hen_moi');
  });

  it('NDL-17 hai đường ghi độc lập: bản ghi lịch cũ và bản ghi yêu cầu cùng id số vẫn là hai dòng (ma_doi_tuong không có khoá ngoại, không dedupe)', async () => {
    const w = await world();
    await db.transaction(async (manager) => {
      await service.record(
        manager,
        withRealIds(proxyRescheduleEntry(), w, '7'),
      );
      await service.record(
        manager,
        withRealIds(requestApprovedEntry(), w, '7'),
      );
    });
    const rows = await auditRows();
    expect(rows.map((r) => `${r.hanhDong}/${r.loaiDoiTuong}`).sort()).toEqual([
      'DoiLichHo/lich_hen',
      'XuLyDoiLichNgoaiChinhSach/yeu_cau_doi_lich_ngoai_chinh_sach',
    ]);
  });
});

describe('NDL-18 — khứ hồi nguyên vẹn qua cột json', () => {
  it('ly_do và ghi_chu đúng 255 đơn vị UTF-16 có dấu tiếng Việt và emoji; thoi_gian dạng Z và +07:00', async () => {
    const w = await world();
    const text = 'Đổi lịch vì bận việc đột xuất 🙂 ạ. '
      .repeat(10)
      .slice(0, 255);
    expect(text.length).toBe(255);
    const proxy = withRealIds(
      proxyRescheduleEntry({
        changes: {
          truoc: {
            ma_lich_hen: 'CLX-20261201-7K3QD',
            thoi_gian: '2026-12-01T02:00:00.000Z',
          },
          sau: {
            ma_lich_hen: 'CLX-20261125-A4B9C',
            thoi_gian: '2026-12-03T14:30:00+07:00',
          },
          ly_do: text,
        },
      }),
      w,
      '9100',
    );
    const handled = withRealIds(
      requestRejectedEntry({
        changes: {
          truoc: { trang_thai: 'ChoDuyet' },
          sau: { trang_thai: 'TuChoi' },
          ghi_chu: text,
          ma_lich_hen_cu: 'CLX-20261201-7K3QD',
        },
      }),
      w,
      '9101',
    );
    await db.transaction(async (manager) => {
      await service.record(manager, proxy);
      await service.record(manager, handled);
    });
    const rows = await auditRows();
    expect(rows.find((r) => r.maDoiTuong === '9100')!.chiTietThayDoi).toEqual(
      proxy.changes,
    );
    expect(rows.find((r) => r.maDoiTuong === '9101')!.chiTietThayDoi).toEqual(
      handled.changes,
    );
  });
});

describe('NDL-19 — lỗi luật ⇒ ném có kiểu, KHÔNG ghi dòng nào, hành động gốc hoàn tác theo', () => {
  const badEntries: [
    string,
    (w: Awaited<ReturnType<typeof world>>) => unknown,
    string,
  ][] = [
    [
      'DoiLichHo: ly_do 256 ký tự',
      (w) => {
        const good = withRealIds(proxyRescheduleEntry(), w, '9200');
        return {
          ...good,
          changes: { ...good.changes, ly_do: 'x'.repeat(256) },
        };
      },
      'AUDIT_ENTRY_INVALID',
    ],
    [
      'duyệt: thiếu ma_lich_hen_moi',
      (w) => {
        const good = withRealIds(requestApprovedEntry(), w, '9201');
        const { ma_lich_hen_moi: _drop, ...rest } = good.changes as Record<
          string,
          unknown
        >;
        return { ...good, changes: rest };
      },
      'AUDIT_ENTRY_INVALID',
    ],
    [
      'từ chối: có khoá lạ ho_ten',
      (w) => {
        const good = withRealIds(requestRejectedEntry(), w, '9202');
        return {
          ...good,
          changes: { ...good.changes, ho_ten: 'Nguyễn Văn A' },
        };
      },
      'AUDIT_ENTRY_INVALID',
    ],
    [
      'từ chối: ghi_chu chứa chuỗi giống bí mật',
      (w) => {
        const good = withRealIds(requestRejectedEntry(), w, '9203');
        return {
          ...good,
          changes: { ...good.changes, ghi_chu: 'otp=123456 đã gửi' },
        };
      },
      'AUDIT_SENSITIVE_DATA',
    ],
  ];

  it.each(badEntries)('%s', async (_name, build, code) => {
    const w = await world();
    const good = withRealIds(proxyRescheduleEntry(), w, '9199');
    await expect(
      db.transaction(async (manager) => {
        // Hành động gốc và một bản ghi hợp lệ ghi TRƯỚC trong cùng giao dịch: phải mất cùng bản ghi sai
        await manager.update(ChiNhanh, w.branch.chiNhanhId, {
          ten: 'Không được commit',
        });
        await service.record(manager, good);
        await service.record(manager, build(w) as AuditEntry);
      }),
    ).rejects.toMatchObject({ code });
    expect(await auditRows()).toHaveLength(0);
    expect(
      (
        await db
          .getRepository(ChiNhanh)
          .findOneByOrFail({ chiNhanhId: w.branch.chiNhanhId })
      ).ten,
    ).toBe(w.branch.ten);
  });
});

describe('NDL-20 — lỗi ghi thật và gọi sai chỗ', () => {
  it.each([
    ['DoiLichHo, actor không tồn tại', proxyRescheduleEntry, 'actor'],
    ['DoiLichHo, chi nhánh không tồn tại', proxyRescheduleEntry, 'branch'],
    ['duyệt, actor không tồn tại', requestApprovedEntry, 'actor'],
    ['từ chối, chi nhánh không tồn tại', requestRejectedEntry, 'branch'],
  ] as const)(
    '%s ⇒ AUDIT_WRITE_FAILED không kèm payload, hành động gốc hoàn tác, 0 dòng',
    async (_name, build, missing) => {
      const w = await world();
      const real = withRealIds(build(), w, '9300');
      const entry: AuditEntry =
        missing === 'actor'
          ? { ...real, actorId: MISSING_ID }
          : { ...real, branchId: MISSING_ID };
      let caught: unknown;
      try {
        await db.transaction(async (manager) => {
          await manager.update(ChiNhanh, w.branch.chiNhanhId, {
            ten: 'Không được commit',
          });
          await service.record(manager, entry);
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
      // Không giữ SQL, tham số hay payload của driver (mã lịch minh hoạ không được lọt vào lỗi)
      expect(JSON.stringify(caught)).not.toContain('CLX-');
      expect(String((caught as Error).message)).toBe('AUDIT_WRITE_FAILED');
      expect(await auditRows()).toHaveLength(0);
      expect(
        (
          await db
            .getRepository(ChiNhanh)
            .findOneByOrFail({ chiNhanhId: w.branch.chiNhanhId })
        ).ten,
      ).toBe(w.branch.ten);
    },
  );

  it('gọi ngoài giao dịch ⇒ AUDIT_TRANSACTION_REQUIRED, không ghi gì', async () => {
    const w = await world();
    for (const entry of rescheduleAuditEntries())
      await expect(
        service.record(db.manager, withRealIds(entry, w, '9301')),
      ).rejects.toThrow('AUDIT_TRANSACTION_REQUIRED');
    expect(await auditRows()).toHaveLength(0);
  });
});
