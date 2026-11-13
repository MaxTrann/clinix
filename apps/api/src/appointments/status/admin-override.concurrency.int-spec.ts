import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import {
  atRemaining,
  cancelInput,
  DEPOSIT,
  HOUR_MS,
  REFUND_POLICY,
} from '../testing/cancel-world.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  createOverrideStack,
  expectedAudit,
  overrideBy,
  readAudit,
  resetOverrideRound,
  settle,
} from '../testing/override-world.js';
import { raceRounds } from '../testing/override-race.js';
import {
  FAKE_PAYMENT_EVENT,
  fakePayment,
  notificationRows,
} from '../testing/payment-doctor-fakes.js';
import {
  checkInInput,
  noShowInput,
  readNoShow,
  runCheckIn,
  runNoShow,
  setNoShow,
  type StatusWorld,
} from '../testing/status-world.js';
import {
  db,
  fx,
  logs,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import type { ReportOptions } from '../testing/concurrency-report.js';

// Task B14 — các ca ĐỒNG THỜI của override trên MySQL 8.4 THẬT (PLAN booking 7.37 `[đề xuất]` OVR-10…OVR-15; 7.10 DT-05, DT-06; TRACKING 3.31 B14-E, B14-H). CHẠY MỘT MÌNH (`--no-file-parallelism` đã là mặc định của cấu hình
// int; không chạy cùng lúc với ca nặng khác). Khung vòng ở `testing/override-race.ts` (THIẾT KẾ SẴN: 40 vòng xen kẽ thứ tự xuất phát cộng bản quét độ lệch 0, 1, 2, 3, 5, 8, 12, 20 ms mỗi bên, tổng 56 vòng): mỗi ca ĐẾM lần
// thử lại 1213 và 1205, GHI bên thắng mỗi vòng (dòng `[B14-DT]`), INV-01…INV-05 sau mỗi vòng, và khẳng định KHÔNG có yêu cầu hết lượt (503). DỰ ĐOÁN (ghi trước khi đo, TRACKING 3.31 B14-E; lệch thì GHI, không sửa dự đoán):
//  P1 OVR-10 (DaTiepDon đua checkIn của Lễ tân): 0 lần thử lại. P2 OVR-11 (DaHuy đua huỷ của Bệnh nhân), OVR-15 (DaHuy đua confirmPaid): 0. P3 OVR-12 (VangMat đua markNoShow): 0.
//  P4 OVR-13 (DaHuy đua markNoShow; VangMat đua huỷ của Bệnh nhân): CÓ THỂ ≥ 1 lần 1213 (chu trình đã đo ở B12-Q: khoá S ngầm của khoá ngoại), được thử lại, kết quả luôn đúng, 503 = 0 ⇒ `retriesAllowed`.
//  P5 OVR-14a (hai Quản trị viên, cặp chỉ khoá `lich_hen`): 0. OVR-14b (cặp TRỘN `checkIn` và `markNoShow`): P5 viết chung nên ca này CŨNG ghi số; KHÔNG ép 0 vì cặp này là cạnh chu trình của B12-Q (CKI-09); số thấy được so với P5 ở báo cáo.
//  P6 mọi ca: 503 = 0 và INV xanh.
const { CANCELLED, CONFIRMED, NO_SHOW } = BOOKING_NOTIFICATION_EVENTS;
const TAG = 'B14-DT';
const SLOW = 300_000;
/** Cạnh chu trình đã đo (B12-Q): vẫn IN số lần thử lại nhưng không ép 0; 503 vẫn ép 0 */
const HIDDEN_FK_LOCK: ReportOptions = { retriesAllowed: true };

useStatusWorldHooks();

type Lich = Awaited<ReturnType<StatusWorld['booked']>>;
interface Round {
  w: StatusWorld;
  lich: Lich;
  stack: ReturnType<typeof createOverrideStack>;
}

/** Dựng dữ liệu SẠCH của một vòng: lịch `from` ở khung giờ số 0, bộ đếm no-show về 0, MỘT bộ dịch vụ dùng chung cho cả hai bên; `paid` (tuỳ chọn) đặt cọc đã thu và còn 23 giờ tới giờ hẹn. */
const freshRound =
  (w: StatusWorld, from: TrangThaiLichHen, options: { paid?: boolean } = {}) =>
  async (): Promise<Round> => {
    await resetOverrideRound(db);
    await setNoShow(db, w.patientId, { soLan: 0, khoa: false });
    const lich = await w.booked(
      from,
      0,
      options.paid === true ? { coc: DEPOSIT, policy: REFUND_POLICY } : {},
    );
    const stack = createOverrideStack(db);
    if (options.paid === true) {
      stack.ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
      atRemaining(23 * HOUR_MS);
    }
    return { w, lich, stack };
  };

const cancelByPatient = ({ w, lich, stack }: Round) =>
  stack.cancellation.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen));
