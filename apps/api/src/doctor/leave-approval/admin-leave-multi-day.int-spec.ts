import type { DataSource } from 'typeorm';
import { LEAVE_CANCEL_REASON } from '../../appointments/appointments.constants.js';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import { DEPOSIT } from '../../appointments/testing/cancel-world.js';
import {
  firstTableOf,
  isLockingStatement,
} from '../../appointments/testing/query-spy.js';
import { recordStatements } from '../../appointments/testing/statement-recorder.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import {
  appointmentRow as appointmentRowOf,
  countRows,
  createLeaveServices,
  leaveSetup,
  requestRow as requestRowOf,
  SYSTEM,
} from '../testing/leave-approval-world.js';
import { AdminLeaveService } from './admin-leave.service.js';
import { AdminLeaveRepository } from './admin-leave.repository.js';
import type { AppointmentCancellationPort } from './appointment-cancellation.port.js';

// Doctor UX7 (issue #582) — yêu cầu nghỉ THEO CA kéo dài nhiều ngày, trên MySQL 8.4 THẬT với booking THẬT (`findAffectedByLeave`, `listAffectedByLeave`, `countActiveByShifts`, `cancel`):
// DUX7-27 (đếm lịch hẹn theo từng (ngày, ca), số câu SQL gửi sang booking), DUX7-28 (duyệt huỷ ĐÚNG ca ở mọi ngày), DUX7-29 (hoàn cọc đúng lịch), DUX7-30 (từ chối, nhật ký, thông báo),
// DUX7-31 (thử lại và sweeper), DUX7-34 (thứ tự khoá không đổi). Cổng giữa `doctor` và `booking` KHÔNG đổi: mọi ca dưới đây dùng đúng `BookingCancellationAdapter` của bản thật.
// Đồng hồ giả của `useIntegrationHooks`: T0 = 08:00 ngày 02/11/2026 (giờ VN). Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const T0 = new Date('2026-11-02T08:00:00+07:00');
const FROM = '2026-11-10';
const TO = '2026-11-12';
const count = (sql: string) => countRows(db, sql);
const requestRow = (id: string) => requestRowOf(db, id);
const appointmentRow = (id: string) => appointmentRowOf(db, id);

/**
 * Bác sĩ có ca sáng (khung giờ số 0 đến 7 của `cancelWorld`) và ca chiều ở CẢ BA ngày 10, 11, 12/11/2026, cộng ca sáng ngày 13/11 (NGOÀI khoảng).
 * Mỗi ca có một lịch hẹn `DaXacNhan` ở khung giờ đầu tiên; `booked[ngày][ca]` là lịch đó.
 */
async function multiDayWorld() {
  const base = await leaveSetup(db, fx);
  const { w } = base;
  const doctor = w.doctor.profile;
  const book = (
    khungGioId: string,
    state: 'DaXacNhan' | 'ChoThanhToan' | 'DaTiepDon' = 'DaXacNhan',
    tienCocSnapshot?: string,
  ) =>
    fx.appointmentIn(state, {
      doctor,
      khungGioId,
      patientId: w.patientId,
      ...(tienCocSnapshot === undefined ? {} : { tienCocSnapshot }),
    });
  const slotsOf = async (ngay: string, ca: 'CaSang' | 'CaChieu') =>
    (await fx.doctor.shiftWithSlots(doctor, { ngay, ca })).slotIds;
  const shiftIdOf = async (ngay: string, ca: 'CaSang' | 'CaChieu') =>
    String(
      (
        await db.query(
          `SELECT lich_lam_viec_id AS id FROM lich_lam_viec WHERE bac_si_id = ? AND ngay = ? AND ca = ?`,
          [base.doctorId, ngay, ca],
        )
      )[0].id,
    );

  // 10/11 sáng đã có (slot 0 đến 7 của `cancelWorld`); thêm các ca còn lại
  const afternoon10 = await slotsOf('2026-11-10', 'CaChieu');
  const morning11 = await slotsOf('2026-11-11', 'CaSang');
  const afternoon11 = await slotsOf('2026-11-11', 'CaChieu');
  const morning12 = await slotsOf('2026-11-12', 'CaSang');
  const afternoon12 = await slotsOf('2026-11-12', 'CaChieu');
  const morning13 = await slotsOf('2026-11-13', 'CaSang');
  const first = (ids: string[]) => ids[0] as string;
  return {
    ...base,
    book,
    shiftIdOf,
    slots: { morning11, morning12 },
    first,
    booked: {
      m10: await w.booked('DaXacNhan', 0),
      a10: await book(first(afternoon10)),
      m11: await book(first(morning11)),
      a11: await book(first(afternoon11)),
      m12: await book(first(morning12)),
      a12: await book(first(afternoon12)),
      m13: await book(first(morning13)),
    },
  };
}

