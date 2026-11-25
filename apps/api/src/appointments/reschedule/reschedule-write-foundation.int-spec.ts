import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { insertLichHen } from '../create/lich-hen-insert.query.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import {
  BookingFixtures,
  nextAppointmentCode,
} from '../testing/booking-fixtures.js';
import {
  transactionOf,
  writeTargets,
} from '../testing/create-appointment-world.js';
import {
  FakeAppointmentNotifier,
  FakeWaitlistPort,
} from '../testing/fake-ports.js';
import {
  assertBookingInvariants,
  assertRescheduleInvariants,
  captureMoneyTotals,
} from '../testing/invariants.js';
import { lockedTablesOfDistinct } from '../testing/lock-chain.js';
import { isLockingStatement } from '../testing/query-spy.js';
import {
  simulateRescheduleWrite,
  type RescheduleWriteInput,
} from '../testing/reschedule-write-world.js';
import {
  interceptStatements,
  type StatementCall,
} from '../testing/statement-recorder.js';
import type { RescheduleLocated } from './reschedule.reader.js';

// reschedule B1 — HDL-10 (phần B1; PLAN reschedule 5.4 quy tắc 3 và 6, 5.5 bước 1, 5 đến 7, 7.9) trên MySQL 8.4 THẬT: bốn hàm nền (khoá, hết hạn lười và `claimSlot`, `insertLichHen` nối chuỗi, `markReplaced`) ghép bằng thân
// MÔ PHỎNG (testing/reschedule-write-world.ts, CHỈ test) chạy trọn trong MỘT `withBookingTransaction`: một cặp START TRANSACTION và COMMIT, chuỗi khoá không vi phạm thứ tự, mọi `INSERT` và `UPDATE` SAU khoá cuối,
// kết quả thoả INV-1 đến INV-10, và ném giữa chừng thì hoàn tác TRỌN. Phần "thông báo và Audit cùng `em`" của HDL-10 là của B4 (B1 chưa có thông báo hay Audit).
// Ô i của thế giới đặt được bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026. `NOW` là 09:00 ngày 02/11/2026 (sau hạn 08:15 của lịch `ChoThanhToan` của fixture).
const NOW = new Date('2026-11-02T09:00:00+07:00');
const HOLD_UNTIL = new Date('2026-11-02T09:15:00+07:00');
const POLICY = '[{"so_gio_truoc_toi_thieu":24,"ty_le_hoan":100}]';

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

async function world() {
  const w = await fx.world();
  await fx.systemConfig();
  const patientId = w.patient.account.taiKhoanId;
  const doctor = w.doctor.profile;
  const old = await fx.appointmentIn('DaXacNhan', {
    doctor,
    khungGioId: w.slotIds[0]!,
    patientId,
    giaSnapshot: '200000.00',
    tienCocSnapshot: '50000.00',
  });
  await db.query(
    `UPDATE lich_hen SET chinh_sach_hoan_snapshot = ?, ly_do_kham = 'Đau đầu', so_lan_tu_doi_lich = 1 WHERE lich_hen_id = ?`,
    [POLICY, old.lichHenId],
  );
  const slotHolds = new SlotHoldService();
  const deps = {
    slotHolds,
    transition: new AppointmentTransitionService(
      db,
      slotHolds,
      new FakeWaitlistPort(),
      new FakeAppointmentNotifier(),
    ),
  };
  const locate = (
    lichHenId: string,
    khungGioCuId: string,
  ): RescheduleLocated => ({
    lichHenId,
    benhNhanId: patientId,
    hoSoNguoiThanId: null,
    bacSiId: doctor.taiKhoanId,
    khungGioCuId,
    bacSiCuaKhungGioMoiId: doctor.taiKhoanId,
  });
  const run = (
    lichHenId: string,
    khungGioCuId: string,
    khungGioMoiId: string,
    extra: Partial<RescheduleWriteInput> = {},
  ) =>
    withBookingTransaction(
      db,
      (em) =>
        simulateRescheduleWrite(em, deps, {
          located: locate(lichHenId, khungGioCuId),
          khungGioMoiId,
          now: NOW,
          tuDoi: true,
          holdUntil: HOLD_UNTIL,
          ...extra,
        }),
      { label: 'reschedule-b1-test' },
    );
  return { ...w, patientId, doctor, old, run };
}

