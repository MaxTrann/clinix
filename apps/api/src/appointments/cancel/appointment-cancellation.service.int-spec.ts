import type { DataSource } from 'typeorm';
import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  BOOKING_NOTIFICATION_EVENTS,
  HOLD_EXPIRED_CANCEL_REASON,
  LEAVE_CANCEL_REASON,
  PATIENT_CANCEL_REASON,
} from '../appointments.constants.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { FLOW_NOW } from '../testing/booking-flow.js';
import {
  atRemaining,
  cancelInput,
  cancelWorld,
  createCancelStack,
  DEPOSIT,
  HOUR_MS,
  REFUND_POLICY,
  T0_TEXT,
  type CancelRole,
} from '../testing/cancel-world.js';
import {
  createExpiryModule,
  readAppointment,
} from '../testing/expiry-fixtures.js';
import { createFakePorts } from '../testing/fake-ports.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { firstTableOf, isLockingStatement } from '../testing/query-spy.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import { cancelOutcomeException } from './cancel-failure.js';
import type { CancelInput } from './cancel.types.js';

// Task B10 — huỷ lịch hẹn dùng chung trên MySQL 8.4 THẬT (PLAN booking 5.3, 5.6, 7.3, 7.29; TRACKING 3.23 B10-I): CNL-03, CNL-04, CNL-06, CNL-07, CNL-09, CNL-10 (phần tích hợp) và HL-01…HL-08, HL-10, HL-12,
// HL-14, HL-15, HL-17 ở MỨC DỊCH VỤ (dịch vụ huỷ thật, cổng là bản `Fake`; B17 chạy lại với cổng thật). Phần có chèn lỗi giữa chừng (HL-16, CNL-05, CNL-08): appointment-cancellation.failure.int-spec.ts; phần đồng thời
// (HL-18, DT-05…DT-08): appointment-cancellation.concurrency.int-spec.ts; phần HTTP: test/booking-patient-cancel.e2e-spec.ts. Phần đơn vị (điều phối, kiểu, hàm thuần): các `*.spec.ts` cạnh mã.
// Đồng hồ ứng dụng giả mặc định là T0 (08:00 ngày 02/11/2026, giờ VN); khung giờ số 0 bắt đầu 08:00 ngày 10/11/2026 (còn 192 giờ). Ca cần mốc khác đặt bằng `atRemaining`.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});
const world = () => cancelWorld(db, fx);

const ROLES: readonly CancelRole[] = [
  'BenhNhan',
  'LeTan',
  'QuanTriVien',
  'HeThong',
];
const LY_DO = 'Lý do thử nghiệm';
// Chữ ly_do_huy của từng vai trò (Q27): Bệnh nhân hằng, Lễ tân và QTV chữ nhập, nghỉ phép hằng
const REASON_TEXT: Record<CancelRole, string> = {
  BenhNhan: PATIENT_CANCEL_REASON,
  LeTan: LY_DO,
  QuanTriVien: LY_DO,
  HeThong: LEAVE_CANCEL_REASON,
};

