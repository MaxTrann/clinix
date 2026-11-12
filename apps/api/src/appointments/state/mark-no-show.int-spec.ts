import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import {
  deadlockError,
  writeTargets,
} from '../testing/create-appointment-world.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  lockedTablesOf,
  expectLichLockByPrimaryKey,
} from '../testing/lock-chain.js';
import {
  notificationRows,
  recordTransaction,
  resetBookingRound,
} from '../testing/payment-doctor-fakes.js';
import { firstTableOf, isLockingStatement } from '../testing/query-spy.js';
import {
  failAfterStatement,
  interceptStatements,
} from '../testing/statement-recorder.js';
import {
  AFTER_ALL_WINDOWS,
  createStatusStack,
  noShowInput,
  readNoShow,
  runNoShow,
  setNoShow,
  WINDOW_END,
  type NoShowState,
  type StatusWorld,
} from '../testing/status-world.js';
import {
  db,
  expectNoChange,
  logs,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import { touchesTable } from '../testing/status-unit-helpers.js';

// Task B12 — `markNoShow` trên MySQL 8.4 THẬT (PLAN booking 7.6 VM-05…VM-08, VM-14; 7.32 NSH-02, NSH-03, NSH-05, NSH-06, NSH-07; TRACKING 3.26 B12-D, B12-H): ngưỡng và cờ khoá, thông báo đúng tài khoản đặt, chuỗi khoá THẬT, ba biến thể `actor`,
// hoàn tác trọn và thử lại bằng `failAfterStatement`. Phần đơn vị: mark-no-show.spec.ts. Phần đồng thời (VM-09, VM-15, DT-06, DT-15, CKI-09, NSH-09, NSH-10): status.concurrency.int-spec.ts. Route Lễ tân (CT-03, CT-04, CT-12): reception-status.int-spec.ts.
// Mọi lời gọi qua `withBookingTransaction` thật (READ COMMITTED, thử lại ≤ 2, timeout chờ khoá 3 giây). Cổng danh sách chờ là bản `Fake`; thông báo GHI THẬT dòng `thong_bao` (có khoá ngoại tới `lich_hen` và `tai_khoan`).
const { NO_SHOW, NO_SHOW_LOCK } = BOOKING_NOTIFICATION_EVENTS;

useStatusWorldHooks();

/** Dữ liệu dựng lại SẠCH, bộ đếm của tài khoản đặt (`w.patientId`) đặt theo `counter`, rồi một lịch ở khung giờ số 0 (của bản thân, hay của hồ sơ người thân nếu truyền `relativeId`). */
async function seed(
  w: StatusWorld,
  counter: NoShowState,
  over: { trangThai?: TrangThaiLichHen; relativeId?: string } = {},
) {
  await resetBookingRound(db);
  await setNoShow(db, w.patientId, counter);
  return w.booked(
    over.trangThai ?? 'DaXacNhan',
    0,
    over.relativeId === undefined ? {} : { hoSoNguoiThanId: over.relativeId },
  );
}

const events = (rows: { loai: string }[]) => rows.map((row) => row.loai);

/** Mở đầu của mọi ca "bị từ chối thì không đổi gì": thế giới, bộ dịch vụ, MỘT lịch (bộ đếm `counter`) và ảnh chụp TRƯỚC */
async function arrange(
  counter: NoShowState,
  over: Parameters<typeof seed>[2] = {},
) {
  const w = await world();
  const stack = createStatusStack(db);
  const lich = await seed(w, counter, over);
  return { w, stack, lich, before: await w.snapshot(lich, 0) };
}

describe('VM-05, VM-06, VM-07 ngưỡng no-show: đạt HOẶC vượt, cờ đã bật không bật lại, sau mở khoá thì khoá lại ngay (ngưỡng của thế giới là 3)', () => {
  it.each<[string, NoShowState, NoShowState, string[]]>([
    [
      'VM-05 chưa đạt: 0 ⇒ 1, không khoá, không thông báo khoá',
      { soLan: 0, khoa: false },
      { soLan: 1, khoa: false },
      [NO_SHOW],
    ],
    [
      'VM-05 chưa đạt: 1 ⇒ 2',
      { soLan: 1, khoa: false },
      { soLan: 2, khoa: false },
      [NO_SHOW],
    ],
    [
      'VM-05 đạt ngưỡng: 2 ⇒ 3, bật cờ và thông báo khoá MỘT lần',
      { soLan: 2, khoa: false },
      { soLan: 3, khoa: true },
      [NO_SHOW, NO_SHOW_LOCK],
    ],
    [
      'VM-06 cờ đã bật từ trước: 5 ⇒ 6, chỉ tăng số, KHÔNG cảnh báo lặp',
      { soLan: 5, khoa: true },
      { soLan: 6, khoa: true },
      [NO_SHOW],
    ],
    [
      'VM-06 cờ đã bật đúng lúc số mới bằng ngưỡng: 2 ⇒ 3, không thông báo khoá',
      { soLan: 2, khoa: true },
      { soLan: 3, khoa: true },
      [NO_SHOW],
    ],
    [
      'VM-07 sau Quản trị viên mở khoá (cờ tắt, số vẫn ≥ ngưỡng): 3 ⇒ 4, khoá lại NGAY',
      { soLan: 3, khoa: false },
      { soLan: 4, khoa: true },
      [NO_SHOW, NO_SHOW_LOCK],
    ],
  ])('%s', async (_ten, before, after, expectedEvents) => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await seed(w, before);
    const slotBefore = await w.snapshot(lich, 0);
    const outcome = await runNoShow(
      db,
      stack.transition,
      noShowInput(w, lich.lichHenId, 'LeTan'),
    );
    expect(outcome).toEqual({
      kind: 'NoShowed',
      soLanNoShow: after.soLan,
      khoaDatLich: expectedEvents.includes(NO_SHOW_LOCK),
    });
    expect(await readNoShow(db, w.patientId)).toEqual(after);
    const state = await w.snapshot(lich, 0);
    expect(state.row.trangThai).toBe('VangMat');
    // VM-08: khung giờ giữ DaDat, không mời danh sách chờ
    expect(state.slot).toEqual(slotBefore.slot);
    expect(state.slot.trangThai).toBe('DaDat');
    expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
    const rows = await notificationRows(db);
    expect(events(rows)).toEqual(expectedEvents);
    for (const row of rows)
      expect(row).toMatchObject({
        taiKhoanId: w.patientId,
        lichHenId: lich.lichHenId,
      });
    await assertBookingInvariants(db);
  });
});

