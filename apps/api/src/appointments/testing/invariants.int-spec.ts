import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { isDuplicateKeyError } from '../../database/mysql-errors.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { BookingFixtures } from './booking-fixtures.js';
import {
  assertBookingInvariants,
  checkBookedSlotHasOneHolder,
  checkConfirmedSlotState,
  checkOrphanHeldSlots,
  checkPendingSlotState,
  checkSlotSingleHolder,
  type Violation,
} from './invariants.js';

// Task P2 — INV-01…INV-05 (PLAN booking 5.2, 7.11; TRACKING 3.6 P2-H) trên MySQL 8.4 THẬT, nếp `doctor/testing/invariants.int-spec.ts`: mỗi ca kiểm HAI chiều: dữ liệu sạch ⇒ không vi phạm;
// gài lỗi có chủ đích ⇒ bị bắt đúng hàng. Chưa có mã ghi của booking (B6…B14) nên lỗi được gài bằng `UPDATE` thẳng. Đồng hồ ứng dụng giả = BOOKING_T0.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const ids = (violations: Violation[], key: string) =>
  violations.map((v) => String(v[key]));

/** Một thế giới đặt được (8 khung giờ) kèm các thao tác hay dùng: dựng lịch ở khung giờ thứ i, hoặc gài lỗi vào khung giờ thứ i. */
async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  return {
    slot: (i: number) => w.slotIds[i]!,
    appt: (trangThai: TrangThaiLichHen, i: number) =>
      fx.appointmentIn(trangThai, {
        doctor: w.doctor.profile,
        khungGioId: w.slotIds[i]!,
        patientId,
      }),
    setSlot: (i: number, assignments: string) =>
      db.query(`UPDATE khung_gio SET ${assignments} WHERE khung_gio_id = ?`, [
        w.slotIds[i],
      ]),
  };
}

describe('INV-01 mỗi khung giờ có tối đa một lịch giữ nó', () => {
  it('sạch ⇒ rỗng, kể cả khung giờ có lịch đang giữ CÙNG lịch DaHuy và DaDoiLich cũ (không giữ khung giờ nên không bị đếm)', async () => {
    const w = await world();
    await w.appt('DaHuy', 0);
    await w.appt('DaDoiLich', 0);
    await w.appt('DaXacNhan', 0);
    await w.appt('ChoThanhToan', 1);
    expect(await checkSlotSingleHolder(db)).toEqual([]);
  });

  it('DB TỪ CHỐI lịch thứ hai cùng trạng thái giữ trên một khung giờ (1062 trên khung_gio_dang_giu): INV-01 không thể vi phạm bằng DML, và lần thử hỏng không để lại dấu vết', async () => {
    const w = await world();
    await w.appt('DaXacNhan', 1);
    const error = await w.appt('ChoThanhToan', 1).catch((e: unknown) => e);
    expect(isDuplicateKeyError(error)).toBe(true);
    expect((error as Error).message).toContain('khung_gio_dang_giu');
    expect(await checkSlotSingleHolder(db)).toEqual([]);
    await expect(assertBookingInvariants(db)).resolves.toBeUndefined();
  });

  it('truy vấn BẮT ĐƯỢC vi phạm khi không còn UNIQUE: chạy trên bảng tạm sao từ lich_hen đã bỏ chỉ mục khung_gio_dang_giu', async () => {
    const runner = db.createQueryRunner();
    try {
      await runner.query(
        'CREATE TEMPORARY TABLE lich_hen_ban_sao LIKE lich_hen',
      );
      await runner.query(
        'ALTER TABLE lich_hen_ban_sao DROP INDEX khung_gio_dang_giu',
      );
      const insert = (ma: string, slot: number, trangThai: string) =>
        runner.query(
          `INSERT INTO lich_hen_ban_sao
             (ma_lich_hen, khung_gio_id, benh_nhan_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id, thoi_gian, gia_snapshot, trang_thai)
           VALUES (?, ?, 1, 1, 1, 1, '2026-11-10 08:00:00', 100000, ?)`,
          [ma, slot, trangThai],
        );
      await insert('A1', 1, 'DaXacNhan');
      await insert('A2', 1, 'ChoThanhToan'); // hai lịch cùng giữ khung giờ 1
      await insert('A3', 2, 'DaXacNhan');
      await insert('A4', 2, 'DaHuy'); // khung giờ 2: một lịch giữ + một lịch huỷ ⇒ hợp lệ
      await insert('A5', 3, 'HoanThanh');
      await insert('A6', 3, 'VangMat'); // khung giờ 3: HoanThanh và VangMat cùng giữ ⇒ vi phạm
      const violations = await checkSlotSingleHolder(runner, {
        lichHenTable: 'lich_hen_ban_sao',
      });
      expect(
        violations.map((v) => [v['khungGioId'], Number(v['soLich'])]),
      ).toEqual([
        ['1', 2],
        ['3', 2],
      ]);
      // bảng thật không bị ảnh hưởng
      expect(await checkSlotSingleHolder(db)).toEqual([]);
    } finally {
      await runner
        .query('DROP TEMPORARY TABLE IF EXISTS lich_hen_ban_sao')
        .finally(() => runner.release());
    }
  });

  it('tên bảng ngoài dạng chữ thường và gạch dưới bị từ chối (không nối chuỗi tuỳ ý vào SQL)', () => {
    expect(() =>
      checkSlotSingleHolder(db, { lichHenTable: 'lich_hen; DROP TABLE x' }),
    ).toThrow(/INV-01/);
  });
});