interface Row {
  trangThai: string;
  truoc: string | null;
  soLan: number | string;
  khungGioId: string;
  hanThanhToan: string | null;
  xacNhanLuc: string | null;
  taoLuc: string;
  thoiGian: string;
  gia: string;
  coc: string;
  chinhSach: unknown;
  lyDoKham: string | null;
  benhNhanId: string;
  bacSiId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
}
async function rowOf(lichHenId: string): Promise<Row> {
  const rows: Row[] = await db.query(
    `SELECT trang_thai AS trangThai, CAST(lich_hen_truoc_id AS CHAR) AS truoc, so_lan_tu_doi_lich AS soLan, CAST(khung_gio_id AS CHAR) AS khungGioId,
       DATE_FORMAT(han_thanh_toan, '%Y-%m-%d %H:%i:%s') AS hanThanhToan, DATE_FORMAT(thoi_diem_xac_nhan, '%Y-%m-%d %H:%i:%s') AS xacNhanLuc,
       DATE_FORMAT(thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS taoLuc, DATE_FORMAT(thoi_gian, '%Y-%m-%d %H:%i:%s') AS thoiGian,
       gia_snapshot AS gia, tien_coc_snapshot AS coc, chinh_sach_hoan_snapshot AS chinhSach, ly_do_kham AS lyDoKham,
       CAST(benh_nhan_id AS CHAR) AS benhNhanId, CAST(bac_si_id AS CHAR) AS bacSiId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId
     FROM lich_hen WHERE lich_hen_id = ?`,
    [lichHenId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`không có lịch ${lichHenId}`);
  return row;
}

const countLichHen = async (): Promise<number> => {
  const rows: { n: number | string }[] = await db.query(
    'SELECT COUNT(*) AS n FROM lich_hen',
  );
  return Number(rows[0]?.n);
};

describe('HDL-10 (B1) bốn hàm nền ghép trong MỘT giao dịch', () => {
  it('thành công: lịch cũ DaDoiLich; lịch mới DaXacNhan nối chuỗi, sao chép nguyên ba bản chụp và các khoá bất biến, bộ đếm cộng 1; khung giờ cũ ConTrong, mới DaDat; INV-1 đến INV-10 xanh', async () => {
    const w = await world();
    const moneyBefore = await captureMoneyTotals(db);

    const result = await w.run(w.old.lichHenId, w.slotIds[0]!, w.slotIds[2]!);

    if (result.kind !== 'Rescheduled') throw new Error('phải Rescheduled');
    const old = await rowOf(w.old.lichHenId);
    const child = await rowOf(result.lichHenMoiId);
    expect(old.trangThai).toBe('DaDoiLich');
    expect(child).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: w.old.lichHenId,
      soLan: 2,
      khungGioId: w.slotIds[2],
      hanThanhToan: null,
      taoLuc: '2026-11-02 09:00:00',
      xacNhanLuc: '2026-11-02 09:00:00',
      thoiGian: '2026-11-10 09:00:00',
      gia: '200000.00',
      coc: '50000.00',
      lyDoKham: 'Đau đầu',
      benhNhanId: old.benhNhanId,
      bacSiId: old.bacSiId,
      chiNhanhId: old.chiNhanhId,
      dichVuKhamId: old.dichVuKhamId,
    });
    expect(child.chinhSach).toEqual(old.chinhSach);
    expect(await fx.slotState(w.slotIds[0]!)).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    expect(await fx.slotState(w.slotIds[2]!)).toEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
    await assertBookingInvariants(db);
    await assertRescheduleInvariants(db, { moneyBefore });
  });

  it('tuDoi = false (Lễ tân đổi hộ, duyệt): bộ đếm của lịch mới BẰNG lịch cũ', async () => {
    const w = await world();

    const result = await w.run(w.old.lichHenId, w.slotIds[0]!, w.slotIds[2]!, {
      tuDoi: false,
    });

    if (result.kind !== 'Rescheduled') throw new Error('phải Rescheduled');
    expect((await rowOf(result.lichHenMoiId)).soLan).toBe(1);
    await assertRescheduleInvariants(db);
  });

  it('đổi hai lần liền (cũ → mới 1 → mới 2): chuỗi 3 lịch, bộ đếm 1, 2, 3, mỗi lịch chỉ MỘT con; INV xanh', async () => {
    const w = await world();
    const first = await w.run(w.old.lichHenId, w.slotIds[0]!, w.slotIds[2]!);
    if (first.kind !== 'Rescheduled') throw new Error('phải Rescheduled');

    const second = await w.run(
      first.lichHenMoiId,
      w.slotIds[2]!,
      w.slotIds[4]!,
    );

    if (second.kind !== 'Rescheduled') throw new Error('phải Rescheduled');
    expect(await rowOf(first.lichHenMoiId)).toMatchObject({
      trangThai: 'DaDoiLich',
      soLan: 2,
    });
    expect(await rowOf(second.lichHenMoiId)).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: first.lichHenMoiId,
      soLan: 3,
    });
    await assertBookingInvariants(db);
    await assertRescheduleInvariants(db);
  });

  it('khung giờ mới đang giữ bởi lịch ChoThanhToan QUÁ HẠN: hết hạn lười dùng chung với create (lịch người kia DaHuy, khung giờ ConTrong) rồi đổi được; INV xanh', async () => {
    const w = await world();
    const other = await fx.appointmentIn('ChoThanhToan', {
      doctor: w.doctor,
      khungGioId: w.slotIds[2]!,
      patientId: w.patientId,
    });

    const result = await w.run(w.old.lichHenId, w.slotIds[0]!, w.slotIds[2]!);

    expect(result.kind).toBe('Rescheduled');
    expect((await rowOf(other.lichHenId)).trangThai).toBe('DaHuy');
    expect(await fx.slotState(w.slotIds[2]!)).toEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
    await assertBookingInvariants(db);
    await assertRescheduleInvariants(db);
  });

  it('đúng MỘT giao dịch; chuỗi khoá (đã bỏ khoá xin lại) không vi phạm thứ tự; mọi INSERT và UPDATE đứng SAU khoá cuối (quy tắc 3); đúng năm câu ghi theo thứ tự', async () => {
    const w = await world();
    const calls: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      calls.push(call);
      return run();
    });

    const result = await w.run(w.old.lichHenId, w.slotIds[0]!, w.slotIds[2]!);

    expect(result.kind).toBe('Rescheduled');
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

