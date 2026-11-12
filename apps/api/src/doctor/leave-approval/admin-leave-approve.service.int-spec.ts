import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { KhungGio } from '../../admin/entities/khung-gio.entity.js';
import { LEAVE_CANCEL_REASON } from '../../appointments/appointments.constants.js';
import { AppointmentQueries } from '../../appointments/queries/appointment-queries.js';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import {
  atRemaining,
  cancelWorld,
  createCancelStack,
  HOUR_MS,
  type CancelWorld,
} from '../../appointments/testing/cancel-world.js';
import { resetBookingData } from '../../appointments/testing/create-appointment-world.js';
import {
  firstTableOf,
  isLockingStatement,
} from '../../appointments/testing/query-spy.js';
import { recordStatements } from '../../appointments/testing/statement-recorder.js';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { LeaveNotifier } from '../notifications/leave-notifier.js';
import { AdminLeaveApproveService } from './admin-leave-approve.service.js';
import { AdminLeaveRejectService } from './admin-leave-reject.service.js';
import { AdminLeaveRepository } from './admin-leave.repository.js';
import type { AppointmentCancellationPort } from './appointment-cancellation.port.js';
import { BookingCancellationAdapter } from './booking-cancellation.adapter.js';
import { LeaveCancellationRunner } from './leave-cancellation.runner.js';

// Doctor B15 — Duyệt yêu cầu nghỉ trên MySQL 8.4 THẬT, mức dịch vụ (PLAN doctor 5.8, 5.9, 7): PD-06, PD-09, PD-17, DH-06, DH-08, và một ca nối `booking` THẬT
// (`findAffectedByLeave` B11 + `cancel` B10; cổng hoàn tiền, mời chờ, thông báo của booking là bản giả của booking). PD-07, PD-08, PD-10, HD-07: leave-cancellation.runner.spec.ts.
// Phần HTTP (vai trò, phạm vi, mã lỗi qua bộ lọc): test/doctor-admin-leave-approve.e2e-spec.ts.
// Đồng hồ giả: T0 = 08:00 ngày 02/11/2026 (giờ VN). Ca sáng của bác sĩ ngày 10/11/2026 có 8 khung giờ từ 08:00, mỗi ô 30 phút.
const LEAVE_DAY = '2026-11-10';
const SYSTEM: AdminScope = { kind: 'ToanHeThong' };

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

/** Dịch vụ Duyệt/Từ chối dựng bằng tay; mặc định cổng là bản thật nối `booking` (cổng sau commit của booking là bản giả). */
function createServices(port?: AppointmentCancellationPort) {
  const { service: cancellation } = createCancelStack(db);
  const realPort = new BookingCancellationAdapter(
    db,
    new AppointmentQueries(),
    cancellation,
  );
  const repository = new AdminLeaveRepository(db);
  const policy = new BranchAccessPolicy();
  const audit = new AuditService(new AuditRepository());
  const notifier = new LeaveNotifier();
  return {
    approval: new AdminLeaveApproveService(
      repository,
      policy,
      audit,
      notifier,
      new LeaveCancellationRunner(port ?? realPort),
    ),
    rejection: new AdminLeaveRejectService(repository, policy, audit, notifier),
  };
}

async function setup() {
  const w = await cancelWorld(db, fx);
  const doctorId = w.doctor.account.taiKhoanId;
  const adminId = w.systemAdmin.account.taiKhoanId;
  const leave = (
    input: {
      batDau?: string;
      ketThuc?: string;
      ca?: 'CaSang' | 'CaChieu';
    } = {},
  ) =>
    fx.doctor.leaveRequest({
      bacSiId: doctorId,
      batDau: input.batDau ?? LEAVE_DAY,
      ...(input.ketThuc ? { ketThuc: input.ketThuc } : {}),
      ...(input.ca ? { hinhThuc: 'TheoCa' as const, ca: input.ca } : {}),
    });
  return { w, doctorId, adminId, leave };
}

const requestRow = async (id: string) =>
  (
    await db.query(
      `SELECT trang_thai AS trangThai, CAST(nguoi_xu_ly_id AS CHAR) AS nguoi, thoi_diem_xu_ly AS luc FROM yeu_cau_nghi_phep WHERE yeu_cau_nghi_phep_id = ?`,
      [id],
    )
  )[0] as { trangThai: string; nguoi: string | null; luc: Date | null };

const appointmentRow = async (lichHenId: string) =>
  (
    await db.query(
      `SELECT trang_thai AS trangThai, ly_do_huy AS lyDo FROM lich_hen WHERE lich_hen_id = ?`,
      [lichHenId],
    )
  )[0] as { trangThai: string; lyDo: string | null };