const asToan =
  (to: TrangThaiLichHen) =>
  ({ w, lich, stack }: Round) =>
    settle(overrideBy(w, stack, 'Toan', lich.maLichHen, to));
const refusedSame = (from: TrangThaiLichHen, to: TrangThaiLichHen) => ({
  kind: 'refused',
  maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
  chiTiet: { tuTrangThai: from, denTrangThai: to },
});
const eventsOf = async () =>
  (await notificationRows(db)).map((row) => row.loai).sort();

describe('OVR-10 (P1) override DaTiepDon đua Lễ tân tiếp đón (checkIn THẬT): đúng MỘT bên đổi, bên thua nhận kết quả có kiểu; 0 lần thử lại', () => {
  it(
    'đúng MỘT kết quả DaTiepDon, khung giờ DaDat; nhật ký 1 dòng iff Quản trị viên thắng; INV',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'OVR-10',
        logs,
        setup: freshRound(w, 'DaXacNhan'),
        first: asToan('DaTiepDon'),
        second: ({ w: world_, lich, stack }) =>
          runCheckIn(
            db,
            stack.transition,
            checkInInput(world_, lich.lichHenId, 'LeTan'),
          ),
        check: async ({ w: world_, lich }, override, checked, tally) => {
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'DaTiepDon',
          );
          expect((await fx.slotState(world_.slotId(0))).trangThai).toBe(
            'DaDat',
          );
          const audit = await readAudit(db);
          if (override.kind === 'ok') {
            expect(checked).toEqual({
              kind: 'InvalidState',
              trangThai: 'DaTiepDon',
            });
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'DaTiepDon',
              ),
            ]);
            tally.add('Quản trị viên override');
          } else {
            expect(override).toMatchObject(
              refusedSame('DaTiepDon', 'DaTiepDon'),
            );
            expect(checked).toEqual({ kind: 'CheckedIn' });
            expect(audit).toEqual([]);
            tally.add('Lễ tân tiếp đón');
          }
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );
});