describe('VM-08, NSH-03 chuỗi khoá THẬT: benh_nhan (tầng 2) TRƯỚC lich_hen (tầng 6), không khung_gio, thông báo SAU khi đã khoá lịch', () => {
  it('đọc thường lich_hen, khoá benh_nhan, khoá lich_hen theo khoá chính, ghi lịch, cộng số, đọc lại, rồi thông báo; bảng bị khoá đúng thứ tự 5.3; không câu nào chạm khung_gio', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await seed(w, { soLan: 0, khoa: false });
    const recorded = recordTransaction(db, 'ns-chain', (em) =>
      stack.transition.markNoShow(em, noShowInput(w, lich.lichHenId, 'LeTan')),
    );
    expect((await recorded.run()).kind).toBe('NoShowed');
    const body = recorded.body();
    expect(firstTableOf(body[0] as string)).toBe('lich_hen');
    expect(isLockingStatement(body[0] as string)).toBe(false);
    expect(lockedTablesOf(body)).toEqual(['benh_nhan', 'lich_hen']);
    expect(findLockOrderViolation(lockedTablesOf(body))).toBeNull();
    expectLichLockByPrimaryKey(body[2] as string);
    expect(writeTargets(body)).toEqual([
      'UPDATE lich_hen',
      'UPDATE benh_nhan',
      'INSERT INTO thong_bao',
    ]);
    // thông báo (tầng 7) là câu CUỐI: sau mọi lần khoá và ghi lịch, bộ đếm
    expect(body.at(-1)).toMatch(/^\s*INSERT INTO thong_bao/i);
    for (const sql of body)
      expect(touchesTable(sql, 'khung_gio'), sql).toBe(false);
  });
});