describe('HDL-10 (B1) hoàn tác trọn khi ném giữa chừng', () => {
  it.each(['insert', 'claim', 'release', 'markReplaced'] as const)(
    'ném SAU bước %s ⇒ withBookingTransaction hoàn tác: lịch cũ DaXacNhan, khung giờ cũ DaDat, khung giờ mới ConTrong, không lịch mới; INV xanh',
    async (step) => {
      const w = await world();
      const before = await countLichHen();

      await expect(
        w.run(w.old.lichHenId, w.slotIds[0]!, w.slotIds[2]!, {
          throwAfter: step,
        }),
      ).rejects.toThrow(`hoàn tác giả sau bước ${step}`);

      expect(await countLichHen()).toBe(before);
      expect((await rowOf(w.old.lichHenId)).trangThai).toBe('DaXacNhan');
      expect(await fx.slotState(w.slotIds[0]!)).toEqual({
        trangThai: 'DaDat',
        giuChoDen: null,
      });
      expect(await fx.slotState(w.slotIds[2]!)).toEqual({
        trangThai: 'ConTrong',
        giuChoDen: null,
      });
      await assertBookingInvariants(db);
      await assertRescheduleInvariants(db);
    },
  );

  it('lịch cũ đã có lịch mới (hai tab) mà vẫn DaXacNhan ⇒ INSERT gặp DuplicateChain ⇒ ném và hoàn tác trọn (B4 đổi thành LICH_HEN_KHONG_CHO_DOI, không 500)', async () => {
    const w = await world();
    // dữ liệu lệch có chủ đích: một lịch con đã trỏ lịch cũ nhưng lịch cũ chưa bị thay (thân của tab thứ nhất chưa tới markReplaced)
    await db.transaction('READ COMMITTED', (em) =>
      insertLichHen(em, {
        maLichHen: nextAppointmentCode(),
        khungGioId: w.slotIds[5]!,
        benhNhanId: w.patientId,
        hoSoNguoiThanId: null,
        bacSiId: w.doctor.taiKhoanId,
        chiNhanhId: w.doctor.chiNhanhId,
        dichVuKhamId: w.doctor.dichVuKhamId,
        thoiGian: NOW,
        giaSnapshot: '200000.00',
        tienCocSnapshot: '50000.00',
        chinhSachHoanSnapshot: null,
        trangThai: 'DaXacNhan',
        hanThanhToan: null,
        lyDoKham: null,
        thoiDiemTao: NOW,
        lichHenTruocId: w.old.lichHenId,
      }),
    );
    const before = await countLichHen();

    await expect(
      w.run(w.old.lichHenId, w.slotIds[0]!, w.slotIds[2]!),
    ).rejects.toThrow('không chèn được lịch mới: DuplicateChain');

    expect(await countLichHen()).toBe(before);
    expect((await rowOf(w.old.lichHenId)).trangThai).toBe('DaXacNhan');
    expect(await fx.slotState(w.slotIds[0]!)).toEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
    expect((await fx.slotState(w.slotIds[2]!)).trangThai).toBe('ConTrong');
  });
});

