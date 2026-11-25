import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { PaymentChain } from '../../payment/ports/payment-chain.js';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  BOOKING_ERROR_CODES,
  RESCHEDULE_NOTIFICATION_EVENTS,
} from '../appointments.constants.js';
import { insertLichHen } from '../create/lich-hen-insert.query.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BookingNotifier } from '../notifications/booking-notifier.js';
import { NoopWaitlistPort } from '../ports/waitlist.port.js';
import {
  BookingFixtures,
  nextAppointmentCode,
} from '../testing/booking-fixtures.js';
import {
  dataState,
  deadlockError,
  transactionOf,
  writeTargets,
} from '../testing/create-appointment-world.js';
import { retryStats } from '../testing/concurrency-report.js';
import { lockedTablesOfDistinct } from '../testing/lock-chain.js';
import { isLockingStatement } from '../testing/query-spy.js';
import {
  insertRescheduleRequest,
  MARKER_LY_DO_KHAM,
  readRescheduleRows,
} from '../testing/reschedule-notification-world.js';
import {
  rescheduleServiceWorld,
  WORLD_POLICY,
  type RescheduleServiceWorld,
  type RescheduleWorldOptions,
} from '../testing/reschedule-service-world.js';
import { buildRescheduleChain } from '../testing/reschedule-world.js';
import {
  failAfterStatement,
  interceptStatements,
  recordStatements,
  type StatementCall,
} from '../testing/statement-recorder.js';
import type { RescheduleOutcome } from './reschedule.types.js';

// reschedule B4 — AppointmentRescheduleService THẬT trên MySQL 8.4 THẬT (PLAN reschedule 5.5, 7.2, 7.9; TRACKING reschedule 1.7): tự đổi, đổi hộ và duyệt dùng MỘT thân giao dịch. Phủ DLH-01, 03, 06, 07, 08, 12, 13, 14, 18, 21 và
// DLH-24…32, 35…39, HDL-05, 07, 08 (phần B4), 09, 17, 18, 20, 21, 22, 23, 24 (mã `[đề xuất]` ở TRACKING 1.7). Cổng `Fake` (nghỉ phép, thay đổi chi nhánh, thông báo, danh sách chờ) trừ ca đổi sang bản thật được nêu.
// Phần ví và thanh toán THẬT: appointment-reschedule.real-stack.int-spec.ts; đồng thời: appointment-reschedule.concurrency.int-spec.ts. Ô i của thế giới bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (thứ Ba);
// đồng hồ giả là 08:00 ngày 02/11/2026. Mọi dữ liệu là giả.
const THU_BA = 2;
/** Giờ Việt Nam ngày 10/11/2026 từ "HH:mm" hoặc "HH:mm:ss". */
const GIO = (time: string) =>
  new Date(`2026-11-10T${time.length === 5 ? `${time}:00` : time}+07:00`);

let db: DataSource;
let fx: BookingFixtures;
let logs: string[];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});

const world = (options?: RescheduleWorldOptions) =>
  rescheduleServiceWorld(db, fx, options);

/** Thu hẹp kết quả về `Rescheduled` (ca nào không đổi được thì đỏ ở đây, kèm kết quả thật). */
function rescheduled(outcome: RescheduleOutcome) {
  if (outcome.kind !== 'Rescheduled')
    throw new Error(`phải Rescheduled, nhận ${JSON.stringify(outcome)}`);
  return outcome;
}

const rule = (code: string, chiTiet?: unknown) => ({
  kind: 'Rejected' as const,
  failure: {
    kind: 'Rule' as const,
    code,
    ...(chiTiet === undefined ? {} : { chiTiet }),
  },
});

/** Ghi lại MỌI câu SQL của lượt gọi và trả danh sách (cần gọi TRƯỚC khi chạy dịch vụ; chỉ một lần mỗi test). */
const statementsOf = () => recordStatements(db);

/** Lời gọi bị từ chối KHÔNG ghi gì: không câu ghi nào, dữ liệu y như trước, cổng thông báo và danh sách chờ không được gọi. */
async function expectNoEffect(
  w: RescheduleServiceWorld,
  before: Awaited<ReturnType<typeof dataState>>,
  statements: readonly string[],
) {
  expect(writeTargets(statements)).toEqual([]);
  expect(await dataState(db)).toEqual(before);
  expect(w.notifier.notifyCall.count).toBe(0);
  expect(w.waitlist.onSlotReleasedCall.count).toBe(0);
}