describe('VM-14 lịch của hồ sơ người thân: cộng vào tài khoản ĐẶT, thông báo cho tài khoản đặt (Q14, CT-12)', () => {
  it('lịch của hồ sơ người thân: so_lan_no_show của Bệnh nhân đặt tăng, cờ khoá theo ngưỡng; thông báo đi cho Bệnh nhân đặt (không có "tài khoản" của người thân); Bệnh nhân khác không bị đụng', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await seed(
      w,
      { soLan: 2, khoa: false },
      { relativeId: w.relativeId },
    );
    await setNoShow(db, w.secondPatientId, { soLan: 1, khoa: false });
    const outcome = await runNoShow(
      db,
      stack.transition,
      noShowInput(w, lich.lichHenId, 'LeTan'),
    );
    expect(outcome).toEqual({
      kind: 'NoShowed',
      soLanNoShow: 3,
      khoaDatLich: true,
    });
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 3,
      khoa: true,
    });
    expect(await readNoShow(db, w.secondPatientId)).toEqual({
      soLan: 1,
      khoa: false,
    });
    const rows = await notificationRows(db);
    expect(events(rows)).toEqual([NO_SHOW, NO_SHOW_LOCK]);
    for (const row of rows) expect(row.taiKhoanId).toBe(w.patientId);
  });
});

