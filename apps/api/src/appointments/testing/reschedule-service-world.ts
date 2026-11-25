import type { DataSource } from 'typeorm';
import { expect } from 'vitest';
import type { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import {
  randomCodeSuffix,
  type CodeSuffixSource,
} from '../appointment-code.js';
import type { AppointmentNotifier } from '../ports/appointment-notifier.port.js';
import type { WaitlistPort } from '../ports/waitlist.port.js';
import { AppointmentRescheduleService } from '../reschedule/appointment-reschedule.service.js';
import { RescheduleReader } from '../reschedule/reschedule.reader.js';
import type {
  RescheduleAfterWrite,
  RescheduleInput,
} from '../reschedule/reschedule.types.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import type { BookingFixtures } from './booking-fixtures.js';
import {
  FakeAppointmentNotifier,
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
  FakeWaitlistPort,
} from './fake-ports.js';
import {
  assertBookingInvariants,
  assertRescheduleInvariants,
  captureMoneyTotals,
  type MoneyTotals,
} from './invariants.js';

// Dựng "thế giới đổi lịch" cho int-spec của reschedule B4 (PLAN reschedule 5.5, 7.2, 7.9; TRACKING reschedule 1.7): `AppointmentRescheduleService` THẬT trên MySQL thật, mọi phụ thuộc là bản thật trừ các cổng
// `Fake` (nghỉ phép, thay đổi chi nhánh, thông báo, danh sách chờ). Thay `reschedule-write-world.ts` của B1 (thân MÔ PHỎNG, đã xoá). Gom một chỗ vì ba file (dịch vụ, đồng thời, nền ghi B1) cùng cần và jscpd quét `testing/`
// và `*.int-spec.ts`. Ô i của thế giới bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (thứ Ba); đồng hồ giả của `useIntegrationHooks` là 08:00 ngày 02/11/2026. Mọi dữ liệu là giả.

/** Chính sách hoàn minh hoạ ghi vào lịch dựng sẵn (mảng JSON thật, để chứng minh sao chép nguyên). */
export const WORLD_POLICY = [
  { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
  { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
];

export interface RescheduleWorldOptions {
  /** Cổng thông báo; mặc định bản `Fake` (đưa `BookingNotifier` thật để ghi `thong_bao` thật) */
  notifier?: AppointmentNotifier;
  /** Cổng danh sách chờ; mặc định bản `Fake` */
  waitlist?: WaitlistPort;
  /** Bộ sinh phần đuôi mã lịch; mặc định là bản thật */
  random?: CodeSuffixSource;
  /** Ghi đè dòng cấu hình; mặc định chỉ đặt `soLanTuDoiLichToiDa: 2` */
  config?: Partial<CauHinhHeThong>;
}

export interface WorldAppointmentOptions {
  patientId?: string;
  hoSoNguoiThanId?: string | null;
  gia?: string;
  coc?: string;
  /** Mảng mốc hoàn ghi vào `chinh_sach_hoan_snapshot`; `null` ghi SQL NULL; mặc định `WORLD_POLICY` */
  policy?: unknown;
  /** `ly_do_kham`; mặc định có chữ */
  lyDoKham?: string | null;
  /** `so_lan_tu_doi_lich` của lịch cũ; mặc định 0 */
  soLan?: number;
}

/** Hàng `lich_hen` đọc ra để so (id là CHUỖI; ngày giờ là chuỗi giờ Việt Nam; tiền là chuỗi decimal). */
export interface WorldRow {
  maLichHen: string;
  trangThai: string;
  truoc: string | null;
  soLan: number | string;
  khungGioId: string;
  hanThanhToan: string | null;
  xacNhanLuc: string | null;
  taoLuc: string;
  thoiGian: string;
  gia: string;
  coc: string;
  chinhSach: unknown;
  chinhSachSqlNull: number | string;
  lyDoKham: string | null;
  benhNhanId: string;
  hoSoNguoiThanId: string | null;
  bacSiId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
}

const FMT = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;

export async function rescheduleServiceWorld(
  db: DataSource,
  fx: BookingFixtures,
  options: RescheduleWorldOptions = {},
) {
  const w = await fx.world();
  await fx.systemConfig({ soLanTuDoiLichToiDa: 2, ...options.config });
  const leave = new FakeDoctorLeavePort();
  const pending = new FakePendingBranchChangesPort();
  const fakeNotifier = new FakeAppointmentNotifier();
  const fakeWaitlist = new FakeWaitlistPort();
  const notifier = options.notifier ?? fakeNotifier;
  const waitlist = options.waitlist ?? fakeWaitlist;
  const slotHolds = new SlotHoldService();
  const transition = new AppointmentTransitionService(
    db,
    slotHolds,
    waitlist,
    notifier,
  );
  const reader = new RescheduleReader(
    new BookabilityReader(new BranchHoursReader(), leave, pending),
    new SystemConfigService(new SystemConfigRepository(db)),
  );
  const service = new AppointmentRescheduleService(
    db,
    reader,
    slotHolds,
    transition,
    notifier,
    waitlist,
    options.random ?? randomCodeSuffix,
  );
  const patientId = w.patient.account.taiKhoanId;
  const doctor = w.doctor.profile;
  const branchId = w.branch.chiNhanhId;

  /** Id khung giờ: số ⇒ ô thứ i của thế giới; chuỗi ⇒ id viết thẳng. */
  const slot = (ref: number | string): string =>
    typeof ref === 'number' ? w.slotIds[ref]! : ref;

  /** Lịch `DaXacNhan` ở ô `index` (kèm khung giờ `DaDat`), giá, cọc, chính sách hoàn, lý do khám và bộ đếm ghi tường minh. */
  const book = async (
    index: number | string,
    extra: WorldAppointmentOptions = {},
  ): Promise<LichHen> => {
    const lich = await fx.appointmentIn('DaXacNhan', {
      doctor,
      khungGioId: slot(index),
      patientId: extra.patientId ?? patientId,
      hoSoNguoiThanId: extra.hoSoNguoiThanId ?? null,
      giaSnapshot: extra.gia ?? '200000.00',
      tienCocSnapshot: extra.coc ?? '50000.00',
    });
    const policy = extra.policy === undefined ? WORLD_POLICY : extra.policy;
    await db.query(
      `UPDATE lich_hen SET chinh_sach_hoan_snapshot = ?, ly_do_kham = ?, so_lan_tu_doi_lich = ? WHERE lich_hen_id = ?`,
      [
        policy === null ? null : JSON.stringify(policy),
        extra.lyDoKham === undefined ? 'Đau đầu' : extra.lyDoKham,
        extra.soLan ?? 0,
        lich.lichHenId,
      ],
    );
    return lich;
  };

  const tuDoi = (
    maLichHen: string,
    to: number | string,
    accountId: string = patientId,
  ): RescheduleInput => ({
    maLichHen,
    khungGioMoiId: slot(to),
    actor: { via: 'TuDoi', accountId },
  });
  const noopAfterWrite: RescheduleAfterWrite = () => Promise.resolve();
  const doiHo = (
    maLichHen: string,
    to: number | string,
    extra: {
      chiNhanhId?: string;
      lyDo?: string;
      afterWrite?: RescheduleAfterWrite;
    } = {},
  ): RescheduleInput => ({
    maLichHen,
    khungGioMoiId: slot(to),
    actor: { via: 'DoiHo', chiNhanhId: extra.chiNhanhId ?? branchId },
    lyDo: extra.lyDo ?? 'Bệnh nhân gọi điện xin dời lịch',
    afterWrite: extra.afterWrite ?? noopAfterWrite,
  });
  const duyet = (
    maLichHen: string,
    to: number | string,
    yeuCauId: string,
    extra: {
      chiNhanhId?: string | null;
      ghiChu?: string;
      afterWrite?: RescheduleAfterWrite;
    } = {},
  ): RescheduleInput => ({
    maLichHen,
    khungGioMoiId: slot(to),
    actor: {
      via: 'DuyetYeuCau',
      chiNhanhId: extra.chiNhanhId === undefined ? branchId : extra.chiNhanhId,
    },
    yeuCauId,
    ghiChu: extra.ghiChu ?? 'Đồng ý đổi lịch',
    afterWrite: extra.afterWrite ?? noopAfterWrite,
  });

  const rowOf = async (lichHenId: string): Promise<WorldRow> => {
    const rows: WorldRow[] = await db.query(
      `SELECT ma_lich_hen AS maLichHen, trang_thai AS trangThai, CAST(lich_hen_truoc_id AS CHAR) AS truoc, so_lan_tu_doi_lich AS soLan,
         CAST(khung_gio_id AS CHAR) AS khungGioId, ${FMT('han_thanh_toan')} AS hanThanhToan, ${FMT('thoi_diem_xac_nhan')} AS xacNhanLuc,
         ${FMT('thoi_diem_tao')} AS taoLuc, ${FMT('thoi_gian')} AS thoiGian, CAST(gia_snapshot AS CHAR) AS gia, CAST(tien_coc_snapshot AS CHAR) AS coc,
         chinh_sach_hoan_snapshot AS chinhSach, (chinh_sach_hoan_snapshot IS NULL) AS chinhSachSqlNull, ly_do_kham AS lyDoKham,
         CAST(benh_nhan_id AS CHAR) AS benhNhanId, CAST(ho_so_nguoi_than_id AS CHAR) AS hoSoNguoiThanId, CAST(bac_si_id AS CHAR) AS bacSiId,
         CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId
       FROM lich_hen WHERE lich_hen_id = ?`,
      [lichHenId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`không có lịch ${lichHenId}`);
    return row;
  };
  /** Id của lịch theo mã (mã trả về từ dịch vụ). */
  const idOfCode = async (maLichHen: string): Promise<string> => {
    const rows: { id: string }[] = await db.query(
      'SELECT CAST(lich_hen_id AS CHAR) AS id FROM lich_hen WHERE ma_lich_hen = ?',
      [maLichHen],
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`không có lịch mã ${maLichHen}`);
    return row.id;
  };
  const countRows = async (table: string): Promise<number> => {
    const rows: { n: number | string }[] = await db.query(
      `SELECT COUNT(*) AS n FROM ${table}`,
    );
    return Number(rows[0]?.n);
  };
  /** MỌI cột của hàng `lich_hen` trừ `cap_nhat_lan_cuoi` (DB tự đổi) và cột sinh `khung_gio_dang_giu`: để chứng minh "mọi cột khác nguyên". */
  const rawRow = async (
    lichHenId: string,
  ): Promise<Record<string, unknown>> => {
    const rows: Record<string, unknown>[] = await db.query(
      'SELECT * FROM lich_hen WHERE lich_hen_id = ?',
      [lichHenId],
    );
    const row = { ...rows[0] };
    delete row.cap_nhat_lan_cuoi;
    delete row.khung_gio_dang_giu;
    return row;
  };
  /** INV-1…INV-10 (và INV-10 so với `moneyBefore` nếu truyền). */
  const expectSettled = async (moneyBefore?: MoneyTotals): Promise<void> => {
    await assertBookingInvariants(db);
    await assertRescheduleInvariants(
      db,
      moneyBefore === undefined ? {} : { moneyBefore },
    );
  };
  const expectSlot = async (
    index: number | string,
    trangThai: 'ConTrong' | 'DaDat' | 'DangGiuCho',
  ): Promise<void> => {
    expect(await fx.slotState(slot(index))).toEqual({
      trangThai,
      giuChoDen: null,
    });
  };

  return {
    ...w,
    leave,
    pending,
    notifier: fakeNotifier,
    waitlist: fakeWaitlist,
    service,
    patientId,
    doctor,
    branchId,
    slot,
    book,
    tuDoi,
    doiHo,
    duyet,
    rowOf,
    idOfCode,
    countRows,
    rawRow,
    expectSettled,
    expectSlot,
    moneyBefore: () => captureMoneyTotals(db),
  };
}

export type RescheduleServiceWorld = Awaited<
  ReturnType<typeof rescheduleServiceWorld>
>;
