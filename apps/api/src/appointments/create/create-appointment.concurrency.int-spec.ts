import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { deferred } from '../../auth/testing/verification-int-helpers.js';
import { AppException } from '../../common/errors/app.exception.js';
import { RelativesRepository } from '../../patient/relatives/relatives.repository.js';
import { RelativesService } from '../../patient/relatives/relatives.service.js';
import {
  detailsOf,
  LOCK_PATIENT_SQL,
  waitForLockWaiterOn,
} from '../../patient/testing/relatives-deactivate-helpers.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  createGate,
  runRounds,
  tallyOutcomes,
  withRowLock,
  type Tally,
} from '../testing/concurrency-harness.js';
import {
  createAppointmentWorld,
  failureOf,
  lichHenRows,
  resetBookingData,
  type CreateWorld,
} from '../testing/create-appointment-world.js';
import { assertBookingInvariants } from '../testing/invariants.js';

// Task B8 — các ca ĐỒNG THỜI của `CreateAppointmentService` trên MySQL 8.4 THẬT (PLAN booking 7.10, 7.12; TRACKING 3.21 B8-H): DL-29 (bấm đúp), DT-10, DT-11 và KT-01 (tạo lịch đua với
// `RelativesService.deactivate` THẬT của patient; TAO-12 là nhánh "tạo đến trước" tất định của DT-11), KT-02, KT-03. Mỗi vòng dựng lại dữ liệu, các yêu cầu cùng xuất phát qua một cổng (`createGate`), rồi chạy INV-01…INV-05. Mọi yêu cầu chạy qua
// `withBookingTransaction` thật (READ COMMITTED, thử lại ≤ 2, chờ khoá 3 giây): "0 lỗi 1213/1205" là SAU thử lại. Số lần ĐÃ thử lại được đếm bằng cảnh báo của chính `withBookingTransaction`
// (KHÔNG dùng `serverDeadlocks` của patient vì nó `SET GLOBAL` trên MySQL dùng chung) và ghi ra stderr để người chạy thấy tải. Các ca này NHẠY VỚI TẢI: chạy MỘT MÌNH trên MySQL.
// "Hai biến thể" của DT-11 và KT-01 (patient NT-17: `plain-read` và `locked-read`) chỉ là hai cách kiểm hiệu lực của booking GIẢ LẬP; route thật chỉ có `locked-read` (`lockVisitProfile`), nên ở đây
// chạy đúng MỘT biến thể thật; `plain-read` là đột biến đối chứng ở giai đoạn 3. Mã TAO-nn là [đề xuất].
const ROUNDS = 30;
const TIMEOUT = 180_000;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const resetAll = () => resetBookingData(db);
const sleepMs = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Đếm số lần `withBookingTransaction` ĐÃ thử lại vì 1213 hay 1205 (cảnh báo "MySQL 1213 ở lần chạy …"); không đổi hành vi (`spyOn` vẫn gọi hàm thật). */
function watchRetries() {
  const messages: string[] = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    if (typeof message === 'string' && /MySQL (1213|1205)/.test(message))
      messages.push(message);
  });
  return {
    deadlocks: () => messages.filter((m) => m.includes('MySQL 1213')).length,
    timeouts: () => messages.filter((m) => m.includes('MySQL 1205')).length,
  };
}

/** MỌI yêu cầu xong có kết quả hợp lệ (thành công hoặc AppException có mã): 0 lỗi lạ (500), 0 deadlock và 0 hết giờ chờ khoá CÒN SÓT sau thử lại. */
function expectNoResidual(sum: Tally, total: number) {
  expect(sum).toMatchObject({
    total,
    deadlocks: 0,
    lockTimeouts: 0,
    other: [],
  });
}

const report = (
  name: string,
  sum: Tally,
  retries: ReturnType<typeof watchRetries>,
) =>
  process.stderr.write(
    `${name}: ${JSON.stringify(sum.byCode)} thành công=${String(sum.ok)}; đã thử lại 1213=${String(retries.deadlocks())} 1205=${String(retries.timeouts())}\n`,
  );

/** Hai yêu cầu tạo cùng xuất phát qua MỘT cổng; yêu cầu thứ hai trễ `delay` mili giây (xen kẽ thứ tự giữa các vòng). */
const together = (
  tasks: readonly (() => Promise<unknown>)[],
  delays: readonly number[] = [],
) => {
  const gate = createGate(tasks.length);
  return tasks.map((task, index) => async () => {
    await gate.arrive();
    if ((delays[index] ?? 0) > 0) await sleepMs(delays[index]!);
    return task();
  });
};

