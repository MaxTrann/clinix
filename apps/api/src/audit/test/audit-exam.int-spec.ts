import type { DataSource } from 'typeorm';
import { NhatKyHanhDong } from '../../admin/entities/nhat-ky-hanh-dong.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AuditEntry } from '../audit-entry.js';
import { AuditRepository } from '../audit.repository.js';
import { AuditService } from '../audit.service.js';
import {
  editRecordEntry,
  hideRatingEntry,
} from '../testing/exam-audit-entries.js';

// doctor-exam P2 (#392) — TDK-04 và TDK-05 trên MySQL 8.4 THẬT: `AuditService.record` ghi SuaGhiChuKham và AnDanhGia, đọc lại dòng trong nhat_ky_hanh_dong.
// Chưa có service nghiệp vụ (B2, B8 gọi sau): lịch hẹn, hồ sơ, đánh giá dựng bằng AdminFixtures và SQL thô, như `exam-tables.int-spec.ts` của P1.
// Bảng ho_so_kham, danh_gia_bac_si ghi bằng SQL thô để `audit/` không import entity của `doctor/`.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});
const service = new AuditService(new AuditRepository());

const AT = '2026-11-02 09:00:00';
const asEntry = (value: unknown) => value as AuditEntry;

/** Chi nhánh, bác sĩ, bệnh nhân, lịch hẹn và một Quản trị viên: đủ id thật cho actor, chi nhánh của lịch và đối tượng. */
async function world() {
  const branch = await fx.branch();
  // Tên, SĐT, email RIÊNG của từng bên (mặc định của fixture giống hệt nhau) để kiểm "không có trong nhật ký" có nghĩa
  const doctor = await fx.doctor(
    branch,
    {},
    {
      hoTen: 'Bác sĩ Lê Văn Khám',
      soDienThoai: '0912345678',
      email: 'bac.si.rieng@example.com',
    },
  );
  const patient = await fx.patient({
    hoTen: 'Trần Thị Bệnh Nhân',
    soDienThoai: '0987654321',
    email: 'benh.nhan.rieng@example.com',
  });
  const slot = await fx.slot(await fx.shift(doctor.profile));
  const appointment = await fx.appointment(
    doctor.profile,
    slot,
    patient.account.taiKhoanId,
  );
  const admin = await fx.admin(branch);
  return { doctor, patient, appointment, admin };
}

async function insertRecord(lichHenId: string): Promise<string> {
  const result = (await db.query(
    'INSERT INTO ho_so_kham (lich_hen_id, trieu_chung, chan_doan_so_bo, huong_xu_ly, cap_nhat_lan_cuoi) VALUES (?, ?, ?, ?, ?)',
    [
      lichHenId,
      'Ho khan 3 ngày',
      'Viêm họng cấp',
      'Nghỉ ngơi, uống nước ấm',
      AT,
    ],
  )) as { insertId: number };
  return String(result.insertId);
}

async function insertRating(
  lichHenId: string,
  nhanXet: string,
): Promise<string> {
  const result = (await db.query(
    'INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, nhan_xet, thoi_diem_tao) VALUES (?, ?, ?, ?)',
    [lichHenId, 1, nhanXet, AT],
  )) as { insertId: number };
  return String(result.insertId);
}

const auditRows = () => db.getRepository(NhatKyHanhDong).find();

type Snapshots = {
  truoc: Record<string, unknown>;
  sau: Record<string, unknown>;
};

