import type { AuditService } from '../../audit/audit.service.js';
import { AuditError } from '../../audit/audit-error.js';
import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import {
  atRemaining,
  DEPOSIT,
  HOUR_MS,
  REFUND_POLICY,
} from '../testing/cancel-world.js';
import { failureOf } from '../testing/create-appointment-world.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  createOverrideStack,
  expectedAudit,
  expectedRefusal,
  OVERRIDE_REASON,
  overrideBy,
  Q24_PAIRS,
  readAudit,
  REFUSED_PAIRS,
  resetOverrideRound,
} from '../testing/override-world.js';
import { notificationRows } from '../testing/payment-doctor-fakes.js';
import { failAfterStatement } from '../testing/statement-recorder.js';
import {
  expectNoChange,
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import {
  readNoShow,
  setNoShow,
  type NoShowState,
} from '../testing/status-world.js';

// Task B14 — `AdminOverrideService` trên MySQL 8.4 THẬT (PLAN booking 5.7, 7.3 HL-15, 7.5 CT-14, CT-16…CT-21, MT-03, 7.37 OVR-04, OVR-05, OVR-09; TRACKING 3.31 B14-C, B14-E, B14-H): từng cặp hợp lệ của Q24 (trạng thái, khung giờ, bộ
// đếm no-show, nhật ký, thông báo), từng ô bị từ chối của ma trận 7 × 7, phạm vi 404, HOÀN TÁC TOÀN BỘ khi audit lỗi, khôi phục không trừ no-show, override không bị cửa sổ và tiền. HTTP thật (DTO, vai trò, `no-store`, phiên): test/booking-admin-override.
// e2e-spec.ts; ca đồng thời: status/admin-override.concurrency.int-spec.ts. Dữ liệu dựng lặp nằm ở `testing/override-world.ts`. Thông báo GHI THẬT dòng `thong_bao`; audit GHI THẬT dòng `nhat_ky_hanh_dong`; cổng `payment` và `wallet` là bản `Fake`.
const { CANCELLED, NO_SHOW, NO_SHOW_LOCK } = BOOKING_NOTIFICATION_EVENTS;
const NOT_FOUND = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};
const MISSING_CODE = 'CLX-20261110-ZZZZZ';
/** Một lần Vắng mặt nữa vẫn dưới ngưỡng 3 của cấu hình thế giới: không bật cờ */
const BASE_COUNTER: NoShowState = { soLan: 1, khoa: false };
/** Thông báo mong đợi của mỗi đích (PLAN 5.12: chỉ huỷ và Vắng mặt có sự kiện; B14-G) */
const NOTIFIED: Record<TrangThaiLichHen, string[]> = {
  ChoThanhToan: [],
  DaXacNhan: [],
  DaTiepDon: [],
  HoanThanh: [],
  DaHuy: [CANCELLED],
  VangMat: [NO_SHOW],
  DaDoiLich: [],
};
const pairs = (
  list: readonly (readonly [TrangThaiLichHen, TrangThaiLichHen])[],
) =>
  list.map(([from, to]) => [from, to] as [TrangThaiLichHen, TrangThaiLichHen]);

useStatusWorldHooks();

/** Dữ liệu dựng lại SẠCH, bộ đếm no-show đặt về `counter`, rồi MỘT lịch `from` ở khung giờ số 0 và bộ dịch vụ mới */
async function arrange(
  from: TrangThaiLichHen,
  options: {
    counter?: NoShowState;
    booked?: Parameters<Awaited<ReturnType<typeof world>>['booked']>[2];
    audit?: AuditService;
  } = {},
) {
  const w = await world();
  const stack = createOverrideStack(db, undefined, options.audit);
  await resetOverrideRound(db);
  await setNoShow(db, w.patientId, options.counter ?? BASE_COUNTER);
  const lich = await w.booked(from, 0, options.booked);
  return { w, stack, lich };
}