/** Hiệu lực của MỘT hồ sơ người thân và số lịch ĐANG HOẠT ĐỘNG của nó (`ChoThanhToan`, `DaXacNhan`, `DaTiepDon`: đúng tập mà ngừng hồ sơ coi là chặn). */
async function relativeState(
  relativeId: string,
): Promise<{ active: boolean; lich: number }> {
  const [row] = (await db.query(
    `SELECT h.trang_thai_hieu_luc AS hl,
       (SELECT COUNT(*) FROM lich_hen l WHERE l.ho_so_nguoi_than_id = h.ho_so_nguoi_than_id
          AND l.trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon')) AS n
     FROM ho_so_nguoi_than h WHERE h.ho_so_nguoi_than_id = ?`,
    [relativeId],
  )) as { hl: number | string; n: number | string }[];
  return { active: Number(row!.hl) === 1, lich: Number(row!.n) };
}

const slotRows = (w: CreateWorld, index: number) =>
  db.query(
    "SELECT COUNT(*) AS n FROM lich_hen WHERE khung_gio_id = ? AND trang_thai IN ('ChoThanhToan', 'DaXacNhan')",
    [w.slot(index)],
  ) as Promise<{ n: string | number }[]>;

/**
 * MỘT ca "hai yêu cầu tạo cùng lúc, đúng một thắng" (≥ 30 vòng): mỗi vòng `resetAll` rồi `prepare`, hai yêu cầu cùng xuất phát qua một cổng (yêu cầu thứ hai trễ 0 đến 2 ms), đúng một 201, người kia
 * nhận ĐÚNG `loserCode`, `verify` kiểm dữ liệu của ca, rồi INV-01…INV-05; sau cả ca: 0 lỗi lạ, 0 deadlock, 0 hết giờ chờ khoá còn sót. Gom một chỗ vì DL-29 và hai ca DT-10 chỉ khác dữ liệu đầu vào và câu kiểm.
 */
async function raceTwoCreates(
  name: string,
  w: CreateWorld,
  ca: {
    slots: readonly [number, number];
    loserCode: string;
    prepare?: () => Promise<unknown>;
    verify: () => Promise<void>;
  },
) {
  const retries = watchRetries();
  const all = await runRounds({
    rounds: ROUNDS,
    setup: async () => {
      await resetAll();
      await ca.prepare?.();
    },
    race: (_context, round) =>
      together(
        ca.slots.map((slot) => () => w.create(slot)),
        [0, round % 3],
      ),
    check: async (_context, results) => {
      const tally = tallyOutcomes(results);
      expect(tally.ok).toBe(1);
      expect(tally.byCode).toStrictEqual({ [ca.loserCode]: 1 });
      expect(tally.other).toEqual([]);
      await ca.verify();
      await assertBookingInvariants(db);
    },
  });
  const sum = tallyOutcomes(all.flat());
  expectNoResidual(sum, ROUNDS * 2);
  report(name, sum, retries);
}

describe('DL-29 bấm đúp: hai POST giống hệt gần như cùng lúc (≥ 30 vòng)', () => {
  it.each([
    ['cọc 0đ', '0.00', 'KHUNG_GIO_DA_DAT', 'DaXacNhan'],
    ['cọc > 0', '50000.00', 'KHUNG_GIO_DANG_GIU', 'ChoThanhToan'],
  ])(
    'DL-29 (%s): đúng MỘT 201 và một 409 %s; một lịch duy nhất; không 500, không deadlock còn sót; INV sau mỗi vòng',
    async (name, tienCoc, loserCode, winnerState) => {
      const w = await createAppointmentWorld(db, fx);
      await w.deposit(tienCoc);

      await raceTwoCreates(`DL-29 ${name}`, w, {
        slots: [0, 0],
        loserCode,
        verify: async () => {
          const rows = await lichHenRows(db);
          expect(rows).toHaveLength(1);
          expect(rows[0]!.trangThai).toBe(winnerState);
          expect(Number((await slotRows(w, 0))[0]!.n)).toBe(1);
        },
      });
    },
    TIMEOUT,
  );
});