describe('DLH-01, DLH-25, DLH-27, DLH-21, DLH-29 tự đổi thành công', () => {
  it('DLH-01 đổi lịch DaXacNhan sang khung giờ trống của cùng bác sĩ ngày hôm đó: lịch mới đủ cột (mã mới, DaXacNhan, không hạn, nối chuỗi, bộ đếm 1, ba bản chụp và khoá bất biến sao chép), lịch cũ DaDoiLich mọi cột khác nguyên, khung giờ cũ ConTrong, mới DaDat; INV-1…INV-10', async () => {
    const w = await world();
    const lich = await w.book(0);
    const oldBefore = await w.rawRow(lich.lichHenId);
    const money = await w.moneyBefore();

    const outcome = rescheduled(
      await w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
    );

    expect(outcome).toStrictEqual({
      kind: 'Rescheduled',
      maLichHenCu: lich.maLichHen,
      maLichHenMoi: outcome.maLichHenMoi,
      thoiGianMoi: GIO('09:00'),
    });
    expect(outcome.maLichHenMoi).not.toBe(lich.maLichHen);
    const child = await w.rowOf(await w.idOfCode(outcome.maLichHenMoi));
    expect(child).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: lich.lichHenId,
      soLan: 1,
      khungGioId: w.slot(2),
      hanThanhToan: null,
      taoLuc: '2026-11-02 08:00:00',
      xacNhanLuc: '2026-11-02 08:00:00',
      thoiGian: '2026-11-10 09:00:00',
      gia: '200000.00',
      coc: '50000.00',
      lyDoKham: 'Đau đầu',
      benhNhanId: w.patientId,
      hoSoNguoiThanId: null,
      bacSiId: w.doctor.taiKhoanId,
      chiNhanhId: w.doctor.chiNhanhId,
      dichVuKhamId: w.doctor.dichVuKhamId,
    });
    expect(child.chinhSach).toEqual(WORLD_POLICY);
    expect(await w.rawRow(lich.lichHenId)).toEqual({
      ...oldBefore,
      trang_thai: 'DaDoiLich',
    });
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(2, 'DaDat');
    await w.expectSettled(money);
  });

  it('DLH-25 bộ đếm: TuDoi cộng 1; DoiHo giữ nguyên kể cả khi cũ đã đạt tối đa (đổi hộ không bị hạn mức); duyệt giữ nguyên', async () => {
    const w = await world();
    const a = await w.book(0, { soLan: 1 });
    const b = await w.book(1, { soLan: 2 });
    const c = await w.book(4, { soLan: 2 });
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: c.lichHenId,
      khungGioMongMuonId: w.slot(5),
    });

    const tuDoi = rescheduled(
      await w.service.reschedule(w.tuDoi(a.maLichHen, 2)),
    );
    const doiHo = rescheduled(
      await w.service.reschedule(w.doiHo(b.maLichHen, 3)),
    );
    const duyet = rescheduled(
      await w.service.reschedule(w.duyet(c.maLichHen, 5, yeuCauId)),
    );

    expect((await w.rowOf(await w.idOfCode(tuDoi.maLichHenMoi))).soLan).toBe(2);
    expect((await w.rowOf(await w.idOfCode(doiHo.maLichHenMoi))).soLan).toBe(2);
    expect((await w.rowOf(await w.idOfCode(duyet.maLichHenMoi))).soLan).toBe(2);
    await w.expectSettled();
  });

  it('DLH-27 ba bản chụp SAO CHÉP nguyên: bác sĩ đổi mức cọc và mốc hoàn sau đó không ảnh hưởng; chính sách NULL (cọc 0đ) cũng sao chép đúng là SQL NULL', async () => {
    const w = await world();
    const co = await w.book(0, { gia: '180000.00', coc: '40000.00' });
    const khong = await w.book(1, {
      gia: '150000.00',
      coc: '0.00',
      policy: null,
    });
    await fx.depositService(w.doctor.dichVuKhamId, '99000.00', [[1, 10]]);

    const a = rescheduled(await w.service.reschedule(w.tuDoi(co.maLichHen, 2)));
    const b = rescheduled(
      await w.service.reschedule(w.tuDoi(khong.maLichHen, 3)),
    );

    const rowA = await w.rowOf(await w.idOfCode(a.maLichHenMoi));
    expect(rowA).toMatchObject({ gia: '180000.00', coc: '40000.00' });
    expect(rowA.chinhSach).toEqual(WORLD_POLICY);
    const rowB = await w.rowOf(await w.idOfCode(b.maLichHenMoi));
    expect(rowB).toMatchObject({ gia: '150000.00', coc: '0.00' });
    expect(Number(rowB.chinhSachSqlNull)).toBe(1);
  });

  it('DLH-21 đổi qua ngày, qua tuần và sang khung giờ CUỐI ca (16:30)', async () => {
    const w = await world({ config: { soLanTuDoiLichToiDa: 5 } });
    const nextDay = await fx.doctor.shiftWithSlots(w.doctor, {
      ngay: '2026-11-11',
      ca: 'CaSang',
    });
    const nextWeek = await fx.doctor.shiftWithSlots(w.doctor, {
      ngay: '2026-11-17',
      ca: 'CaSang',
    });
    const afternoon = await fx.doctor.shiftWithSlots(w.doctor, {
      ngay: '2026-11-17',
      ca: 'CaChieu',
    });
    const lich = await w.book(0);

    const day = rescheduled(
      await w.service.reschedule(w.tuDoi(lich.maLichHen, nextDay.slotIds[0]!)),
    );
    const week = rescheduled(
      await w.service.reschedule(
        w.tuDoi(day.maLichHenMoi, nextWeek.slotIds[2]!),
      ),
    );
    const last = rescheduled(
      await w.service.reschedule(
        w.tuDoi(week.maLichHenMoi, afternoon.slotIds.at(-1)!),
      ),
    );

    expect(day.thoiGianMoi).toStrictEqual(
      new Date('2026-11-11T08:00:00+07:00'),
    );
    expect(week.thoiGianMoi).toStrictEqual(
      new Date('2026-11-17T09:00:00+07:00'),
    );
    expect(last.thoiGianMoi).toStrictEqual(
      new Date('2026-11-17T16:30:00+07:00'),
    );
    await w.expectSettled();
  });

  it('DLH-29 lịch của hồ sơ người thân: lịch mới cùng hồ sơ; hồ sơ đã ngừng ⇒ HO_SO_NGUOI_THAN_DA_NGUNG và không ghi gì', async () => {
    const w = await world();
    const active = await w.book(0, { hoSoNguoiThanId: w.relativeId });
    const stopped = await w.book(1, { hoSoNguoiThanId: w.stoppedRelativeId });

    const ok = rescheduled(
      await w.service.reschedule(w.tuDoi(active.maLichHen, 2)),
    );
    // Bộ đếm của cổng Fake là CỘNG DỒN: lần đổi thành công ở trên đã thông báo, nên đặt lại trước khi đo lần bị từ chối
    w.notifier.notifyCall.reset();
    w.waitlist.onSlotReleasedCall.reset();
    const before = await dataState(db);
    const statements = statementsOf();
    const refused = await w.service.reschedule(w.tuDoi(stopped.maLichHen, 3));

    expect(
      (await w.rowOf(await w.idOfCode(ok.maLichHenMoi))).hoSoNguoiThanId,
    ).toBe(w.relativeId);
    expect(refused).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'ProfileInactive' },
    });
    await expectNoEffect(w, before, statements);
  });
});