describe('OVR-11 (P2) override DaHuy đua huỷ của Bệnh nhân (dịch vụ huỷ THẬT): một lần huỷ, một lần hoàn tiền đúng bậc, một lần mời chờ; 0 lần thử lại', () => {
  it(
    'đúng MỘT bên huỷ: override thắng ⇒ hoàn 100% và nhật ký 1 dòng; Bệnh nhân thắng ⇒ hoàn 50% (còn 23 giờ) và override nhận 409 LICH_HEN_KHONG_CHO_HUY; luôn DaHuy, khung giờ ConTrong, cổng đúng một lần',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'OVR-11',
        logs,
        setup: freshRound(w, 'DaXacNhan', { paid: true }),
        first: asToan('DaHuy'),
        second: cancelByPatient,
        check: async (round, override, patient, tally) => {
          const { w: world_, lich, stack } = round;
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'DaHuy',
          );
          expect(await fx.slotState(world_.slotId(0))).toEqual({
            trangThai: 'ConTrong',
            giuChoDen: null,
          });
          expect(stack.ports.refund.refundCall.count).toBe(1);
          expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(1);
          expect(await eventsOf()).toEqual([CANCELLED]);
          const audit = await readAudit(db);
          if (override.kind === 'ok') {
            expect(patient).toEqual({ kind: 'AlreadyCancelled' });
            expect(stack.ports.refund.refundCall.calls[0]?.[0]).toMatchObject({
              soTien: '100000.00',
            });
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'DaHuy',
              ),
            ]);
            tally.add('Quản trị viên override');
          } else {
            expect(override).toMatchObject({
              kind: 'refused',
              maLoi: 'LICH_HEN_KHONG_CHO_HUY',
              chiTiet: { trangThai: 'DaHuy' },
            });
            expect(patient).toMatchObject({ kind: 'Cancelled' });
            expect(stack.ports.refund.refundCall.calls[0]?.[0]).toMatchObject({
              soTien: '50000.00',
            });
            expect(audit).toEqual([]);
            tally.add('Bệnh nhân huỷ');
          }
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );
});

describe('OVR-12 (P3) override VangMat đua markNoShow kiểu job (actor HeThong; job thật là B13): so_lan_no_show đúng +1 (không +2); 0 lần thử lại', () => {
  it(
    'đúng MỘT bên đánh Vắng mặt: bộ đếm {1, chưa khoá}, khung giờ DaDat, một thông báo LichHenVangMat; nhật ký 1 dòng iff Quản trị viên thắng',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'OVR-12',
        logs,
        setup: freshRound(w, 'DaXacNhan'),
        first: asToan('VangMat'),
        second: ({ w: world_, lich, stack }) =>
          runNoShow(
            db,
            stack.transition,
            noShowInput(world_, lich.lichHenId, 'HeThong'),
          ),
        check: async ({ w: world_, lich }, override, noShow, tally) => {
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'VangMat',
          );
          expect(await readNoShow(db, world_.patientId)).toEqual({
            soLan: 1,
            khoa: false,
          });
          expect((await fx.slotState(world_.slotId(0))).trangThai).toBe(
            'DaDat',
          );
          expect(await eventsOf()).toEqual([NO_SHOW]);
          const audit = await readAudit(db);
          if (override.kind === 'ok') {
            expect(noShow).toEqual({
              kind: 'InvalidState',
              trangThai: 'VangMat',
            });
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'VangMat',
              ),
            ]);
            tally.add('Quản trị viên override');
          } else {
            expect(override).toMatchObject(refusedSame('VangMat', 'VangMat'));
            expect(noShow).toMatchObject({ kind: 'NoShowed', soLanNoShow: 1 });
            expect(audit).toEqual([]);
            tally.add('Job Vắng mặt');
          }
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );
});

