import type { DataSource } from 'typeorm';
import { LEAVE_CANCEL_REASON } from '../../appointments/appointments.constants.js';
import type { CancelOutcome } from '../../appointments/cancel/cancel.types.js';
import type { AffectedByLeaveFilter } from '../../appointments/queries/affected-by-leave.query.js';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import { resetBookingData } from '../../appointments/testing/create-appointment-world.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  appointmentRow as appointmentRowOf,
  countRows,
  createLeaveServices,
  errorCodeOf,
  LEAVE_DAY,
  leaveSetup,
  requestRow as requestRowOf,
  SYSTEM,
} from '../testing/leave-approval-world.js';
import type { AppointmentCancellationPort } from './appointment-cancellation.port.js';

// Doctor B16 — chạy lại huỷ lịch hẹn sau khi duyệt, trên MySQL 8.4 THẬT với `booking` THẬT (`cancel` B10, `findAffectedByLeave` B11; cổng hoàn tiền, mời chờ, thông báo của booking là bản giả của booking):
// PD-11 (nút "Xử lý lại"), PD-12 (truy vấn quét), PD-13 và DH-11 (hai sweeper cùng lúc), DH-07 (mất tiến trình giữa hai bước), IV-05 (sau sweeper không còn lịch ChoThanhToan/DaXacNhan sau now trong khoảng nghỉ đã duyệt).
// PD-12 phần lô, trần lô, cờ running, log và BD-05: leave-cancellation.sweeper.job.spec.ts (đơn vị). Phần HTTP của PD-11 (vai trò, phạm vi, mã lỗi): test/doctor-admin-leave-retry.e2e-spec.ts.
// Đồng hồ giả: T0 = 08:00 ngày 02/11/2026 (giờ VN); ca sáng ngày 10/11/2026 có 8 khung giờ từ 08:00.
const NOW = new Date('2026-11-02T01:00:00.000Z');

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const setup = () => leaveSetup(db, fx);
const requestRow = (id: string) => requestRowOf(db, id);
const appointmentRow = (id: string) => appointmentRowOf(db, id);
const count = (sql: string) => countRows(db, sql);

/** Bọc một cổng để ghi lại mọi lần tìm (bộ lọc) và mọi kết quả huỷ, mà vẫn chạy đúng cổng bọc. */
function counting(inner: AppointmentCancellationPort) {
  const finds: AffectedByLeaveFilter[] = [];
  const outcomes: CancelOutcome['kind'][] = [];
  const port: AppointmentCancellationPort = {
    findAffected: (filter) => {
      finds.push(filter);
      return inner.findAffected(filter);
    },
    cancelForLeave: async (maLichHen) => {
      const outcome = await inner.cancelForLeave(maLichHen);
      outcomes.push(outcome.kind);
      return outcome;
    },
  };
  return { port, finds, outcomes };
}

const cancelledCount = (kinds: readonly string[]) =>
  kinds.filter((kind) => kind === 'Cancelled').length;

