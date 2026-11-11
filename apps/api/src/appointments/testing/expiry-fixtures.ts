import type { Provider } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { expect } from 'vitest';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { HoldExpiryJob } from '../expiry/hold-expiry.job.js';
import { APPOINTMENT_NOTIFIER } from '../ports/appointment-notifier.port.js';
import { DOCTOR_LEAVE_PORT } from '../ports/doctor-leave.port.js';
import { PAYMENT_PORT, PAYMENT_SUMMARY_PORT } from '../ports/payment.port.js';
import { PENDING_BRANCH_CHANGES_PORT } from '../ports/pending-branch-changes.port.js';
import { REFUND_PORT, WALLET_BALANCE_PORT } from '../ports/wallet.port.js';
import { WAITLIST_PORT } from '../ports/waitlist.port.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import type { BookingFixtures } from './booking-fixtures.js';
import { createFakePorts, FakeWaitlistPort } from './fake-ports.js';

// Hạ tầng test dùng chung của các int-spec của B9 (TRX-08, TRX-09, HG-01…HG-10, DT-08, DT-16; PLAN booking 7.26, TRACKING 3.19.3). Nằm ở `testing/` nên AR-01 và AR-06 bỏ qua; `.jscpd.json` KHÔNG bỏ
// `*.int-spec.ts`, nên phần dựng dữ liệu và dựng "bản API" nằm MỘT chỗ ở đây thay vì chép ở từng spec.

export interface AppointmentRow {
  trangThai: string;
  /** `thoi_diem_huy` dạng 'YYYY-MM-DD HH:MM:SS' (DATE_FORMAT, không lệch múi giờ) hoặc null */
  huy: string | null;
  lyDo: string | null;
  /** `han_thanh_toan` cùng dạng, hoặc null */
  han: string | null;
}

export async function readAppointment(
  db: DataSource,
  lichHenId: string,
): Promise<AppointmentRow> {
  const rows: AppointmentRow[] = await db.query(
    `SELECT trang_thai AS trangThai, DATE_FORMAT(thoi_diem_huy, '%Y-%m-%d %H:%i:%s') AS huy, ly_do_huy AS lyDo,
            DATE_FORMAT(han_thanh_toan, '%Y-%m-%d %H:%i:%s') AS han
       FROM lich_hen WHERE lich_hen_id = ?`,
    [lichHenId],
  );
  const row = rows[0];
  if (!row) throw new Error(`Không có lịch hẹn ${lichHenId}`);
  return row;
}

/** Lịch `lichHenId` đang ở `trangThai` (chỉ kiểm trạng thái; ca cần cả giờ huỷ và lý do thì dùng `readAppointment`). */
export async function expectStatus(
  db: DataSource,
  lichHenId: string,
  trangThai: string,
): Promise<void> {
  expect((await readAppointment(db, lichHenId)).trangThai).toBe(trangThai);
}

/**
 * Thế giới đặt được (`BookingFixtures.world`: 8 khung giờ 30 phút của ngày 10/11/2026 từ 08:00) cùng hàm dựng lịch theo CHỈ SỐ khung giờ. Lịch `ChoThanhToan` mặc định có hạn 08:15 ngày 02/11/2026
 * (khung giờ `DangGiuCho` cùng hạn, INV-02), tức đã quá hạn với `FLOW_NOW` (09:00 cùng ngày).
 */
export async function expiryWorld(fx: BookingFixtures) {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  const slotId = (index: number): string => {
    const id = w.slotIds[index];
    if (id === undefined) throw new Error(`Không có khung giờ số ${index}`);
    return id;
  };
  return {
    ...w,
    patientId,
    slotId,
    /** Lịch `ChoThanhToan` ở khung giờ số `slot`; `hanThanhToan` mặc định 08:15 ngày 02/11/2026 */
    pending: (slot: number, hanThanhToan?: Date) =>
      fx.appointmentIn('ChoThanhToan', {
        doctor: w.doctor.profile,
        khungGioId: slotId(slot),
        patientId,
        ...(hanThanhToan ? { hanThanhToan } : {}),
      }),
    /** Lịch ở trạng thái bất kỳ (khung giờ nhất quán theo `BookingFixtures.appointmentIn`) */
    inState: (trangThai: TrangThaiLichHen, slot: number) =>
      fx.appointmentIn(trangThai, {
        doctor: w.doctor.profile,
        khungGioId: slotId(slot),
        patientId,
      }),
    slotState: (slot: number) => fx.slotState(slotId(slot)),
    /** Khung giờ số `slot` đang ở `trangThai` với `giu_cho_den` = `giuChoDen` (mặc định null: không giữ) */
    expectSlot: async (
      slot: number,
      trangThai: string,
      giuChoDen: string | null = null,
    ): Promise<void> => {
      expect(await fx.slotState(slotId(slot))).toEqual({
        trangThai,
        giuChoDen,
      });
    },
  };
}