describe('NSH-02 ba biến thể actor trên MySQL thật', () => {
  it('QuanTriVien (override) đánh Vắng mặt được từ DaXacNhan HOẶC DaTiepDon (ô Q24), KHÔNG điều kiện thời gian: mốc now còn cách giờ hẹn một ngày vẫn được; bộ đếm +1', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    for (const trangThai of ['DaXacNhan', 'DaTiepDon'] as const) {
      const lich = await seed(w, { soLan: 0, khoa: false }, { trangThai });
      const outcome = await runNoShow(
        db,
        stack.transition,
        noShowInput(w, lich.lichHenId, 'QuanTriVien', {
          now: new Date('2026-11-09T08:00:00+07:00'),
        }),
      );
      expect(outcome, trangThai).toMatchObject({
        kind: 'NoShowed',
        soLanNoShow: 1,
      });
      expect((await w.snapshot(lich, 0)).row.trangThai).toBe('VangMat');
      await assertBookingInvariants(db);
    }
  });

  it('QuanTriVien chỉ thấy chi nhánh khác (phạm vi ChiNhanh): NotFound, không đổi gì, không cộng số', async () => {
    const { w, stack, lich, before } = await arrange({ soLan: 1, khoa: false });
    expect(
      await runNoShow(
        db,
        stack.transition,
        noShowInput(w, lich.lichHenId, 'QuanTriVien', {
          scope: { kind: 'ChiNhanh', chiNhanhId: w.otherBranch.chiNhanhId },
        }),
      ),
    ).toEqual({ kind: 'NotFound' });
    await expectNoChange(w, lich, before, { soLan: 1, khoa: false });
    expect(await notificationRows(db)).toEqual([]);
  });

  it('HeThong (job): isDue đúng ⇒ NoShowed; isDue sai ⇒ NotDue, không đổi gì; nguồn DaTiepDon ⇒ InvalidState (ma trận chỉ cho HeThong đi từ DaXacNhan)', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await seed(w, { soLan: 0, khoa: false });
    const before = await w.snapshot(lich, 0);
    expect(
      await runNoShow(
        db,
        stack.transition,
        noShowInput(w, lich.lichHenId, 'HeThong', { isDue: false }),
      ),
    ).toEqual({ kind: 'NotDue' });
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(
      (
        await runNoShow(
          db,
          stack.transition,
          noShowInput(w, lich.lichHenId, 'HeThong'),
        )
      ).kind,
    ).toBe('NoShowed');
    const attending = await seed(
      w,
      { soLan: 0, khoa: false },
      { trangThai: 'DaTiepDon' },
    );
    expect(
      await runNoShow(
        db,
        stack.transition,
        noShowInput(w, attending.lichHenId, 'HeThong'),
      ),
    ).toEqual({ kind: 'InvalidState', trangThai: 'DaTiepDon' });
  });

  it('LeTan: ngoài chi nhánh ⇒ NotFound; chưa quá hết cửa sổ (đúng mốc thoi_gian + 15 phút còn trong cửa sổ) ⇒ NotDue; không đổi gì, không cộng số, không thông báo', async () => {
    const { w, stack, lich, before } = await arrange({ soLan: 1, khoa: false });
    const run = (over: Parameters<typeof noShowInput>[3]) =>
      runNoShow(
        db,
        stack.transition,
        noShowInput(w, lich.lichHenId, 'LeTan', over),
      );
    expect(await run({ chiNhanhId: w.otherBranch.chiNhanhId })).toEqual({
      kind: 'NotFound',
    });
    expect(await run({ now: WINDOW_END })).toEqual({ kind: 'NotDue' });
    await expectNoChange(w, lich, before, { soLan: 1, khoa: false });
    expect(await notificationRows(db)).toEqual([]);
    // +1 giây sau mốc: được
    expect(
      (await run({ now: new Date(WINDOW_END.getTime() + 1000) })).kind,
    ).toBe('NoShowed');
  });

  it('chưa có cấu hình ⇒ ConfigMissing với cả ba vai trò: không đổi gì, không đoán ngưỡng', async () => {
    const { w, stack, lich, before } = await arrange({ soLan: 2, khoa: false });
    for (const role of ['LeTan', 'QuanTriVien', 'HeThong'] as const)
      expect(
        await runNoShow(
          db,
          stack.transition,
          noShowInput(w, lich.lichHenId, role, { config: null }),
        ),
        role,
      ).toEqual({ kind: 'ConfigMissing' });
    await expectNoChange(w, lich, before, { soLan: 2, khoa: false });
  });

  it.each<TrangThaiLichHen>([
    'ChoThanhToan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'VangMat',
    'DaDoiLich',
  ])(
    'LeTan, lịch %s: InvalidState, không đổi gì (VangMat là bấm đúp: KHÔNG cộng số lần thứ hai)',
    async (trangThai) => {
      const { w, stack, lich, before } = await arrange(
        { soLan: 1, khoa: false },
        { trangThai },
      );
      expect(
        await runNoShow(
          db,
          stack.transition,
          noShowInput(w, lich.lichHenId, 'LeTan'),
        ),
      ).toEqual({ kind: 'InvalidState', trangThai });
      await expectNoChange(w, lich, before, { soLan: 1, khoa: false });
    },
  );
});