describe('TDK-04 — nhật ký SuaGhiChuKham (MySQL thật)', () => {
  it('ghi đúng chi nhánh của lịch, đối tượng và CHỈ trường có đổi; không tên, SĐT, email, không nội dung trường không đổi', async () => {
    const w = await world();
    const recordId = await insertRecord(w.appointment.lichHenId);
    const entry = editRecordEntry({
      actorId: w.doctor.account.taiKhoanId,
      branchId: w.appointment.chiNhanhId,
      targetId: recordId,
      changes: {
        truoc: { chan_doan_so_bo: 'Viêm họng cấp' },
        sau: { chan_doan_so_bo: 'Viêm amiđan cấp' },
      },
    });
    await db.transaction(async (manager) => {
      await manager.query(
        'UPDATE ho_so_kham SET chan_doan_so_bo = ? WHERE ho_so_kham_id = ?',
        ['Viêm amiđan cấp', recordId],
      );
      await service.record(manager, entry);
    });

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      taiKhoanId: w.doctor.account.taiKhoanId,
      chiNhanhId: w.appointment.chiNhanhId,
      hanhDong: 'SuaGhiChuKham',
      loaiDoiTuong: 'ho_so_kham',
      maDoiTuong: recordId,
      ketQua: 'ThanhCong',
      chiTietThayDoi: entry.changes,
    });
    const payload = row.chiTietThayDoi as unknown as Snapshots;
    expect(Object.keys(payload.truoc)).toEqual(['chan_doan_so_bo']);
    expect(Object.keys(payload.sau)).toEqual(['chan_doan_so_bo']);
    const text = JSON.stringify(row.chiTietThayDoi);
    for (const forbidden of [
      w.patient.account.hoTen,
      w.patient.account.soDienThoai,
      w.patient.account.email,
      w.doctor.account.hoTen,
      w.doctor.account.email,
      // hai trường không đổi của hồ sơ
      'Ho khan 3 ngày',
      'Nghỉ ngơi, uống nước ấm',
    ])
      expect(text).not.toContain(forbidden);
  });

  it('payload tối đa (4 khoá × 2.000 ký tự × hai phía, có dấu, xuống dòng, emoji) khứ hồi nguyên vẹn qua cột json (chỉ kiểm lại, không thay M10 của X1)', async () => {
    const w = await world();
    const recordId = await insertRecord(w.appointment.lichHenId);
    const unit = 'Đau đầu, chóng mặt 🙂 ạ\n';
    // Đúng 2.000 đơn vị UTF-16, không cắt giữa cặp thay thế của emoji
    const fill = (mark: string) =>
      `${mark}${unit.repeat(Math.floor((2000 - mark.length) / unit.length))}`.padEnd(
        2000,
        '.',
      );
    const entry = editRecordEntry({
      actorId: w.doctor.account.taiKhoanId,
      branchId: w.appointment.chiNhanhId,
      targetId: recordId,
      changes: {
        truoc: {
          trieu_chung: fill('T1'),
          chan_doan_so_bo: fill('C1'),
          huong_xu_ly: fill('H1'),
          ngay_tai_kham_du_kien: null,
        },
        sau: {
          trieu_chung: fill('T2'),
          chan_doan_so_bo: fill('C2'),
          huong_xu_ly: fill('H2'),
          ngay_tai_kham_du_kien: '2026-12-15',
        },
      },
    });
    await db.transaction((manager) => service.record(manager, entry));

    const row = (await auditRows())[0]!;
    expect(row.chiTietThayDoi).toEqual(entry.changes);
    const payload = row.chiTietThayDoi as unknown as Snapshots;
    for (const key of ['trieu_chung', 'chan_doan_so_bo', 'huong_xu_ly'])
      expect((payload.sau[key] as string).length).toBe(2000);
  });

  it('payload sai (khoá ho_ten) ⇒ AUDIT_ENTRY_INVALID, không có dòng nhật ký và giao dịch ngoài hoàn tác', async () => {
    const w = await world();
    const recordId = await insertRecord(w.appointment.lichHenId);
    const bad = {
      ...editRecordEntry({
        actorId: w.doctor.account.taiKhoanId,
        branchId: w.appointment.chiNhanhId,
        targetId: recordId,
      }),
      changes: {
        truoc: { ho_ten: w.patient.account.hoTen },
        sau: { ho_ten: 'Tên khác' },
      },
    };
    await expect(
      db.transaction(async (manager) => {
        await manager.query(
          'UPDATE ho_so_kham SET chan_doan_so_bo = ? WHERE ho_so_kham_id = ?',
          ['Viêm amiđan cấp', recordId],
        );
        await service.record(manager, asEntry(bad));
      }),
    ).rejects.toThrow('AUDIT_ENTRY_INVALID');

    expect(await auditRows()).toHaveLength(0);
    const rows = (await db.query(
      'SELECT chan_doan_so_bo FROM ho_so_kham WHERE ho_so_kham_id = ?',
      [recordId],
    )) as { chan_doan_so_bo: string }[];
    expect(rows[0]?.chan_doan_so_bo).toBe('Viêm họng cấp');
  });
});