describe('DLH-03, HDL-09, HDL-22 chuỗi đổi lịch và trần', () => {
  it('DLH-03 đổi lần hai và ba: chuỗi 3 và 4 lịch, bộ đếm 1, 2, 3, PaymentChain truy đúng lịch gốc; mỗi lịch chỉ MỘT con', async () => {
    const w = await world({ config: { soLanTuDoiLichToiDa: 5 } });
    const root = await w.book(0);

    const second = rescheduled(
      await w.service.reschedule(w.tuDoi(root.maLichHen, 1)),
    );
    const third = rescheduled(
      await w.service.reschedule(w.tuDoi(second.maLichHenMoi, 2)),
    );
    const fourth = rescheduled(
      await w.service.reschedule(w.tuDoi(third.maLichHenMoi, 3)),
    );

    const ids = await Promise.all(
      [second, third, fourth].map((o) => w.idOfCode(o.maLichHenMoi)),
    );
    expect(
      await Promise.all(ids.map(async (id) => (await w.rowOf(id)).soLan)),
    ).toEqual([1, 2, 3]);
    expect(await new PaymentChain().rootOf(db.manager, ids[2]!)).toBe(
      root.lichHenId,
    );
    await w.expectSettled();
  });

  it('HDL-09 chuỗi 19 lịch rồi đổi ⇒ CHUOI_DOI_LICH_QUA_DAI trước khi PaymentChain ném; không ghi gì', async () => {
    const w = await world();
    const last = await buildRescheduleChain(db, fx, {
      doctor: w.doctor,
      patientId: w.patientId,
      khungGioId: w.slot(0),
      length: 19,
    });
    const before = await dataState(db);
    const statements = statementsOf();

    const outcome = await w.service.reschedule(w.tuDoi(last.maLichHen, 2));

    expect(outcome).toStrictEqual(
      rule(BOOKING_ERROR_CODES.RESCHEDULE_CHAIN_TOO_LONG),
    );
    await expectNoEffect(w, before, statements);
  });

  it('HDL-22 đổi hộ liên tiếp 18 lần (chuỗi 19 lịch): PaymentChain.rootOf đúng gốc ở MỌI độ dài, không ném; lần thứ 19 bị từ chối', async () => {
    const w = await world();
    const root = await w.book(0);
    const chain = new PaymentChain();
    let current = root.maLichHen;
    for (let step = 1; step <= 18; step += 1) {
      const outcome = rescheduled(
        await w.service.reschedule(w.doiHo(current, step % 2 === 1 ? 1 : 0)),
      );
      current = outcome.maLichHenMoi;
      expect(await chain.rootOf(db.manager, await w.idOfCode(current))).toBe(
        root.lichHenId,
      );
    }

    const refused = await w.service.reschedule(w.doiHo(current, 2));

    expect(refused).toStrictEqual(
      rule(BOOKING_ERROR_CODES.RESCHEDULE_CHAIN_TOO_LONG),
    );
    await w.expectSettled();
  });
});

