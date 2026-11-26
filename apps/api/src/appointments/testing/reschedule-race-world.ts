import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BranchChangeApplyRepository } from '../../admin/branch-change-requests/apply/branch-change-apply.repository.js';
import { BranchChangeApplyService } from '../../admin/branch-change-requests/apply/branch-change-apply.service.js';
import { BranchRepository } from '../../admin/branches/branch.repository.js';
import { BranchImpactService } from '../../admin/branches/impact/branch-impact.service.js';
import type { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { BookingCancellationAdapter } from '../../doctor/leave-approval/booking-cancellation.adapter.js';
import { DoctorLeaveRepository } from '../../doctor/leave-requests/doctor-leave.repository.js';
import { DoctorLeaveService } from '../../doctor/leave-requests/doctor-leave.service.js';
import { LeaveNotifier } from '../../doctor/notifications/leave-notifier.js';
import {
  createLeaveServices,
  SYSTEM,
} from '../../doctor/testing/leave-approval-world.js';
import { BranchChangeNotifier } from '../../notification/branch-change-notifier.js';
import { cashWorld } from '../../payment/testing/cash-stack.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { AppointmentsModule } from '../appointments.module.js';
import { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import { CreateAppointmentService } from '../create/create-appointment.service.js';
import { HoldExpiryJob } from '../expiry/hold-expiry.job.js';
import { NoShowJob } from '../noshow/no-show.job.js';
import { AppointmentQueries } from '../queries/appointment-queries.js';
import { AppointmentRescheduleService } from '../reschedule/appointment-reschedule.service.js';
import { ReceptionRescheduleService } from '../reschedule/reception-reschedule.service.js';
import { RescheduleRequestApproveService } from '../reschedule/reschedule-request-approve.service.js';
import { RescheduleRequestRejectService } from '../reschedule/reschedule-request-reject.service.js';
import { RescheduleRequestService } from '../reschedule/reschedule-request.service.js';
import type { RescheduleInput } from '../reschedule/reschedule.types.js';
import { AdminOverrideService } from '../status/admin-override.service.js';
import { ReceptionStatusService } from '../status/reception-status.service.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import { type BookingFixtures, BOOKABLE_DAY } from './booking-fixtures.js';
import { REFUND_POLICY } from './cancel-world.js';
import { insertRequestAt } from './reschedule-request-world.js';

// Thế giới của bộ ca đồng thời X2 của đổi lịch (reschedule X2; PLAN reschedule 5.4, 7.5; TRACKING reschedule 1.17): `AppointmentsModule` THẬT (đổi lịch, huỷ, create, tiếp đón, override, job hết hạn, job vắng mặt, duyệt, từ chối,
// đổi hộ) nối cổng ví, thanh toán, nghỉ phép, thay đổi chi nhánh THẬT (chỉ danh sách chờ là `Noop`), trên dữ liệu `cashWorld` của payment B6 (lịch cọc > 0 có khoản ví thật theo sổ cái). Mẫu: `appointment-reschedule.real-stack.int-spec.ts`
// của B4. Thêm các đối tác DỰNG TAY của module khác (chỉ ĐỌC và IMPORT, không sửa): nghỉ phép của `doctor`, áp dụng thay đổi chi nhánh của `admin`, thu tiền mặt của `payment`. Nằm trong `testing/` nên AR-01, AR-03, AR-06 bỏ qua.
// Ô i của thế giới bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (thứ Ba); đồng hồ giả của `useIntegrationHooks` là 08:00 ngày 02/11/2026. Mọi dữ liệu là DỮ LIỆU GIẢ.

/** Lý do đổi hộ hợp lệ (1 đến 255 đơn vị UTF-16, không giống bí mật). */
export const PROXY_REASON = 'Bệnh nhân gọi điện xin dời lịch vì việc đột xuất';

const opened: TestingModule[] = [];

/** Đóng mọi module đã mở bằng `raceWorld` (gọi ở `afterEach`). */
export async function closeRaceModules(): Promise<void> {
  for (const moduleRef of opened.splice(0)) await moduleRef.close();
}

/** Bệnh nhân và ví của họ (id là chuỗi). */
export interface PatientRef {
  accountId: string;
  walletId: string;
}

export interface BookOptions {
  patient?: PatientRef;
  /** Cọc ĐÃ TRẢ bằng ví (khoản thật trong sổ cái); mặc định 0 */
  coc?: string;
  gia?: string;
  /** `chinh_sach_hoan_snapshot`; mặc định `REFUND_POLICY` (24 giờ: 100%, 2 giờ: 50%, còn lại 0%) */
  policy?: unknown;
  /** `so_lan_tu_doi_lich` của lịch; mặc định 0 */
  soLan?: number;
}

/** Hàng `lich_hen` đọc ra để so (id là CHUỖI). */
export interface RaceRow {
  maLichHen: string;
  trangThai: string;
  truoc: string | null;
  khungGioId: string;
  benhNhanId: string;
}

/** Dòng SQL dọn giữa các vòng (thứ tự theo khoá ngoại). Giữ nguyên bác sĩ, ca, khung giờ, Bệnh nhân và ví (số dư về 0, khớp sổ cái rỗng). */
const RESET_SQL = [
  'DELETE FROM email_thong_bao',
  'DELETE FROM thong_bao',
  'DELETE FROM nhat_ky_hanh_dong',
  'DELETE FROM yeu_cau_doi_lich_ngoai_chinh_sach',
  'DELETE FROM giao_dich_vi',
  'DELETE FROM lich_su_hoan_tien',
  'DELETE FROM giao_dich_thanh_toan',
  'DELETE FROM lich_hen ORDER BY lich_hen_id DESC',
  "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  'UPDATE vi_noi_bo SET so_du = 0, so_tien_dang_giu = 0',
  'UPDATE benh_nhan SET so_lan_no_show = 0, khoa_dat_lich_do_no_show = 0',
  'DELETE FROM yeu_cau_nghi_phep',
] as const;

export async function raceWorld(
  db: DataSource,
  fx: BookingFixtures,
  options: { config?: Partial<CauHinhHeThong> } = {},
) {
  const w = await cashWorld(db, fx);
  // `fx.world()` ghi cấu hình mặc định (tối đa 0 lần tự đổi): đặt 2 để Bệnh nhân tự đổi được (cửa sổ tiếp đón 30 và 15 phút giữ nguyên)
  await fx.systemConfig({ soLanTuDoiLichToiDa: 2, ...options.config });
  const moduleRef = await Test.createTestingModule({
    imports: [AppointmentsModule],
  })
    .useMocker((token) => (token === DataSource ? db : undefined))
    .compile();
  opened.push(moduleRef);
  const get = <T>(token: unknown): T =>
    moduleRef.get<T>(token as never, { strict: false });

  const self: PatientRef = { accountId: w.patientId, walletId: w.walletId };
  const doctorId = w.doctor.account.taiKhoanId;
  const branchId = w.branch.chiNhanhId;
  const adminId = w.systemAdmin.account.taiKhoanId;

  /** Id khung giờ: số ⇒ ô thứ i của thế giới; chuỗi ⇒ id viết thẳng. */
  const slot = (ref: number | string): string =>
    typeof ref === 'number' ? w.slotId(ref) : ref;

  /** Lịch `DaXacNhan` ở ô `ref` (khung giờ `DaDat`), cọc `coc` TRẢ BẰNG VÍ thật (khoản nạp, khoản trừ, so_du không đổi), chính sách hoàn và bộ đếm ghi tường minh. */
  const book = async (
    ref: number | string,
    extra: BookOptions = {},
  ): Promise<LichHen> => {
    const patient = extra.patient ?? self;
    const coc = extra.coc ?? '0.00';
    const lich = await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: slot(ref),
      patientId: patient.accountId,
      giaSnapshot: extra.gia ?? '300000.00',
      ...(coc === '0.00' ? {} : { tienCocSnapshot: coc }),
    });
    if (coc !== '0.00')
      await w.wallets.insertWalletDeposit({
        viNoiBoId: patient.walletId,
        lichHenId: lich.lichHenId,
        soTien: coc,
      });
    await db.query(
      'UPDATE lich_hen SET chinh_sach_hoan_snapshot = ?, so_lan_tu_doi_lich = ? WHERE lich_hen_id = ?',
      [
        JSON.stringify(extra.policy ?? REFUND_POLICY),
        extra.soLan ?? 0,
        lich.lichHenId,
      ],
    );
    return lich;
  };

  /** Bệnh nhân mới kèm ví (id là chuỗi). */
  const newPatient = async (): Promise<PatientRef> => {
    const created = await fx.admin.patient();
    return {
      accountId: created.account.taiKhoanId,
      walletId: created.wallet.viNoiBoId,
    };
  };

  const rowOf = async (lichHenId: string): Promise<RaceRow> => {
    const rows: RaceRow[] = await db.query(
      `SELECT ma_lich_hen AS maLichHen, trang_thai AS trangThai, CAST(lich_hen_truoc_id AS CHAR) AS truoc,
              CAST(khung_gio_id AS CHAR) AS khungGioId, CAST(benh_nhan_id AS CHAR) AS benhNhanId
         FROM lich_hen WHERE lich_hen_id = ?`,
      [lichHenId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`không có lịch ${lichHenId}`);
    return row;
  };
  /** Mọi lịch theo thứ tự id (để in khi một vòng đỏ). */
  const allRows = (): Promise<(RaceRow & { lichHenId: string })[]> =>
    db.query(
      `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, ma_lich_hen AS maLichHen, trang_thai AS trangThai, CAST(lich_hen_truoc_id AS CHAR) AS truoc,
              CAST(khung_gio_id AS CHAR) AS khungGioId, CAST(benh_nhan_id AS CHAR) AS benhNhanId
         FROM lich_hen ORDER BY lich_hen_id`,
    );
  /** Lịch CON (lịch mới nối chuỗi) của `lichHenId`, hoặc `null`. */
  const childOf = async (lichHenId: string): Promise<RaceRow | null> => {
    const rows: RaceRow[] = await db.query(
      `SELECT ma_lich_hen AS maLichHen, trang_thai AS trangThai, CAST(lich_hen_truoc_id AS CHAR) AS truoc,
              CAST(khung_gio_id AS CHAR) AS khungGioId, CAST(benh_nhan_id AS CHAR) AS benhNhanId
         FROM lich_hen WHERE lich_hen_truoc_id = ?`,
      [lichHenId],
    );
    return rows[0] ?? null;
  };
  const countRows = async (table: string, where = '1 = 1'): Promise<number> => {
    const rows: { n: number | string }[] = await db.query(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
    );
    return Number(rows[0]?.n);
  };
  /** Số dòng hoàn tiền `ThanhCong` và số dư ví (chuỗi decimal) của `walletId`. */
  const refundCount = () =>
    countRows('lich_su_hoan_tien', "trang_thai = 'ThanhCong'");
  const balanceOf = async (walletId: string): Promise<string> =>
    (await w.wallets.readWallet(walletId)).soDu;
  const slotState = (ref: number | string) => fx.slotState(slot(ref));

  const tuDoi = (
    maLichHen: string,
    to: number | string,
    accountId: string = self.accountId,
  ): RescheduleInput => ({
    maLichHen,
    khungGioMoiId: slot(to),
    actor: { via: 'TuDoi', accountId },
  });

  const proxy = get<ReceptionRescheduleService>(ReceptionRescheduleService);
  /** Lễ tân đổi hộ qua dịch vụ của ROUTE (Audit `DoiLichHo` cùng giao dịch, thông báo); từ chối thì ném `AppException`. */
  const doiHo = (
    maLichHen: string,
    to: number | string,
    accountId: string = w.receptionId,
  ) =>
    proxy.reschedule(accountId, maLichHen, {
      khungGioId: slot(to),
      lyDo: PROXY_REASON,
    });

  /** Yêu cầu `ChoDuyet` của lịch `lichHenId` mong muốn ô `to` (chèn thẳng; `soLan` của lịch nên là 2 để đúng nghiệp vụ). */
  const openRequest = (lichHenId: string, to: number | string) =>
    insertRequestAt(db, {
      lichHenId,
      khungGioMongMuonId: slot(to),
      thoiDiemTao: '2026-11-01 09:00:00',
    });

  /** Trạng thái hiện tại của một yêu cầu đổi lịch (`ChoDuyet`, `DaDuyet`, `TuChoi`). */
  const requestStatus = async (yeuCauId: string): Promise<string> => {
    const rows: { trangThai: string }[] = await db.query(
      'SELECT trang_thai AS trangThai FROM yeu_cau_doi_lich_ngoai_chinh_sach WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = ?',
      [yeuCauId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`không có yêu cầu ${yeuCauId}`);
    return row.trangThai;
  };

  const resetRound = async (): Promise<void> => {
    for (const sql of RESET_SQL) await db.query(sql);
  };

  const cancel = get<AppointmentCancellationService>(
    AppointmentCancellationService,
  );

  return {
    ...w,
    db,
    fx,
    moduleRef,
    self,
    doctorId,
    branchId,
    adminId,
    systemScope: SYSTEM,
    slot,
    book,
    newPatient,
    rowOf,
    allRows,
    childOf,
    countRows,
    refundCount,
    balanceOf,
    slotState,
    tuDoi,
    openRequest,
    requestStatus,
    resetRound,
    /** Dịch vụ THẬT lấy từ `AppointmentsModule` */
    core: get<AppointmentRescheduleService>(AppointmentRescheduleService),
    cancel,
    create: get<CreateAppointmentService>(CreateAppointmentService),
    request: get<RescheduleRequestService>(RescheduleRequestService),
    approveService: get<RescheduleRequestApproveService>(
      RescheduleRequestApproveService,
    ),
    rejectService: get<RescheduleRequestRejectService>(
      RescheduleRequestRejectService,
    ),
    proxy,
    doiHo,
    status: get<ReceptionStatusService>(ReceptionStatusService),
    override: get<AdminOverrideService>(AdminOverrideService),
    transition: get<AppointmentTransitionService>(AppointmentTransitionService),
    expiryJob: get<HoldExpiryJob>(HoldExpiryJob),
    noShowJob: get<NoShowJob>(NoShowJob),
    queries: get<AppointmentQueries>(AppointmentQueries),
    /** Lễ tân THỨ HAI của CÙNG chi nhánh */
    secondReceptionist: async (): Promise<string> =>
      (await fx.admin.receptionist(w.branch)).account.taiKhoanId,
    /** Quản trị viên Toàn hệ thống mới (người xử lý thứ hai). */
    secondAdmin: async () => {
      const created = await fx.admin.admin();
      return {
        accountId: created.account.taiKhoanId,
        scope: SYSTEM,
      };
    },
  };
}

export type RaceWorld = Awaited<ReturnType<typeof raceWorld>>;

/**
 * Nghỉ phép THẬT của `doctor` (gửi yêu cầu rồi Quản trị viên duyệt): bước huỷ lịch của duyệt đi qua `BookingCancellationAdapter` bọc dịch vụ huỷ THẬT của module, nên hoàn cọc vào ví THẬT (không phải cổng `Fake`
 * của `createLeaveServices` mặc định). `leaveOn(ngay)` gửi yêu cầu nghỉ CẢ NGÀY `ngay` (`ChoDuyet`); `approve(id)` duyệt bằng Quản trị viên Toàn hệ thống.
 */
export function leaveActors(w: RaceWorld) {
  const port = new BookingCancellationAdapter(w.db, w.queries, w.cancel);
  const services = createLeaveServices(w.db, port);
  const submit = new DoctorLeaveService(
    new DoctorLeaveRepository(w.db),
    new LeaveReader(),
    new BranchHoursReader(),
    new LeaveNotifier(),
    port,
  );
  const leaveOn = async (ngay: string = BOOKABLE_DAY) =>
    (
      await submit.create(w.doctorId, {
        hinhThuc: 'CaNgay',
        tuNgay: ngay,
        denNgay: ngay,
        ca: null,
        lyDo: 'Việc gia đình',
      })
    ).yeuCauNghiPhepId;
  const approve = (yeuCauNghiPhepId: string) =>
    services.approval.approve(SYSTEM, w.adminId, yeuCauNghiPhepId);
  return {
    leaveOn,
    approve,
    /**
     * Hai bước THẬT liên tiếp (DT-09 của B16a): gửi yêu cầu nghỉ CẢ NGÀY rồi duyệt ngay. `LeaveReader` coi yêu cầu `ChoDuyet` LẪN `DaDuyet` là chặn khung giờ, nên cuộc đua với đổi lịch là cuộc đua với bước GỬI
     * (khoá `bac_si FOR UPDATE`), không phải riêng bước duyệt.
     */
    submitAndApprove: async (ngay: string = BOOKABLE_DAY) =>
      approve(await leaveOn(ngay)),
  };
}

/** Áp dụng thay đổi chi nhánh THẬT (`BranchChangeApplyService`, như job `apply.job.ts` gọi mỗi yêu cầu một lần); `impact` cho phép bọc `lockSlotsOfDays` (cổng ép chồng của TDL-10). */
export function branchApplyActor(
  w: RaceWorld,
  impact: BranchImpactService = new BranchImpactService(),
) {
  const service = new BranchChangeApplyService(
    new BranchChangeApplyRepository(w.db),
    new BranchRepository(w.db),
    impact,
    new BranchChangeNotifier(),
  );
  return { service, impact };
}
