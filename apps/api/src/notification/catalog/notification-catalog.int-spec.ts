import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  LEAVE_EVENTS,
  LeaveNotifier,
  type LeaveNotificationInput,
} from '../../doctor/notifications/leave-notifier.js';
import { ReconcileRepository } from '../../payment/reconcile/reconcile.repository.js';
import { TopupNotifier } from '../../payment/topup/topup-notifier.js';
import { RefundRepository } from '../../wallet/refund/refund.queries.js';
import { RefundNotifier } from '../../wallet/refund/refund-notifier.js';
import { WithdrawalNotifier } from '../../wallet/withdrawal/withdrawal-notifier.js';
import { BRANCH_CHANGE_EVENTS } from '../branch-change-events.js';
import { BranchChangeNotifier } from '../branch-change-notifier.js';
import { findCatalogEntry } from './notification-catalog.js';

// notification B1 — DMS-08 trên MySQL 8.4 THẬT: chạy notifier thật của doctor (nghỉ phép), payment (nạp ví), wallet (rút tiền, hoàn cọc) và admin (thay đổi chi nhánh),
// rồi so loại tài khoản của người nhận từng dòng `thong_bao` với cột "người nhận" của danh mục.
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});
const NOW = new Date('2026-11-02T08:00:00+07:00');

interface RecipientRow {
  loai: string;
  vaiTro: string;
  phamVi: string | null;
}

/** Mỗi dòng `thong_bao`: mã đã lưu, loại tài khoản người nhận và phạm vi quản trị (nếu là Quản trị viên). */
function readRecipients(): Promise<RecipientRow[]> {
  return db.query(
    `SELECT t.loai_su_kien AS loai, k.loai_tai_khoan AS vaiTro, q.pham_vi_quan_tri AS phamVi
       FROM thong_bao t
       JOIN tai_khoan k ON k.tai_khoan_id = t.tai_khoan_id
       LEFT JOIN quan_tri_vien q ON q.tai_khoan_id = t.tai_khoan_id
      ORDER BY t.thong_bao_id`,
  );
}

/** Một chi nhánh với đủ người: Bệnh nhân, Bác sĩ, Quản trị viên Toàn hệ thống và Quản trị viên Chi nhánh; thêm một lịch hẹn và một yêu cầu thay đổi chi nhánh. */
async function world() {
  const fx = new AdminFixtures(db);
  const branch = await fx.branch();
  const patient = await fx.patient();
  const doctor = await fx.doctor(branch);
  const systemAdmin = await fx.admin();
  const branchAdmin = await fx.admin(branch);
  const slot = await fx.slot(await fx.shift(doctor.profile));
  const appointment = await fx.appointment(
    doctor.profile,
    slot,
    patient.account.taiKhoanId,
  );
  const request: { insertId: number | string } = await db.query(
    `INSERT INTO yeu_cau_thay_doi_chi_nhanh (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau, trang_thai)
     VALUES (?, ?, JSON_OBJECT('ten', 'Cũ'), JSON_OBJECT('ten', 'Mới'), 'ChoDuyet')`,
    [branch.chiNhanhId, branchAdmin.account.taiKhoanId],
  );
  return {
    branchId: branch.chiNhanhId,
    patientId: patient.account.taiKhoanId,
    doctorId: doctor.account.taiKhoanId,
    systemAdminId: systemAdmin.account.taiKhoanId,
    branchAdminId: branchAdmin.account.taiKhoanId,
    appointment,
    yeuCauId: String(request.insertId),
  };
}