describe('DLH-06, DLH-07, DLH-08, DLH-26, DLH-28, DLH-30, DLH-39 từ chối: đúng mã, không ghi gì', () => {
  it('DLH-06, HDL-10 (B1) (viii) khung giờ mới vừa có người khác đặt ⇒ KHUNG_GIO_DA_DAT; lịch cũ vẫn DaXacNhan, khung giờ cũ DaDat, không lịch mới', async () => {
    const w = await world();
    const lich = await w.book(0);
    const [other] = await fx.patients(1);
    await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor,
      khungGioId: w.slot(2),
      patientId: other!.account.taiKhoanId,
    });
    const before = await dataState(db);
    const statements = statementsOf();

    const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(outcome).toStrictEqual(rule(BOOKING_ERROR_CODES.SLOT_BOOKED));
    await expectNoEffect(w, before, statements);
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaXacNhan');
  });

  const REFUSALS: {
    name: string;
    code: string;
    setup: (w: RescheduleServiceWorld) => Promise<void> | void;
  }[] = [
    {
      name: 'chi nhánh nghỉ hôm đó',
      code: 'CHI_NHANH_NGHI',
      setup: async (w) => {
        await hours(
          w,
          'hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL',
        );
      },
    },
    {
      name: 'khung giờ vượt khoảng nhận khám (buổi sáng chỉ tới 08:30)',
      code: 'NGOAI_GIO_HOAT_DONG',
      setup: async (w) => {
        await hours(w, "gio_ket_thuc_sang = '08:30:00'");
      },
    },
    {
      name: 'ca không có khoảng (không có buổi sáng)',
      code: 'CA_KHONG_TON_TAI',
      setup: async (w) => {
        await hours(w, 'gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL');
      },
    },
    {
      name: 'khung giờ nằm vùng bị loại bởi thay đổi chi nhánh',
      code: 'KHUNG_GIO_NGOAI_LICH_MOI',
      setup: (w) => {
        w.pending.blocks();
      },
    },
    {
      name: 'bác sĩ có nghỉ phép đã duyệt',
      code: 'BAC_SI_NGHI_PHEP',
      setup: (w) => {
        w.leave.blocks({}, 'DaDuyet');
      },
    },
    {
      name: 'bác sĩ ngừng hoạt động',
      code: 'BAC_SI_KHONG_KHA_DUNG',
      setup: async (w) => {
        await db.query(
          "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
          [w.doctor.taiKhoanId],
        );
      },
    },
  ];
  const hours = (w: RescheduleServiceWorld, assignments: string) =>
    db.query(
      `UPDATE chi_nhanh_lich_hoat_dong SET ${assignments} WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?`,
      [w.doctor.chiNhanhId, THU_BA],
    );

  it.each(REFUSALS)(
    'DLH-07 $name ⇒ $code, không ghi gì',
    async ({ code, setup }) => {
      const w = await world();
      const lich = await w.book(0);
      await setup(w);
      const before = await dataState(db);
      const statements = statementsOf();

      const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 1));

      // `chiTiet` do bộ luật đặt lịch tự thêm (ví dụ `thuTrongTuan`): chỉ khẳng định đúng mã
      expect(outcome).toMatchObject(rule(code));
      await expectNoEffect(w, before, statements);
    },
  );

  it('DLH-07 không có dòng cấu hình ⇒ AppException 409 HE_THONG_CHUA_CAU_HINH ném ngay, chưa mở giao dịch nào', async () => {
    const w = await world();
    const lich = await w.book(0);
    await db.query('DELETE FROM cau_hinh_he_thong');
    const statements = statementsOf();

    const error = await w.service.reschedule(w.tuDoi(lich.maLichHen, 1)).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(statements.some((sql) => /^START TRANSACTION/i.test(sql))).toBe(
      false,
    );
  });

  it.each([
    'DaHuy',
    'ChoThanhToan',
    'DaTiepDon',
    'HoanThanh',
    'VangMat',
  ] as const)(
    'DLH-08 lịch %s ⇒ LICH_HEN_KHONG_CHO_DOI kèm trạng thái; không ghi gì',
    async (state) => {
      const w = await world();
      const lich = await fx.appointmentIn(state, {
        doctor: w.doctor,
        khungGioId: w.slot(0),
        patientId: w.patientId,
      });
      const before = await dataState(db);
      const statements = statementsOf();

      const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 1));

      expect(outcome).toStrictEqual(
        rule(BOOKING_ERROR_CODES.NOT_RESCHEDULABLE, { trangThai: state }),
      );
      await expectNoEffect(w, before, statements);
    },
  );

  it('DLH-08 lịch DaDoiLich: Bệnh nhân ⇒ NotFound (cùng thân, Q31); Lễ tân đổi hộ ⇒ LICH_HEN_KHONG_CHO_DOI', async () => {
    const w = await world();
    const lich = await fx.appointmentIn('DaDoiLich', {
      doctor: w.doctor,
      khungGioId: w.slot(0),
      patientId: w.patientId,
    });

    const patient = await w.service.reschedule(w.tuDoi(lich.maLichHen, 1));
    const staff = await w.service.reschedule(w.doiHo(lich.maLichHen, 1));

    expect(patient).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'NotFound' },
    });
    expect(staff).toStrictEqual(
      rule(BOOKING_ERROR_CODES.NOT_RESCHEDULABLE, { trangThai: 'DaDoiLich' }),
    );
  });

  it('DLH-08 lịch bị huỷ GIỮA lúc đọc thường và lúc khoá ⇒ kiểm lại dưới khoá, LICH_HEN_KHONG_CHO_DOI trạng thái DaHuy, không lịch mới', async () => {
    const w = await world();
    const lich = await w.book(0);
    let injected = false;
    interceptStatements(db, async (call, run) => {
      // Ngay TRƯỚC câu khoá `benh_nhan` đầu tiên của giao dịch: một kết nối khác huỷ lịch
      if (!injected && /FROM benh_nhan\b[\s\S]*FOR UPDATE/i.test(call.sql)) {
        injected = true;
        await db.query(
          "UPDATE lich_hen SET trang_thai = 'DaHuy' WHERE lich_hen_id = ?",
          [lich.lichHenId],
        );
      }
      return run();
    });

    const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 1));

    expect(injected).toBe(true);
    expect(outcome).toStrictEqual(
      rule(BOOKING_ERROR_CODES.NOT_RESCHEDULABLE, { trangThai: 'DaHuy' }),
    );
    expect(await w.countRows('lich_hen')).toBe(1);
  });

  it('DLH-26 TuDoi: quá hạn ĐÚNG giờ hẹn cũ (nửa mở, Q3) và đổi được 1 giây trước; khi đổi được thì mời danh sách chờ (giờ cũ > now)', async () => {
    const w = await world();
    const lich = await w.book(0);

    vi.setSystemTime(GIO('08:00'));
    const tooLate = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));
    vi.setSystemTime(GIO('07:59:59'));
    const justInTime = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(tooLate).toStrictEqual(
      rule(BOOKING_ERROR_CODES.RESCHEDULE_TOO_LATE),
    );
    expect(justInTime.kind).toBe('Rescheduled');
    expect(w.waitlist.releasedSlotIds).toEqual([w.slot(0)]);
  });

  it('DLH-26 đổi hộ: tới giờ hẹn + check_in_sau_phut (15) KHÔNG tính (08:45 với lịch 08:30 ⇒ quá giờ); trong khoảng đó (08:44:59) đổi được nhưng KHÔNG mời danh sách chờ vì giờ cũ ≤ now', async () => {
    const w = await world();
    const lich = await w.book(1);

    vi.setSystemTime(GIO('08:45'));
    const tooLate = await w.service.reschedule(w.doiHo(lich.maLichHen, 3));
    vi.setSystemTime(GIO('08:44:59'));
    const grace = await w.service.reschedule(w.doiHo(lich.maLichHen, 3));

    expect(tooLate).toStrictEqual(
      rule(BOOKING_ERROR_CODES.RESCHEDULE_TOO_LATE),
    );
    expect(grace.kind).toBe('Rescheduled');
    expect(w.waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('DLH-28 khung giờ NGUỒN thuộc vùng bị loại vẫn đổi RA được; khung giờ ĐÍCH bị loại thì từ chối (PLAN 5.5 bước 3)', async () => {
    const w = await world();
    const lich = await w.book(0);
    w.pending.blocks({ ngayGio: GIO('08:00') });

    const out = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(out.kind).toBe('Rescheduled');
    const second = await w.book(1);
    w.pending.blocks({ ngayGio: GIO('10:00') });
    const into = await w.service.reschedule(w.tuDoi(second.maLichHen, 4));
    expect(into).toStrictEqual(
      rule(BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE),
    );
  });

  it('DLH-30, HDL-10 (B1) (iv) hết hạn lười khung giờ mới: lịch ChoThanhToan QUÁ HẠN bị DaHuy đúng một lần rồi đổi được; chưa quá hạn ⇒ KHUNG_GIO_DANG_GIU và không ghi gì', async () => {
    const w = await world();
    const lich = await w.book(0);
    const [other] = await fx.patients(1);
    const holder = await fx.appointmentIn('ChoThanhToan', {
      doctor: w.doctor,
      khungGioId: w.slot(2),
      patientId: other!.account.taiKhoanId,
    });
    vi.setSystemTime(new Date('2026-11-02T08:05:00+07:00'));
    const before = await dataState(db);
    const statements = statementsOf();

    const held = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(held).toStrictEqual(rule(BOOKING_ERROR_CODES.SLOT_HELD));
    await expectNoEffect(w, before, statements);

    vi.setSystemTime(new Date('2026-11-02T09:00:00+07:00'));
    const free = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(free.kind).toBe('Rescheduled');
    expect((await w.rowOf(holder.lichHenId)).trangThai).toBe('DaHuy');
    await w.expectSlot(2, 'DaDat');
    await w.expectSettled();
  });

  it('DLH-39 đã đủ số lịch tối đa của hồ sơ: đổi vẫn được vì lịch đang đổi KHÔNG tính vào số lịch (thayThe)', async () => {
    const w = await world();
    const lich = await w.book(0);
    await w.book(4);
    await w.book(5);

    const out = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(out.kind).toBe('Rescheduled');
    await w.expectSettled();
  });
});

describe('DLH-24 OverQuota: chọn nhánh ở lần đọc thường, không khoá, không ghi', () => {
  it('hết lần: OverQuota đúng hai số và KHÔNG có câu khoá hay ghi nào, không mở giao dịch', async () => {
    const w = await world();
    const lich = await w.book(0, { soLan: 2 });
    const before = await dataState(db);
    const statements = statementsOf();

    const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(outcome).toStrictEqual({
      kind: 'OverQuota',
      soLanDaDoi: 2,
      toiDa: 2,
    });
    expect(statements.filter(isLockingStatement)).toEqual([]);
    expect(statements.some((sql) => /^START TRANSACTION/i.test(sql))).toBe(
      false,
    );
    await expectNoEffect(w, before, statements);
  });

  it.each([
    [0, 0, 'OverQuota'],
    [0, 1, 'Rescheduled'],
    [1, 1, 'OverQuota'],
    [1, 2, 'Rescheduled'],
    [2, 2, 'OverQuota'],
    [3, 2, 'OverQuota'],
  ])('biên: đã đổi %i lần, tối đa %i ⇒ %s', async (soLan, toiDa, expected) => {
    const w = await world({ config: { soLanTuDoiLichToiDa: toiDa } });
    const lich = await w.book(0, { soLan });

    const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(outcome.kind).toBe(expected);
  });

  it('hết lần nhưng lịch đã huỷ ⇒ không nói "hết lần": LICH_HEN_KHONG_CHO_DOI (trạng thái đứng trước hạn mức, PLAN 5.6)', async () => {
    const w = await world();
    const lich = await fx.appointmentIn('DaHuy', {
      doctor: w.doctor,
      khungGioId: w.slot(0),
      patientId: w.patientId,
    });
    await db.query(
      'UPDATE lich_hen SET so_lan_tu_doi_lich = 2 WHERE lich_hen_id = ?',
      [lich.lichHenId],
    );

    const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 1));

    expect(outcome).toStrictEqual(
      rule(BOOKING_ERROR_CODES.NOT_RESCHEDULABLE, { trangThai: 'DaHuy' }),
    );
  });

  it('hết lần nhưng lịch đã QUÁ GIỜ ⇒ LICH_HEN_DA_QUA_GIO (hạn giờ đứng trước hạn mức); còn đúng 1 giây trước giờ hẹn thì mới OverQuota', async () => {
    const w = await world();
    const lich = await w.book(0, { soLan: 2 });

    vi.setSystemTime(GIO('08:00'));
    const late = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));
    vi.setSystemTime(GIO('07:59:59'));
    const early = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(late).toStrictEqual(rule(BOOKING_ERROR_CODES.RESCHEDULE_TOO_LATE));
    expect(early).toStrictEqual({
      kind: 'OverQuota',
      soLanDaDoi: 2,
      toiDa: 2,
    });
  });
});

