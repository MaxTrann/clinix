import { findLockOrderViolation } from '../locking/lock-order.js';
import {
  deadlockError,
  writeTargets,
} from '../testing/create-appointment-world.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  expectLichLockByPrimaryKey,
  lockedTablesOf,
} from '../testing/lock-chain.js';
import {
  notificationRows,
  recordTransaction,
  resetBookingRound,
} from '../testing/payment-doctor-fakes.js';
import { createRealNotifierStack } from '../testing/notification-world.js';
import { failAfterStatement } from '../testing/statement-recorder.js';
import {
  ALL_STATES,
  checkInInput,
  createStatusStack,
  runCheckIn,
  WINDOW_END,
  WINDOW_START,
} from '../testing/status-world.js';
import {
  db,
  logs,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import { touchesTable } from '../testing/status-unit-helpers.js';

// Task B12 — `checkIn` trên MySQL 8.4 THẬT (PLAN booking 7.32 `[đề xuất]`; TRACKING 3.26 B12-C, B12-H): CKI-06 (đủ ma trận actor × trạng thái nguồn, kèm chuỗi câu thật), CKI-07 (hoàn tác bằng `failAfterStatement`, và thử lại
// khi gặp 1213). Phần đơn vị: check-in.spec.ts (CKI-01…CKI-05). Phần đồng thời (CKI-08, CKI-09): check-in.concurrency.int-spec.ts. Route và nghiệp vụ Lễ tân (CT-05, CT-06, CT-07, CT-10): reception-status.int-spec.ts.
// Mọi lời gọi qua `withBookingTransaction` thật (READ COMMITTED, thử lại ≤ 2, timeout chờ khoá 3 giây). Cổng danh sách chờ và hoàn tiền là bản `Fake`; thông báo GHI THẬT dòng `thong_bao`.
useStatusWorldHooks();
/** Dòng thông báo tiếp đón cho Bác sĩ phụ trách (notification B6; PLAN notification 5.8) */
const checkedInRow = (
  w: { doctor: { account: { taiKhoanId: string } } },
  lichHenId: string,
) => ({
  taiKhoanId: w.doctor.account.taiKhoanId,
  lichHenId,
  loai: 'LichHenDaTiepDon',
});
const emailRowCount = async () =>
  Number(
    (
      await db.query<{ n: string }[]>(
        'SELECT COUNT(*) AS n FROM email_thong_bao',
      )
    )[0]!.n,
  );
const lichHenStateOf = async (lichHenId: string) =>
  (
    await db.query<{ trangThai: string }[]>(
      'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
      [lichHenId],
    )
  )[0]?.trangThai;

describe('CKI-06 checkIn đủ ma trận (actor × trạng thái nguồn) trên MySQL thật', () => {
  it.each(['LeTan', 'ThanhToan'] as const)(
    'actor %s trong cửa sổ: CHỈ lịch DaXacNhan thành DaTiepDon (khung giờ giữ DaDat, thông báo cho Bác sĩ từ notification B6, không mời chờ); mọi nguồn khác là InvalidState và KHÔNG đổi một byte; INV-01…INV-05 sau từng ca',
    async (role) => {
      const w = await world();
      const stack = createStatusStack(db);
      for (const trangThai of ALL_STATES) {
        await resetBookingRound(db);
        const lich = await w.booked(trangThai, 0);
        const before = await w.snapshot(lich, 0);
        const outcome = await runCheckIn(
          db,
          stack.transition,
          checkInInput(w, lich.lichHenId, role),
        );
        const after = await w.snapshot(lich, 0);
        if (trangThai === 'DaXacNhan') {
          expect(outcome, trangThai).toEqual({ kind: 'CheckedIn' });
          expect(after.row.trangThai).toBe('DaTiepDon');
          // khung giờ giữ DaDat (INV-3): không giải phóng
          expect(after.slot).toEqual(before.slot);
          expect(after.slot.trangThai).toBe('DaDat');
        } else {
          expect(outcome, trangThai).toEqual({
            kind: 'InvalidState',
            trangThai,
          });
          expect(after, trangThai).toEqual(before);
        }
        // notification B6 (DMS-09, DMS-12): CHỈ lần tiếp đón thành công sinh MỘT thông báo cho Bác sĩ phụ trách; nguồn bị từ chối không sinh gì
        expect(await notificationRows(db), trangThai).toEqual(
          trangThai === 'DaXacNhan' ? [checkedInRow(w, lich.lichHenId)] : [],
        );
        await assertBookingInvariants(db);
      }
      expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
    },
  );

  it('lịch ở chi nhánh khác (Lễ tân chi nhánh thứ hai): NotFound, không đổi gì; ThanhToan không bị giới hạn chi nhánh (payment tự kiểm phạm vi, quy tắc 45 b)', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    const before = await w.snapshot(lich, 0);
    const outcome = await runCheckIn(
      db,
      stack.transition,
      checkInInput(w, lich.lichHenId, 'LeTan', {
        chiNhanhId: w.otherBranch.chiNhanhId,
      }),
    );
    expect(outcome).toEqual({ kind: 'NotFound' });
    expect(await w.snapshot(lich, 0)).toEqual(before);
    // DMS-11: lịch ngoài phạm vi vẫn NotFound như cũ và KHÔNG ghi thông báo
    expect(await notificationRows(db)).toEqual([]);
    expect(
      await runCheckIn(
        db,
        stack.transition,
        checkInInput(w, lich.lichHenId, 'ThanhToan'),
      ),
    ).toEqual({ kind: 'CheckedIn' });
  });

  it('còn phải thu (LeTan) ⇒ OwedAmount; chưa có cấu hình ⇒ ConfigMissing; ngoài cửa sổ ⇒ OutsideWindow: cả ba KHÔNG đổi gì', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    const before = await w.snapshot(lich, 0);
    const run = (
      over: Parameters<typeof checkInInput>[3],
      role = 'LeTan' as const,
    ) =>
      runCheckIn(
        db,
        stack.transition,
        checkInInput(w, lich.lichHenId, role, over),
      );
    expect(await run({ owed: '50000.00' })).toEqual({
      kind: 'OwedAmount',
      conPhaiThu: '50000.00',
    });
    expect(await run({ config: null })).toEqual({ kind: 'ConfigMissing' });
    expect(await run({ now: new Date(WINDOW_START.getTime() - 1000) })).toEqual(
      { kind: 'OutsideWindow', tu: WINDOW_START, den: WINDOW_END },
    );
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });

  it('chuỗi câu THẬT: `lich_hen` theo khoá chính rồi một UPDATE có điều kiện nguồn; chỉ khoá lich_hen; không khung_gio, benh_nhan; từ notification B6 thêm câu đọc ngữ cảnh (không khoá) rồi INSERT thong_bao, không email_thong_bao', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    const recorded = recordTransaction(db, 'ck-chain', (em) =>
      stack.transition.checkIn(em, checkInInput(w, lich.lichHenId, 'LeTan')),
    );
    expect(await recorded.run()).toEqual({ kind: 'CheckedIn' });
    const body = recorded.body();
    expectLichLockByPrimaryKey(body[0] as string);
    expect(lockedTablesOf(body)).toEqual(['lich_hen']);
    expect(findLockOrderViolation(lockedTablesOf(body))).toBeNull();
    // Thông báo ghi SAU khi đổi trạng thái, chỉ thong_bao
    expect(writeTargets(body)).toEqual([
      'UPDATE lich_hen',
      'INSERT INTO thong_bao',
    ]);
    for (const sql of body)
      for (const table of ['khung_gio', 'benh_nhan', 'email_thong_bao'])
        expect(touchesTable(sql, table), `${table}: ${sql}`).toBe(false);
  });
});