describe('DMS-08 người nhận do notifier thật chọn khớp cột "người nhận" của danh mục', () => {
  it('mọi dòng nghỉ phép, nạp ví, rút tiền, hoàn cọc và thay đổi chi nhánh', async () => {
    const w = await world();
    const leave: LeaveNotificationInput = {
      bacSiId: w.doctorId,
      chiNhanhId: w.branchId,
      tenBacSi: 'Bác sĩ Test',
      ngayBatDau: '2026-11-10',
      ngayKetThuc: '2026-11-10',
      ca: null,
    };
    const money = { benhNhanId: w.patientId, soTien: '100000.00', now: NOW };
    const branchChange = new BranchChangeNotifier();
    const E = BRANCH_CHANGE_EVENTS;

    await db.transaction(async (em) => {
      // doctor: bốn sự kiện nghỉ phép; người nhận của NghiPhepChoDuyet do notifier tự tìm
      const leaveNotifier = new LeaveNotifier();
      for (const loaiSuKien of Object.values(LEAVE_EVENTS))
        await leaveNotifier.notify(em, { loaiSuKien, ...leave });

      // payment: năm sự kiện nạp ví; Quản trị viên nhận lấy bằng câu thật của job đối soát
      const topup = new TopupNotifier();
      await topup.notifySucceeded(em, money);
      await topup.notifyFailed(em, money);
      await topup.notifyReconciled(em, money);
      await topup.notifyUnprocessable(em, money);
      await topup.notifyNeedsAttention(em, {
        giaoDichId: '1',
        adminIds: await new ReconcileRepository().findSystemAdmins(em),
        now: NOW,
      });

      // wallet: ba sự kiện rút tiền, hai sự kiện hoàn cọc
      const withdrawal = new WithdrawalNotifier();
      await withdrawal.notifySubmitted(em, money);
      await withdrawal.notifyApproved(em, money);
      await withdrawal.notifyRejected(em, money);
      const refund = new RefundNotifier();
      const appointmentRef = {
        lichHenId: w.appointment.lichHenId,
        maLichHen: w.appointment.maLichHen,
        now: NOW,
      };
      await refund.notifyRefunded(em, {
        ...appointmentRef,
        taiKhoanId: w.patientId,
        soTien: '100000.00',
      });
      await refund.notifyNeedsAttention(em, {
        ...appointmentRef,
        adminIds: await new RefundRepository().findSystemAdmins(em),
      });

      // admin: bảy sự kiện thay đổi chi nhánh; người nhận theo đúng nơi gọi thật (người đề xuất, bệnh nhân, Toàn hệ thống)
      const notify = (
        taiKhoanId: string,
        event: Parameters<typeof branchChange.notify>[1]['event'],
      ) =>
        branchChange.notify(em, {
          yeuCauId: w.yeuCauId,
          taiKhoanId,
          event,
          noiDung: 'Nội dung thử.',
          now: NOW,
        });
      await notify(w.branchAdminId, { type: E.RESULT });
      await notify(w.patientId, { type: E.AFFECTED, version: 1 });
      await notify(w.patientId, { type: E.CANCELLED });
      await notify(w.branchAdminId, { type: E.CANCELLED });
      await notify(w.patientId, { type: E.RESCHEDULED, version: 1 });
      await notify(w.branchAdminId, { type: E.RESCHEDULE_RESULT, version: 1 });
      await notify(w.systemAdminId, { type: E.OVERDUE, version: 1 });
      await notify(w.systemAdminId, { type: E.WITHDRAWN });
    });

    const rows = await readRecipients();
    // Đủ 21 mã khác nhau: 4 nghỉ phép + 5 nạp ví + 3 rút tiền + 2 hoàn cọc + 7 thay đổi chi nhánh (không sót notifier nào)
    const distinct = new Set(rows.map((r) => r.loai.split(':', 1)[0]));
    expect(distinct.size).toBe(21);

    const mismatched = rows.filter((row) => {
      const entry = findCatalogEntry(row.loai);
      return (
        entry === null || !entry.nguoiNhan.some((role) => role === row.vaiTro)
      );
    });
    expect(mismatched).toEqual([]);
  });

  it('NghiPhepChoDuyet tới Quản trị viên Toàn hệ thống và Chi nhánh của bác sĩ; NapViCanXuLy, HoanCocCanXuLy chỉ tới Toàn hệ thống', async () => {
    const w = await world();
    await db.transaction(async (em) => {
      await new LeaveNotifier().notify(em, {
        loaiSuKien: LEAVE_EVENTS.Pending,
        bacSiId: w.doctorId,
        chiNhanhId: w.branchId,
        tenBacSi: 'Bác sĩ Test',
        ngayBatDau: '2026-11-10',
        ngayKetThuc: '2026-11-10',
        ca: null,
      });
      await new TopupNotifier().notifyNeedsAttention(em, {
        giaoDichId: '1',
        adminIds: await new ReconcileRepository().findSystemAdmins(em),
        now: NOW,
      });
      await new RefundNotifier().notifyNeedsAttention(em, {
        lichHenId: w.appointment.lichHenId,
        maLichHen: w.appointment.maLichHen,
        adminIds: await new RefundRepository().findSystemAdmins(em),
        now: NOW,
      });
    });

    const rows = await readRecipients();
    const scopesOf = (loai: string) =>
      rows
        .filter((r) => r.loai === loai)
        .map((r) => `${r.vaiTro}/${r.phamVi ?? '-'}`)
        .sort();
    expect(scopesOf('NghiPhepChoDuyet')).toEqual([
      'QuanTriVien/ChiNhanh',
      'QuanTriVien/ToanHeThong',
    ]);
    expect(scopesOf('NapViCanXuLy')).toEqual(['QuanTriVien/ToanHeThong']);
    expect(scopesOf('HoanCocCanXuLy')).toEqual(['QuanTriVien/ToanHeThong']);
  });
});