describe('DT-10 hai yêu cầu cùng tài khoản khi chỉ còn 1 chỗ trong giới hạn (≥ 30 vòng)', () => {
  // đã có 1 lịch đang hoạt động ở ô 5 và giới hạn là 2: còn đúng 1 chỗ
  const withOneSeatLeft = async () => {
    const w = await createAppointmentWorld(db, fx);
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 2 });
    return w;
  };

  it(
    'hai khung giờ KHÁC NHAU: đúng một thắng, người kia VUOT_SO_LICH_HEN_TOI_DA (chiTiet.toiDa); không bao giờ vượt giới hạn; INV sau mỗi vòng',
    async () => {
      const w = await withOneSeatLeft();

      await raceTwoCreates('DT-10 hai khung giờ', w, {
        slots: [0, 1],
        loserCode: 'VUOT_SO_LICH_HEN_TOI_DA',
        prepare: () => w.book('DaXacNhan', 5),
        verify: async () => {
          const [{ n }] = (await db.query(
            "SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon')",
          )) as { n: string | number }[];
          expect(Number(n)).toBe(2);
        },
      });
    },
    TIMEOUT,
  );

  it(
    'CÙNG một khung giờ còn 1 chỗ: đúng một thắng, người kia KHUNG_GIO_DA_DAT; không lịch nào bị vượt giới hạn; INV sau mỗi vòng',
    async () => {
      const w = await withOneSeatLeft();

      await raceTwoCreates('DT-10 cùng khung giờ', w, {
        slots: [0, 0],
        loserCode: 'KHUNG_GIO_DA_DAT',
        prepare: () => w.book('DaXacNhan', 5),
        verify: async () => {
          expect(Number((await slotRows(w, 0))[0]!.n)).toBe(1);
        },
      });
    },
    TIMEOUT,
  );
});

describe('DT-11, KT-01 tạo lịch đua với RelativesService.deactivate THẬT (locked-read thật, ≥ 30 vòng)', () => {
  const relatives = () => new RelativesService(db, new RelativesRepository());
  const CONFLICT = 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN';

  it(
    'mỗi vòng đúng MỘT trong hai: (hồ sơ ngừng, tạo nhận HO_SO_NGUOI_THAN_DA_NGUNG, không lịch mới) hoặc (có lịch, ngừng nhận 409 HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN, hồ sơ còn hiệu lực); không deadlock, không 500; INV sau mỗi vòng',
    async () => {
      const w = await createAppointmentWorld(db, fx);
      const service = relatives();
      const retries = watchRetries();
      const branches = { ngungThang: 0, taoThang: 0 };

      const all = await runRounds({
        rounds: ROUNDS,
        setup: async () => {
          await resetAll();
          return fx.relative(w.patientId);
        },
        race: (relativeId, round) => {
          const create = () => w.create(0, { hoSoNguoiThanId: relativeId });
          const stop = () => service.deactivate(w.patientId, relativeId);
          // vòng chẵn: ngừng được gọi trước, tạo trễ 0, 1 hoặc 2 ms; vòng lẻ: tạo được gọi trước, ngừng trễ 0 đến 14 ms (rộng hơn vì `create` còn đọc cấu hình NGOÀI giao dịch
          // trước khi tới khoá `benh_nhan`, nên trễ 0 đến 2 ms gần như luôn để ngừng tới khoá trước: số đo lần chạy đầu là 29 ngừng thắng / 1 tạo thắng)
          return round % 2 === 0
            ? together([stop, create], [0, round % 3])
            : together([create, stop], [0, (round % 8) * 2]);
        },
        check: async (relativeId, results, round) => {
          // vòng chẵn: race = [ngừng, tạo]; vòng lẻ: race = [tạo, ngừng]
          const [first, second] = results;
          const createResult = round % 2 === 0 ? second! : first!;
          const stopResult = round % 2 === 0 ? first! : second!;
          const label = (r: PromiseSettledResult<unknown>) =>
            r.status === 'fulfilled'
              ? 'ok'
              : r.reason instanceof AppException
                ? r.reason.maLoi
                : `LỖI-KHÁC:${String(r.reason)}`;
          const key = `vòng ${String(round)}: tạo=${label(createResult)} + ngừng=${label(stopResult)}`;
          const state = await relativeState(relativeId);
          // bất biến H1: hồ sơ đã ngừng thì KHÔNG còn lịch đang hoạt động nào
          expect(state.active || state.lich === 0, key).toBe(true);
          if (label(stopResult) === 'ok') {
            branches.ngungThang += 1;
            expect(label(createResult), key).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
            expect(state, key).toStrictEqual({ active: false, lich: 0 });
            expect(await lichHenRows(db), key).toHaveLength(0);
          } else {
            branches.taoThang += 1;
            expect(label(stopResult), key).toBe(CONFLICT);
            expect(label(createResult), key).toBe('ok');
            expect(state, key).toStrictEqual({ active: true, lich: 1 });
          }
          await assertBookingInvariants(db);
        },
      });

      const sum = tallyOutcomes(all.flat());
      expect(sum.total).toBe(ROUNDS * 2);
      expect(sum.deadlocks).toBe(0);
      expect(sum.lockTimeouts).toBe(0);
      expect(sum.other).toEqual([]);
      report('DT-11/KT-01 locked-read', sum, retries);
      process.stderr.write(
        `DT-11/KT-01 phân bố hai nhánh: ${JSON.stringify(branches)}\n`,
      );
    },
    TIMEOUT,
  );
});