const count = async (sql: string) =>
  Number((await db.query(`SELECT COUNT(*) AS so ${sql}`))[0].so);

/** Mã lỗi của một lời hứa bị từ chối bằng `AppException` (ném lại mọi lỗi khác). */
async function errorCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error.maLoi;
    throw error;
  }
  throw new Error('Mong đợi lỗi nhưng thành công');
}

describe('B15 — Duyệt yêu cầu nghỉ phép (mức dịch vụ, MySQL thật)', () => {
  it('PD-06 bước 1: DaDuyet + người/thời điểm xử lý, nhật ký DuyetNghiPhep, thông báo NghiPhepDaDuyet; khoá bac_si TRƯỚC hàng yêu cầu', async () => {
    const { doctorId, adminId, leave, w } = await setup();
    const id = await leave({ ca: 'CaSang' });
    const statements = recordStatements(db);

    const result = await createServices().approval.approve(SYSTEM, adminId, id);

    expect(result).toEqual({
      yeuCauNghiPhepId: id,
      trangThai: 'DaDuyet',
      thoiDiemXuLy: '2026-11-02T01:00:00.000Z',
      huyLichHen: {
        hoanTat: true,
        daHuy: 0,
        daHuyTruocDo: 0,
        khongHuyDuoc: [],
      },
    });
    // Không có lịch hẹn nào: chỉ hai câu khoá, đúng thứ tự PLAN 5.9 (tầng 4 rồi hàng yêu cầu).
    expect(statements.filter(isLockingStatement).map(firstTableOf)).toEqual([
      'bac_si',
      'yeu_cau_nghi_phep',
    ]);

    const saved = await requestRow(id);
    expect(saved.trangThai).toBe('DaDuyet');
    expect(saved.nguoi).toBe(adminId);
    expect(saved.luc).not.toBeNull();

    const logs: { action: string; branch: string; changes: unknown }[] =
      await db.query(
        `SELECT hanh_dong AS action, CAST(chi_nhanh_id AS CHAR) AS branch, chi_tiet_thay_doi AS changes FROM nhat_ky_hanh_dong`,
      );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe('DuyetNghiPhep');
    expect(logs[0]?.branch).toBe(w.branch.chiNhanhId);
    const changes =
      typeof logs[0]?.changes === 'string'
        ? JSON.parse(logs[0].changes)
        : logs[0]?.changes;
    expect(changes).toEqual({
      bac_si_id: doctorId,
      ngay_bat_dau: LEAVE_DAY,
      ngay_ket_thuc: LEAVE_DAY,
      ca: 'CaSang',
    });

    const notes: { who: string; type: string }[] = await db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS who, loai_su_kien AS type FROM thong_bao`,
    );
    expect(notes).toEqual([{ who: doctorId, type: 'NghiPhepDaDuyet' }]);
  });

  it('bước 2 với booking THẬT: huỷ ChoThanhToan và DaXacNhan trong khoảng nghỉ (ly_do_huy = chữ hằng), giữ DaTiepDon và lịch ngoài khoảng', async () => {
    const { adminId, leave, w } = await setup();
    const confirmed = await w.booked('DaXacNhan', 0);
    const pending = await w.booked('ChoThanhToan', 1);
    const checkedIn = await w.booked('DaTiepDon', 2);
    const id = await leave();

    const result = await createServices().approval.approve(SYSTEM, adminId, id);

    expect(result.huyLichHen).toEqual({
      hoanTat: true,
      daHuy: 2,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
    expect(await appointmentRow(confirmed.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      lyDo: LEAVE_CANCEL_REASON,
    });
    expect((await appointmentRow(pending.lichHenId)).trangThai).toBe('DaHuy');
    expect((await appointmentRow(checkedIn.lichHenId)).trangThai).toBe(
      'DaTiepDon',
    );
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(1, 'ConTrong');
  });

  it('bước 2 theo ca: nghỉ CaChieu không huỷ lịch của CaSang', async () => {
    const { adminId, leave, w } = await setup();
    const morning = await w.booked('DaXacNhan', 0);
    const id = await leave({ ca: 'CaChieu' });
    const result = await createServices().approval.approve(SYSTEM, adminId, id);
    expect(result.huyLichHen.daHuy).toBe(0);
    expect((await appointmentRow(morning.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );
  });

  it('PD-09 ngày kết thúc trước hôm nay ⇒ 409 YEU_CAU_NGHI_DA_QUA_HAN và không đổi gì; vẫn Từ chối được', async () => {
    const { adminId, leave } = await setup();
    const id = await leave({ batDau: '2026-10-30', ketThuc: '2026-11-01' });
    const { approval, rejection } = createServices();
    expect(await errorCodeOf(approval.approve(SYSTEM, adminId, id))).toBe(
      'YEU_CAU_NGHI_DA_QUA_HAN',
    );
    expect((await requestRow(id)).trangThai).toBe('ChoDuyet');
    expect(await count('FROM nhat_ky_hanh_dong')).toBe(0);
    expect(await count('FROM thong_bao')).toBe(0);
    await rejection.reject(SYSTEM, adminId, id, 'Đã quá hạn');
    expect((await requestRow(id)).trangThai).toBe('TuChoi');
  });

  it('PD-09 biên: ngày kết thúc ĐÚNG hôm nay thì duyệt được', async () => {
    const { adminId, leave } = await setup();
    const id = await leave({ batDau: '2026-11-01', ketThuc: '2026-11-02' });
    await createServices().approval.approve(SYSTEM, adminId, id);
    expect((await requestRow(id)).trangThai).toBe('DaDuyet');
  });

  it('PD-09 một phần đã qua: now là cận dưới, lịch đã qua giờ và lịch đúng bằng now KHÔNG bị huỷ, lịch sau now bị huỷ', async () => {
    const { adminId, leave, w } = await setup();
    const past = await w.booked('DaXacNhan', 0); // 08:00
    const exactlyNow = await w.booked('DaXacNhan', 2); // 09:00
    const later = await w.booked('DaXacNhan', 4); // 10:00
    const id = await leave();
    atRemaining(-HOUR_MS); // đồng hồ: 09:00 ngày 10/11/2026

    const result = await createServices().approval.approve(SYSTEM, adminId, id);

    expect(result.huyLichHen.daHuy).toBe(1);
    expect((await appointmentRow(past.lichHenId)).trangThai).toBe('DaXacNhan');
    expect((await appointmentRow(exactlyNow.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );
    expect((await appointmentRow(later.lichHenId)).trangThai).toBe('DaHuy');
  });

  it('PD-17 ca của yêu cầu mang chi nhánh khác (dữ liệu lệch): vẫn xử lý theo (ngày, ca), không lọc chi nhánh', async () => {
    const { adminId, leave, w } = await setup();
    const other = await fx.admin.branch();
    await db.query(
      `UPDATE lich_lam_viec SET chi_nhanh_id = ? WHERE lich_lam_viec_id = ?`,
      [other.chiNhanhId, w.shift.lichLamViecId],
    );
    const lich = await w.booked('DaXacNhan', 3);
    const id = await leave();
    const result = await createServices().approval.approve(SYSTEM, adminId, id);
    expect(result.huyLichHen.daHuy).toBe(1);
    expect((await appointmentRow(lich.lichHenId)).trangThai).toBe('DaHuy');
  });

  it('PD-10 bước 2 ném lỗi: vẫn 200 DaDuyet, hoanTat = false; nhật ký và thông báo của bước 1 còn nguyên', async () => {
    const { adminId, leave } = await setup();
    const id = await leave();
    const broken: AppointmentCancellationPort = {
      findAffected: async () => [{ lichHenId: '1', maLichHen: 'X' }],
      cancelForLeave: async () => {
        throw new Error('mất kết nối');
      },
    };
    const result = await createServices(broken).approval.approve(
      SYSTEM,
      adminId,
      id,
    );
    expect(result.trangThai).toBe('DaDuyet');
    expect(result.huyLichHen.hoanTat).toBe(false);
    expect((await requestRow(id)).trangThai).toBe('DaDuyet');
    expect(await count('FROM nhat_ky_hanh_dong')).toBe(1);
    expect(await count('FROM thong_bao')).toBe(1);
  });

  it('lỗi ghi nhật ký ở bước 1 ⇒ hoàn tác cả việc duyệt và KHÔNG chạy bước 2', async () => {
    const { adminId, leave, w } = await setup();
    const lich = await w.booked('DaXacNhan', 0);
    const id = await leave();
    vi.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(
      new Error('nhat_ky hỏng'),
    );
    await expect(
      createServices().approval.approve(SYSTEM, adminId, id),
    ).rejects.toThrow('nhat_ky hỏng');
    expect((await requestRow(id)).trangThai).toBe('ChoDuyet');
    expect(await count('FROM thong_bao')).toBe(0);
    expect((await appointmentRow(lich.lichHenId)).trangThai).toBe('DaXacNhan');
  });

  it('duyệt yêu cầu không có, hay Admin Chi nhánh khác ⇒ 404 KHONG_TIM_THAY và không đổi gì', async () => {
    const { adminId, leave } = await setup();
    const id = await leave();
    const other = await fx.admin.branch();
    const { approval } = createServices();
    expect(await errorCodeOf(approval.approve(SYSTEM, adminId, '999999'))).toBe(
      'KHONG_TIM_THAY',
    );
    expect(
      await errorCodeOf(
        approval.approve(
          { kind: 'ChiNhanh', chiNhanhId: other.chiNhanhId },
          adminId,
          id,
        ),
      ),
    ).toBe('KHONG_TIM_THAY');
    expect((await requestRow(id)).trangThai).toBe('ChoDuyet');
  });

  it('DH-08 hai Admin cùng xử lý một yêu cầu (duyệt + duyệt, duyệt + từ chối): đúng một thắng, một YEU_CAU_DA_XU_LY', async () => {
    const { adminId, leave } = await setup();
    const secondId = (await fx.admin.admin()).account.taiKhoanId;
    const { approval, rejection } = createServices();
    for (const second of [0, 1] as const)
      for (let round = 0; round < 5; round += 1) {
        const id = await leave();
        const other =
          second === 0
            ? approval.approve(SYSTEM, secondId, id)
            : rejection.reject(SYSTEM, secondId, id, 'Không đủ người trực');
        const results = await Promise.allSettled([
          approval.approve(SYSTEM, adminId, id),
          other,
        ]);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        const loser = rejected[0]?.reason as AppException | undefined;
        expect(loser?.maLoi).toBe('YEU_CAU_DA_XU_LY');
      }
    // Mỗi yêu cầu đúng một dòng nhật ký và một thông báo.
    expect(await count('FROM nhat_ky_hanh_dong')).toBe(10);
    expect(await count('FROM thong_bao')).toBe(10);
  });
});

describe('DH-06 duyệt nghỉ (bước 1 thật, huỷ thật) đua với đặt lịch giả', () => {
  /**
   * Đặt lịch giả theo đúng hợp đồng D4 của booking: giao dịch giữ `bac_si` FOR SHARE, hỏi `LeaveReader` (cả `ChoDuyet` và `DaDuyet` chặn), rồi mới chèn lịch `DaXacNhan`.
   * Fixture chèn qua `em` của giao dịch (cùng commit).
   */
  async function fakeBook(
    w: CancelWorld,
    slot: number,
  ): Promise<'booked' | 'blocked'> {
    return db.transaction('READ COMMITTED', async (em: EntityManager) => {
      await em.query(
        `SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR SHARE`,
        [w.doctor.account.taiKhoanId],
      );
      const blocking = await new LeaveReader().findBlockingLeave(em, {
        bacSiId: w.doctor.account.taiKhoanId,
        ngay: LEAVE_DAY,
        ca: 'CaSang',
      });
      if (blocking !== null) return 'blocked';
      const khungGio = await em
        .getRepository(KhungGio)
        .findOneByOrFail({ khungGioId: w.slotId(slot) });
      await new AdminFixtures(em).appointment(
        w.doctor.profile,
        khungGio,
        w.patientId,
      );
      return 'booked';
    });
  }

  it('≥ 30 vòng: sau khi Duyệt trả về, không còn lịch ChoThanhToan/DaXacNhan nào sau now trong khoảng nghỉ; đặt lịch đua bị chặn', async () => {
    const { adminId, leave, w } = await setup();
    const { approval } = createServices();
    let blocked = 0;
    for (let round = 0; round < 30; round += 1) {
      await resetBookingData(db);
      await db.query('DELETE FROM yeu_cau_nghi_phep');
      // Lịch có từ TRƯỚC khi gửi yêu cầu: bước 2 phải thấy và huỷ.
      await w.booked('DaXacNhan', 0);
      const id = await leave();
      const [result, booking] = await Promise.all([
        approval.approve(SYSTEM, adminId, id),
        fakeBook(w, 1 + (round % 6)),
      ]);
      if (booking === 'blocked') blocked += 1;
      expect(result.huyLichHen.hoanTat).toBe(true);
      expect(
        await count(
          `FROM lich_hen WHERE bac_si_id = ${Number(w.doctor.account.taiKhoanId)} AND trang_thai IN ('ChoThanhToan', 'DaXacNhan')`,
        ),
        `vòng ${round}`,
      ).toBe(0);
    }
    // Yêu cầu đã ChoDuyet trước khi đua nên đặt lịch luôn bị chặn (D4).
    expect(blocked).toBe(30);
  });
});