describe('CNL-03 chuỗi khoá thật của cancel: khung giờ rồi lịch theo khoá chính (5.3 tầng 5 rồi 6, quy tắc 7)', () => {
  it('đọc thường theo ma_lich_hen (không khoá), khung_gio FOR UPDATE, lich_hen FOR UPDATE theo lich_hen_id, rồi UPDATE lich_hen và UPDATE khung_gio; không đụng bac_si, benh_nhan, ho_so_nguoi_than; không vi phạm thứ tự 5.3', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const statements = recordStatements(db);
    const { service } = createCancelStack(db);

    const outcome = await service.cancel(
      cancelInput(w, 'BenhNhan', lich.maLichHen),
    );
    expect(outcome.kind).toBe('Cancelled');

    // bỏ các câu của VỎ giao dịch (mức cô lập, bắt đầu, commit, đặt và khôi phục timeout chờ khoá, X1b)
    const body = statements.filter(
      (sql) =>
        !/^\s*(SET SESSION|SET TRANSACTION|SELECT @@session|START TRANSACTION|COMMIT|ROLLBACK)/i.test(
          sql,
        ),
    );
    expect(body).toHaveLength(5);
    const [readKeys, lockSlotSql, lockLich, cancel, release] = body as [
      string,
      string,
      string,
      string,
      string,
    ];
    expect(firstTableOf(readKeys)).toBe('lich_hen');
    expect(isLockingStatement(readKeys)).toBe(false);
    expect(readKeys).toMatch(/WHERE ma_lich_hen = \?/);
    expect(firstTableOf(lockSlotSql)).toBe('khung_gio');
    expect(isLockingStatement(lockSlotSql)).toBe(true);
    expect(firstTableOf(lockLich)).toBe('lich_hen');
    expect(isLockingStatement(lockLich)).toBe(true);
    // khoá lich_hen CHỈ theo khoá chính (quy tắc 7): không khung_gio_id, không khung_gio_dang_giu
    expect(lockLich).toMatch(/WHERE lich_hen_id = \?/);
    expect(lockLich).not.toMatch(/khung_gio_id|khung_gio_dang_giu/);
    expect(cancel).toMatch(/^UPDATE lich_hen/);
    expect(release).toMatch(/^UPDATE khung_gio/);
    const lockedTables = body
      .filter(isLockingStatement)
      .map(firstTableOf)
      .filter((table): table is string => table !== undefined);
    expect(lockedTables).toEqual(['khung_gio', 'lich_hen']);
    expect(findLockOrderViolation(lockedTables)).toBeNull();
    // huỷ không phụ thuộc điều kiện nào của bác sĩ, tài khoản hay hồ sơ: không xin tầng 2, 3, 4
    expect(
      body.some((sql) =>
        /\b(FROM|UPDATE|JOIN)\s+`?(bac_si|benh_nhan|ho_so_nguoi_than)`?\b/i.test(
          sql,
        ),
      ),
    ).toBe(false);
    await assertBookingInvariants(db);
  });
});

// Bảng kết quả mong đợi viết TAY (không suy từ `canTransition`: nếu ma trận sai, bảng này phải đỏ). Q21, Q24, HLH A1.
const MATRIX: Record<TrangThaiLichHen, Record<CancelRole, string>> = {
  ChoThanhToan: {
    BenhNhan: 'Cancelled',
    LeTan: 'Cancelled',
    QuanTriVien: 'Cancelled',
    HeThong: 'Cancelled',
  },
  DaXacNhan: {
    BenhNhan: 'Cancelled',
    LeTan: 'Cancelled',
    QuanTriVien: 'Cancelled',
    HeThong: 'Cancelled',
  },
  // Lễ tân KHÔNG huỷ lịch đã tiếp đón (Q21); Quản trị viên đi được (Q24: override từ DaTiepDon và VangMat sang DaHuy)
  DaTiepDon: {
    BenhNhan: 'NotCancellable',
    LeTan: 'NotCancellable',
    QuanTriVien: 'Cancelled',
    HeThong: 'NotCancellable',
  },
  HoanThanh: {
    BenhNhan: 'NotCancellable',
    LeTan: 'NotCancellable',
    QuanTriVien: 'NotCancellable',
    HeThong: 'NotCancellable',
  },
  VangMat: {
    BenhNhan: 'NotCancellable',
    LeTan: 'NotCancellable',
    QuanTriVien: 'Cancelled',
    HeThong: 'NotCancellable',
  },
  DaHuy: {
    BenhNhan: 'AlreadyCancelled',
    LeTan: 'AlreadyCancelled',
    QuanTriVien: 'AlreadyCancelled',
    HeThong: 'AlreadyCancelled',
  },
  // Bệnh nhân không thấy DaDoiLich (quyết định (j): 404 như B2); Lễ tân, Quản trị viên, hệ thống thấy rồi ma trận từ chối ⇒ 409
  DaDoiLich: {
    BenhNhan: 'NotFound',
    LeTan: 'NotCancellable',
    QuanTriVien: 'NotCancellable',
    HeThong: 'NotCancellable',
  },
};

