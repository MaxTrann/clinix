import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  BOOKING_ERROR_CODES,
  HOLD_EXPIRED_CANCEL_REASON,
} from '../appointments.constants.js';
import { BookingFixtures } from './booking-fixtures.js';
import { createBookingFlow, FLOW_NOW } from './booking-flow.js';
import { assertBookingInvariants } from './invariants.js';

// Task B6b — BKF-01 (hàm tạo lịch rút gọn, tuần tự) và phần DỊCH VỤ trên MySQL thật của DL-03, DL-04, DL-05, HG-14 (PLAN booking 7.1, 7.2, 7.23; TRACKING 3.14.5). Phần HTTP của DL-03 và DL-04 là của B8.
// Ô i bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026. `FLOW_NOW` = 09:00 ngày 02/11/2026: sau hạn 08:15 của lịch `ChoThanhToan` trong fixture.
const CODES = BOOKING_ERROR_CODES;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

async function world() {
  const w = await fx.world();
  const [other] = await fx.patients(1);
  if (!other) throw new Error('thiếu Bệnh nhân thứ hai');
  const patientId = w.patient.account.taiKhoanId;
  const otherId = other.account.taiKhoanId;
  const flow = createBookingFlow(db);
  const slotId = (i: number) => w.slotIds[i]!;
  const holderOf = (i: number, hanThanhToan?: Date) =>
    fx.appointmentIn('ChoThanhToan', {
      doctor: w.doctor.profile,
      khungGioId: slotId(i),
      patientId: otherId,
      ...(hanThanhToan ? { hanThanhToan } : {}),
    });
  /** Ảnh chụp để chứng minh "không ghi gì": số và nội dung `lich_hen`, trạng thái mọi `khung_gio`. */
  const snapshot = async () =>
    JSON.stringify([
      await db.query(
        'SELECT lich_hen_id, trang_thai, han_thanh_toan, thoi_diem_huy FROM lich_hen ORDER BY lich_hen_id',
      ),
      await db.query(
        'SELECT khung_gio_id, trang_thai, giu_cho_den FROM khung_gio ORDER BY khung_gio_id',
      ),
    ]);
  return { ...w, patientId, otherId, flow, slotId, holderOf, snapshot };
}

const rowsOf = (khungGioId: string) =>
  db.query<
    {
      trangThai: string;
      han: string | null;
      huy: string | null;
      lyDo: string | null;
      benhNhanId: string;
    }[]
  >(
    `SELECT trang_thai AS trangThai, DATE_FORMAT(han_thanh_toan, '%Y-%m-%d %H:%i:%s') AS han, DATE_FORMAT(thoi_diem_huy, '%Y-%m-%d %H:%i:%s') AS huy,
            ly_do_huy AS lyDo, CAST(benh_nhan_id AS CHAR) AS benhNhanId
       FROM lich_hen WHERE khung_gio_id = ? ORDER BY lich_hen_id`,
    [khungGioId],
  );

describe('BKF-01 hàm tạo lịch rút gọn, tuần tự (đường đạt)', () => {
  it('cọc > 0: lịch ChoThanhToan, khung giờ DangGiuCho, giu_cho_den = han_thanh_toan = now + thời gian giữ; INV-01…INV-05', async () => {
    const w = await world();
    const result = await w.flow.create({
      khungGioId: w.slotId(0),
      benhNhanId: w.patientId,
    });
    expect(result).toMatchObject({
      kind: 'Created',
      trangThai: 'ChoThanhToan',
      expiredHolderId: null,
    });
    const rows = await rowsOf(w.slotId(0));
    expect(rows).toEqual([
      {
        trangThai: 'ChoThanhToan',
        han: '2026-11-02 09:15:00',
        huy: null,
        lyDo: null,
        benhNhanId: w.patientId,
      },
    ]);
    expect(await fx.slotState(w.slotId(0))).toEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-02 09:15:00',
    });
    await assertBookingInvariants(db);
  });

  it('cọc 0đ: xác nhận ngay (DaXacNhan, khung giờ DaDat, hạn NULL; INV-03, INV-04)', async () => {
    const w = await world();
    const result = await w.flow.create({
      khungGioId: w.slotId(1),
      benhNhanId: w.patientId,
      zeroDeposit: true,
    });
    expect(result).toMatchObject({ kind: 'Created', trangThai: 'DaXacNhan' });
    expect((await rowsOf(w.slotId(1)))[0]?.trangThai).toBe('DaXacNhan');
    expect(await fx.slotState(w.slotId(1))).toEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
    await assertBookingInvariants(db);
  });

  it('người thứ hai đặt cùng khung giờ đang giữ còn hạn ⇒ Rejected KHUNG_GIO_DANG_GIU, người đầu không bị ảnh hưởng', async () => {
    const w = await world();
    await w.flow.create({ khungGioId: w.slotId(2), benhNhanId: w.patientId });
    const second = await w.flow.create({
      khungGioId: w.slotId(2),
      benhNhanId: w.otherId,
    });
    expect(second).toMatchObject({ kind: 'Rejected', code: CODES.SLOT_HELD });
    expect(await rowsOf(w.slotId(2))).toHaveLength(1);
    await assertBookingInvariants(db);
  });

  it('các nhánh của hàm: không có hồ sơ Bệnh nhân, hồ sơ người thân đã ngừng, khung giờ không tồn tại', async () => {
    const w = await world();
    expect(
      await w.flow.create({ khungGioId: w.slotId(0), benhNhanId: '999999999' }),
    ).toEqual({ kind: 'NoPatient' });
    expect(
      await w.flow.create({
        khungGioId: w.slotId(0),
        benhNhanId: w.patientId,
        hoSoNguoiThanId: w.stoppedRelativeId,
      }),
    ).toEqual({ kind: 'ProfileUnusable', state: 'inactive' });
    expect(
      await w.flow.create({
        khungGioId: '999999999',
        benhNhanId: w.patientId,
      }),
    ).toEqual({ kind: 'SlotNotFound' });
    expect(await rowsOf(w.slotId(0))).toEqual([]);
  });
});

