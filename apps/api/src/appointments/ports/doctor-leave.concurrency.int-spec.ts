import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { deferred } from '../../auth/testing/verification-int-helpers.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  appointmentRow,
  countRows,
  createLeaveServices,
  leaveSetup,
  requestRow,
  SYSTEM,
} from '../../doctor/testing/leave-approval-world.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { LEAVE_CANCEL_REASON } from '../appointments.constants.js';
import type { DoctorLeavePort } from '../ports/doctor-leave.port.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { DEPOSIT, REFUND_POLICY } from '../testing/cancel-world.js';
import { createGate, runRounds } from '../testing/concurrency-harness.js';
import {
  reportRounds,
  sleep,
  winnerTally,
} from '../testing/concurrency-report.js';
import { lichHenRows } from '../testing/create-appointment-world.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  dyingAfter,
  leaveRaceWorld,
  type LeaveRaceWorld,
} from '../testing/leave-race-world.js';
import { waitUntilWaiting } from '../testing/lock-wait.js';
import { recordStatements } from '../testing/statement-recorder.js';

// Task B16a (nửa `doctor` của B16; PLAN booking 5.10 D5, H5, 7.10; TRACKING 3.39 B16a-D, B16a-E) — các ca ĐỒNG THỜI và đổi trạng thái giữa hai module với lớp THẬT của `doctor` trên MySQL 8.4 THẬT: DT-09 (duyệt nghỉ phép đua đặt lịch), LRP-02
// (nhánh "đặt lịch đến trước" TẤT ĐỊNH của DT-09, mã mới `[đề xuất]`, PLAN 7.45) và DT-17 (mất tiến trình giữa hai bước của duyệt). DT-09 và DT-17 là lần chạy ĐẦU của hai mã này (chưa từng có bản `Fake`). Bên `doctor` là `DoctorLeaveService.create`
// (gửi yêu cầu, khoá `bac_si` FOR UPDATE), `AdminLeaveApproveService.approve` (khoá `bac_si` FOR UPDATE rồi huỷ lịch qua `cancel` và `findAffectedByLeave` THẬT của booking sau commit) và `LeaveCancellationSweeper`; bên booking là
// `CreateAppointmentService` THẬT với `LeaveReader` THẬT (`withBookingTransaction`: READ COMMITTED, thử lại ≤ 2, chờ khoá 3 giây). CHẠY MỘT MÌNH (nhạy với tải máy, như DT-01): ca vòng tự do, số lần thử lại và bên thắng ghi ở dòng `[B16a-DT]`.
// "0 lần thử lại" kiểm ở CẢ HAI bên: bên booking bằng cảnh báo của `withBookingTransaction` (`reportRounds`), bên `doctor` (thử lại im lặng, không log) bằng số câu `ROLLBACK` trong cửa sổ của vòng: một giao dịch bị hoàn tác (1213, 1205
// hay lỗi nào) là một câu `ROLLBACK`, và luồng đúng không có giao dịch nào bị hoàn tác (lời từ chối nghiệp vụ của `create` là kết quả có kiểu, commit rỗng).
const ROUNDS = 40;
const TIMEOUT = 300_000;
const NOW = new Date('2026-11-02T01:00:00.000Z');

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});

const CREATED_THEN_CANCELLED = 'create thành công, bước (2) của duyệt huỷ lịch';
const CREATE_REJECTED = 'create bị 409 BAC_SI_NGHI_PHEP';

const rollbacks = (statements: readonly string[], from: number): number =>
  statements.slice(from).filter((sql) => /^\s*ROLLBACK\b/i.test(sql)).length;

const reasonText = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/** Lịch còn hiệu lực (chưa kết thúc, chưa huỷ) trong dữ liệu: sau duyệt nghỉ phép của CẢ NGÀY đặt lịch thì phải là 0. */
const activeCount = () =>
  countRows(
    db,
    "FROM lich_hen WHERE trang_thai IN ('ChoThanhToan', 'DaXacNhan')",
  );

type ChainResult = Awaited<ReturnType<LeaveRaceWorld['submitAndApprove']>>;