describe('HDL-10 (B1) từ chối TRƯỚC lần ghi đầu tiên: giao dịch commit rỗng', () => {
  it.each([
    ['khung giờ mới ĐÃ ĐẶT', 'SlotNotFree'],
    ['lịch cũ không còn DaXacNhan', 'NotConfirmed'],
  ] as const)(
    '%s ⇒ Rejected %s, không câu ghi nào, không đổi gì',
    async (_name, reason) => {
      const w = await world();
      if (reason === 'SlotNotFree')
        await fx.appointmentIn('DaXacNhan', {
          doctor: w.doctor,
          khungGioId: w.slotIds[2]!,
          patientId: w.patientId,
        });
      else
        await db.query(
          "UPDATE lich_hen SET trang_thai = 'DaHuy' WHERE lich_hen_id = ?",
          [w.old.lichHenId],
        );
      const before = await countLichHen();
      const calls: StatementCall[] = [];
      interceptStatements(db, (call, run) => {
        calls.push(call);
        return run();
      });

      const result = await w.run(w.old.lichHenId, w.slotIds[0]!, w.slotIds[2]!);

      expect(result).toEqual({ kind: 'Rejected', reason });
      expect(
        writeTargets(transactionOf(calls.map((call) => call.sql))),
      ).toEqual([]);
      expect(await countLichHen()).toBe(before);
    },
  );

  it('khung giờ đích không tồn tại ⇒ Rejected Missing (hàm khoá dừng ở khung_gio, không khoá lich_hen)', async () => {
    const w = await world();

    const result = await w.run(w.old.lichHenId, w.slotIds[0]!, '999999');

    expect(result).toEqual({ kind: 'Rejected', reason: 'Missing' });
  });
});
