import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { DoctorFixtures } from '../../doctor/testing/doctor-fixtures.js';
import { runConcurrently } from '../../doctor/testing/concurrency-harness.js';
import { BranchHoursReader } from '../branch-hours/branch-hours.reader.js';
import { checkSlotWithinBranchHours } from '../branch-hours/slot-hours.rules.js';
import { isoWeekdayOf } from '../branch-hours/time-of-day.js';
import { syncShiftSlots } from './slot-generator.js';

// Doctor B1 trên MySQL 8.4 THẬT: SG-06, SG-07 (ca đột biến), SG-09, SG-10, SG-11, SG-13.
let db: DataSource;
let fx: DoctorFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new DoctorFixtures(d);
});

const NGAY = '2026-12-07'; // Thứ Hai
const SANG = { tuGiay: 8 * 3600, denGiay: 12 * 3600 };

async function newShift(ca: 'CaSang' | 'CaChieu' = 'CaSang') {
  const { doctor } = await fx.world();
  const shift = await fx.admin.shift(doctor.profile, { ngay: NGAY, ca });
  return { doctor, shift };
}

const readSlots = (lichLamViecId: string) =>
  db.query<
    {
      id: string;
      gio: string;
      trang_thai: string;
      giu_cho_den: string | null;
    }[]
  >(
    `SELECT khung_gio_id AS id, DATE_FORMAT(ngay_gio, '%Y-%m-%d %H:%i:%s') AS gio, trang_thai,
            DATE_FORMAT(giu_cho_den, '%Y-%m-%d %H:%i:%s') AS giu_cho_den
       FROM khung_gio WHERE lich_lam_viec_id = ? ORDER BY ngay_gio`,
    [lichLamViecId],
  );