describe('DT-09 duyệt nghỉ phép (gửi rồi duyệt THẬT của doctor) đua đặt lịch THẬT, 40 vòng', () => {
  it(
    'mỗi vòng ĐÚNG MỘT: create bị 409 BAC_SI_NGHI_PHEP (không lịch), hoặc create thành công rồi bước (2) huỷ lịch (DaHuy, ConTrong); không bao giờ còn lịch ChoThanhToan hay DaXacNhan trong ngày nghỉ đã duyệt; 0 lần thử lại, 0 ROLLBACK, INV',
    async () => {
      const w = await leaveRaceWorld(db, fx);
      const statements = recordStatements(db);
      const winners = winnerTally();
      let from = 0;

      await runRounds<LeaveRaceWorld, unknown>({
        rounds: ROUNDS,
        setup: async () => {
          await w.resetRound();
          from = statements.length;
          return w;
        },
        // hai bên cùng xuất phát qua MỘT cổng; luân phiên bên nào trễ (0 đến 20 ms) để quét các thứ tự đan xen
        race: (_context, round) => {
          const gate = createGate(2);
          const delay = [0, 2, 5, 10, 20][round % 5]!;
          return [
            async () => {
              await gate.arrive();
              if (round % 2 === 0 && delay > 0) await sleep(delay);
              return w.create(0);
            },
            async () => {
              await gate.arrive();
              if (round % 2 === 1 && delay > 0) await sleep(delay);
              return w.submitAndApprove();
            },
          ];
        },
        check: async (_context, results, round) => {
          const [creating, chain] = results;
          if (chain?.status !== 'fulfilled')
            throw new Error(
              `chuỗi gửi rồi duyệt của doctor thất bại: ${chain?.status === 'rejected' ? reasonText(chain.reason) : 'thiếu kết quả'}`,
            );
          const { created, approved } = chain.value as ChainResult;
          const rows = await lichHenRows(db);
          if (creating?.status === 'fulfilled') {
            winners.add(CREATED_THEN_CANCELLED);
            expect(rows, `vòng ${round}`).toMatchObject([
              { trangThai: 'DaHuy', lyDoHuy: LEAVE_CANCEL_REASON },
            ]);
            expect(approved.huyLichHen, `vòng ${round}`).toStrictEqual({
              hoanTat: true,
              daHuy: 1,
              daHuyTruocDo: 0,
              khongHuyDuoc: [],
            });
          } else {
            const reason: unknown = creating?.reason;
            if (
              !(reason instanceof AppException) ||
              reason.maLoi !== 'BAC_SI_NGHI_PHEP'
            )
              throw new Error(`create bị từ chối sai: ${reasonText(reason)}`);
            winners.add(CREATE_REJECTED);
            expect(rows, `vòng ${round}`).toHaveLength(0);
            expect(approved.huyLichHen.daHuy, `vòng ${round}`).toBe(0);
          }
          // điều bất biến của H5: sau duyệt không còn lịch còn hiệu lực trong ngày nghỉ, khung giờ đã trả
          expect(await activeCount(), `vòng ${round}`).toBe(0);
          expect(
            (await requestRow(db, created.yeuCauNghiPhepId)).trangThai,
            `vòng ${round}`,
          ).toBe('DaDuyet');
          expect(await fx.slotState(w.slot(0)), `vòng ${round}`).toStrictEqual({
            trangThai: 'ConTrong',
            giuChoDen: null,
          });
          expect(rollbacks(statements, from), `vòng ${round}`).toBe(0);
          await assertBookingInvariants(db);
        },
      });

      reportRounds(
        'B16a-DT',
        'DT-09 duyệt nghỉ phép THẬT đua create THẬT',
        ROUNDS,
        winners.winners,
        logs,
      );
    },
    TIMEOUT,
  );
});