describe('TAO-12, DT-11 nhánh "tạo đến trước" TẤT ĐỊNH (bù cho vòng tự do nghiêng về ngừng thắng)', () => {
  it('tạo đang GIỮ benh_nhan (dừng ở cổng nghỉ phép, dưới khoá); ngừng hồ sơ THẬT được gọi ở kết nối khác và ĐỨNG CHỜ benh_nhan (data_lock_waits); tạo commit ⇒ ngừng 409 HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN có đúng lịch vừa tạo; hồ sơ vẫn hiệu lực', async () => {
    const w = await createAppointmentWorld(db, fx);
    const service = new RelativesService(db, new RelativesRepository());
    const reached = deferred();
    const proceed = deferred();
    w.leave.findBlockingLeaveCall.onCall(async () => {
      reached.resolve();
      await proceed.promise;
    });

    const creating = w.create(0, { hoSoNguoiThanId: w.relativeId });
    // tránh "unhandled rejection" nếu ca đỏ trước khi tới `await creating`
    creating.catch(() => undefined);
    await reached.promise;
    const stopping = service.deactivate(w.patientId, w.relativeId).then(
      () => 'ok',
      (error: unknown) => error,
    );
    await waitForLockWaiterOn(db, 'benh_nhan');
    proceed.resolve();

    const created = await creating;
    const stopped = await stopping;
    expect(stopped).toBeInstanceOf(AppException);
    expect((stopped as AppException).maLoi).toBe(
      'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN',
    );
    expect(JSON.stringify(detailsOf(stopped))).toContain(created.maLichHen);
    expect(await relativeState(w.relativeId)).toStrictEqual({
      active: true,
      lich: 1,
    });
    await w.expectSettled(0);
  });
});

describe('KT-02, KT-03 thứ tự khoá benh_nhan → ho_so_nguoi_than với ngừng hồ sơ THẬT', () => {
  it('KT-02 đặt lịch vào hồ sơ vừa được ngừng bằng RelativesService.deactivate thật ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG, không ghi gì', async () => {
    const w = await createAppointmentWorld(db, fx);
    await new RelativesService(db, new RelativesRepository()).deactivate(
      w.patientId,
      w.relativeId,
    );

    const { status, body } = await failureOf(
      w.create(0, { hoSoNguoiThanId: w.relativeId }),
    );

    expect(status).toBe(409);
    expect(body.maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(await lichHenRows(db)).toHaveLength(0);
    await w.expectSettled(0);
  });

  it('KT-03 tất định: giao dịch giả giữ benh_nhan FOR UPDATE; tạo lịch phải CHỜ ở benh_nhan (không tiến tới khoá hồ sơ, bác sĩ, khung giờ); sau commit của giao dịch giả đã ngừng hồ sơ thì tạo báo HO_SO_NGUOI_THAN_DA_NGUNG', async () => {
    const w = await createAppointmentWorld(db, fx);
    const waitersOn = async (table: string) => {
      const rows = (await db.query(
        `SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w
         JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
         WHERE l.OBJECT_SCHEMA = DATABASE() AND l.OBJECT_NAME = ?`,
        [table],
      )) as { n: string | number }[];
      return Number(rows[0]!.n);
    };

    await withRowLock(
      db,
      { sql: LOCK_PATIENT_SQL, params: [w.patientId] },
      async (held) => {
        const pending = w.create(0, { hoSoNguoiThanId: w.relativeId }).then(
          () => 'ok',
          (error: unknown) => error,
        );

        await waitForLockWaiterOn(db, 'benh_nhan');
        // đang đứng chờ benh_nhan (tầng 2): chưa xin ho_so_nguoi_than, bac_si, khung_gio
        expect(await waitersOn('ho_so_nguoi_than')).toBe(0);
        expect(await waitersOn('bac_si')).toBe(0);
        expect(await waitersOn('khung_gio')).toBe(0);
        await held.manager.query(
          'UPDATE ho_so_nguoi_than SET trang_thai_hieu_luc = 0 WHERE ho_so_nguoi_than_id = ?',
          [w.relativeId],
        );
        await held.release('commit');

        const outcome = await pending;
        expect(outcome).toBeInstanceOf(AppException);
        expect((outcome as AppException).maLoi).toBe(
          'HO_SO_NGUOI_THAN_DA_NGUNG',
        );
      },
    );

    expect(await lichHenRows(db)).toHaveLength(0);
    await w.expectSettled(0);
  });
});