describe('CNL-04 ma trận thật: mỗi actor × trạng thái nguồn (kể cả Quản trị viên từ DaTiepDon và VangMat)', () => {
  it.each(TRANG_THAI_LICH_HEN)(
    'nguồn %s: kết quả đúng bảng; Cancelled ghi đúng (DaHuy, thoi_diem_huy = giờ ứng dụng, ly_do_huy theo vai trò, khung giờ ConTrong); mọi kết quả khác KHÔNG đổi gì và KHÔNG gọi cổng',
    async (trangThai) => {
      const w = await world();
      for (const [index, role] of ROLES.entries()) {
        const lich = await w.booked(trangThai, index);
        const before = await w.snapshot(lich, index);
        const { service, ports } = createCancelStack(db);

        const outcome = await service.cancel(
          cancelInput(w, role, lich.maLichHen, LY_DO),
        );
        const label = `${trangThai} × ${role}`;
        expect(outcome.kind, label).toBe(MATRIX[trangThai][role]);
        const after = await w.snapshot(lich, index);

        if (outcome.kind === 'Cancelled') {
          expect(after.row, label).toEqual({
            trangThai: 'DaHuy',
            huy: T0_TEXT,
            lyDo: REASON_TEXT[role],
            han: before.row.han, // hạn giữ chỗ cũ giữ nguyên để truy vết
          });
          expect(after.slot, label).toEqual({
            trangThai: 'ConTrong',
            giuChoDen: null,
          });
          // mời danh sách chờ trừ khi bác sĩ nghỉ phép (Q17); không hoàn vì chưa thu đồng nào
          expect(ports.waitlist.releasedSlotIds, label).toEqual(
            role === 'HeThong' ? [] : [w.slotId(index)],
          );
          expect(ports.refund.refundCall.count, label).toBe(0);
          expect(ports.notifier.events, label).toHaveLength(1);
        } else {
          expect(after, label).toEqual(before);
          expect(ports.waitlist.onSlotReleasedCall.count, label).toBe(0);
          expect(ports.refund.refundCall.count, label).toBe(0);
          expect(ports.notifier.notifyCall.count, label).toBe(0);
          if (outcome.kind === 'NotCancellable')
            expect(outcome.trangThai, label).toBe(trangThai);
        }
      }
      await assertBookingInvariants(db);
    },
  );
});