describe('LRP-02 DT-09 nhánh "đặt lịch đến trước" TẤT ĐỊNH: duyệt thật đứng chờ bac_si cho tới khi create commit, rồi huỷ lịch vừa tạo', () => {
  it('create dừng NGAY SAU câu đọc nghỉ phép thật (đang giữ bac_si FOR SHARE); DoctorLeaveService.create thật ĐỨNG CHỜ bac_si (data_lock_waits, chưa có yêu cầu nào); create commit ⇒ yêu cầu được gửi, duyệt thật xong, lịch vừa tạo bị huỷ (BacSiNghiPhep)', async () => {
    const reached = deferred();
    const proceed = deferred();
    const real = new LeaveReader();
    // bọc cổng THẬT: chạy `LeaveReader` thật rồi dừng ở đây, DƯỚI khoá bac_si FOR SHARE và khung_gio FOR UPDATE của create
    const gated: DoctorLeavePort = {
      findBlockingLeave: async (em, input) => {
        const found = await real.findBlockingLeave(em, input);
        reached.resolve();
        await proceed.promise;
        return found;
      },
    };
    const w = await leaveRaceWorld(db, fx, gated);
    const statements = recordStatements(db);

    const creating = w.create(0);
    // tránh "unhandled rejection" nếu ca đỏ trước khi tới `await creating`
    creating.catch(() => undefined);
    await reached.promise;
    const chain = w.submitAndApprove().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await waitUntilWaiting(db, 'bac_si', 1);
    // lúc này: create chưa commit (lịch chưa thấy), doctor đứng chờ nên CHƯA có yêu cầu nghỉ nào
    expect(await lichHenRows(db)).toHaveLength(0);
    expect(await countRows(db, 'FROM yeu_cau_nghi_phep')).toBe(0);
    const from = statements.length;
    proceed.resolve();

    const createdAppointment = await creating;
    const done = await chain;
    if ('error' in done) throw new Error(reasonText(done.error));
    expect(createdAppointment.trangThai).toBe('DaXacNhan');
    expect(done.value.approved.huyLichHen).toStrictEqual({
      hoanTat: true,
      daHuy: 1,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
    expect(await lichHenRows(db)).toMatchObject([
      { trangThai: 'DaHuy', lyDoHuy: LEAVE_CANCEL_REASON },
    ]);
    expect(await fx.slotState(w.slot(0))).toStrictEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    expect(
      (await requestRow(db, done.value.created.yeuCauNghiPhepId)).trangThai,
    ).toBe('DaDuyet');
    expect(await activeCount()).toBe(0);
    expect(rollbacks(statements, from)).toBe(0);
    await assertBookingInvariants(db);
  }, 60_000);
});

describe('DT-17 mất tiến trình giữa hai bước của duyệt nghỉ phép: sweeper THẬT chạy lại bước (2) hai lần', () => {
  it('duyệt commit DaDuyet rồi dừng sau 2 lịch (5 lịch đã thu cọc); sweeper lượt 1 huỷ 3 lịch còn lại, lượt 2 không làm gì; mỗi lịch huỷ ĐÚNG MỘT lần, hoàn cọc đúng một lần mỗi lịch, không mời danh sách chờ (Q17), không còn lịch hiệu lực, INV', async () => {
    const { w, leave, adminId } = await leaveSetup(db, fx);
    const total = 5;
    const lich = [];
    for (let i = 0; i < total; i += 1)
      lich.push(
        await w.booked('DaXacNhan', i, { coc: DEPOSIT, policy: REFUND_POLICY }),
      );
    const id = await leave();
    const base = createLeaveServices(db);
    // cọc ĐÃ THU của cả năm lịch: huỷ vì bác sĩ nghỉ phép hoàn 100% (PLAN 5.10 D5, Q17), qua cổng hoàn giả của booking để ĐẾM
    base.ports.paymentSummary.paid(
      Object.fromEntries(lich.map((l) => [l.lichHenId, DEPOSIT])),
    );

    const dying = createLeaveServices(db, dyingAfter(base.realPort, 2));
    const approved = await dying.approval.approve(SYSTEM, adminId, id);
    expect(approved.huyLichHen).toMatchObject({ hoanTat: false, daHuy: 2 });
    expect((await requestRow(db, id)).trangThai).toBe('DaDuyet');
    expect(base.ports.refund.refundCall.count).toBe(2);

    expect(await base.sweeper.run(NOW)).toMatchObject({
      requests: 1,
      daHuy: total - 2,
      daHuyTruocDo: 0,
      chuaHoanTat: 0,
    });
    expect(await base.sweeper.run(NOW)).toMatchObject({
      requests: 1,
      daHuy: 0,
      daHuyTruocDo: 0,
      chuaHoanTat: 0,
    });

    for (const l of lich)
      expect(await appointmentRow(db, l.lichHenId)).toStrictEqual({
        trangThai: 'DaHuy',
        lyDo: LEAVE_CANCEL_REASON,
      });
    // MỖI lịch hoàn cọc đúng MỘT lần (không hoàn lại ở lượt chạy lại), đủ số cọc đã thu
    const refunds = base.ports.refund.refundCall.calls.map(([input]) => input);
    expect(refunds.map((r) => r.lichHenId).sort()).toStrictEqual(
      lich.map((l) => l.lichHenId).sort(),
    );
    expect(refunds.every((r) => r.soTien === DEPOSIT)).toBe(true);
    // không mời danh sách chờ (cả ngày đó không còn bác sĩ), đúng một thông báo cho mỗi lịch đã huỷ
    expect(base.ports.waitlist.releasedSlotIds).toStrictEqual([]);
    expect(base.ports.notifier.events).toHaveLength(total);
    expect(await activeCount()).toBe(0);
    await assertBookingInvariants(db);
  }, 60_000);
});