describe('DLH-12, HDL-18, DLH-32 hoàn tác trọn khi lỗi SAU lần chèn', () => {
  const STEPS: [string, RegExp][] = [
    ['insert lich_hen', /^INSERT INTO lich_hen\b/],
    ['hold khung giờ mới', /^UPDATE khung_gio SET trang_thai = 'DangGiuCho'/],
    ['markBooked khung giờ mới', /^UPDATE khung_gio SET trang_thai = 'DaDat'/],
    ['release khung giờ cũ', /^UPDATE khung_gio SET trang_thai = 'ConTrong'/],
    ['markReplaced', /^UPDATE lich_hen SET trang_thai = 'DaDoiLich'/],
  ];

  async function expectRolledBack(
    w: RescheduleServiceWorld,
    oldId: string,
    before: unknown,
  ) {
    expect(await dataState(db)).toEqual(before);
    expect((await w.rowOf(oldId)).trangThai).toBe('DaXacNhan');
    await w.expectSlot(0, 'DaDat');
    await w.expectSlot(2, 'ConTrong');
    expect(w.waitlist.onSlotReleasedCall.count).toBe(0);
    await w.expectSettled();
  }

  it.each(STEPS)(
    'DLH-12, HDL-10 (B1) (vi) lỗi SAU câu "%s" ⇒ lỗi đi ra, hoàn tác trọn: lịch cũ DaXacNhan, khung giờ cũ DaDat, mới ConTrong, không lịch mồ côi; INV',
    async (name, pattern) => {
      const w = await world();
      const lich = await w.book(0);
      const before = await dataState(db);
      failAfterStatement(db, pattern, new Error(`hoàn tác giả sau ${name}`));

      await expect(
        w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
      ).rejects.toThrow(`hoàn tác giả sau ${name}`);

      await expectRolledBack(w, lich.lichHenId, before);
    },
  );

  it('DLH-12 thông báo ném ⇒ hoàn tác trọn', async () => {
    const w = await world();
    const lich = await w.book(0);
    const before = await dataState(db);
    w.notifier.notifyCall.throwsOnce(new Error('ghi thông báo lỗi'));

    await expect(
      w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
    ).rejects.toThrow('ghi thông báo lỗi');

    await expectRolledBack(w, lich.lichHenId, before);
  });

  it('HDL-18 afterWrite (Audit, UPDATE yêu cầu của B7, B9) ném ⇒ hoàn tác trọn, lỗi không bị nuốt', async () => {
    const w = await world();
    const lich = await w.book(0);
    const before = await dataState(db);

    await expect(
      w.service.reschedule(
        w.doiHo(lich.maLichHen, 2, {
          afterWrite: () => Promise.reject(new Error('ghi audit lỗi')),
        }),
      ),
    ).rejects.toThrow('ghi audit lỗi');

    await expectRolledBack(w, lich.lichHenId, before);
    expect(w.notifier.notifyCall.count).toBe(0);
  });

  it('DLH-32 dữ liệu lệch: khung giờ mới ghi ConTrong mà đã có lịch đang hoạt động giữ nó ⇒ 1062 khung_gio_dang_giu ⇒ KHUNG_GIO_DA_DAT, hoàn tác trọn, không 500', async () => {
    const w = await world();
    const lich = await w.book(0);
    const [other] = await fx.patients(1);
    await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor,
      khungGioId: w.slot(2),
      patientId: other!.account.taiKhoanId,
    });
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'ConTrong' WHERE khung_gio_id = ?",
      [w.slot(2)],
    );
    const before = await dataState(db);

    const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(outcome).toStrictEqual(rule(BOOKING_ERROR_CODES.SLOT_BOOKED));
    expect(await dataState(db)).toEqual(before);
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaXacNhan');
  });

  it('DLH-32, HDL-08, HDL-10 (B1) (vii) dữ liệu lệch: lịch cũ ĐÃ có lịch con mà vẫn DaXacNhan ⇒ 1062 lich_hen_truoc_id ⇒ Bệnh nhân NotFound, Lễ tân LICH_HEN_KHONG_CHO_DOI (DaDoiLich); không 500, hoàn tác trọn', async () => {
    const w = await world();
    const lich = await w.book(0);
    await db.transaction('READ COMMITTED', (em) =>
      insertLichHen(em, {
        maLichHen: nextAppointmentCode(),
        khungGioId: w.slot(5),
        benhNhanId: w.patientId,
        hoSoNguoiThanId: null,
        bacSiId: w.doctor.taiKhoanId,
        chiNhanhId: w.doctor.chiNhanhId,
        dichVuKhamId: w.doctor.dichVuKhamId,
        thoiGian: GIO('10:30'),
        giaSnapshot: '200000.00',
        tienCocSnapshot: '50000.00',
        chinhSachHoanSnapshot: null,
        trangThai: 'DaXacNhan',
        hanThanhToan: null,
        lyDoKham: null,
        thoiDiemTao: new Date('2026-11-02T08:00:00+07:00'),
        lichHenTruocId: lich.lichHenId,
      }),
    );
    const before = await dataState(db);

    // `resolves`: một lỗi ném thô (500) phải thành khẳng định đỏ "promise rejected", không phải lỗi của chính ca
    await expect(
      w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
    ).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'NotFound' },
    });
    await expect(
      w.service.reschedule(w.doiHo(lich.maLichHen, 2)),
    ).resolves.toStrictEqual(
      rule(BOOKING_ERROR_CODES.NOT_RESCHEDULABLE, { trangThai: 'DaDoiLich' }),
    );
    expect(await dataState(db)).toEqual(before);
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaXacNhan');
  });

  it('HDL-08 lịch mới có lich_hen_truoc_id KHÁC chính id của nó (quy tắc DB 27) và INV-9 không vòng', async () => {
    const w = await world();
    const lich = await w.book(0);

    const out = rescheduled(
      await w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
    );

    const newId = await w.idOfCode(out.maLichHenMoi);
    const child = await w.rowOf(newId);
    expect(child.truoc).toBe(lich.lichHenId);
    expect(child.truoc).not.toBe(newId);
    await w.expectSettled();
  });
});