describe('NSH-06 hoàn tác trọn (failAfterStatement): lỗi ở BẤT KỲ bước ghi nào sau lần ghi đầu hoàn tác cả lịch, bộ đếm, cờ và thông báo', () => {
  it.each<[string, RegExp, NoShowState]>([
    [
      'sau UPDATE lich_hen',
      /^\s*UPDATE lich_hen SET trang_thai/i,
      { soLan: 0, khoa: false },
    ],
    [
      'sau UPDATE bộ đếm so_lan_no_show',
      /^\s*UPDATE benh_nhan SET so_lan_no_show/i,
      { soLan: 0, khoa: false },
    ],
    [
      'sau UPDATE cờ khoá (số mới đạt ngưỡng)',
      /^\s*UPDATE benh_nhan SET khoa_dat_lich_do_no_show/i,
      { soLan: 2, khoa: false },
    ],
    [
      'sau INSERT thong_bao đầu (LichHenVangMat)',
      /^\s*INSERT INTO thong_bao/i,
      { soLan: 2, khoa: false },
    ],
  ])('%s', async (_ten, pattern, before) => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await seed(w, before);
    const snapshot = await w.snapshot(lich, 0);
    const error = new Error('lỗi giả sau câu ghi');
    const matched = failAfterStatement(db, pattern, error);
    await expect(
      runNoShow(db, stack.transition, noShowInput(w, lich.lichHenId, 'LeTan')),
    ).rejects.toBe(error);
    expect(matched).toHaveLength(1);
    expect(await w.snapshot(lich, 0)).toEqual(snapshot);
    expect(await readNoShow(db, w.patientId)).toEqual(before);
    expect(await notificationRows(db)).toEqual([]);
    await assertBookingInvariants(db);
  });

  it('sau INSERT thong_bao THỨ HAI (KhoaDatLichNoShow, dòng thứ nhất đã ghi thật): hoàn tác cả hai dòng, bộ đếm, cờ và lịch', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const before = { soLan: 2, khoa: false };
    const lich = await seed(w, before);
    const snapshot = await w.snapshot(lich, 0);
    const error = new Error('lỗi giả sau thông báo thứ hai');
    let seen = 0;
    interceptStatements(db, async (call, run) => {
      const result = await run();
      if (/^\s*INSERT INTO thong_bao/i.test(call.sql)) {
        seen += 1;
        if (seen === 2) throw error;
      }
      return result;
    });
    await expect(
      runNoShow(db, stack.transition, noShowInput(w, lich.lichHenId, 'LeTan')),
    ).rejects.toBe(error);
    expect(seen).toBe(2);
    expect(await w.snapshot(lich, 0)).toEqual(snapshot);
    expect(await readNoShow(db, w.patientId)).toEqual(before);
    expect(await notificationRows(db)).toEqual([]);
  });
});

describe('NSH-07 thân chạy lại sau 1213 không cộng đôi', () => {
  it.each<[string, RegExp, NoShowState, NoShowState, string[]]>([
    [
      'sau UPDATE bộ đếm (chưa tới ngưỡng)',
      /^\s*UPDATE benh_nhan SET so_lan_no_show/i,
      { soLan: 0, khoa: false },
      { soLan: 1, khoa: false },
      [NO_SHOW],
    ],
    [
      'sau UPDATE cờ khoá (đạt ngưỡng)',
      /^\s*UPDATE benh_nhan SET khoa_dat_lich_do_no_show/i,
      { soLan: 2, khoa: false },
      { soLan: 3, khoa: true },
      [NO_SHOW, NO_SHOW_LOCK],
    ],
  ])(
    'deadlock giả (1213) %s: giao dịch hoàn tác rồi chạy lại từ đầu; số lần chỉ +1, mỗi thông báo đúng MỘT dòng, đúng một cảnh báo thử lại',
    async (_ten, pattern, before, after, expectedEvents) => {
      const w = await world();
      const stack = createStatusStack(db);
      const lich = await seed(w, before);
      const matched = failAfterStatement(db, pattern, deadlockError(), 1);
      const outcome = await runNoShow(
        db,
        stack.transition,
        noShowInput(w, lich.lichHenId, 'LeTan'),
      );
      expect(outcome).toMatchObject({
        kind: 'NoShowed',
        soLanNoShow: after.soLan,
      });
      expect(matched).toHaveLength(2);
      expect(await readNoShow(db, w.patientId)).toEqual(after);
      expect(events(await notificationRows(db))).toEqual(expectedEvents);
      expect(logs.filter((line) => /MySQL 1213/.test(line))).toHaveLength(1);
      await assertBookingInvariants(db);
    },
  );
});

describe('tiền đề của các ca đồng thời: AFTER_ALL_WINDOWS nằm sau cửa sổ của mọi khung giờ trong ngày', () => {
  it('AFTER_ALL_WINDOWS sau cửa sổ của MỌI khung giờ trong ngày (ô cuối 11:30 + 15 phút): Lễ tân đánh Vắng mặt được lịch ở khung giờ cuối', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    await resetBookingRound(db);
    const last = await w.booked('DaXacNhan', w.slotIds.length - 1);
    expect(
      (
        await runNoShow(
          db,
          stack.transition,
          noShowInput(w, last.lichHenId, 'LeTan', { now: AFTER_ALL_WINDOWS }),
        )
      ).kind,
    ).toBe('NoShowed');
  });
});