describe('syncShiftSlots trên MySQL thật', () => {
  it('SG-11 ghi ngay_gio bằng chuỗi: đọc lại bằng DATE_FORMAT ra đúng giờ VN, ô trống', async () => {
    const { shift } = await newShift();
    const result = await syncShiftSlots(db.manager, {
      lichLamViecId: shift.lichLamViecId,
      ngay: NGAY,
      khoang: SANG,
      thoiLuongPhut: 30,
    });
    expect(result).toEqual({ moi: 8, daCo: 0 });
    const slots = await readSlots(shift.lichLamViecId);
    expect(slots.map((s) => s.gio)).toEqual([
      `${NGAY} 08:00:00`,
      `${NGAY} 08:30:00`,
      `${NGAY} 09:00:00`,
      `${NGAY} 09:30:00`,
      `${NGAY} 10:00:00`,
      `${NGAY} 10:30:00`,
      `${NGAY} 11:00:00`,
      `${NGAY} 11:30:00`,
    ]);
    expect(new Set(slots.map((s) => s.trang_thai))).toEqual(
      new Set(['ConTrong']),
    );
    // Cùng một thời điểm khi đọc bằng Date (UTC+7): 08:00 VN = 01:00 UTC.
    const rows = await db.query<{ ts: number }[]>(
      'SELECT UNIX_TIMESTAMP(ngay_gio) AS ts FROM khung_gio WHERE khung_gio_id = ?',
      [slots[0].id],
    );
    expect(rows[0].ts * 1000).toBe(
      new Date(`${NGAY}T08:00:00+07:00`).getTime(),
    );
  });

  it('SG-10 dịch vụ 60 phút ⇒ ô cách nhau đúng 60 phút', async () => {
    const { shift } = await newShift('CaChieu');
    await syncShiftSlots(db.manager, {
      lichLamViecId: shift.lichLamViecId,
      ngay: NGAY,
      khoang: { tuGiay: 13 * 3600, denGiay: 17 * 3600 },
      thoiLuongPhut: 60,
    });
    expect((await readSlots(shift.lichLamViecId)).map((s) => s.gio)).toEqual([
      `${NGAY} 13:00:00`,
      `${NGAY} 14:00:00`,
      `${NGAY} 15:00:00`,
      `${NGAY} 16:00:00`,
    ]);
  });

  it('SG-06 chạy hai lần: lần hai không thêm, không đổi hàng nào (id giữ nguyên)', async () => {
    const { shift } = await newShift();
    const input = {
      lichLamViecId: shift.lichLamViecId,
      ngay: NGAY,
      khoang: SANG,
      thoiLuongPhut: 30,
    };
    await syncShiftSlots(db.manager, input);
    const first = await readSlots(shift.lichLamViecId);
    const second = await syncShiftSlots(db.manager, input);
    expect(second).toEqual({ moi: 0, daCo: 8 });
    expect(await readSlots(shift.lichLamViecId)).toEqual(first);
  });

  it('SG-07 ca đột biến: sync lại khi có ô DaDat/DangGiuCho không đụng trang_thai và giu_cho_den', async () => {
    const { shift } = await newShift();
    const input = {
      lichLamViecId: shift.lichLamViecId,
      ngay: NGAY,
      khoang: SANG,
      thoiLuongPhut: 30,
    };
    await syncShiftSlots(db.manager, input);
    const [a, b] = await readSlots(shift.lichLamViecId);
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DaDat' WHERE khung_gio_id = ?",
      [a.id],
    );
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = '2026-12-07 07:45:00' WHERE khung_gio_id = ?",
      [b.id],
    );
    const before = await readSlots(shift.lichLamViecId);
    const result = await syncShiftSlots(db.manager, input);
    expect(result).toEqual({ moi: 0, daCo: 8 });
    expect(await readSlots(shift.lichLamViecId)).toEqual(before);
    expect(before[0].trang_thai).toBe('DaDat');
    expect(before[1]).toMatchObject({
      trang_thai: 'DangGiuCho',
      giu_cho_den: '2026-12-07 07:45:00',
    });
  });

  it('SG-07 bổ sung: ca mở rộng thì chỉ thêm ô còn thiếu, ô cũ giữ trạng thái', async () => {
    const { shift } = await newShift();
    const base = {
      lichLamViecId: shift.lichLamViecId,
      ngay: NGAY,
      thoiLuongPhut: 30,
    };
    await syncShiftSlots(db.manager, {
      ...base,
      khoang: { tuGiay: 8 * 3600, denGiay: 10 * 3600 },
    });
    const [first] = await readSlots(shift.lichLamViecId);
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DaDat' WHERE khung_gio_id = ?",
      [first.id],
    );
    const result = await syncShiftSlots(db.manager, { ...base, khoang: SANG });
    expect(result).toEqual({ moi: 4, daCo: 4 });
    expect((await readSlots(shift.lichLamViecId))[0].trang_thai).toBe('DaDat');
  });

  it('SG-09 hai syncShiftSlots đồng thời cùng ca: không trùng, không lỗi', async () => {
    const { shift } = await newShift();
    const input = {
      lichLamViecId: shift.lichLamViecId,
      ngay: NGAY,
      khoang: SANG,
      thoiLuongPhut: 30,
    };
    const results = await runConcurrently([
      () => syncShiftSlots(db.manager, input),
      () => syncShiftSlots(db.manager, input),
      () => syncShiftSlots(db.manager, input),
    ]);
    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    expect(await readSlots(shift.lichLamViecId)).toHaveLength(8);
  });

  it('lô 500: ca 1.200 ô vẫn sinh đủ, không trùng', async () => {
    const { shift } = await newShift();
    // 1 phút/ô trong 20 giờ = 1.200 ô ⇒ 3 lô (500 + 500 + 200).
    const result = await syncShiftSlots(db.manager, {
      lichLamViecId: shift.lichLamViecId,
      ngay: NGAY,
      khoang: { tuGiay: 0, denGiay: 20 * 3600 },
      thoiLuongPhut: 1,
    });
    expect(result).toEqual({ moi: 1200, daCo: 0 });
    expect(await readSlots(shift.lichLamViecId)).toHaveLength(1200);
  });

  it('SG-13 mọi ô sinh ra đều ok với checkSlotWithinBranchHours (D1 và D2 nhất quán)', async () => {
    const { doctor, shift } = await newShift();
    await syncShiftSlots(db.manager, {
      lichLamViecId: shift.lichLamViecId,
      ngay: NGAY,
      khoang: SANG,
      thoiLuongPhut: 30,
    });
    const hours = await new BranchHoursReader().load(
      db.manager,
      doctor.profile.chiNhanhId,
      isoWeekdayOf(NGAY),
    );
    const slots = await readSlots(shift.lichLamViecId);
    expect(slots).not.toHaveLength(0);
    for (const slot of slots) {
      const check = checkSlotWithinBranchHours({
        ngayGio: new Date(`${slot.gio.replace(' ', 'T')}+07:00`),
        thoiLuongPhut: 30,
        ca: 'CaSang',
        ngayHoatDong: hours,
      });
      expect(check).toEqual({ ok: true });
    }
  });
});