describe('HL-01, HL-02 huỷ của Bệnh nhân khi cọc 0đ hoặc chưa thu cọc', () => {
  it('HL-01 lịch DaXacNhan cọc 0: DaHuy, thoi_diem_huy, ly_do_huy hằng, khung giờ ConTrong, hoanCoc null, thông báo ghi (cho tài khoản đặt), không hoàn, mời danh sách chờ', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { service, ports } = createCancelStack(db);

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toStrictEqual({
      kind: 'Cancelled',
      maLichHen: lich.maLichHen,
      hoanCoc: null,
    });
    expect(await readAppointment(db, lich.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      huy: T0_TEXT,
      lyDo: PATIENT_CANCEL_REASON,
      han: null,
    });
    await w.expectSlot(0, 'ConTrong');
    expect(ports.notifier.events).toEqual([
      {
        loaiSuKien: BOOKING_NOTIFICATION_EVENTS.CANCELLED,
        lichHenId: lich.lichHenId,
        taiKhoanId: w.patientId,
        huy: { reason: 'BenhNhanHuy', hoanCoc: null },
      },
    ]);
    expect(ports.refund.refundCall.count).toBe(0);
    expect(ports.waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
    await assertBookingInvariants(db);
  });

  it('HL-02 lịch ChoThanhToan (chưa thu cọc): DaHuy, khung giờ DangGiuCho về ConTrong (giu_cho_den NULL), hạn thanh toán cũ giữ nguyên, hoanCoc null', async () => {
    const w = await world();
    const lich = await w.booked('ChoThanhToan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    await w.expectSlot(0, 'DangGiuCho', '2026-11-02 08:15:00');
    const { service, ports } = createCancelStack(db);

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toMatchObject({ kind: 'Cancelled', hoanCoc: null });
    expect(await readAppointment(db, lich.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      huy: T0_TEXT,
      lyDo: PATIENT_CANCEL_REASON,
      han: '2026-11-02 08:15:00',
    });
    await w.expectSlot(0, 'ConTrong');
    expect(ports.refund.refundCall.count).toBe(0);
    await assertBookingInvariants(db);
  });
});

describe('HL-03 A1: lịch không huỷ được ⇒ kết quả có kiểu, đổi sang 409 LICH_HEN_KHONG_CHO_HUY kèm chiTiet.trangThai; không đổi gì', () => {
  it.each(['DaTiepDon', 'HoanThanh', 'VangMat', 'DaHuy'] as const)(
    'Bệnh nhân huỷ lịch %s',
    async (trangThai) => {
      const w = await world();
      const lich = await w.booked(trangThai, 0);
      const before = await w.snapshot(lich, 0);
      const { service, ports } = createCancelStack(db);

      const outcome = await service.cancel(
        cancelInput(w, 'BenhNhan', lich.maLichHen),
      );
      expect(outcome.kind).toBe(
        trangThai === 'DaHuy' ? 'AlreadyCancelled' : 'NotCancellable',
      );
      if (outcome.kind === 'Cancelled') throw new Error('lẽ ra bị từ chối');
      const error = cancelOutcomeException(outcome);
      expect(error.getStatus()).toBe(409);
      expect(error.maLoi).toBe('LICH_HEN_KHONG_CHO_HUY');
      expect(error.getResponse()).toMatchObject({ chiTiet: { trangThai } });
      expect(await w.snapshot(lich, 0)).toEqual(before);
      expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
      expect(ports.notifier.notifyCall.count).toBe(0);
      await assertBookingInvariants(db);
    },
  );
});

describe('HL-04, HL-05, HL-06 sở hữu và bấm đúp', () => {
  it('HL-04 lịch của hồ sơ NGƯỜI THÂN của chính mình: huỷ được (benh_nhan_id là người đặt)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      hoSoNguoiThanId: w.relativeId,
    });
    const { service } = createCancelStack(db);
    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toMatchObject({ kind: 'Cancelled' });
    await w.expectSlot(0, 'ConTrong');
  });

  it('HL-05 (mức dịch vụ) lịch của Bệnh nhân khác, kể cả lịch của hồ sơ người thân của họ: NotFound, không đổi gì, không cổng', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    const otherId = other.account.taiKhoanId;
    const relativeId = await fx.relative(otherId);
    const own = await w.booked('DaXacNhan', 0, { patientId: otherId });
    const viaRelative = await w.booked('DaXacNhan', 1, {
      patientId: otherId,
      hoSoNguoiThanId: relativeId,
    });
    const { service, ports } = createCancelStack(db);
    for (const [index, lich] of [own, viaRelative].entries()) {
      const before = await w.snapshot(lich, index);
      await expect(
        service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
      ).resolves.toStrictEqual({ kind: 'NotFound' });
      expect(await w.snapshot(lich, index)).toEqual(before);
    }
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(ports.notifier.notifyCall.count).toBe(0);
    // mã không tồn tại: cùng kết quả
    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', 'CLX-20261110-ZZZZZ')),
    ).resolves.toStrictEqual({ kind: 'NotFound' });
  });

  it('HL-06 bấm đúp huỷ: lần hai AlreadyCancelled (409 DaHuy ở HTTP); hoàn tiền, mời chờ và thông báo đúng MỘT lần', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    const input = cancelInput(w, 'BenhNhan', lich.maLichHen);

    expect((await service.cancel(input)).kind).toBe('Cancelled');
    const second = await service.cancel(input);
    expect(second).toStrictEqual({ kind: 'AlreadyCancelled' });
    if (second.kind === 'Cancelled') throw new Error('lẽ ra bị từ chối');
    expect(cancelOutcomeException(second).getResponse()).toMatchObject({
      chiTiet: { trangThai: 'DaHuy' },
    });
    expect(ports.refund.refundCall.count).toBe(1);
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(1);
    expect(ports.notifier.notifyCall.count).toBe(1);
    await assertBookingInvariants(db);
  });
});