describe('CT-14, CT-20 override từng cặp hợp lệ của Q24: trạng thái, khung giờ, no-show, nhật ký cùng giao dịch, thông báo', () => {
  it.each(pairs(Q24_PAIRS))(
    '%s → %s: đổi đúng, khung giờ theo INV (DaHuy ⇒ ConTrong, còn lại DaDat), so_lan_no_show chỉ +1 khi đích VangMat, MỘT dòng nhật ký OverrideLichHen, thông báo đúng tài khoản đặt, INV',
    async (from, to) => {
      const { w, stack, lich } = await arrange(from);
      const result = await overrideBy(w, stack, 'Toan', lich.maLichHen, to);
      expect(result).toStrictEqual(
        to === 'DaHuy'
          ? { maLichHen: lich.maLichHen, trangThai: 'DaHuy', hoanCoc: null }
          : { maLichHen: lich.maLichHen, trangThai: to },
      );
      const row = await readAppointment(db, lich.lichHenId);
      expect(row.trangThai).toBe(to);
      if (to === 'DaHuy') {
        expect(row.lyDo).toBe(OVERRIDE_REASON);
        expect(row.huy).not.toBeNull();
      }
      expect(await fx.slotState(w.slotId(0))).toEqual({
        trangThai: to === 'DaHuy' ? 'ConTrong' : 'DaDat',
        giuChoDen: null,
      });
      // CT-20: chỉ đích VangMat cộng; khôi phục (VangMat hay DaTiepDon về DaXacNhan) và VangMat → DaTiepDon KHÔNG trừ
      expect(await readNoShow(db, w.patientId)).toEqual({
        soLan: BASE_COUNTER.soLan + (to === 'VangMat' ? 1 : 0),
        khoa: false,
      });
      expect(await readAudit(db)).toMatchObject([
        expectedAudit(w, 'Toan', lich.lichHenId, from, to),
      ]);
      expect(await notificationRows(db)).toEqual(
        NOTIFIED[to].map((loai) => ({
          taiKhoanId: w.patientId,
          lichHenId: lich.lichHenId,
          loai,
        })),
      );
      await assertBookingInvariants(db);
    },
  );

  it('Quản trị viên Chi nhánh của đúng chi nhánh cũng override được; nhật ký ghi tài khoản của HỌ và chi nhánh của lịch', async () => {
    const { w, stack, lich } = await arrange('DaXacNhan');
    await overrideBy(w, stack, 'ChiNhanh', lich.maLichHen, 'DaTiepDon');
    expect(await readAudit(db)).toMatchObject([
      expectedAudit(w, 'ChiNhanh', lich.lichHenId, 'DaXacNhan', 'DaTiepDon'),
    ]);
  });
});

describe('CT-16, MT-03 mọi ô BỊ TỪ CHỐI của ma trận 7 × 7 (39 ô): 409 đúng mã và chiTiet, không đổi MỘT byte, không nhật ký, không thông báo', () => {
  it('REFUSED_PAIRS có đúng 39 ô và không giao với 10 ô của Q24', () => {
    expect(REFUSED_PAIRS).toHaveLength(39);
    expect(TRANG_THAI_LICH_HEN.length ** 2).toBe(49);
    const allowed = new Set(Q24_PAIRS.map(([from, to]) => `${from}>${to}`));
    for (const [from, to] of REFUSED_PAIRS)
      expect(allowed.has(`${from}>${to}`), `${from}>${to}`).toBe(false);
  });

  it.each(pairs(REFUSED_PAIRS))('%s → %s', async (from, to) => {
    const { w, stack, lich } = await arrange(from);
    const before = await w.snapshot(lich, 0);
    const failure = await failureOf(
      overrideBy(w, stack, 'Toan', lich.maLichHen, to),
    );
    const expected = expectedRefusal(from, to);
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe(expected.maLoi);
    if (expected.chiTiet !== undefined)
      expect(failure.body.chiTiet).toEqual(expected.chiTiet);
    await expectNoChange(w, lich, before, BASE_COUNTER);
    expect(await readAudit(db)).toEqual([]);
    expect(await notificationRows(db)).toEqual([]);
  });
});

describe('CT-17 phạm vi: Quản trị viên Chi nhánh ngoài phạm vi ⇒ 404 CÙNG thân với lịch không tồn tại, TRƯỚC mọi kiểm tra trạng thái', () => {
  it.each(TRANG_THAI_LICH_HEN)(
    'đích %s: 404, không đổi gì, không nhật ký; thân giống từng ký tự với mã không tồn tại',
    async (to) => {
      const { w, stack, lich } = await arrange('DaXacNhan');
      const before = await w.snapshot(lich, 0);
      const outside = await failureOf(
        overrideBy(w, stack, 'Ngoai', lich.maLichHen, to),
      );
      const missing = await failureOf(
        overrideBy(w, stack, 'Toan', MISSING_CODE, to),
      );
      expect(outside.status).toBe(404);
      expect(outside.body).toEqual(NOT_FOUND);
      expect(missing.body).toEqual(NOT_FOUND);
      await expectNoChange(w, lich, before, BASE_COUNTER);
      expect(await readAudit(db)).toEqual([]);
    },
  );
});