describe('CKI-07 hoàn tác trọn và thử lại (failAfterStatement)', () => {
  it('lỗi SAU khi UPDATE lich_hen đã chạy thật: giao dịch hoàn tác, lịch về DaXacNhan, khung giờ DaDat, không dòng thong_bao; lỗi nổi nguyên (không thử lại vì không phải 1213 hay 1205)', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    const before = await w.snapshot(lich, 0);
    const error = new Error('lỗi giả sau UPDATE lich_hen');
    const matched = failAfterStatement(
      db,
      /^\s*UPDATE lich_hen SET trang_thai/i,
      error,
    );
    await expect(
      runCheckIn(
        db,
        stack.transition,
        checkInInput(w, lich.lichHenId, 'LeTan'),
      ),
    ).rejects.toBe(error);
    expect(matched).toHaveLength(1);
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(await lichHenStateOf(lich.lichHenId)).toBe('DaXacNhan');
    expect(await notificationRows(db)).toEqual([]);
    await assertBookingInvariants(db);
  });

  it('deadlock giả (1213) SAU UPDATE lich_hen: giao dịch hoàn tác rồi CHẠY LẠI thân từ đầu; kết quả CheckedIn đúng MỘT lần, lịch DaTiepDon, có đúng một cảnh báo thử lại', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    const matched = failAfterStatement(
      db,
      /^\s*UPDATE lich_hen SET trang_thai/i,
      deadlockError(),
      1,
    );
    expect(
      await runCheckIn(
        db,
        stack.transition,
        checkInInput(w, lich.lichHenId, 'LeTan'),
      ),
    ).toEqual({ kind: 'CheckedIn' });
    // hai lần UPDATE: lần đầu bị hoàn tác, lần chạy lại thành công
    expect(matched).toHaveLength(2);
    expect(await lichHenStateOf(lich.lichHenId)).toBe('DaTiepDon');
    expect(logs.filter((line) => /MySQL 1213/.test(line))).toHaveLength(1);
    await assertBookingInvariants(db);
  });
});