describe('HL-07, HL-08 cancel-preview trên MySQL thật', () => {
  it('HL-07 bậc 24→100, 2→50, 0→0 với cọc đã thu 100.000: đúng 24 giờ, 24 giờ − 1 giây, đúng 2 giờ, 2 giờ − 1 giây, 0, đã quá giờ ⇒ 100.000; 50.000; 50.000; 0; 0; 0 (nửa đóng ≥)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const { preview, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });

    for (const [name, remainingMs, tyLe, soTien, mocApDung] of [
      ['đúng 24 giờ', 24 * HOUR_MS, 100, '100000.00', 24],
      ['24 giờ trừ 1 giây', 24 * HOUR_MS - 1000, 50, '50000.00', 2],
      ['đúng 2 giờ', 2 * HOUR_MS, 50, '50000.00', 2],
      ['2 giờ trừ 1 giây', 2 * HOUR_MS - 1000, 0, '0.00', 0],
      ['còn 0 giây', 0, 0, '0.00', 0],
      ['đã quá giờ 1 giây', -1000, 0, '0.00', null],
    ] as const) {
      atRemaining(remainingMs);
      await expect(
        preview.preview(w.patientId, lich.maLichHen),
        name,
      ).resolves.toStrictEqual({
        choPhepHuy: true,
        hoanCoc: { tyLe, soTien, mocApDung },
      });
    }
  });

  it('HL-07 chính sách đọc từ SNAPSHOT của lịch, không từ moc_hoan_tien hiện hành: đổi bảng mốc của dịch vụ sau khi đặt không đổi số hoàn (Q16)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    await db.query(
      'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, 0, 100)',
      [w.doctor.profile.dichVuKhamId],
    );
    const { preview, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    atRemaining(HOUR_MS);
    // còn 1 giờ: snapshot (mốc 0 → 0%) cho 0, còn bảng hiện hành (mốc 0 → 100%) sẽ cho 100.000
    await expect(
      preview.preview(w.patientId, lich.maLichHen),
    ).resolves.toMatchObject({ hoanCoc: { tyLe: 0, soTien: '0.00' } });
  });

  it('HL-07 lịch cọc 0đ hay ChoThanhToan chưa thu (Q45): choPhepHuy, hoanCoc null; lịch không huỷ được: choPhepHuy false kèm lyDoKhongHuy, hoanCoc null', async () => {
    const w = await world();
    const pending = await w.booked('ChoThanhToan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const checkedIn = await w.booked('DaTiepDon', 1);
    const { preview } = createCancelStack(db);
    await expect(
      preview.preview(w.patientId, pending.maLichHen),
    ).resolves.toStrictEqual({ choPhepHuy: true, hoanCoc: null });
    await expect(
      preview.preview(w.patientId, checkedIn.maLichHen),
    ).resolves.toStrictEqual({
      choPhepHuy: false,
      lyDoKhongHuy: 'LICH_HEN_KHONG_CHO_HUY',
      hoanCoc: null,
    });
  });

  it('HL-05 (mức dịch vụ) preview của người khác, không tồn tại và DaDoiLich: cùng một 404 KHONG_TIM_THAY', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    const theirs = await w.booked('DaXacNhan', 0, {
      patientId: other.account.taiKhoanId,
    });
    const replaced = await w.booked('DaDoiLich', 1);
    const { preview } = createCancelStack(db);
    for (const code of [
      theirs.maLichHen,
      replaced.maLichHen,
      'CLX-20261110-ZZZZZ',
    ])
      await expect(preview.preview(w.patientId, code)).rejects.toMatchObject({
        maLoi: 'KHONG_TIM_THAY',
      });
  });

  it('HL-08 (phần I) cancel-preview KHÔNG đổi dữ liệu: không câu ghi hay khoá nào, hàng lịch và khung giờ y nguyên', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const before = await w.snapshot(lich, 0);
    const { preview, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    const statements = recordStatements(db);

    await preview.preview(w.patientId, lich.maLichHen);

    expect(statements.length).toBeGreaterThan(0);
    expect(statements.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toEqual([]);
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(ports.refund.refundCall.count).toBe(0);
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
  });
});