describe('TDK-05 — nhật ký AnDanhGia (MySQL thật)', () => {
  it('ghi đúng truoc/sau/ly_do/bac_si_id, bi_an đọc lại là boolean; không nhận xét, tên, SĐT, email', async () => {
    const w = await world();
    const review = 'NHAN-XET-QUANG-CAO-MAU';
    const ratingId = await insertRating(w.appointment.lichHenId, review);
    const entry = hideRatingEntry({
      actorId: w.admin.account.taiKhoanId,
      branchId: w.appointment.chiNhanhId,
      targetId: ratingId,
      changes: {
        truoc: { bi_an: false },
        sau: { bi_an: true },
        ly_do: 'Nội dung quảng cáo, vi phạm quy định',
        bac_si_id: w.appointment.bacSiId,
      },
    });
    await db.transaction(async (manager) => {
      await manager.query(
        'UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE danh_gia_bac_si_id = ?',
        [entry.changes.ly_do, ratingId],
      );
      await service.record(manager, entry);
    });

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      taiKhoanId: w.admin.account.taiKhoanId,
      chiNhanhId: w.appointment.chiNhanhId,
      hanhDong: 'AnDanhGia',
      loaiDoiTuong: 'danh_gia_bac_si',
      maDoiTuong: ratingId,
      ketQua: 'ThanhCong',
      chiTietThayDoi: entry.changes,
    });
    const payload = row.chiTietThayDoi as unknown as Snapshots;
    // Khứ hồi JSON giữ đúng kiểu boolean (không thành 0 và 1)
    expect(payload.truoc.bi_an).toBe(false);
    expect(payload.sau.bi_an).toBe(true);
    const text = JSON.stringify(row.chiTietThayDoi);
    for (const forbidden of [
      review,
      w.patient.account.hoTen,
      w.patient.account.soDienThoai,
      w.patient.account.email,
      w.doctor.account.hoTen,
    ])
      expect(text).not.toContain(forbidden);
  });

  it('bac_si_id lớn nhất của BIGINT khứ hồi nguyên dạng chuỗi', async () => {
    const w = await world();
    const ratingId = await insertRating(
      w.appointment.lichHenId,
      'Nhận xét mẫu',
    );
    const entry = hideRatingEntry({
      actorId: w.admin.account.taiKhoanId,
      branchId: w.appointment.chiNhanhId,
      targetId: ratingId,
      changes: {
        truoc: { bi_an: false },
        sau: { bi_an: true },
        ly_do: 'Nội dung quảng cáo, vi phạm quy định',
        bac_si_id: '9223372036854775807',
      },
    });
    await db.transaction((manager) => service.record(manager, entry));
    const row = (await auditRows())[0]!;
    expect(
      (row.chiTietThayDoi as unknown as { bac_si_id: unknown }).bac_si_id,
    ).toBe('9223372036854775807');
  });

  it('lý do ngắn hơn 10 ký tự ⇒ AUDIT_ENTRY_INVALID, không dòng nhật ký và đánh giá vẫn hiển thị (hoàn tác)', async () => {
    const w = await world();
    const ratingId = await insertRating(
      w.appointment.lichHenId,
      'Nhận xét mẫu',
    );
    const bad = hideRatingEntry({
      actorId: w.admin.account.taiKhoanId,
      branchId: w.appointment.chiNhanhId,
      targetId: ratingId,
      changes: {
        truoc: { bi_an: false },
        sau: { bi_an: true },
        ly_do: 'ngắn quá',
        bac_si_id: w.appointment.bacSiId,
      },
    });
    await expect(
      db.transaction(async (manager) => {
        await manager.query(
          'UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE danh_gia_bac_si_id = ?',
          ['ngắn quá', ratingId],
        );
        await service.record(manager, bad);
      }),
    ).rejects.toThrow('AUDIT_ENTRY_INVALID');

    expect(await auditRows()).toHaveLength(0);
    const rows = (await db.query(
      'SELECT bi_an FROM danh_gia_bac_si WHERE danh_gia_bac_si_id = ?',
      [ratingId],
    )) as { bi_an: number }[];
    expect(Number(rows[0]?.bi_an)).toBe(0);
  });
});