describe('CT-18 audit lỗi ⇒ HOÀN TÁC TOÀN BỘ (trạng thái, khung giờ, bộ đếm, cờ, thông báo, nhật ký) và không cổng sau commit (H12)', () => {
  const CASES = [
    ['DaXacNhan', 'DaHuy'],
    ['DaXacNhan', 'VangMat'],
    ['VangMat', 'DaTiepDon'],
    ['DaTiepDon', 'DaXacNhan'],
  ] as const;
  const failingAudit = {
    record: () => Promise.reject(new AuditError('AUDIT_WRITE_FAILED')),
  } as unknown as AuditService;

  /** Lịch có cọc đã thu và còn 23 giờ tới giờ hẹn: nếu huỷ được commit thì hoàn tiền và mời danh sách chờ sẽ chạy */
  async function arrangeForFailure(
    from: TrangThaiLichHen,
    audit?: AuditService,
  ) {
    const set = await arrange(from, {
      booked: { coc: DEPOSIT, policy: REFUND_POLICY },
      ...(audit === undefined ? {} : { audit }),
    });
    set.stack.ports.paymentSummary.paid({ [set.lich.lichHenId]: DEPOSIT });
    atRemaining(23 * HOUR_MS);
    return set;
  }

  async function expectRolledBack(
    set: Awaited<ReturnType<typeof arrangeForFailure>>,
    before: Awaited<ReturnType<typeof set.w.snapshot>>,
  ) {
    await expectNoChange(set.w, set.lich, before, BASE_COUNTER);
    expect(await notificationRows(db)).toEqual([]);
    expect(await readAudit(db)).toEqual([]);
    expect(set.stack.ports.refund.refundCall.count).toBe(0);
    expect(set.stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
    await assertBookingInvariants(db);
  }

  it.each(
    CASES.map(
      ([from, to]) => [from, to] as [TrangThaiLichHen, TrangThaiLichHen],
    ),
  )(
    'audit giả ném, %s → %s: ném AuditError, mọi thứ như TRƯỚC',
    async (from, to) => {
      const set = await arrangeForFailure(from, failingAudit);
      const before = await set.w.snapshot(set.lich, 0);
      await expect(
        overrideBy(set.w, set.stack, 'Toan', set.lich.maLichHen, to),
      ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
      await expectRolledBack(set, before);
    },
  );

  it.each(
    CASES.map(
      ([from, to]) => [from, to] as [TrangThaiLichHen, TrangThaiLichHen],
    ),
  )(
    'câu INSERT nhật ký đã chạy THẬT rồi mới hỏng, %s → %s: dòng nhật ký đã chèn cũng bị hoàn tác',
    async (from, to) => {
      const set = await arrangeForFailure(from);
      const before = await set.w.snapshot(set.lich, 0);
      const matched = failAfterStatement(
        db,
        /INSERT INTO `nhat_ky_hanh_dong`/i,
        new Error('lỗi sau INSERT nhật ký'),
      );
      await expect(
        overrideBy(set.w, set.stack, 'Toan', set.lich.maLichHen, to),
      ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
      // Câu INSERT thật sự đã chạy đúng một lần (không thử lại: lỗi không phải 1213, 1205)
      expect(matched).toHaveLength(1);
      await expectRolledBack(set, before);
    },
  );
});

describe('CT-19 override sang VangMat cộng no-show như mọi đường khác; bật cờ khi đạt ngưỡng', () => {
  it.each(['DaXacNhan', 'DaTiepDon'] as const)(
    'nguồn %s, số lần 2 và cờ tắt: số mới 3 ⇒ cờ khoá BẬT; thông báo LichHenVangMat rồi KhoaDatLichNoShow, đúng một lần, cho tài khoản đặt',
    async (from) => {
      const { w, stack, lich } = await arrange(from, {
        counter: { soLan: 2, khoa: false },
      });
      await overrideBy(w, stack, 'Toan', lich.maLichHen, 'VangMat');
      expect(await readNoShow(db, w.patientId)).toEqual({
        soLan: 3,
        khoa: true,
      });
      expect(await notificationRows(db)).toEqual([
        { taiKhoanId: w.patientId, lichHenId: lich.lichHenId, loai: NO_SHOW },
        {
          taiKhoanId: w.patientId,
          lichHenId: lich.lichHenId,
          loai: NO_SHOW_LOCK,
        },
      ]);
      expect(await readAudit(db)).toHaveLength(1);
    },
  );

  it('cờ đã bật: chỉ tăng số lần, KHÔNG cảnh báo lặp (A4 10b)', async () => {
    const { w, stack, lich } = await arrange('DaXacNhan', {
      counter: { soLan: 3, khoa: true },
    });
    await overrideBy(w, stack, 'Toan', lich.maLichHen, 'VangMat');
    expect(await readNoShow(db, w.patientId)).toEqual({ soLan: 4, khoa: true });
    expect((await notificationRows(db)).map((row) => row.loai)).toEqual([
      NO_SHOW,
    ]);
  });

  it('chưa có cấu hình: 409 HE_THONG_CHUA_CAU_HINH (không đoán ngưỡng, quy tắc 35), không đổi gì, không nhật ký; các đích khác vẫn chạy (CT-21)', async () => {
    const { w, stack, lich } = await arrange('DaXacNhan');
    await db.query('DELETE FROM cau_hinh_he_thong');
    const before = await w.snapshot(lich, 0);
    const failure = await failureOf(
      overrideBy(w, stack, 'Toan', lich.maLichHen, 'VangMat'),
    );
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    await expectNoChange(w, lich, before, BASE_COUNTER);
    expect(await readAudit(db)).toEqual([]);
  });
});

describe('CT-20 khôi phục và VangMat → DaTiepDon KHÔNG trừ so_lan_no_show và không mở cờ khoá (Q24: việc của "Điều chỉnh số lần no-show")', () => {
  it.each([
    ['VangMat', 'DaXacNhan'],
    ['DaTiepDon', 'DaXacNhan'],
    ['VangMat', 'DaTiepDon'],
  ] as const)(
    '%s → %s với số lần 3 và cờ BẬT: bộ đếm và cờ nguyên vẹn, không thông báo, khung giờ DaDat',
    async (from, to) => {
      const { w, stack, lich } = await arrange(from, {
        counter: { soLan: 3, khoa: true },
      });
      await overrideBy(w, stack, 'Toan', lich.maLichHen, to);
      expect(await readNoShow(db, w.patientId)).toEqual({
        soLan: 3,
        khoa: true,
      });
      expect(await notificationRows(db)).toEqual([]);
      expect((await fx.slotState(w.slotId(0))).trangThai).toBe('DaDat');
    },
  );
});

describe('CT-21 override DaTiepDon KHÔNG bị cửa sổ tiếp đón, tiền còn phải thu hay thiếu cấu hình (quy tắc 40, 45 đến 47)', () => {
  it.each(['DaXacNhan', 'VangMat'] as const)(
    'nguồn %s, giờ hẹn cách `now` nhiều ngày, còn phải thu 50.000, đã xoá cấu hình: vẫn DaTiepDon, nhật ký đúng',
    async (from) => {
      const { w, stack, lich } = await arrange(from);
      stack.ports.paymentSummary.remaining({ [lich.lichHenId]: '50000.00' });
      await db.query('DELETE FROM cau_hinh_he_thong');
      expect(
        await overrideBy(w, stack, 'Toan', lich.maLichHen, 'DaTiepDon'),
      ).toStrictEqual({ maLichHen: lich.maLichHen, trangThai: 'DaTiepDon' });
      expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
        'DaTiepDon',
      );
      expect(await readAudit(db)).toMatchObject([
        expectedAudit(w, 'Toan', lich.lichHenId, from, 'DaTiepDon'),
      ]);
    },
  );

  it('DaHuy và DaXacNhan cũng KHÔNG cần cấu hình hệ thống', async () => {
    const huy = await arrange('DaXacNhan');
    await db.query('DELETE FROM cau_hinh_he_thong');
    await overrideBy(huy.w, huy.stack, 'Toan', huy.lich.maLichHen, 'DaHuy');
    const restore = await arrange('VangMat');
    await db.query('DELETE FROM cau_hinh_he_thong');
    await overrideBy(
      restore.w,
      restore.stack,
      'Toan',
      restore.lich.maLichHen,
      'DaXacNhan',
    );
    expect((await readAppointment(db, restore.lich.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );
  });
});

describe('HL-15 (nửa Quản trị viên) override sang DaHuy hoàn 100% cọc đã thu, KHÔNG theo bậc (Q17)', () => {
  it.each(['DaXacNhan', 'DaTiepDon', 'VangMat'] as const)(
    'nguồn %s, đã thu 100.000, còn 23 giờ (theo bậc chỉ 50%): hoanCoc 100% ở thân và ở cổng hoàn (một lần), mời danh sách chờ một lần',
    async (from) => {
      const { w, stack, lich } = await arrange(from, {
        booked: { coc: DEPOSIT, policy: REFUND_POLICY },
      });
      stack.ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
      atRemaining(23 * HOUR_MS);
      const result = await overrideBy(
        w,
        stack,
        'Toan',
        lich.maLichHen,
        'DaHuy',
      );
      expect(result).toStrictEqual({
        maLichHen: lich.maLichHen,
        trangThai: 'DaHuy',
        hoanCoc: { tyLe: 100, soTien: '100000.00' },
      });
      expect(stack.ports.refund.refundCall.count).toBe(1);
      expect(stack.ports.refund.refundCall.calls[0]?.[0]).toMatchObject({
        lichHenId: lich.lichHenId,
        soTien: '100000.00',
      });
      expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(1);
      await assertBookingInvariants(db);
    },
  );
});

describe('OVR-04 nhật ký: nối tiếp nhiều lần override, `truoc` là trạng thái ngay trước, không dữ liệu cá nhân (OVR-09)', () => {
  it('DaXacNhan → DaTiepDon (Toàn hệ thống) → VangMat (Chi nhánh): hai dòng theo thứ tự, dòng sau có truoc = sau của dòng trước, hai người thực hiện khác nhau, cùng chi nhánh của lịch', async () => {
    const { w, stack, lich } = await arrange('DaXacNhan');
    await overrideBy(w, stack, 'Toan', lich.maLichHen, 'DaTiepDon');
    await overrideBy(
      w,
      stack,
      'ChiNhanh',
      lich.maLichHen,
      'VangMat',
      'Vắng mặt',
    );
    expect(await readAudit(db)).toMatchObject([
      expectedAudit(w, 'Toan', lich.lichHenId, 'DaXacNhan', 'DaTiepDon'),
      expectedAudit(
        w,
        'ChiNhanh',
        lich.lichHenId,
        'DaTiepDon',
        'VangMat',
        'Vắng mặt',
      ),
    ]);
  });

  it('OVR-09 dòng nhật ký không chứa tên, SĐT hay email của bệnh nhân; log của Nest không chứa lý do', async () => {
    const { w, stack, lich } = await arrange('DaXacNhan');
    await overrideBy(w, stack, 'Toan', lich.maLichHen, 'VangMat');
    const text = JSON.stringify(await readAudit(db));
    for (const secret of [
      w.patient.account.hoTen,
      w.patient.account.soDienThoai,
      w.patient.account.email,
    ])
      expect(text.includes(String(secret)), String(secret)).toBe(false);
  });
});

describe('OVR-05 phòng thủ thứ hai: lý do giống bí mật (DTO đã chặn ở route) mà lọt tới dịch vụ ⇒ AuditError AUDIT_SENSITIVE_DATA và hoàn tác trọn', () => {
  it('lyDo = "token=…": ném AuditError, lịch, bộ đếm, thông báo và nhật ký như TRƯỚC', async () => {
    const { w, stack, lich } = await arrange('DaXacNhan');
    const before = await w.snapshot(lich, 0);
    await expect(
      overrideBy(
        w,
        stack,
        'Toan',
        lich.maLichHen,
        'VangMat',
        'token=abc123xyz',
      ),
    ).rejects.toMatchObject({ code: 'AUDIT_SENSITIVE_DATA' });
    await expectNoChange(w, lich, before, BASE_COUNTER);
    expect(await notificationRows(db)).toEqual([]);
    expect(await readAudit(db)).toEqual([]);
  });
});