describe('HL-10, CNL-07, CNL-09 cọc đã thu > 0: RefundPort một lần SAU commit; thông báo TRONG giao dịch', () => {
  it('còn 5 giờ (mốc 2 giờ ⇒ 50%): refund đúng tham số, lúc cổng được gọi lịch đã DaHuy và khung giờ đã ConTrong (đã commit); lúc ghi thông báo lịch còn DaXacNhan (chưa commit)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    atRemaining(5 * HOUR_MS);
    // đọc bằng kết nối KHÁC (pool) ngay lúc từng cổng bị gọi: READ COMMITTED chỉ thấy phần đã commit
    const seen: Record<string, string> = {};
    ports.notifier.notifyCall.onCall(async () => {
      seen['luc thong bao'] = (
        await readAppointment(db, lich.lichHenId)
      ).trangThai;
    });
    ports.refund.refundCall.onCall(async () => {
      seen['luc hoan tien'] = (
        await readAppointment(db, lich.lichHenId)
      ).trangThai;
    });
    ports.waitlist.onSlotReleasedCall.onCall(async () => {
      seen['luc moi cho'] = (await w.slotState(0)).trangThai;
    });

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toStrictEqual({
      kind: 'Cancelled',
      maLichHen: lich.maLichHen,
      hoanCoc: { tyLe: 50, soTien: '50000.00' },
    });

    expect(seen).toEqual({
      'luc thong bao': 'DaXacNhan',
      'luc hoan tien': 'DaHuy',
      'luc moi cho': 'ConTrong',
    });
    expect(ports.refund.refundCall.calls).toEqual([
      [
        {
          lichHenId: lich.lichHenId,
          soTien: '50000.00',
          lyDo: PATIENT_CANCEL_REASON,
        },
      ],
    ]);
    expect(ports.notifier.events).toEqual([
      {
        loaiSuKien: BOOKING_NOTIFICATION_EVENTS.CANCELLED,
        lichHenId: lich.lichHenId,
        taiKhoanId: w.patientId,
        huy: {
          reason: 'BenhNhanHuy',
          hoanCoc: { tyLe: 50, soTien: '50000.00' },
        },
      },
    ]);
    expect(ports.waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
    await assertBookingInvariants(db);
  });

  it('CNL-07 ba bậc: còn 30 giờ ⇒ 100.000, còn 1 giờ (ngoài mọi bậc có hoàn) ⇒ KHÔNG gọi RefundPort dù đã thu 100.000; đã quá giờ hẹn ⇒ huỷ vẫn được, hoàn 0, không mời danh sách chờ (HL-12)', async () => {
    const w = await world();
    const full = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const none = await w.booked('DaXacNhan', 1, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const late = await w.booked('DaXacNhan', 2, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({
      [full.lichHenId]: DEPOSIT,
      [none.lichHenId]: DEPOSIT,
      [late.lichHenId]: DEPOSIT,
    });

    atRemaining(30 * HOUR_MS);
    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', full.maLichHen)),
    ).resolves.toMatchObject({
      hoanCoc: { tyLe: 100, soTien: '100000.00' },
    });
    expect(ports.refund.refundCall.count).toBe(1);

    // còn 1 giờ so với khung giờ số 1 (08:30): đặt đồng hồ theo khung giờ số 1
    atRemaining(HOUR_MS - 30 * 60 * 1000);
    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', none.maLichHen)),
    ).resolves.toMatchObject({ hoanCoc: { tyLe: 0, soTien: '0.00' } });
    expect(ports.refund.refundCall.count).toBe(1);

    atRemaining(-2 * HOUR_MS);
    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', late.maLichHen)),
    ).resolves.toMatchObject({ kind: 'Cancelled', hoanCoc: { tyLe: 0 } });
    expect(ports.refund.refundCall.count).toBe(1);
    expect(ports.waitlist.releasedSlotIds).toEqual([w.slotId(0), w.slotId(1)]);
    await assertBookingInvariants(db);
  });
});

describe('HL-12 (mức dịch vụ) WaitlistPort: giờ tương lai gọi một lần; giờ đã qua và BacSiNghiPhep không gọi', () => {
  it('đúng một lần với khung giờ vừa trống khi giờ hẹn ở tương lai', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { service, ports } = createCancelStack(db);
    atRemaining(HOUR_MS);
    await service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen));
    expect(ports.waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
  });

  it('giờ hẹn đã qua ⇒ không gọi (huỷ vẫn thành công, khung giờ ConTrong)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { service, ports } = createCancelStack(db);
    atRemaining(-HOUR_MS);
    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toMatchObject({ kind: 'Cancelled' });
    await w.expectSlot(0, 'ConTrong');
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
  });
});