describe('INV-02 lịch ChoThanhToan ⇒ khung giờ DangGiuCho và giu_cho_den = han_thanh_toan', () => {
  it('sạch ⇒ rỗng; khung giờ ConTrong, hay giu_cho_den lệch 1 giây ⇒ bị bắt; đúng bằng ⇒ hợp lệ; chỉ xét lịch ChoThanhToan', async () => {
    const w = await world();
    const pending = await w.appt('ChoThanhToan', 0);
    const confirmed = await w.appt('DaXacNhan', 1);
    expect(await checkPendingSlotState(db)).toEqual([]);

    await w.setSlot(0, "trang_thai = 'ConTrong', giu_cho_den = NULL");
    expect(ids(await checkPendingSlotState(db), 'lichHenId')).toEqual([
      pending.lichHenId,
    ]);

    await w.setSlot(
      0,
      "trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 08:15:01'",
    );
    expect(ids(await checkPendingSlotState(db), 'lichHenId')).toEqual([
      pending.lichHenId,
    ]);

    await w.setSlot(
      0,
      "trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 08:15:00'",
    );
    expect(await checkPendingSlotState(db)).toEqual([]);

    // lịch DaXacNhan với khung giờ sai là việc của INV-03, INV-02 không báo
    await w.setSlot(1, "trang_thai = 'ConTrong'");
    expect(await checkPendingSlotState(db)).toEqual([]);
    expect(ids(await checkConfirmedSlotState(db), 'lichHenId')).toEqual([
      confirmed.lichHenId,
    ]);
  });

  it('hai NULL không được coi là bằng: lịch ChoThanhToan không có hạn, hoặc khung giờ không có giu_cho_den, đều bị bắt', async () => {
    const w = await world();
    const pending = await w.appt('ChoThanhToan', 0);
    await db.query('UPDATE lich_hen SET han_thanh_toan = NULL');
    await w.setSlot(0, 'giu_cho_den = NULL');
    expect(ids(await checkPendingSlotState(db), 'lichHenId')).toEqual([
      pending.lichHenId,
    ]);

    await db.query(
      "UPDATE lich_hen SET han_thanh_toan = '2026-11-02 08:15:00'",
    );
    expect(ids(await checkPendingSlotState(db), 'lichHenId')).toEqual([
      pending.lichHenId,
    ]); // khung giờ vẫn NULL

    // chiều ngược lại: khung giờ CÓ giu_cho_den nhưng lịch không có hạn (phép so với NULL ra NULL, không được coi là khớp)
    await db.query('UPDATE lich_hen SET han_thanh_toan = NULL');
    await w.setSlot(
      0,
      "trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 08:15:00'",
    );
    expect(ids(await checkPendingSlotState(db), 'lichHenId')).toEqual([
      pending.lichHenId,
    ]);
  });
});

describe('INV-03 lịch DaXacNhan, DaTiepDon, HoanThanh, VangMat ⇒ khung giờ DaDat và giu_cho_den NULL', () => {
  it('sạch ⇒ rỗng cho cả bốn trạng thái; khung giờ ConTrong, DangGiuCho, hoặc DaDat nhưng còn giu_cho_den ⇒ bị bắt đúng lịch', async () => {
    const w = await world();
    const states: TrangThaiLichHen[] = [
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'VangMat',
    ];
    const created = [];
    for (const [i, state] of states.entries())
      created.push(await w.appt(state, i));
    expect(await checkConfirmedSlotState(db)).toEqual([]);

    await w.setSlot(0, "trang_thai = 'ConTrong'");
    await w.setSlot(
      1,
      "trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 08:15:00'",
    );
    await w.setSlot(2, "giu_cho_den = '2026-11-02 08:15:00'"); // vẫn DaDat nhưng còn hạn giữ
    const violations = await checkConfirmedSlotState(db);
    expect(ids(violations, 'lichHenId')).toEqual(
      created.slice(0, 3).map((a) => a.lichHenId),
    );
    expect(violations.map((v) => v['trangThai'])).toEqual([
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
    ]);
  });

  it('lịch DaHuy hay ChoThanhToan không bị INV-03 xét dù khung giờ ra sao', async () => {
    const w = await world();
    await w.appt('DaHuy', 0);
    await w.appt('ChoThanhToan', 1);
    await w.setSlot(0, "trang_thai = 'DaDat'");
    await w.setSlot(1, "trang_thai = 'ConTrong'");
    expect(await checkConfirmedSlotState(db)).toEqual([]);
  });
});