describe('DLH-13, DLH-14, DLH-35, DLH-36 onSlotReleased sau commit', () => {
  it('DLH-13 đúng MỘT lần với khung giờ CŨ, SAU commit (kết nối khác đã thấy lịch mới và lịch cũ DaDoiLich), giờ cũ > now', async () => {
    const w = await world();
    const lich = await w.book(0);
    let seen: { cu: string; moi: number } | null = null;
    w.waitlist.onSlotReleasedCall.onCall(async () => {
      const cu: { trangThai: string }[] = await db.query(
        'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
        [lich.lichHenId],
      );
      const moi: { n: number | string }[] = await db.query(
        'SELECT COUNT(*) AS n FROM lich_hen WHERE lich_hen_truoc_id = ?',
        [lich.lichHenId],
      );
      seen = { cu: cu[0]!.trangThai, moi: Number(moi[0]!.n) };
    });

    rescheduled(await w.service.reschedule(w.tuDoi(lich.maLichHen, 2)));

    expect(w.waitlist.releasedSlotIds).toEqual([w.slot(0)]);
    expect(seen).toEqual({ cu: 'DaDoiLich', moi: 1 });
  });

  it('DLH-35 KHÔNG gọi khi bị từ chối, khi hết lần (OverQuota), khi hoàn tác', async () => {
    const w = await world();
    const full = await w.book(0, { soLan: 2 });
    const huy = await fx.appointmentIn('DaHuy', {
      doctor: w.doctor,
      khungGioId: w.slot(1),
      patientId: w.patientId,
    });
    const rolled = await w.book(4);

    await w.service.reschedule(w.tuDoi(full.maLichHen, 2));
    await w.service.reschedule(w.tuDoi(huy.maLichHen, 2));
    failAfterStatement(
      db,
      /^UPDATE lich_hen SET trang_thai = 'DaDoiLich'/,
      new Error('hoàn tác giả'),
    );
    await expect(
      w.service.reschedule(w.tuDoi(rolled.maLichHen, 5)),
    ).rejects.toThrow('hoàn tác giả');

    expect(w.waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('DLH-36 cổng ném ⇒ vẫn Rescheduled; log CHỈ có id nội bộ và TÊN lớp lỗi', async () => {
    const w = await world();
    const lich = await w.book(0);
    w.waitlist.onSlotReleasedCall.throwsOnce(
      new TypeError('chi tiết riêng tư Nguyễn Văn A'),
    );

    const outcome = await w.service.reschedule(w.tuDoi(lich.maLichHen, 2));

    expect(outcome.kind).toBe('Rescheduled');
    const lines = logs.filter((line) => line.includes('danh sách chờ'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(w.slot(0));
    expect(lines[0]).toContain('TypeError');
    expect(lines[0]).not.toContain('Nguyễn');
    expect(lines[0]).not.toContain(lich.maLichHen);
  });

  it('DLH-14 bản Noop THẬT: đổi lịch chạy đủ, cảnh báo log đúng MỘT lần dù đổi hai lịch', async () => {
    const w = await world({ waitlist: new NoopWaitlistPort() });
    const a = await w.book(0);
    const b = await w.book(1);

    rescheduled(await w.service.reschedule(w.tuDoi(a.maLichHen, 2)));
    rescheduled(await w.service.reschedule(w.tuDoi(b.maLichHen, 3)));

    expect(
      logs.filter((line) => line.includes('WaitlistPort đang dùng bản Noop')),
    ).toHaveLength(1);
    await w.expectSettled();
  });
});

describe('DLH-18, DLH-37 thông báo THẬT (BookingNotifier) đúng hợp đồng B3', () => {
  it('DLH-18 tự đổi: MỘT thong_bao LichHenDaDoiLich (lich_hen_id = lịch MỚI) và MỘT email ChoGui cho tài khoản đặt; nội dung có mã mới, ≤ 500, không lý do khám', async () => {
    const w = await world({ notifier: new BookingNotifier() });
    const lich = await w.book(0, { lyDoKham: MARKER_LY_DO_KHAM });

    const out = rescheduled(
      await w.service.reschedule(w.tuDoi(lich.maLichHen, 2)),
    );

    const rows = await readRescheduleRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      loai: RESCHEDULE_NOTIFICATION_EVENTS.RESCHEDULED,
      taiKhoanId: w.patientId,
      lichHenId: await w.idOfCode(out.maLichHenMoi),
      yeuCauId: null,
      emailTrangThai: 'ChoGui',
    });
    expect(rows[0]!.noiDung).toContain(out.maLichHenMoi);
    expect(rows[0]!.noiDung).toContain(lich.maLichHen);
    expect(rows[0]!.noiDung.length).toBeLessThanOrEqual(500);
    expect(rows[0]!.noiDung).not.toContain(MARKER_LY_DO_KHAM);
  });

  it('DLH-37 đổi hộ: người nhận là tài khoản ĐẶT (không phải Lễ tân), nội dung có lý do của Lễ tân', async () => {
    const w = await world({ notifier: new BookingNotifier() });
    const lich = await w.book(0);

    rescheduled(
      await w.service.reschedule(
        w.doiHo(lich.maLichHen, 2, { lyDo: 'Bác sĩ xin dời ca' }),
      ),
    );

    const rows = await readRescheduleRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.taiKhoanId).toBe(w.patientId);
    expect(rows[0]!.taiKhoanId).not.toBe(w.receptionist.account.taiKhoanId);
    expect(rows[0]!.noiDung).toContain('Bác sĩ xin dời ca');
  });

  it('DLH-37 duyệt: CHỈ YeuCauDoiLichDaDuyet gắn yêu cầu (lich_hen_id NULL), không LichHenDaDoiLich; có mã lịch mới và ghi chú', async () => {
    const w = await world({ notifier: new BookingNotifier() });
    const lich = await w.book(0);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: lich.lichHenId,
      khungGioMongMuonId: w.slot(2),
    });

    const out = rescheduled(
      await w.service.reschedule(
        w.duyet(lich.maLichHen, 2, yeuCauId, { ghiChu: 'Đã sắp xếp lại ca' }),
      ),
    );

    const rows = await readRescheduleRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      loai: RESCHEDULE_NOTIFICATION_EVENTS.REQUEST_APPROVED,
      taiKhoanId: w.patientId,
      lichHenId: null,
      yeuCauId,
      emailTrangThai: 'ChoGui',
    });
    expect(rows[0]!.noiDung).toContain(out.maLichHenMoi);
    expect(rows[0]!.noiDung).toContain('Đã sắp xếp lại ca');
  });
});