describe('OVR-13 (P4) hai cạnh của chu trình đã đo ở B12-Q (khoá S ngầm của khoá ngoại): DaHuy đua markNoShow, VangMat đua huỷ của Bệnh nhân; cho phép thử lại, 503 = 0', () => {
  it(
    'DaHuy đua markNoShow: HAI kết quả đều đúng. Override trước ⇒ markNoShow nhận InvalidState DaHuy, bộ đếm 0, truoc = DaXacNhan. markNoShow trước ⇒ override vẫn được (VangMat → DaHuy là ô Q24), bộ đếm 1, truoc = VangMat. Luôn DaHuy và khung giờ ConTrong',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'OVR-13 DaHuy-markNoShow',
        logs,
        options: HIDDEN_FK_LOCK,
        setup: freshRound(w, 'DaXacNhan'),
        first: asToan('DaHuy'),
        second: ({ w: world_, lich, stack }) =>
          runNoShow(
            db,
            stack.transition,
            noShowInput(world_, lich.lichHenId, 'HeThong'),
          ),
        check: async ({ w: world_, lich }, override, noShow, tally) => {
          expect(override.kind).toBe('ok');
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'DaHuy',
          );
          expect((await fx.slotState(world_.slotId(0))).trangThai).toBe(
            'ConTrong',
          );
          const counter = await readNoShow(db, world_.patientId);
          const audit = await readAudit(db);
          if (noShow.kind === 'NoShowed') {
            expect(counter).toEqual({ soLan: 1, khoa: false });
            expect(audit).toMatchObject([
              expectedAudit(world_, 'Toan', lich.lichHenId, 'VangMat', 'DaHuy'),
            ]);
            expect(await eventsOf()).toEqual([CANCELLED, NO_SHOW]);
            tally.add('Vắng mặt rồi override huỷ');
          } else {
            expect(noShow).toEqual({
              kind: 'InvalidState',
              trangThai: 'DaHuy',
            });
            expect(counter).toEqual({ soLan: 0, khoa: false });
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'DaHuy',
              ),
            ]);
            expect(await eventsOf()).toEqual([CANCELLED]);
            tally.add('Override huỷ trước');
          }
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );

  it(
    'VangMat đua huỷ của Bệnh nhân: override trước ⇒ Bệnh nhân nhận NotCancellable VangMat (ma trận Bệnh nhân không huỷ VangMat), bộ đếm 1, khung giờ DaDat. Huỷ trước ⇒ override nhận 409 (DaHuy → VangMat), bộ đếm 0, khung giờ ConTrong',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'OVR-13 VangMat-huỷ',
        logs,
        options: HIDDEN_FK_LOCK,
        setup: freshRound(w, 'DaXacNhan'),
        first: asToan('VangMat'),
        second: cancelByPatient,
        check: async ({ w: world_, lich }, override, patient, tally) => {
          const counter = await readNoShow(db, world_.patientId);
          const audit = await readAudit(db);
          if (override.kind === 'ok') {
            expect(patient).toEqual({
              kind: 'NotCancellable',
              trangThai: 'VangMat',
            });
            expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
              'VangMat',
            );
            expect(counter).toEqual({ soLan: 1, khoa: false });
            expect((await fx.slotState(world_.slotId(0))).trangThai).toBe(
              'DaDat',
            );
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'VangMat',
              ),
            ]);
            tally.add('Override Vắng mặt trước');
          } else {
            expect(override).toMatchObject(refusedSame('DaHuy', 'VangMat'));
            expect(patient).toMatchObject({ kind: 'Cancelled' });
            expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
              'DaHuy',
            );
            expect(counter).toEqual({ soLan: 0, khoa: false });
            expect((await fx.slotState(world_.slotId(0))).trangThai).toBe(
              'ConTrong',
            );
            expect(audit).toEqual([]);
            tally.add('Bệnh nhân huỷ trước');
          }
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );
});

