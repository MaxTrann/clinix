import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { expiryWorld } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { expectLichLockByPrimaryKey } from '../testing/lock-chain.js';
import {
  createTransitionStack,
  recordTransaction,
  snapshotState,
} from '../testing/payment-doctor-fakes.js';
import { failAfterStatement } from '../testing/statement-recorder.js';

// Task B11 — CG-07, MT-04, CMP-03 (PLAN booking 7.5, 7.13, 7.30; TRACKING 3.24.3) trên MySQL 8.4 THẬT: `AppointmentTransitionService.complete` gọi từ một `doctor` GIẢ (`fakeDoctorExam`: giao dịch
// `withBookingTransaction` thật). Phần ĐƠN VỊ: complete-appointment.spec.ts (CMP-01, CMP-02). Ma trận (`BacSi` chỉ `DaTiepDon` sang `HoanThanh`) đã ở P1; đây là ca THẬT. `complete` đua với huỷ hay Vắng mặt: CHƯA phủ
// (B12, B13 chưa có).
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

/** Một thế giới test với MỘT lịch ở `trangThai`: ảnh chụp trạng thái trước, bản `doctor` giả và mã tài khoản của bác sĩ phụ trách lịch đó. */
async function given(trangThai: TrangThaiLichHen, slot = 0) {
  const w = await expiryWorld(fx);
  const target = await w.inState(trangThai, slot);
  return {
    w,
    target,
    before: await snapshotState(db, target),
    ownerId: w.doctor.profile.taiKhoanId,
    ...createTransitionStack(db, w.patientId),
  };
}

describe('CG-07 doctor giả gọi complete: Completed, NotAssigned, InvalidState', () => {
  it('lịch DaTiepDon của đúng bác sĩ: Completed ⇒ lịch HoanThanh, khung giờ vẫn DaDat (không đụng khung giờ); INV (INV-03 gồm HoanThanh)', async () => {
    const { w, target, before, ownerId, exam } = await given('DaTiepDon');

    await expect(exam(target.lichHenId, ownerId)).resolves.toEqual({
      kind: 'Completed',
    });

    const after = await snapshotState(db, target);
    expect(after.appointment).toEqual({
      ...before.appointment,
      trangThai: 'HoanThanh',
    });
    expect(after.slot).toEqual(before.slot);
    await w.expectSlot(0, 'DaDat', null);
    await assertBookingInvariants(db);
  });

  it('bác sĩ KHÁC (lịch ở mọi trạng thái, kể cả DaTiepDon) và lịch không tồn tại: NotAssigned, không đổi gì, không lộ trạng thái', async () => {
    const w = await expiryWorld(fx);
    const stranger = (await fx.admin.doctor(w.branch)).profile;
    const { exam } = createTransitionStack(db, w.patientId);
    const states = [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
    ] as const;
    for (const [index, trangThai] of states.entries()) {
      const target = await w.inState(trangThai, index);
      const before = await snapshotState(db, target);
      await expect(
        exam(target.lichHenId, stranger.taiKhoanId),
      ).resolves.toEqual({ kind: 'NotAssigned' });
      expect(await snapshotState(db, target)).toEqual(before);
    }
    await expect(
      exam('999999999', w.doctor.profile.taiKhoanId),
    ).resolves.toEqual({ kind: 'NotAssigned' });
    await assertBookingInvariants(db);
  });

  it.each([
    ['ChoThanhToan', 0],
    ['DaXacNhan', 1],
    ['HoanThanh', 2],
    ['DaHuy', 3],
    ['VangMat', 4],
    ['DaDoiLich', 5],
  ] as const)(
    'lịch %s của đúng bác sĩ: InvalidState kèm trạng thái; lịch và khung giờ không đổi',
    async (trangThai, slot) => {
      const { target, before, ownerId, exam } = await given(trangThai, slot);

      await expect(exam(target.lichHenId, ownerId)).resolves.toEqual({
        kind: 'InvalidState',
        trangThai,
      });

      expect(await snapshotState(db, target)).toEqual(before);
      await assertBookingInvariants(db);
    },
  );
});

describe('MT-04 complete thật: bác sĩ khác ⇒ NotAssigned, sai trạng thái ⇒ InvalidState (phần ma trận ở P1)', () => {
  it('chỉ DaTiepDon đi tới HoanThanh qua complete: lịch DaXacNhan của đúng bác sĩ bị từ chối InvalidState (HoanThanh không tới được từ DaXacNhan), bác sĩ khác bị NotAssigned', async () => {
    const { w, target, ownerId, exam } = await given('DaXacNhan');
    const stranger = (await fx.admin.doctor(w.branch)).profile;

    await expect(exam(target.lichHenId, ownerId)).resolves.toEqual({
      kind: 'InvalidState',
      trangThai: 'DaXacNhan',
    });
    await expect(exam(target.lichHenId, stranger.taiKhoanId)).resolves.toEqual({
      kind: 'NotAssigned',
    });
    expect((await snapshotState(db, target)).appointment.trangThai).toBe(
      'DaXacNhan',
    );
  });
});

describe('CMP-03 chuỗi khoá thật của complete và hoàn tác trọn', () => {
  it('chỉ lich_hen FOR UPDATE theo lich_hen_id rồi UPDATE lich_hen; KHÔNG câu nào đụng khung_gio hay bac_si; khung giờ vẫn DaDat', async () => {
    const { w, target, ownerId, service } = await given('DaTiepDon');
    const recorded = recordTransaction(db, 'complete-recorded', (em) =>
      service.complete(em, { lichHenId: target.lichHenId, bacSiId: ownerId }),
    );

    await expect(recorded.run()).resolves.toEqual({ kind: 'Completed' });

    const body = recorded.body();
    expect(body).toHaveLength(2);
    const [lock, update] = body as [string, string];
    expectLichLockByPrimaryKey(lock);
    expect(update).toMatch(/^UPDATE lich_hen/);
    expect(body.some((sql) => /\b(khung_gio|bac_si)\b/i.test(sql))).toBe(false);
    await w.expectSlot(0, 'DaDat', null);
    await assertBookingInvariants(db);
  });

  it('ném SAU khi UPDATE đã chạy thật (failAfterStatement của B8, như ghi hồ sơ khám hỏng): hoàn tác, lịch còn DaTiepDon; INV', async () => {
    const { target, before, ownerId, exam } = await given('DaTiepDon');
    const matched = failAfterStatement(
      db,
      /^UPDATE lich_hen/,
      new Error('lỗi ném sau câu ghi'),
    );

    await expect(exam(target.lichHenId, ownerId)).rejects.toThrow(
      'lỗi ném sau câu ghi',
    );

    expect(matched).toHaveLength(1);
    expect(await snapshotState(db, target)).toEqual(before);
    await assertBookingInvariants(db);
  });

  it('doctor giả ném sau complete (fakeDoctorExam): hoàn tác, lịch còn DaTiepDon', async () => {
    const { target, before, ownerId, exam } = await given('DaTiepDon');

    await expect(
      exam(target.lichHenId, ownerId, new Error('lỗi ghi hồ sơ khám')),
    ).rejects.toThrow('lỗi ghi hồ sơ khám');

    expect(await snapshotState(db, target)).toEqual(before);
  });
});
