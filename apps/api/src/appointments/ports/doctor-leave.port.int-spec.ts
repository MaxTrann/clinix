import { Test } from '@nestjs/testing';
import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { SchedulingModule } from '../../scheduling/scheduling.module.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { FakeDoctorLeavePort } from '../testing/fake-ports.js';
import {
  DOCTOR_LEAVE_PORT,
  type DoctorLeavePort,
} from './doctor-leave.port.js';

// Task P2 — BPO-05 (PLAN booking 5.10 D4, 7.19; TRACKING 3.6 P2-D, câu f): hợp đồng giữa cổng `DoctorLeavePort` và `LeaveReader` THẬT của doctor, trên MySQL 8.4 THẬT.
// Dòng dưới là kiểm kiểu lúc BIÊN DỊCH (`tsc` bao gồm file spec): Trung đổi chữ ký `findBlockingLeave` thì dòng này đỏ ngay, trước khi B16 nối cổng.
const leaveReaderIsAPort: DoctorLeavePort = new LeaveReader();

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

describe('BPO-05 hợp đồng D4: LeaveReader thật đi qua cổng DoctorLeavePort', () => {
  it('đúng công thức B16: provider `{ provide: DOCTOR_LEAVE_PORT, useExisting: LeaveReader }` với SchedulingModule (đã xuất LeaveReader) cho đúng thể hiện LeaveReader', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SchedulingModule],
      providers: [{ provide: DOCTOR_LEAVE_PORT, useExisting: LeaveReader }],
    }).compile();
    const port = moduleRef.get<DoctorLeavePort>(DOCTOR_LEAVE_PORT);
    expect(port).toBeInstanceOf(LeaveReader);
    expect(port).toBe(moduleRef.get(LeaveReader));
    expect(leaveReaderIsAPort).toBeInstanceOf(LeaveReader);
    await moduleRef.close();
  });

  it('ChoDuyet và DaDuyet chặn, TuChoi không; ca khác, ngày khác, bác sĩ khác không bị chặn; kết quả có đúng hình dạng của FakeDoctorLeavePort', async () => {
    const w = await fx.world();
    const bacSiId = w.doctor.account.taiKhoanId;
    const other = await fx.admin.doctor(w.branch);
    const adminId = w.systemAdmin.account.taiKhoanId;
    const handled = {
      nguoiXuLyId: adminId,
      thoiDiemXuLy: '2026-11-20 08:00:00',
    } as const;
    const port: DoctorLeavePort = new LeaveReader();
    const ask = (
      ngay: string,
      ca: 'CaSang' | 'CaChieu' = 'CaSang',
      id = bacSiId,
    ) => port.findBlockingLeave(db.manager, { bacSiId: id, ngay, ca });

    expect(await ask('2026-12-01')).toBeNull();

    // DaDuyet, CaNgay 01–03/12: chặn cả hai ca của ba ngày
    const approved = await fx.doctor.leaveRequest({
      bacSiId,
      batDau: '2026-12-01',
      ketThuc: '2026-12-03',
      trangThai: 'DaDuyet',
      ...handled,
    });
    expect(await ask('2026-12-01')).toEqual({
      yeuCauNghiPhepId: approved,
      trangThai: 'DaDuyet',
    });
    expect(await ask('2026-12-03', 'CaChieu')).toMatchObject({
      yeuCauNghiPhepId: approved,
    });
    expect(await ask('2026-12-04')).toBeNull(); // ngày liền sau
    expect(await ask('2026-11-30')).toBeNull(); // ngày liền trước
    expect(
      await ask('2026-12-02', 'CaSang', other.account.taiKhoanId),
    ).toBeNull();

    // ChoDuyet, TheoCa chiều 10/12: chỉ ca chiều của ngày đó, và vẫn là "chặn"
    const pending = await fx.doctor.leaveRequest({
      bacSiId,
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
      batDau: '2026-12-10',
    });
    expect(await ask('2026-12-10', 'CaChieu')).toEqual({
      yeuCauNghiPhepId: pending,
      trangThai: 'ChoDuyet',
    });
    expect(await ask('2026-12-10', 'CaSang')).toBeNull();

    // TuChoi không chặn
    await fx.doctor.leaveRequest({
      bacSiId,
      batDau: '2026-12-20',
      trangThai: 'TuChoi',
      ...handled,
    });
    expect(await ask('2026-12-20')).toBeNull();

    // cùng hình dạng với bản Fake mà B6 đến B12 sẽ dùng
    const fake = new FakeDoctorLeavePort().blocks();
    const fromFake = await fake.findBlockingLeave(db.manager, {
      bacSiId,
      ngay: '2026-12-01',
      ca: 'CaSang',
    });
    const fromReal = await ask('2026-12-01');
    expect(Object.keys(fromReal ?? {}).sort()).toEqual(
      Object.keys(fromFake ?? {}).sort(),
    );
    expect(typeof fromReal?.yeuCauNghiPhepId).toBe('string');
  });
});