export type ExpiryWorld = Awaited<ReturnType<typeof expiryWorld>>;

/**
 * "Một bản API": dịch vụ + job + cổng danh sách chờ `Fake` (truyền cổng chung để hai bản đếm vào CÙNG một bộ đếm). Mỗi bản có cờ `running` riêng của job, như hai tiến trình thật (DT-16).
 * Dựng bằng tay (không qua Nest) để test chủ động thay `expire` hay bọc `DataSource`.
 */
export function createExpiryStack(
  db: DataSource,
  waitlist: FakeWaitlistPort = new FakeWaitlistPort(),
) {
  const service = new AppointmentTransitionService(
    db,
    new SlotHoldService(),
    waitlist,
  );
  return { waitlist, service, job: new HoldExpiryJob(db, service) };
}

/**
 * Module Nest có ĐỦ TÁM cổng `Fake` (HG-01, Q6: `notifier.notifyCall.count` phải là 0): nếu dịch vụ hết hạn một ngày nào đó phụ thuộc `AppointmentNotifier` và gọi nó, bản `Fake` ở đây đếm được.
 * Người gọi `await moduleRef.close()` ở cuối ca.
 */
export async function createExpiryModule(
  db: DataSource,
  ports: ReturnType<typeof createFakePorts> = createFakePorts(),
): Promise<{
  moduleRef: TestingModule;
  ports: ReturnType<typeof createFakePorts>;
  job: HoldExpiryJob;
  service: AppointmentTransitionService;
}> {
  const bindings: [symbol, unknown][] = [
    [PAYMENT_PORT, ports.payment],
    [PAYMENT_SUMMARY_PORT, ports.paymentSummary],
    [REFUND_PORT, ports.refund],
    [WALLET_BALANCE_PORT, ports.walletBalance],
    [WAITLIST_PORT, ports.waitlist],
    [DOCTOR_LEAVE_PORT, ports.doctorLeave],
    [PENDING_BRANCH_CHANGES_PORT, ports.pendingBranchChanges],
    [APPOINTMENT_NOTIFIER, ports.notifier],
  ];
  const portProviders: Provider[] = bindings.map(([provide, useValue]) => ({
    provide,
    useValue,
  }));
  const moduleRef = await Test.createTestingModule({
    providers: [
      AppointmentTransitionService,
      SlotHoldService,
      HoldExpiryJob,
      { provide: DataSource, useValue: db },
      ...portProviders,
    ],
  }).compile();
  return {
    moduleRef,
    ports,
    job: moduleRef.get(HoldExpiryJob),
    service: moduleRef.get(AppointmentTransitionService),
  };
}

/**
 * `count` khung giờ `ConTrong` mới của MỘT ca riêng (ngày `ngay`, giờ cách nhau 1 phút từ 00:00; chèn nhiều hàng bằng MỘT câu), cho ca cần hơn 8 khung giờ của `world()` (HG-05). Trả id theo thứ tự giờ.
 * `count` tối đa 1440 (một ngày).
 */
export async function bulkSlots(
  db: DataSource,
  fx: BookingFixtures,
  doctor: BacSi,
  ngay: string,
  count: number,
): Promise<string[]> {
  if (count < 1 || count > 1440)
    throw new RangeError('count phải từ 1 đến 1440');
  const shift = await fx.admin.shift(doctor, { ngay, ca: 'CaSang' });
  const pad = (n: number) => String(n).padStart(2, '0');
  const params = Array.from({ length: count }, (_, i) => [
    shift.lichLamViecId,
    `${ngay} ${pad(Math.floor(i / 60))}:${pad(i % 60)}:00`,
  ]).flat();
  await db.query(
    `INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES ${Array.from({ length: count }, () => "(?, ?, 'ConTrong')").join(', ')}`,
    params,
  );
  const rows: { id: string }[] = await db.query(
    'SELECT CAST(khung_gio_id AS CHAR) AS id FROM khung_gio WHERE lich_lam_viec_id = ? ORDER BY ngay_gio',
    [shift.lichLamViecId],
  );
  return rows.map((row) => row.id);
}