describe('HDL-05, HDL-07 cổng thay đổi chi nhánh và nghỉ phép: một lần, khung giờ ĐÍCH, dưới khoá, bằng em của giao dịch', () => {
  it('HDL-05 findBlocking gọi đúng MỘT lần với khung giờ ĐÍCH (giờ, ca, chi nhánh, dịch vụ), trong giao dịch, SAU khoá bac_si và khung_gio, TRƯỚC mọi ghi; HDL-07 cổng nghỉ phép: ngày và ca của khung giờ đích', async () => {
    const w = await world();
    const lich = await w.book(0);
    const order: string[] = [];
    interceptStatements(db, (call, run) => {
      order.push(call.sql);
      return run();
    });
    const inTx: boolean[] = [];
    w.pending.findBlockingCall.onCall((em) => {
      inTx.push(em.queryRunner?.isTransactionActive === true);
      order.push('findBlocking');
    });
    w.leave.findBlockingLeaveCall.onCall((em) => {
      inTx.push(em.queryRunner?.isTransactionActive === true);
      order.push('findBlockingLeave');
    });

    rescheduled(await w.service.reschedule(w.tuDoi(lich.maLichHen, 2)));

    expect(w.pending.findBlockingCall.count).toBe(1);
    const [, pendingInput] = w.pending.findBlockingCall.calls[0]!;
    expect(pendingInput).toEqual({
      chiNhanhId: w.doctor.chiNhanhId,
      ngayGio: GIO('09:00'),
      thoiLuongPhut: 30,
      dichVuKhamId: w.doctor.dichVuKhamId,
      ca: w.shift.ca,
    });
    expect(w.leave.findBlockingLeaveCall.count).toBe(1);
    const [, leaveInput] = w.leave.findBlockingLeaveCall.calls[0]!;
    expect(leaveInput).toEqual({
      bacSiId: w.doctor.taiKhoanId,
      ngay: '2026-11-10',
      ca: w.shift.ca,
    });
    expect(inTx).toEqual([true, true]);
    // "Dưới khoá": cả hai cổng đứng SAU câu khoá `bac_si` (FOR SHARE) và `khung_gio` (FOR UPDATE), TRƯỚC mọi ghi
    const at = order.indexOf('findBlocking');
    const atLeave = order.indexOf('findBlockingLeave');
    const lockedDoctor = order.findIndex((sql) =>
      /FROM bac_si\b[\s\S]*FOR SHARE/i.test(sql),
    );
    const lockedSlot = order.findLastIndex(
      (sql, index) =>
        index < at && /FROM khung_gio\b[\s\S]*FOR UPDATE/i.test(sql),
    );
    const firstInsert = order.findIndex((sql) =>
      /^INSERT INTO lich_hen\b/.test(sql),
    );
    expect(lockedDoctor).toBeGreaterThan(-1);
    expect(lockedSlot).toBeGreaterThan(lockedDoctor);
    expect(at).toBeGreaterThan(lockedSlot);
    expect(atLeave).toBeGreaterThan(lockedDoctor);
    expect(Math.max(at, atLeave)).toBeLessThan(firstInsert);
  });
});