describe('PD-12 sweeper quét đúng yêu cầu (truy vấn trên MySQL thật)', () => {
  it('chỉ DaDuyet còn hiệu lực (ngay_ket_thuc >= hôm nay, gồm đúng hôm nay); bỏ ChoDuyet, TuChoi và DaDuyet đã qua; huỷ lịch của yêu cầu được quét', async () => {
    const { leave, w, doctorId } = await setup();
    const lich = await w.booked('DaXacNhan', 0);
    await leave({ trangThai: 'DaDuyet' }); // 10/11: được quét, có lịch
    await leave({ batDau: '2026-11-12', trangThai: 'ChoDuyet' }); // bỏ
    await leave({ batDau: '2026-11-13', trangThai: 'TuChoi' }); // bỏ
    await leave({
      batDau: '2026-10-30',
      ketThuc: '2026-11-01',
      trangThai: 'DaDuyet',
    }); // đã qua: bỏ
    await leave({
      batDau: '2026-11-01',
      ketThuc: '2026-11-02',
      trangThai: 'DaDuyet',
    }); // kết thúc ĐÚNG hôm nay: được quét

    const real = createLeaveServices(db).realPort;
    const spy = counting(real);
    const { sweeper } = createLeaveServices(db, spy.port);
    const summary = await sweeper.run(NOW);

    expect(summary).toEqual({
      requests: 2,
      daHuy: 1,
      daHuyTruocDo: 0,
      khongHuyDuoc: 0,
      chuaHoanTat: 0,
      more: false,
    });
    expect(spy.finds.map((f) => `${f.tuNgay}..${f.denNgay}`).sort()).toEqual([
      '2026-11-01..2026-11-02',
      '2026-11-10..2026-11-10',
    ]);
    expect(spy.finds.every((f) => f.bacSiId === doctorId)).toBe(true);
    expect(await appointmentRow(lich.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      lyDo: LEAVE_CANCEL_REASON,
    });
  });

  it('theo ca: yêu cầu CaChieu chỉ huỷ lịch ca chiều (lịch ca sáng giữ nguyên)', async () => {
    const { leave, w } = await setup();
    const morning = await w.booked('DaXacNhan', 0);
    await leave({ ca: 'CaChieu', trangThai: 'DaDuyet' });
    const { sweeper } = createLeaveServices(db);
    expect(await sweeper.run(NOW)).toMatchObject({ requests: 1, daHuy: 0 });
    expect((await appointmentRow(morning.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );
  });

  it('lịch DaTiepDon không bị huỷ và không đếm là khongHuyDuoc (findAffectedByLeave không lấy nó)', async () => {
    const { leave, w } = await setup();
    const checkedIn = await w.booked('DaTiepDon', 0);
    await leave({ trangThai: 'DaDuyet' });
    const { sweeper } = createLeaveServices(db);
    expect(await sweeper.run(NOW)).toMatchObject({
      requests: 1,
      daHuy: 0,
      khongHuyDuoc: 0,
    });
    expect((await appointmentRow(checkedIn.lichHenId)).trangThai).toBe(
      'DaTiepDon',
    );
  });

  it('điều kiện dừng: chạy thêm lượt nữa thì không làm gì (daHuy = 0, không đổi dữ liệu); sweeper không ghi nhật ký hay thông báo', async () => {
    const { leave, w } = await setup();
    await w.booked('DaXacNhan', 0);
    await w.booked('ChoThanhToan', 1);
    await leave({ trangThai: 'DaDuyet' });
    const { sweeper } = createLeaveServices(db);
    expect(await sweeper.run(NOW)).toMatchObject({ daHuy: 2 });
    expect(await sweeper.run(NOW)).toMatchObject({
      requests: 1,
      daHuy: 0,
      daHuyTruocDo: 0,
    });
    expect(await count('FROM nhat_ky_hanh_dong')).toBe(0);
    expect(await count('FROM thong_bao')).toBe(0);
  });
});

describe('PD-11 "Xử lý lại" một yêu cầu (dịch vụ chạy lại)', () => {
  it('chỉ yêu cầu DaDuyet: ChoDuyet và TuChoi ⇒ 409 YEU_CAU_DA_XU_LY và không huỷ gì', async () => {
    const { leave, w, adminId } = await setup();
    const lich = await w.booked('DaXacNhan', 0);
    const pending = await leave({ trangThai: 'ChoDuyet' });
    const rejected = await leave({ batDau: '2026-11-11', trangThai: 'TuChoi' });
    const { retry } = createLeaveServices(db);
    for (const id of [pending, rejected])
      expect(await errorCodeOf(retry.retry(SYSTEM, id))).toBe(
        'YEU_CAU_DA_XU_LY',
      );
    expect((await appointmentRow(lich.lichHenId)).trangThai).toBe('DaXacNhan');
    expect((await requestRow(pending)).trangThai).toBe('ChoDuyet');
    expect((await requestRow(rejected)).nguoi).toBe(adminId);
  });

  it('DaDuyet: huỷ phần còn lại; chạy hai lần thì lần hai daHuy = 0 (và không đếm lại lịch đã huỷ)', async () => {
    const { leave, w } = await setup();
    const first = await w.booked('DaXacNhan', 0);
    const second = await w.booked('ChoThanhToan', 1);
    const id = await leave({ trangThai: 'DaDuyet' });
    const { retry } = createLeaveServices(db);

    const one = await retry.retry(SYSTEM, id);
    expect(one).toEqual({
      yeuCauNghiPhepId: id,
      trangThai: 'DaDuyet',
      huyLichHen: {
        hoanTat: true,
        daHuy: 2,
        daHuyTruocDo: 0,
        khongHuyDuoc: [],
      },
    });
    const two = await retry.retry(SYSTEM, id);
    expect(two.huyLichHen).toEqual({
      hoanTat: true,
      daHuy: 0,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
    expect((await appointmentRow(first.lichHenId)).trangThai).toBe('DaHuy');
    expect((await appointmentRow(second.lichHenId)).trangThai).toBe('DaHuy');
    // Chạy lại không ghi nhật ký hay thông báo (việc duyệt đã ghi ở B15)
    expect(await count('FROM nhat_ky_hanh_dong')).toBe(0);
    expect(await count('FROM thong_bao')).toBe(0);
  });

  it('không có yêu cầu ⇒ 404; Admin Chi nhánh khác ⇒ 404 TRƯỚC khi nói gì về trạng thái (cả với yêu cầu ChoDuyet)', async () => {
    const { leave } = await setup();
    const pending = await leave({ trangThai: 'ChoDuyet' });
    const other = await fx.admin.branch();
    const { retry } = createLeaveServices(db);
    const outside = { kind: 'ChiNhanh', chiNhanhId: other.chiNhanhId } as const;
    expect(await errorCodeOf(retry.retry(SYSTEM, '999999'))).toBe(
      'KHONG_TIM_THAY',
    );
    expect(await errorCodeOf(retry.retry(outside, pending))).toBe(
      'KHONG_TIM_THAY',
    );
  });

  it('lỗi của một lịch: vẫn 200, hoanTat = false, lịch còn lại vẫn được huỷ', async () => {
    const { leave, w } = await setup();
    const lich = [
      await w.booked('DaXacNhan', 0),
      await w.booked('DaXacNhan', 1),
      await w.booked('DaXacNhan', 2),
    ];
    const id = await leave({ trangThai: 'DaDuyet' });
    const real = createLeaveServices(db).realPort;
    let calls = 0;
    const flaky: AppointmentCancellationPort = {
      findAffected: (filter) => real.findAffected(filter),
      cancelForLeave: (maLichHen) => {
        calls += 1;
        if (calls === 2) throw new Error('mất kết nối');
        return real.cancelForLeave(maLichHen);
      },
    };
    const result = await createLeaveServices(db, flaky).retry.retry(SYSTEM, id);
    expect(result.huyLichHen).toMatchObject({ hoanTat: false, daHuy: 2 });
    const states = await Promise.all(
      lich.map(async (l) => (await appointmentRow(l.lichHenId)).trangThai),
    );
    expect(states.filter((s) => s === 'DaHuy')).toHaveLength(2);
    // Lần chạy lại sau lỗi hoàn tất nốt phần còn lại
    const again = await createLeaveServices(db).retry.retry(SYSTEM, id);
    expect(again.huyLichHen).toMatchObject({ hoanTat: true, daHuy: 1 });
  });
});

describe('DH-07 mất tiến trình giữa hai bước', () => {
  it('Duyệt commit DaDuyet rồi dừng sau khi huỷ MỘT lịch; sweeper chạy hai lần ⇒ các lịch còn lại huỷ đúng một lần, không thông báo hai lần', async () => {
    const { leave, w, adminId } = await setup();
    const total = 5;
    const lich = [];
    for (let i = 0; i < total; i += 1)
      lich.push(await w.booked('DaXacNhan', i, { coc: '100000.00' }));
    const id = await leave();

    // Bước 2 của Duyệt "chết" sau lịch đầu tiên: cổng thật cho lịch đầu, ném lỗi từ lịch thứ hai.
    const base = createLeaveServices(db);
    const spy = counting(base.realPort);
    let calls = 0;
    const dying: AppointmentCancellationPort = {
      findAffected: (filter) => spy.port.findAffected(filter),
      cancelForLeave: (maLichHen) => {
        calls += 1;
        if (calls > 1) throw new Error('tiến trình dừng');
        return spy.port.cancelForLeave(maLichHen);
      },
    };
    const approved = await createLeaveServices(db, dying).approval.approve(
      SYSTEM,
      adminId,
      id,
    );
    expect(approved.huyLichHen).toMatchObject({ hoanTat: false, daHuy: 1 });
    expect((await requestRow(id)).trangThai).toBe('DaDuyet');
    expect(cancelledCount(spy.outcomes)).toBe(1);

    const sweeper = createLeaveServices(db, spy.port).sweeper;
    expect(await sweeper.run(NOW)).toMatchObject({
      requests: 1,
      daHuy: total - 1,
      chuaHoanTat: 0,
    });
    expect(await sweeper.run(NOW)).toMatchObject({ requests: 1, daHuy: 0 });

    // Mỗi lịch được huỷ ĐÚNG MỘT lần, kể cả qua hai lượt chạy lại
    expect(cancelledCount(spy.outcomes)).toBe(total);
    for (const l of lich)
      expect((await appointmentRow(l.lichHenId)).trangThai).toBe('DaHuy');
    // Cổng thông báo của booking: đúng một sự kiện cho mỗi lịch đã huỷ (không lặp sau lượt chạy lại)
    expect(base.ports.notifier.events).toHaveLength(total);
  });
});

describe('PD-13, DH-11 hai sweeper chạy cùng lúc', () => {
  it('10 vòng × 6 lịch: mỗi lịch huỷ ĐÚNG MỘT lần (bên kia thấy AlreadyCancelled), không lỗi, không còn lịch ChoThanhToan/DaXacNhan', async () => {
    const { leave, w } = await setup();
    const total = 6;
    for (let round = 0; round < 10; round += 1) {
      await resetBookingData(db);
      await db.query('DELETE FROM yeu_cau_nghi_phep');
      for (let i = 0; i < total; i += 1)
        await w.booked(i % 2 === 0 ? 'DaXacNhan' : 'ChoThanhToan', i);
      await leave({ trangThai: 'DaDuyet' });

      const spy = counting(createLeaveServices(db).realPort);
      const a = createLeaveServices(db, spy.port).sweeper;
      const b = createLeaveServices(db, spy.port).sweeper;
      const [one, two] = await Promise.all([a.run(NOW), b.run(NOW)]);

      expect(one?.chuaHoanTat, `vòng ${round}`).toBe(0);
      expect(two?.chuaHoanTat, `vòng ${round}`).toBe(0);
      expect(cancelledCount(spy.outcomes), `vòng ${round}`).toBe(total);
      expect((one?.daHuy ?? 0) + (two?.daHuy ?? 0)).toBe(total);
      expect(
        await count(
          "FROM lich_hen WHERE trang_thai IN ('ChoThanhToan', 'DaXacNhan')",
        ),
      ).toBe(0);
    }
  });
});

describe('IV-05 sau sweeper không còn lịch ChoThanhToan/DaXacNhan có thoi_gian > now trong khoảng nghỉ đã duyệt', () => {
  it('nhiều yêu cầu DaDuyet (cả ngày và theo ca): chỉ còn lịch DaTiepDon, lịch ngoài khoảng và lịch ca khác', async () => {
    const { leave, w, doctorId } = await setup();
    await w.booked('DaXacNhan', 0);
    await w.booked('ChoThanhToan', 3);
    const checkedIn = await w.booked('DaTiepDon', 5);
    await leave({ ca: 'CaSang', trangThai: 'DaDuyet' });

    const { sweeper } = createLeaveServices(db);
    await sweeper.run(NOW);

    expect(
      await count(
        `FROM lich_hen WHERE bac_si_id = ${Number(doctorId)} AND trang_thai IN ('ChoThanhToan', 'DaXacNhan') AND thoi_gian > '2026-11-02 08:00:00' AND thoi_gian >= '${LEAVE_DAY} 00:00:00' AND thoi_gian < '2026-11-11 00:00:00'`,
      ),
    ).toBe(0);
    expect((await appointmentRow(checkedIn.lichHenId)).trangThai).toBe(
      'DaTiepDon',
    );
  });
});
