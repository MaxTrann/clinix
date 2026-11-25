import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  transactionOf,
  writeTargets,
} from '../testing/create-appointment-world.js';
import { lockedTablesOfDistinct } from '../testing/lock-chain.js';
import { isLockingStatement } from '../testing/query-spy.js';
import {
  rescheduleServiceWorld,
  WORLD_POLICY,
} from '../testing/reschedule-service-world.js';
import {
  interceptStatements,
  type StatementCall,
} from '../testing/statement-recorder.js';
import type { RescheduleOutcome } from './reschedule.types.js';

// reschedule B1, viết lại ở B4 — HDL-10 (phần B1; PLAN reschedule 5.4 quy tắc 3 và 6, 5.5 bước 1, 5 đến 7, 7.9) trên MySQL 8.4 THẬT: bốn hàm nền của B1 (khoá, hết hạn lười và `claimSlot`, `insertLichHen` nối chuỗi, `markReplaced`)
// chạy trọn trong MỘT `withBookingTransaction`, nay qua `AppointmentRescheduleService` THẬT (B4) thay cho thân mô phỏng `reschedule-write-world.ts` (đã xoá, TRACKING reschedule 1.7 E3): một cặp START TRANSACTION và COMMIT,
// chuỗi khoá không vi phạm thứ tự, mọi `INSERT` và `UPDATE` SAU khoá cuối, kết quả thoả INV-1 đến INV-10. Các chỗ còn lại của HDL-10 (B1) nằm ở `appointment-reschedule.service.int-spec.ts` để không lặp mã (jscpd quét cả file này):
// (iv) hết hạn lười = DLH-30; (vi) hoàn tác sau từng bước = DLH-12; (vii) `DuplicateChain` = DLH-32; (viii) khung giờ mới đã đặt = DLH-06 và lịch cũ không còn `DaXacNhan` = DLH-08. Ô i của thế giới bắt đầu lúc
// 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026; đồng hồ giả là 08:00 ngày 02/11/2026. Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const world = () =>
  rescheduleServiceWorld(db, fx, { config: { soLanTuDoiLichToiDa: 5 } });

function rescheduled(outcome: RescheduleOutcome) {
  if (outcome.kind !== 'Rescheduled')
    throw new Error(`phải Rescheduled, nhận ${JSON.stringify(outcome)}`);
  return outcome;
}

describe('HDL-10 (B1) bốn hàm nền ghép trong MỘT giao dịch', () => {
  it('(i) thành công: lịch cũ DaDoiLich; lịch mới DaXacNhan nối chuỗi, sao chép nguyên ba bản chụp và các khoá bất biến, bộ đếm cộng 1; khung giờ cũ ConTrong, mới DaDat; INV-1 đến INV-10 xanh', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 1 });
    const oldRow = await w.rowOf(old.lichHenId);
    const money = await w.moneyBefore();

    const result = rescheduled(
      await w.service.reschedule(w.tuDoi(old.maLichHen, 2)),
    );

    const child = await w.rowOf(await w.idOfCode(result.maLichHenMoi));
    expect((await w.rowOf(old.lichHenId)).trangThai).toBe('DaDoiLich');
    expect(child).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: old.lichHenId,
      soLan: 2,
      khungGioId: w.slot(2),
      hanThanhToan: null,
      taoLuc: '2026-11-02 08:00:00',
      xacNhanLuc: '2026-11-02 08:00:00',
      thoiGian: '2026-11-10 09:00:00',
      gia: '200000.00',
      coc: '50000.00',
      lyDoKham: 'Đau đầu',
      benhNhanId: oldRow.benhNhanId,
      bacSiId: oldRow.bacSiId,
      chiNhanhId: oldRow.chiNhanhId,
      dichVuKhamId: oldRow.dichVuKhamId,
    });
    expect(child.chinhSach).toEqual(WORLD_POLICY);
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(2, 'DaDat');
    await w.expectSettled(money);
  });

  it('(ii) đổi hộ (không phải tự đổi): bộ đếm của lịch mới BẰNG lịch cũ', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 1 });

    const result = rescheduled(
      await w.service.reschedule(w.doiHo(old.maLichHen, 2)),
    );

    expect((await w.rowOf(await w.idOfCode(result.maLichHenMoi))).soLan).toBe(
      1,
    );
    await w.expectSettled();
  });

  it('(iii) đổi hai lần liền (cũ → mới 1 → mới 2): chuỗi 3 lịch, bộ đếm 1, 2, 3, mỗi lịch chỉ MỘT con; INV xanh', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 1 });
    const first = rescheduled(
      await w.service.reschedule(w.tuDoi(old.maLichHen, 2)),
    );

    const second = rescheduled(
      await w.service.reschedule(w.tuDoi(first.maLichHenMoi, 4)),
    );

    const firstId = await w.idOfCode(first.maLichHenMoi);
    expect(await w.rowOf(firstId)).toMatchObject({
      trangThai: 'DaDoiLich',
      soLan: 2,
    });
    expect(await w.rowOf(await w.idOfCode(second.maLichHenMoi))).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: firstId,
      soLan: 3,
    });
    await w.expectSettled();
  });

  it('(v) đúng MỘT giao dịch; chuỗi khoá (đã bỏ khoá xin lại) không vi phạm thứ tự; mọi INSERT và UPDATE đứng SAU khoá cuối (quy tắc 3); đúng năm câu ghi theo thứ tự', async () => {
    const w = await world();
    const old = await w.book(0);
    const calls: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      calls.push(call);
      return run();
    });

    rescheduled(await w.service.reschedule(w.tuDoi(old.maLichHen, 2)));

    const sqls = calls.map((call) => call.sql);
    expect(sqls.filter((sql) => /^START TRANSACTION/i.test(sql))).toHaveLength(
      1,
    );
    expect(sqls.filter((sql) => /^COMMIT/i.test(sql))).toHaveLength(1);
    const body = transactionOf(sqls);
    expect(writeTargets(body)).toEqual([
      'INSERT INTO lich_hen',
      'UPDATE khung_gio', // hold khung giờ mới
      'UPDATE khung_gio', // markBooked khung giờ mới
      'UPDATE khung_gio', // release khung giờ cũ
      'UPDATE lich_hen', // markReplaced
    ]);
    const lastLock = body.findLastIndex(isLockingStatement);
    const firstWrite = body.findIndex((sql) =>
      /^\s*(INSERT|UPDATE)\b/i.test(sql),
    );
    expect(firstWrite).toBeGreaterThan(lastLock);
    expect(findLockOrderViolation(lockedTablesOfDistinct(calls))).toBeNull();
  });
});

describe('HDL-10 (B1) từ chối TRƯỚC lần ghi đầu tiên: giao dịch commit rỗng', () => {
  it('(viii) khung giờ đích không tồn tại ⇒ SlotNotFound; không câu ghi nào, không đổi gì', async () => {
    const w = await world();
    const old = await w.book(0);
    const before = await w.countRows('lich_hen');
    const calls: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      calls.push(call);
      return run();
    });

    const result = await w.service.reschedule(w.tuDoi(old.maLichHen, '999999'));

    expect(result).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'SlotNotFound' },
    });
    expect(writeTargets(calls.map((call) => call.sql))).toEqual([]);
    expect(await w.countRows('lich_hen')).toBe(before);
    await w.expectSlot(0, 'DaDat');
  });
});