describe('HDL-17, HDL-20, HDL-21, HDL-24, HDL-10 điểm cắm, duyệt và phạm vi', () => {
  it('HDL-17 afterWrite chạy TRONG giao dịch (thấy lịch mới chưa commit, lịch cũ đã DaDoiLich), TRƯỚC thông báo, nhận `written` đủ id, mã, giờ, chi nhánh; tự đổi không có điểm cắm', async () => {
    const w = await world();
    const lich = await w.book(0);
    let report: unknown = null;
    const outcome = rescheduled(
      await w.service.reschedule(
        w.doiHo(lich.maLichHen, 2, {
          afterWrite: async (em, written) => {
            const rows: { moi: number | string; cu: string }[] = await em.query(
              `SELECT (SELECT COUNT(*) FROM lich_hen WHERE ma_lich_hen = ?) AS moi,
                      (SELECT trang_thai FROM lich_hen WHERE lich_hen_id = ?) AS cu`,
              [written.maLichHenMoi, written.lichHenCuId],
            );
            report = {
              active: em.queryRunner?.isTransactionActive,
              moi: Number(rows[0]!.moi),
              cu: rows[0]!.cu,
              notifyBefore: w.notifier.notifyCall.count,
              written,
            };
            await Promise.resolve();
          },
        }),
      ),
    );

    expect(report).toEqual({
      active: true,
      moi: 1,
      cu: 'DaDoiLich',
      notifyBefore: 0,
      written: {
        lichHenCuId: lich.lichHenId,
        lichHenMoiId: await w.idOfCode(outcome.maLichHenMoi),
        maLichHenCu: lich.maLichHen,
        maLichHenMoi: outcome.maLichHenMoi,
        khungGioCuId: w.slot(0),
        khungGioMoiId: w.slot(2),
        chiNhanhId: w.doctor.chiNhanhId,
        thoiGianCu: GIO('08:00'),
        thoiGianMoi: GIO('09:00'),
      },
    });
    expect(w.notifier.notifyCall.count).toBe(1);
  });

  it('HDL-20 duyệt: yêu cầu đã xử lý ⇒ RequestHandled; yêu cầu của lịch khác hoặc không có ⇒ RequestNotFound; không ghi, yêu cầu giữ nguyên', async () => {
    const w = await world();
    const a = await w.book(0);
    const b = await w.book(1);
    const handled = await insertRescheduleRequest(db, {
      lichHenId: a.lichHenId,
      khungGioMongMuonId: w.slot(2),
      trangThai: 'DaDuyet',
      nguoiXuLyId: w.receptionist.account.taiKhoanId,
    });
    const ofOther = await insertRescheduleRequest(db, {
      lichHenId: b.lichHenId,
      khungGioMongMuonId: w.slot(3),
    });
    const before = await dataState(db);
    const statements = statementsOf();

    const done = await w.service.reschedule(w.duyet(a.maLichHen, 2, handled));
    const wrong = await w.service.reschedule(w.duyet(a.maLichHen, 2, ofOther));
    const absent = await w.service.reschedule(
      w.duyet(a.maLichHen, 2, '987654'),
    );

    expect(done).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'RequestHandled' },
    });
    expect(wrong).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'RequestNotFound' },
    });
    expect(absent).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'RequestNotFound' },
    });
    await expectNoEffect(w, before, statements);
    const states: { trangThai: string }[] = await db.query(
      'SELECT trang_thai AS trangThai FROM yeu_cau_doi_lich_ngoai_chinh_sach ORDER BY yeu_cau_doi_lich_ngoai_chinh_sach_id',
    );
    expect(states.map((row) => row.trangThai)).toEqual(['DaDuyet', 'ChoDuyet']);
  });

  it('HDL-21 duyệt chọn khung giờ THAY THẾ: sự kiện mang giờ MONG MUỐN (khung giờ yêu cầu) khác giờ MỚI (khung giờ đích); khung giờ mong muốn không bị giữ', async () => {
    const w = await world();
    const lich = await w.book(0);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: lich.lichHenId,
      khungGioMongMuonId: w.slot(3),
    });

    const out = rescheduled(
      await w.service.reschedule(w.duyet(lich.maLichHen, 2, yeuCauId)),
    );

    expect(w.notifier.events).toHaveLength(1);
    expect(w.notifier.events[0]).toMatchObject({
      loaiSuKien: RESCHEDULE_NOTIFICATION_EVENTS.REQUEST_APPROVED,
      lichHenId: lich.lichHenId,
      taiKhoanId: w.patientId,
      yeuCau: {
        yeuCauId,
        maLichHenMoi: out.maLichHenMoi,
        thoiGianMongMuon: GIO('09:30'),
        thoiGianMoi: GIO('09:00'),
      },
    });
    await w.expectSlot(2, 'DaDat');
    await w.expectSlot(3, 'ConTrong');
  });

  it('HDL-24 phạm vi: Bệnh nhân khác, Lễ tân và duyệt ở chi nhánh khác ⇒ NotFound (không rò), không ghi gì; duyệt Toàn hệ thống (chiNhanhId null) thấy mọi lịch', async () => {
    const w = await world();
    const lich = await w.book(0);
    const [other] = await fx.patients(1);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: lich.lichHenId,
      khungGioMongMuonId: w.slot(2),
    });
    const before = await dataState(db);
    const statements = statementsOf();

    const results = [
      await w.service.reschedule(
        w.tuDoi(lich.maLichHen, 2, other!.account.taiKhoanId),
      ),
      await w.service.reschedule(
        w.doiHo(lich.maLichHen, 2, { chiNhanhId: '987654' }),
      ),
      await w.service.reschedule(
        w.duyet(lich.maLichHen, 2, yeuCauId, { chiNhanhId: '987654' }),
      ),
    ];

    for (const result of results)
      expect(result).toStrictEqual({
        kind: 'Rejected',
        failure: { kind: 'NotFound' },
      });
    await expectNoEffect(w, before, statements);
    const all = await w.service.reschedule(
      w.duyet(lich.maLichHen, 2, yeuCauId, { chiNhanhId: null }),
    );
    expect(all.kind).toBe('Rescheduled');
  });
});

describe('HDL-10 (B4), HDL-23 giao dịch và thân chạy lại', () => {
  it('HDL-10 đúng MỘT giao dịch; chuỗi khoá không vi phạm thứ tự; mọi INSERT và UPDATE đứng SAU khoá cuối; đúng bảy câu ghi theo thứ tự (thông báo thật)', async () => {
    const w = await world({ notifier: new BookingNotifier() });
    const lich = await w.book(0);
    const calls: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      calls.push(call);
      return run();
    });

    rescheduled(await w.service.reschedule(w.tuDoi(lich.maLichHen, 2)));

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
      'INSERT INTO thong_bao',
      'INSERT INTO email_thong_bao',
    ]);
    const lastLock = body.findLastIndex(isLockingStatement);
    const firstWrite = body.findIndex((sql) =>
      /^\s*(INSERT|UPDATE)\b/i.test(sql),
    );
    expect(firstWrite).toBeGreaterThan(lastLock);
    expect(findLockOrderViolation(lockedTablesOfDistinct(calls))).toBeNull();
  });

  it('HDL-23 deadlock giả (1213) SAU thông báo: thân chạy LẠI, `afterWrite` chạy lại, kết quả cuối đúng MỘT lịch mới, một lần onSlotReleased, một lần thử lại được ghi', async () => {
    const w = await world();
    const lich = await w.book(0);
    let afterWriteRuns = 0;
    w.notifier.notifyCall.throwsOnce(deadlockError());

    const out = rescheduled(
      await w.service.reschedule(
        w.doiHo(lich.maLichHen, 2, {
          afterWrite: () => {
            afterWriteRuns += 1;
            return Promise.resolve();
          },
        }),
      ),
    );

    expect(afterWriteRuns).toBe(2);
    expect(w.notifier.notifyCall.count).toBe(2);
    expect(w.waitlist.onSlotReleasedCall.count).toBe(1);
    expect(await w.countRows('lich_hen')).toBe(2);
    expect((await w.rowOf(await w.idOfCode(out.maLichHenMoi))).truoc).toBe(
      lich.lichHenId,
    );
    expect(retryStats(logs).retries['reschedule-appointment MySQL 1213']).toBe(
      1,
    );
    await w.expectSettled();
  });
});