describe('HL-14, HL-15 hệ thống (nghỉ phép), Lễ tân và Quản trị viên: bậc hoàn theo Q17 (mức dịch vụ)', () => {
  it('HL-14 HeThong + BacSiNghiPhep huỷ DaXacNhan cọc > 0 (còn 1 giờ, ngoài bậc): hoàn 100%, KHÔNG mời danh sách chờ, ly_do_huy là chữ hằng; lịch DaTiepDon ⇒ NotCancellable; lịch đã DaHuy ⇒ AlreadyCancelled', async () => {
    const w = await world();
    const paid = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const checkedIn = await w.booked('DaTiepDon', 1);
    const gone = await w.booked('DaHuy', 2);
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [paid.lichHenId]: DEPOSIT });
    atRemaining(HOUR_MS);

    await expect(
      service.cancel(cancelInput(w, 'HeThong', paid.maLichHen)),
    ).resolves.toStrictEqual({
      kind: 'Cancelled',
      maLichHen: paid.maLichHen,
      hoanCoc: { tyLe: 100, soTien: DEPOSIT },
    });
    expect((await readAppointment(db, paid.lichHenId)).lyDo).toBe(
      LEAVE_CANCEL_REASON,
    );
    expect(ports.refund.refundCall.calls[0]?.[0]).toEqual({
      lichHenId: paid.lichHenId,
      soTien: DEPOSIT,
      lyDo: LEAVE_CANCEL_REASON,
    });
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);

    await expect(
      service.cancel(cancelInput(w, 'HeThong', checkedIn.maLichHen)),
    ).resolves.toStrictEqual({
      kind: 'NotCancellable',
      trangThai: 'DaTiepDon',
    });
    await expect(
      service.cancel(cancelInput(w, 'HeThong', gone.maLichHen)),
    ).resolves.toStrictEqual({ kind: 'AlreadyCancelled' });
    expect(ports.refund.refundCall.count).toBe(1);
    await assertBookingInvariants(db);
  });

  it('HL-15 (một phần B10: mức dịch vụ) còn 5 giờ: Lễ tân hoàn THEO BẬC (50%), Quản trị viên hoàn 100%; ly_do_huy là lý do nhập; endpoint của hai vai trò là B12, B14', async () => {
    const w = await world();
    const byReceptionist = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const byAdmin = await w.booked('DaXacNhan', 1, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({
      [byReceptionist.lichHenId]: DEPOSIT,
      [byAdmin.lichHenId]: DEPOSIT,
    });
    atRemaining(5 * HOUR_MS);

    await expect(
      service.cancel(
        cancelInput(w, 'LeTan', byReceptionist.maLichHen, 'Gọi điện xin huỷ'),
      ),
    ).resolves.toMatchObject({ hoanCoc: { tyLe: 50, soTien: '50000.00' } });
    // Quản trị viên: 100% bất kể bậc (khung giờ số 1 bắt đầu 08:30 nên còn 5 giờ 30 phút, nhưng số hoàn không phụ thuộc bậc)
    await expect(
      service.cancel(
        cancelInput(w, 'QuanTriVien', byAdmin.maLichHen, 'Sửa sai nghiệp vụ'),
      ),
    ).resolves.toMatchObject({ hoanCoc: { tyLe: 100, soTien: DEPOSIT } });

    expect((await readAppointment(db, byReceptionist.lichHenId)).lyDo).toBe(
      'Gọi điện xin huỷ',
    );
    expect((await readAppointment(db, byAdmin.lichHenId)).lyDo).toBe(
      'Sửa sai nghiệp vụ',
    );
    expect(ports.refund.refundCall.calls.map(([call]) => call.soTien)).toEqual([
      '50000.00',
      DEPOSIT,
    ]);
    await assertBookingInvariants(db);
  });
});