describe('OVR-14 (P5) hai Quản trị viên cùng override MỘT lịch: nhật ký nối đuôi đúng, `truoc` của lần sau là `sau` của lần trước (truoc đọc DƯỚI khoá)', () => {
  it(
    'cặp chỉ khoá lich_hen (DaTiepDon và DaXacNhan, từ DaXacNhan; 0 lần thử lại): DaTiepDon trước ⇒ cả hai được (hai dòng, cuối DaXacNhan); DaXacNhan trước ⇒ bị 409 (cùng trạng thái), một dòng, cuối DaTiepDon',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'OVR-14a',
        logs,
        setup: freshRound(w, 'DaXacNhan'),
        first: asToan('DaTiepDon'),
        second: ({ w: world_, lich, stack }) =>
          settle(
            overrideBy(world_, stack, 'ChiNhanh', lich.maLichHen, 'DaXacNhan'),
          ),
        check: async ({ w: world_, lich }, first, second, tally) => {
          expect(first.kind).toBe('ok');
          const audit = await readAudit(db);
          const status = (await readAppointment(db, lich.lichHenId)).trangThai;
          if (second.kind === 'ok') {
            expect(status).toBe('DaXacNhan');
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'DaTiepDon',
              ),
              expectedAudit(
                world_,
                'ChiNhanh',
                lich.lichHenId,
                'DaTiepDon',
                'DaXacNhan',
              ),
            ]);
            tally.add('DaTiepDon trước rồi khôi phục');
          } else {
            expect(second).toMatchObject(refusedSame('DaXacNhan', 'DaXacNhan'));
            expect(status).toBe('DaTiepDon');
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'DaTiepDon',
              ),
            ]);
            tally.add('Khôi phục bị từ chối trước');
          }
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );

  it(
    'cặp TRỘN checkIn (DaTiepDon) và markNoShow (VangMat), từ DaXacNhan (cạnh chu trình B12-Q: ghi số, không ép 0): cả hai thứ tự đều thành công; dòng sau có truoc = sau của dòng trước; bộ đếm đúng 1',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'OVR-14b',
        logs,
        options: HIDDEN_FK_LOCK,
        setup: freshRound(w, 'DaXacNhan'),
        first: asToan('DaTiepDon'),
        second: ({ w: world_, lich, stack }) =>
          settle(
            overrideBy(world_, stack, 'ChiNhanh', lich.maLichHen, 'VangMat'),
          ),
        check: async ({ w: world_, lich }, first, second, tally) => {
          expect(first.kind).toBe('ok');
          expect(second.kind).toBe('ok');
          const audit = await readAudit(db);
          expect(audit).toHaveLength(2);
          const rows = audit.map((row) => row.chiTietThayDoi) as {
            truoc: { trang_thai: string };
            sau: { trang_thai: string };
          }[];
          expect(rows[0]?.truoc.trang_thai).toBe('DaXacNhan');
          expect(rows[1]?.truoc.trang_thai).toBe(rows[0]?.sau.trang_thai);
          const finalState = rows[1]?.sau.trang_thai;
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            finalState,
          );
          expect(await readNoShow(db, world_.patientId)).toEqual({
            soLan: 1,
            khoa: false,
          });
          tally.add(
            finalState === 'VangMat'
              ? 'DaTiepDon rồi VangMat'
              : 'VangMat rồi DaTiepDon',
          );
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );
});

describe('OVR-15 (P2) override DaHuy đua confirmPaid của payment giả trên lịch ChoThanhToan: luôn DaHuy; confirmPaid thua hay (thắng rồi bị override) đều kết quả có kiểu; 0 lần thử lại', () => {
  it(
    'override trước ⇒ confirmPaid nhận InvalidState DaHuy, không dòng thanh toán, truoc = ChoThanhToan. confirmPaid trước ⇒ Confirmed rồi override huỷ từ DaXacNhan, truoc = DaXacNhan. Luôn DaHuy, khung giờ ConTrong',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'OVR-15',
        logs,
        setup: freshRound(w, 'ChoThanhToan'),
        first: asToan('DaHuy'),
        second: ({ w: world_, lich, stack }) =>
          fakePayment(db, stack.transition, {
            lichHenId: lich.lichHenId,
            taiKhoanId: world_.patientId,
          }),
        check: async ({ w: world_, lich }, override, paid, tally) => {
          expect(override.kind).toBe('ok');
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'DaHuy',
          );
          expect(await fx.slotState(world_.slotId(0))).toEqual({
            trangThai: 'ConTrong',
            giuChoDen: null,
          });
          const audit = await readAudit(db);
          if (paid.kind === 'Confirmed') {
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'DaHuy',
              ),
            ]);
            expect(await eventsOf()).toEqual(
              [CANCELLED, CONFIRMED, FAKE_PAYMENT_EVENT].sort(),
            );
            tally.add('Thanh toán rồi override huỷ');
          } else {
            expect(paid).toEqual({ kind: 'InvalidState', trangThai: 'DaHuy' });
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'ChoThanhToan',
                'DaHuy',
              ),
            ]);
            expect(await eventsOf()).toEqual([CANCELLED]);
            tally.add('Override huỷ trước');
          }
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );
});