// notification B6 (PLAN notification 5.8; Q7): thông báo tiếp đón cho Bác sĩ phụ trách, ghi trong giao dịch của `checkIn`. Ba đường vào (DMS-10): Lễ tân qua route (CT-05 ở
// `status/reception-status.int-spec.ts`), Quản trị viên override (CT-14 ở `status/admin-override.int-spec.ts`), thu tiền mặt tại quầy (TTQ-14 ở `payment/cash/cash-payment.int-spec.ts`).
describe('DMS-09, DMS-11 thông báo tiếp đón cho Bác sĩ phụ trách (MySQL thật)', () => {
  // `BookingNotifier` THẬT (chữ thật, nuốt 1062 đúng chỉ mục); `createStatusStack` dùng bản ghi giả `RecordingAppointmentNotifier`
  const checkIn = (w: Awaited<ReturnType<typeof world>>, lichHenId: string) =>
    runCheckIn(
      db,
      createRealNotifierStack(db).transition,
      checkInInput(w, lichHenId, 'LeTan'),
    );

  it('DMS-09 thành công: đúng MỘT thong_bao LichHenDaTiepDon cho bac_si_id của lịch, gắn lich_hen_id, chưa đọc; KHÔNG email_thong_bao; chữ có mã lịch', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    expect(await checkIn(w, lich.lichHenId)).toEqual({ kind: 'CheckedIn' });
    expect(await notificationRows(db)).toEqual([
      checkedInRow(w, lich.lichHenId),
    ]);
    expect(await emailRowCount()).toBe(0);
    const [note] = await db.query<{ noiDung: string; daDoc: number }[]>(
      'SELECT noi_dung AS noiDung, trang_thai_doc AS daDoc FROM thong_bao',
    );
    expect(note?.daDoc).toBe(0);
    expect(note?.noiDung).toMatch(
      /^Bệnh nhân .+ đã được tiếp đón cho lịch hẹn /,
    );
    expect(note?.noiDung).toContain(lich.maLichHen);
  });

  it('DMS-09 lỗi ghi thông báo (INSERT thong_bao chạy thật rồi ném): hoàn tác CẢ lần tiếp đón, lịch về DaXacNhan, không dòng nào; lỗi nổi nguyên', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const before = await w.snapshot(lich, 0);
    const error = new Error('INSERT thong_bao hỏng');
    const matched = failAfterStatement(db, /^\s*INSERT INTO thong_bao/i, error);
    await expect(checkIn(w, lich.lichHenId)).rejects.toBe(error);
    expect(matched).toHaveLength(1);
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(await lichHenStateOf(lich.lichHenId)).toBe('DaXacNhan');
    expect(await notificationRows(db)).toEqual([]);
    await assertBookingInvariants(db);
  });

  it('DMS-09 đã có sẵn thong_bao cùng (lịch, Bác sĩ, LichHenDaTiepDon): 1062 là "đã có", vẫn CheckedIn, vẫn MỘT dòng, nội dung cũ giữ nguyên, không email', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await db.query(
      "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, 'dòng có sẵn', 'LichHenDaTiepDon', ?, '2026-11-10 07:00:00')",
      [w.doctor.account.taiKhoanId, lich.lichHenId],
    );
    expect(await checkIn(w, lich.lichHenId)).toEqual({ kind: 'CheckedIn' });
    expect(await notificationRows(db)).toEqual([
      checkedInRow(w, lich.lichHenId),
    ]);
    const [note] = await db.query<{ noiDung: string }[]>(
      'SELECT noi_dung AS noiDung FROM thong_bao',
    );
    expect(note?.noiDung).toBe('dòng có sẵn');
    expect(await emailRowCount()).toBe(0);
  });

  it('DMS-11 Bác sĩ phụ trách NgungHoatDong: tiếp đón KHÔNG bị chặn, thông báo vẫn ghi cho tài khoản đó', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.doctor.account.taiKhoanId],
    );
    expect(await checkIn(w, lich.lichHenId)).toEqual({ kind: 'CheckedIn' });
    expect(await notificationRows(db)).toEqual([
      checkedInRow(w, lich.lichHenId),
    ]);
  });
});