describe('HL-17 hết hạn giữ chỗ KHÔNG hoàn và KHÔNG thông báo (Q6): chạy expire qua module thật có đủ tám cổng Fake', () => {
  it('lịch ChoThanhToan cọc > 0 quá hạn: Expired, ly_do_huy là chữ hết hạn; RefundPort 0 lần, AppointmentNotifier 0 lần, WaitlistPort 1 lần', async () => {
    const w = await world();
    const lich = await w.booked('ChoThanhToan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const ports = createFakePorts();
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    const { moduleRef, service } = await createExpiryModule(db, ports);
    try {
      await expect(
        service.expire({ lichHenId: lich.lichHenId, now: FLOW_NOW }),
      ).resolves.toMatchObject({ kind: 'Expired' });
    } finally {
      await moduleRef.close();
    }
    expect((await readAppointment(db, lich.lichHenId)).lyDo).toBe(
      HOLD_EXPIRED_CANCEL_REASON,
    );
    expect(ports.refund.refundCall.count).toBe(0);
    expect(ports.notifier.notifyCall.count).toBe(0);
    expect(ports.waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
    await assertBookingInvariants(db);
  });
});

describe('CNL-06 sở hữu và phạm vi theo actor trên MySQL thật; NotFound đến TRƯỚC kiểm trạng thái', () => {
  it('Lễ tân và Quản trị viên của chi nhánh KHÁC, Bệnh nhân khác: NotFound, không đổi gì, không cổng; Quản trị viên Chi nhánh đúng chi nhánh và Toàn hệ thống: huỷ được', async () => {
    const w = await world();
    const other = await fx.admin.branch();
    const otherReceptionist = await fx.admin.receptionist(other);
    const otherAdmin = await fx.admin.admin(other);
    const otherPatient = await fx.admin.patient();
    const open = await w.booked('DaXacNhan', 0);
    const cancelled = await w.booked('DaHuy', 1);
    const { service, ports } = createCancelStack(db);

    const outsiders = (maLichHen: string): CancelInput[] => [
      {
        maLichHen,
        actor: {
          kind: 'LeTan',
          accountId: otherReceptionist.account.taiKhoanId,
          chiNhanhId: other.chiNhanhId,
        },
        reason: 'LeTanHuy',
        lyDo: LY_DO,
      },
      {
        maLichHen,
        actor: {
          kind: 'QuanTriVien',
          accountId: otherAdmin.account.taiKhoanId,
          scope: { kind: 'ChiNhanh', chiNhanhId: other.chiNhanhId },
        },
        reason: 'QtvOverride',
        lyDo: LY_DO,
      },
      {
        maLichHen,
        actor: { kind: 'BenhNhan', accountId: otherPatient.account.taiKhoanId },
        reason: 'BenhNhanHuy',
      },
    ];
    for (const [index, lich] of [open, cancelled].entries()) {
      const before = await w.snapshot(lich, index);
      for (const input of outsiders(lich.maLichHen))
        // lịch đã DaHuy của người ngoài phạm vi cũng là NotFound (không lộ "đã huỷ")
        await expect(
          service.cancel(input),
          input.actor.kind,
        ).resolves.toStrictEqual({
          kind: 'NotFound',
        });
      expect(await w.snapshot(lich, index)).toEqual(before);
    }
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(ports.notifier.notifyCall.count).toBe(0);

    // Quản trị viên Chi nhánh ĐÚNG chi nhánh của lịch
    await expect(
      service.cancel({
        maLichHen: open.maLichHen,
        actor: {
          kind: 'QuanTriVien',
          accountId: w.branchAdmin.account.taiKhoanId,
          scope: { kind: 'ChiNhanh', chiNhanhId: w.branch.chiNhanhId },
        },
        reason: 'QtvOverride',
        lyDo: LY_DO,
      }),
    ).resolves.toMatchObject({ kind: 'Cancelled' });
    // Quản trị viên Toàn hệ thống (không bị ràng buộc chi nhánh)
    const second = await w.booked('DaXacNhan', 2);
    await expect(
      service.cancel(cancelInput(w, 'QuanTriVien', second.maLichHen)),
    ).resolves.toMatchObject({ kind: 'Cancelled' });
    await assertBookingInvariants(db);
  });

  it('mã chữ thường hay có khoảng trắng đã được người gọi chuẩn hoá chữ hoa; dịch vụ tra không phân biệt hoa thường (collation utf8mb4_unicode_ci) và trả mã chuẩn của DB', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const { service } = createCancelStack(db);
    const outcome = await service.cancel(
      cancelInput(w, 'BenhNhan', lich.maLichHen.toLowerCase()),
    );
    expect(outcome).toStrictEqual({
      kind: 'Cancelled',
      maLichHen: lich.maLichHen,
      hoanCoc: null,
    });
  });
});

describe('CNL-10 lỗi dữ liệu SAU lần ghi: ném, hoàn tác trọn, không cổng; lỗi dữ liệu không liên quan thì không chặn', () => {
  it('snapshot chính sách hoàn HỎNG khi đã thu > 0: dịch vụ ném, lịch và khung giờ y nguyên (UPDATE đã chạy rồi hoàn tác), 0 lần gọi cổng', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: 'hỏng',
    });
    const before = await w.snapshot(lich, 0);
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).rejects.toThrow(/hoàn/);
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(ports.refund.refundCall.count).toBe(0);
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(ports.notifier.notifyCall.count).toBe(0);
    await assertBookingInvariants(db);
  });

  it('snapshot hỏng nhưng CHƯA thu đồng nào (lịch cọc 0đ): huỷ được, hoanCoc null (đã thu 0 kiểm TRƯỚC snapshot)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, { policy: 'hỏng' });
    const { service } = createCancelStack(db);
    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toMatchObject({ kind: 'Cancelled', hoanCoc: null });
    await assertBookingInvariants(db);
  });

  it('khung giờ LỆCH khỏi lịch (lịch DaXacNhan mà khung giờ ConTrong): dịch vụ ném, lịch vẫn DaXacNhan (UPDATE lich_hen đã chạy rồi hoàn tác), không cổng', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL WHERE khung_gio_id = ?",
      [w.slotId(0)],
    );
    const { service, ports } = createCancelStack(db);

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).rejects.toThrow(/không đúng trạng thái giữ lịch DaXacNhan/);
    expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );
    await w.expectSlot(0, 'ConTrong');
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(ports.notifier.notifyCall.count).toBe(0);
  });
});