const morningRequest = (
  leave: (input: {
    batDau?: string;
    ketThuc?: string;
    ca?: 'CaSang' | 'CaChieu';
  }) => Promise<string>,
  ca: 'CaSang' | 'CaChieu' = 'CaSang',
) => leave({ ca, batDau: FROM, ketThuc: TO });

describe('DUX7 — nghỉ theo ca nhiều ngày: booking THẬT, MySQL thật', () => {
  it('DUX7-27 đếm lịch hẹn theo từng (ngày, ca): lịch ở ca KHÁC cùng ngày và lịch ngoài khoảng KHÔNG được tính; một lần gọi sang booking cho cả khoảng', async () => {
    const world = await multiDayWorld();
    const { realPort } = createLeaveServices(db);
    const input = {
      bacSiId: world.doctorId,
      tuNgay: FROM,
      denNgay: TO,
      now: T0,
    };
    const codes = (...ids: { maLichHen: string }[]) =>
      ids.map((x) => x.maLichHen).sort();

    const statements = recordStatements(db);
    const morning = await realPort.listAffected({
      ...input,
      ca: 'CaSang',
      limit: 10,
    });
    // MỘT lần gọi cho 3 ngày: đúng hai câu (COUNT, rồi trang), không tăng theo số ngày
    expect(statements.filter((s) => /FROM lich_hen/i.test(s))).toHaveLength(2);
    expect(morning.tong).toBe(3);
    expect(morning.items.map((i) => i.maLichHen).sort()).toEqual(
      codes(world.booked.m10, world.booked.m11, world.booked.m12),
    );

    const afternoon = await realPort.listAffected({
      ...input,
      ca: 'CaChieu',
      limit: 10,
    });
    expect(afternoon.items.map((i) => i.maLichHen).sort()).toEqual(
      codes(world.booked.a10, world.booked.a11, world.booked.a12),
    );
    // Không chọn ca (CaNgay): cả hai ca của cả ba ngày, vẫn không lấy ngày 13
    expect((await realPort.listAffected({ ...input, limit: 0 })).tong).toBe(6);
    // Khoảng một ngày: đúng ca đó của ngày đó
    expect(
      (
        await realPort.listAffected({
          ...input,
          tuNgay: '2026-11-11',
          denNgay: '2026-11-11',
          ca: 'CaSang',
          limit: 0,
        })
      ).tong,
    ).toBe(1);
    // `findAffected` (đường của bước huỷ) CÙNG tập với `listAffected` (một hàm lọc ở booking)
    expect(
      (await realPort.findAffected({ ...input, ca: 'CaSang' }))
        .map((x) => x.maLichHen)
        .sort(),
    ).toEqual(codes(world.booked.m10, world.booked.m11, world.booked.m12));

    // `countByShifts` nhận danh sách ca của yêu cầu: chỉ ba ca sáng, một lần gọi một câu
    const morningShifts = await Promise.all(
      [FROM, '2026-11-11', TO].map((ngay) => world.shiftIdOf(ngay, 'CaSang')),
    );
    // `recordStatements` chỉ gọi MỘT lần mỗi test (gọi hai lần làm hai lớp bọc đệ quy): lấy mốc rồi đếm phần câu SQL sinh ra SAU mốc
    const mark = statements.length;
    expect(await realPort.countByShifts(morningShifts)).toEqual({
      [morningShifts[0] as string]: 1,
      [morningShifts[1] as string]: 1,
      [morningShifts[2] as string]: 1,
    });
    expect(
      statements.slice(mark).filter((s) => /JOIN lich_hen/i.test(s)),
    ).toHaveLength(1);
  });

  it('DUX7-28 duyệt MỘT lần: huỷ đúng lịch của ca đã chọn ở MỌI ngày trong khoảng, giữ ca kia cùng ngày, ngày ngoài khoảng và lịch đã tiếp đón', async () => {
    const world = await multiDayWorld();
    const pending = await world.book(
      world.slots.morning12[1] as string,
      'ChoThanhToan',
    );
    const checkedInMorning12 = await world.book(
      world.slots.morning12[2] as string,
      'DaTiepDon',
    );
    const id = await morningRequest(world.leave);

    const result = await createLeaveServices(db).approval.approve(
      SYSTEM,
      world.adminId,
      id,
    );

    expect(result.huyLichHen).toEqual({
      hoanTat: true,
      daHuy: 4, // m10, m11, m12 (DaXacNhan) và lịch ChoThanhToan của sáng 12/11
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
    for (const cancelled of [
      world.booked.m10,
      world.booked.m11,
      world.booked.m12,
      pending,
    ])
      expect(await appointmentRow(cancelled.lichHenId)).toEqual({
        trangThai: 'DaHuy',
        lyDo: LEAVE_CANCEL_REASON,
      });
    // Không bị huỷ: ca chiều của cả ba ngày, ca sáng NGOÀI khoảng (13/11) và lịch đã tiếp đón
    for (const kept of [
      world.booked.a10,
      world.booked.a11,
      world.booked.a12,
      world.booked.m13,
    ])
      expect((await appointmentRow(kept.lichHenId)).trangThai).toBe(
        'DaXacNhan',
      );
    expect((await appointmentRow(checkedInMorning12.lichHenId)).trangThai).toBe(
      'DaTiepDon',
    );
    expect((await requestRow(id)).trangThai).toBe('DaDuyet');
  });

  it('DUX7-29 hoàn cọc đúng lịch: chỉ lịch có cọc ở ca đã chọn (mọi ngày) được hoàn; lịch có cọc ở ca kia không đụng tới', async () => {
    const world = await multiDayWorld();
    // m10 và m12 là lịch sáng (bị huỷ), a11 là lịch chiều (giữ); cả ba đã thu cọc
    await db.query(
      'UPDATE lich_hen SET tien_coc_snapshot = ? WHERE lich_hen_id IN (?, ?, ?)',
      [
        DEPOSIT,
        world.booked.m10.lichHenId,
        world.booked.m12.lichHenId,
        world.booked.a11.lichHenId,
      ],
    );
    const services = createLeaveServices(db);
    services.ports.paymentSummary.paid({
      [world.booked.m10.lichHenId]: DEPOSIT,
      [world.booked.m12.lichHenId]: DEPOSIT,
      [world.booked.a11.lichHenId]: DEPOSIT,
    });
    const id = await morningRequest(world.leave);

    await services.approval.approve(SYSTEM, world.adminId, id);

    const refunded = services.ports.refund.refundCall.calls
      .map(([call]) => call.lichHenId)
      .sort();
    expect(refunded).toEqual(
      [world.booked.m10.lichHenId, world.booked.m12.lichHenId].sort(),
    );
    for (const [call] of services.ports.refund.refundCall.calls)
      expect(call.soTien).toBe(DEPOSIT); // nghỉ phép của bác sĩ: hoàn đủ cọc
    expect((await appointmentRow(world.booked.a11.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );
  });

  it('DUX7-30 từ chối: không huỷ lịch nào; nhật ký TuChoiNghiPhep ghi khoảng nhiều ngày và ca; thông báo giữ chữ ca ở cả hai sự kiện', async () => {
    const world = await multiDayWorld();
    const rejected = await morningRequest(world.leave);
    const approved = await morningRequest(world.leave, 'CaChieu');
    const { rejection, approval } = createLeaveServices(db);

    await rejection.reject(SYSTEM, world.adminId, rejected, 'Thiếu người trực');
    expect((await requestRow(rejected)).trangThai).toBe('TuChoi');
    for (const lich of Object.values(world.booked))
      expect((await appointmentRow(lich.lichHenId)).trangThai).toBe(
        'DaXacNhan',
      );

    await approval.approve(SYSTEM, world.adminId, approved);
    const logs: { action: string; changes: unknown }[] = await db.query(
      `SELECT hanh_dong AS action, chi_tiet_thay_doi AS changes FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id`,
    );
    expect(logs.map((l) => l.action)).toEqual([
      'TuChoiNghiPhep',
      'DuyetNghiPhep',
    ]);
    const parse = (value: unknown): Record<string, unknown> =>
      typeof value === 'string' ? JSON.parse(value) : (value as never);
    expect(parse(logs[0]?.changes)).toEqual({
      bac_si_id: world.doctorId,
      ngay_bat_dau: FROM,
      ngay_ket_thuc: TO,
      ca: 'CaSang',
      ly_do_tu_choi: 'Thiếu người trực',
    });
    expect(parse(logs[1]?.changes)).toEqual({
      bac_si_id: world.doctorId,
      ngay_bat_dau: FROM,
      ngay_ket_thuc: TO,
      ca: 'CaChieu',
    });
    const notes: { type: string; body: string }[] = await db.query(
      `SELECT loai_su_kien AS type, noi_dung AS body FROM thong_bao ORDER BY thong_bao_id`,
    );
    expect(notes.map((n) => n.body)).toEqual([
      'Yêu cầu nghỉ phép ca sáng từ 10/11/2026 đến 12/11/2026 đã bị từ chối. Lý do: Thiếu người trực',
      'Yêu cầu nghỉ phép ca chiều từ 10/11/2026 đến 12/11/2026 đã được duyệt.',
    ]);
  });

  it('DUX7-31 thử lại và sweeper: một lịch lỗi giữa chừng được huỷ ở lượt sau, hai lượt đó KHÔNG đụng ca kia; chạy lại nữa không huỷ thêm gì', async () => {
    const world = await multiDayWorld();
    const real = createLeaveServices(db).realPort;
    let failuresLeft = 1;
    const flaky: AppointmentCancellationPort = {
      findAffected: (filter) => real.findAffected(filter),
      cancelForLeave: (maLichHen) => {
        if (maLichHen === world.booked.m11.maLichHen && failuresLeft-- > 0)
          return Promise.reject(new Error('lỗi giả của cổng huỷ'));
        return real.cancelForLeave(maLichHen);
      },
    };
    const services = createLeaveServices(db, flaky);
    const id = await morningRequest(world.leave);

    const first = await services.approval.approve(SYSTEM, world.adminId, id);
    expect(first.huyLichHen).toMatchObject({ hoanTat: false, daHuy: 2 });
    expect((await appointmentRow(world.booked.m11.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );

    const retried = await services.retry.retry(SYSTEM, id);
    expect(retried.huyLichHen).toEqual({
      hoanTat: true,
      daHuy: 1,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
    for (const done of [world.booked.m10, world.booked.m11, world.booked.m12])
      expect((await appointmentRow(done.lichHenId)).trangThai).toBe('DaHuy');

    // Sweeper chạy sau đó: không còn gì để huỷ và KHÔNG huỷ nhầm ca chiều cùng ngày
    const swept = await services.sweeper.run(T0);
    expect(swept).toMatchObject({ requests: 1, daHuy: 0, chuaHoanTat: 0 });
    for (const kept of [
      world.booked.a10,
      world.booked.a11,
      world.booked.a12,
      world.booked.m13,
    ])
      expect((await appointmentRow(kept.lichHenId)).trangThai).toBe(
        'DaXacNhan',
      );
  });

  it('DUX7-53 chi tiết của Admin (AdminLeaveService.get): số lịch hẹn bị ảnh hưởng và danh sách chỉ gồm lịch của ca đã chọn ở mọi ngày; yêu cầu TuChoi trả null', async () => {
    const world = await multiDayWorld();
    const { realPort } = createLeaveServices(db);
    const service = new AdminLeaveService(
      db,
      new AdminLeaveRepository(db),
      new BranchAccessPolicy(),
      realPort,
    );
    const codesOf = (...booked: { maLichHen: string }[]) =>
      booked.map((b) => b.maLichHen).sort();

    const morning = await service.get(
      SYSTEM,
      await morningRequest(world.leave),
    );
    expect(morning.soLichHenBiAnhHuong).toBe(3);
    expect(morning.lichHenBiAnhHuong?.tong).toBe(3);
    expect(
      morning.lichHenBiAnhHuong?.items.map((i) => i.maLichHen).sort(),
    ).toEqual(codesOf(world.booked.m10, world.booked.m11, world.booked.m12));

    const afternoon = await service.get(
      SYSTEM,
      await morningRequest(world.leave, 'CaChieu'),
    );
    expect(afternoon.soLichHenBiAnhHuong).toBe(3);
    expect(
      afternoon.lichHenBiAnhHuong?.items.map((i) => i.maLichHen).sort(),
    ).toEqual(codesOf(world.booked.a10, world.booked.a11, world.booked.a12));

    const refused = await world.leave({
      ca: 'CaSang',
      batDau: FROM,
      ketThuc: TO,
      trangThai: 'TuChoi',
    });
    const rejected = await service.get(SYSTEM, refused);
    expect(rejected.soLichHenBiAnhHuong).toBeNull();
    expect(rejected.lichHenBiAnhHuong).toBeNull();
  });

  it('DUX7-34 thứ tự khoá của duyệt không đổi với yêu cầu nhiều ngày: khoá bac_si TRƯỚC hàng yêu cầu, không khoá thêm bảng nào ở bước 1', async () => {
    const world = await multiDayWorld();
    const id = await morningRequest(world.leave);
    const statements = recordStatements(db);
    const { approval } = createLeaveServices(db);

    await approval.approve(SYSTEM, world.adminId, id);

    // Bước 1 chỉ có hai câu khoá (bac_si rồi yeu_cau_nghi_phep); phần còn lại là các `cancel` của booking (khoá khung giờ, rồi lịch hẹn: tầng 5, 6) SAU commit
    const locks = statements.filter(isLockingStatement).map(firstTableOf);
    expect(locks.slice(0, 2)).toEqual(['bac_si', 'yeu_cau_nghi_phep']);
    expect(locks.slice(2).every((t) => t !== 'bac_si')).toBe(true);
  });

  it('DUX7-32 chặn đặt lịch (D4): LeaveReader.findBlockingLeave chặn đúng ca ở mọi ngày của khoảng, không chặn ca kia và ngày ngoài khoảng', async () => {
    const world = await multiDayWorld();
    await morningRequest(world.leave); // ChoDuyet cũng chặn
    const reader = new LeaveReader();
    const blocked = async (ngay: string, ca: 'CaSang' | 'CaChieu') =>
      (await db.transaction((em) =>
        reader.findBlockingLeave(em, { bacSiId: world.doctorId, ngay, ca }),
      )) !== null;

    for (const ngay of [FROM, '2026-11-11', TO])
      expect(await blocked(ngay, 'CaSang'), `${ngay} sáng`).toBe(true);
    for (const ngay of [FROM, '2026-11-11', TO])
      expect(await blocked(ngay, 'CaChieu'), `${ngay} chiều`).toBe(false);
    expect(await blocked('2026-11-09', 'CaSang')).toBe(false);
    expect(await blocked('2026-11-13', 'CaSang')).toBe(false);
    expect(await count('FROM yeu_cau_nghi_phep')).toBe(1);
  });
});