describe('INV-04 khung giờ DaDat ⇒ có đúng một lịch (tập INV-03) giữ nó', () => {
  it('sạch ⇒ rỗng; DaDat không lịch nào, hoặc chỉ có lịch ChoThanhToan, hoặc chỉ lịch DaHuy ⇒ bị bắt (soLich 0); lịch DaHuy cũ cạnh một lịch giữ không làm sai', async () => {
    const w = await world();
    await w.appt('DaHuy', 0);
    await w.appt('DaXacNhan', 0); // khung giờ 0: DaHuy cũ + một lịch giữ ⇒ hợp lệ
    expect(await checkBookedSlotHasOneHolder(db)).toEqual([]);

    await w.setSlot(2, "trang_thai = 'DaDat'"); // không lịch nào
    await w.appt('ChoThanhToan', 3);
    await w.setSlot(3, "trang_thai = 'DaDat', giu_cho_den = NULL"); // chỉ lịch chờ thanh toán
    await w.appt('DaHuy', 4);
    await w.setSlot(4, "trang_thai = 'DaDat'"); // chỉ lịch huỷ
    const violations = await checkBookedSlotHasOneHolder(db);
    expect(ids(violations, 'khungGioId')).toEqual(
      [2, 3, 4].map((i) => w.slot(i)),
    );
    expect(violations.map((v) => Number(v['soLich']))).toEqual([0, 0, 0]);
  });

  it('khung giờ không DaDat thì không bị xét (ConTrong, DangGiuCho)', async () => {
    const w = await world();
    await w.appt('ChoThanhToan', 0);
    expect(await checkBookedSlotHasOneHolder(db)).toEqual([]);
  });
});

describe('INV-05 khung giờ DangGiuCho phải có lịch ChoThanhToan giữ (trừ lời mời danh sách chờ)', () => {
  it('sạch ⇒ rỗng; DangGiuCho không lịch nào, hoặc chỉ có lịch DaHuy ⇒ bị bắt; exceptSlotIds miễn đúng các khung giờ nêu', async () => {
    const w = await world();
    await w.appt('ChoThanhToan', 0);
    expect(await checkOrphanHeldSlots(db)).toEqual([]);

    await w.setSlot(
      1,
      "trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 09:00:00'",
    );
    await w.appt('DaHuy', 2);
    await w.setSlot(
      2,
      "trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 09:00:00'",
    );
    const violations = await checkOrphanHeldSlots(db);
    expect(ids(violations, 'khungGioId')).toEqual([w.slot(1), w.slot(2)]);
    expect(violations[0]?.['giuChoDen']).toBe('2026-11-02 09:00:00');

    expect(
      ids(
        await checkOrphanHeldSlots(db, { exceptSlotIds: [w.slot(1)] }),
        'khungGioId',
      ),
    ).toEqual([w.slot(2)]);
    expect(
      await checkOrphanHeldSlots(db, { exceptSlotIds: [w.slot(1), w.slot(2)] }),
    ).toEqual([]);
    // miễn một khung giờ KHÔNG miễn khung giờ khác, và không miễn khung giờ đã có lịch
    expect(
      ids(
        await checkOrphanHeldSlots(db, { exceptSlotIds: [w.slot(0)] }),
        'khungGioId',
      ),
    ).toEqual([w.slot(1), w.slot(2)]);
  });
});

describe('assertBookingInvariants', () => {
  it('dữ liệu sạch ⇒ không ném; vi phạm ⇒ ném lỗi nêu đúng mã INV (không nêu mã đúng); exceptSlotIds được chuyển tới INV-05', async () => {
    const w = await world();
    await w.appt('ChoThanhToan', 0);
    await w.appt('DaXacNhan', 1);
    await expect(assertBookingInvariants(db)).resolves.toBeUndefined();

    await w.setSlot(1, "trang_thai = 'ConTrong'"); // INV-03
    await w.setSlot(
      5,
      "trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 09:00:00'",
    ); // INV-05
    const failure = await assertBookingInvariants(db).catch((e: unknown) => e);
    expect((failure as Error).message).toMatch(/INV-03/);
    expect((failure as Error).message).toMatch(/INV-05/);
    expect((failure as Error).message).not.toMatch(/INV-0[124]/);

    await w.setSlot(1, "trang_thai = 'DaDat'");
    await expect(
      assertBookingInvariants(db, { exceptSlotIds: [w.slot(5)] }),
    ).resolves.toBeUndefined();
  });
});