describe('DL-03 và DL-04 (mức dịch vụ): từ chối đúng mã và KHÔNG ghi gì', () => {
  it('DL-03: khung giờ DaDat ⇒ Rejected KHUNG_GIO_DA_DAT; lich_hen và khung_gio y nguyên', async () => {
    const w = await world();
    await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: w.slotId(0),
      patientId: w.otherId,
    });
    const before = await w.snapshot();
    const result = await w.flow.create({
      khungGioId: w.slotId(0),
      benhNhanId: w.patientId,
    });
    expect(result).toMatchObject({ kind: 'Rejected', code: CODES.SLOT_BOOKED });
    expect(await w.snapshot()).toBe(before);
  });

  it('DL-04: khung giờ DangGiuCho còn hạn (người khác giữ) ⇒ Rejected KHUNG_GIO_DANG_GIU; y nguyên', async () => {
    const w = await world();
    await w.holderOf(1); // hạn 08:15
    const before = await w.snapshot();
    const result = await w.flow.create({
      khungGioId: w.slotId(1),
      benhNhanId: w.patientId,
      now: new Date('2026-11-02T08:05:00+07:00'),
    });
    expect(result).toMatchObject({ kind: 'Rejected', code: CODES.SLOT_HELD });
    expect(await w.snapshot()).toBe(before);
  });
});

describe('DL-05 hết hạn lười (mức dịch vụ) và HG-14 (I)', () => {
  it('khung giờ DangGiuCho đã quá giu_cho_den, job chưa quét ⇒ tạo được; lịch cũ DaHuy (ly_do_huy hằng), khung giờ giữ lại cho người mới, INV', async () => {
    const w = await world();
    const old = await w.holderOf(3);
    const result = await w.flow.create({
      khungGioId: w.slotId(3),
      benhNhanId: w.patientId,
    });
    expect(result).toMatchObject({
      kind: 'Created',
      expiredHolderId: old.lichHenId,
    });
    expect(await rowsOf(w.slotId(3))).toEqual([
      {
        trangThai: 'DaHuy',
        han: '2026-11-02 08:15:00',
        huy: '2026-11-02 09:00:00',
        lyDo: HOLD_EXPIRED_CANCEL_REASON,
        benhNhanId: w.otherId,
      },
      {
        trangThai: 'ChoThanhToan',
        han: '2026-11-02 09:15:00',
        huy: null,
        lyDo: null,
        benhNhanId: w.patientId,
      },
    ]);
    expect(await fx.slotState(w.slotId(3))).toEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-02 09:15:00',
    });
    await assertBookingInvariants(db);
  });

  it('HG-14: giu_cho_den ĐÚNG BẰNG now ⇒ coi là trống (tạo được); sớm hơn now một giây thì vẫn đang giữ (KHUNG_GIO_DANG_GIU)', async () => {
    const w = await world();
    await w.holderOf(0, FLOW_NOW); // hạn = now
    await w.holderOf(1, new Date(FLOW_NOW.getTime() + 1000)); // hạn = now + 1s
    const atNow = await w.flow.create({
      khungGioId: w.slotId(0),
      benhNhanId: w.patientId,
    });
    const justBefore = await w.flow.create({
      khungGioId: w.slotId(1),
      benhNhanId: w.patientId,
    });
    expect(atNow.kind).toBe('Created');
    expect(justBefore).toMatchObject({
      kind: 'Rejected',
      code: CODES.SLOT_HELD,
    });
  });

  it('bị từ chối thì KHÔNG hết hạn lười: Bệnh nhân bị khoá no-show đặt khung giờ quá hạn ⇒ Rejected, lịch cũ vẫn ChoThanhToan', async () => {
    const w = await world();
    const old = await w.holderOf(2);
    await db.query(
      'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
      [w.patientId],
    );
    const before = await w.snapshot();
    const result = await w.flow.create({
      khungGioId: w.slotId(2),
      benhNhanId: w.patientId,
    });
    expect(result).toMatchObject({
      kind: 'Rejected',
      code: CODES.BOOKING_LOCKED_NO_SHOW,
    });
    expect(await w.snapshot()).toBe(before);
    expect((await rowsOf(w.slotId(2)))[0]?.trangThai).toBe('ChoThanhToan');
    expect(old.trangThai).toBe('ChoThanhToan');
  });
});
