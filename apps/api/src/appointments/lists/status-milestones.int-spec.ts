import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { expiryWorld } from '../testing/expiry-fixtures.js';
import { DoctorAppointmentsRepository } from './doctor-appointments.repository.js';
import { toDoctorDetail } from './doctor-appointment.mapper.js';
import { toOperationsDetail } from './operations-appointment.mapper.js';
import { OperationsAppointmentsRepository } from './operations-appointments.repository.js';
import { toDetail } from './patient-appointment.mapper.js';
import { PatientAppointmentsRepository } from './patient-appointments.repository.js';
import type { StatusMilestones } from './status-milestones.mapper.js';

// Booking B19 — MOC-19 đến MOC-22 trên MySQL 8.4 THẬT (TRACKING 3.46.3): cột `thoi_diem_xac_nhan`, `thoi_diem_tiep_don`, `thoi_diem_hoan_thanh` của `lich_hen` đi qua CÂU SQL CHI TIẾT và mapper của BỐN vai thành khoá `moc`
// (ISO 8601 UTC theo mã bước, hoặc `null`). Chạy thẳng kho và mapper dùng chung (chỗ dễ sai là alias cột và múi giờ của `DATETIME`); phạm vi, 404 và khoá chặt của từng vai ở `*-appointments.int-spec.ts`.
// Lễ tân và Quản trị viên dùng CHUNG `OperationsAppointmentsRepository.findDetail` và `toOperationsDetail` nên MOC-21 và MOC-22 là cùng một đường.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

// Giờ viết theo giờ Việt Nam (+07:00); ISO UTC tương ứng trừ 7 giờ
const XN = '2026-11-02 08:00:00';
const TD = '2026-11-10 07:50:00';
const HT = '2026-11-10 08:45:09';
const EXPECTED: StatusMilestones = {
  xacNhan: '2026-11-02T01:00:00.000Z',
  tiepDon: '2026-11-10T00:50:00.000Z',
  hoanThanh: '2026-11-10T01:45:09.000Z',
};
const NONE: StatusMilestones = {
  xacNhan: null,
  tiepDon: null,
  hoanThanh: null,
};

async function given(state: 'DaTiepDon' | 'HoanThanh') {
  const w = await expiryWorld(fx);
  const lich = await w.inState(state, 0);
  const setMoc = (xn: string | null, td: string | null, ht: string | null) =>
    db.query(
      'UPDATE lich_hen SET thoi_diem_xac_nhan = ?, thoi_diem_tiep_don = ?, thoi_diem_hoan_thanh = ? WHERE lich_hen_id = ?',
      [xn, td, ht, lich.lichHenId],
    );
  return {
    w,
    code: lich.maLichHen,
    patientId: w.patientId,
    doctorId: w.doctor.profile.taiKhoanId,
    branchId: w.branch.chiNhanhId,
    setMoc,
  };
}

const PATIENT_STATES = ['DaTiepDon', 'HoanThanh'] as const;
const NO_EXTRAS = {
  thanhToan: null,
  hoanTien: null,
  serverTime: new Date('2026-11-18T03:00:00.000Z'),
};

describe('MOC-19 Bệnh nhân: câu chi tiết và toDetail trả `moc`', () => {
  it('ba mốc ISO UTC đúng cột; lịch cũ (cả ba NULL) ⇒ ba null; mỗi cột độc lập', async () => {
    const { code, patientId, setMoc } = await given('HoanThanh');
    const repo = new PatientAppointmentsRepository();
    const read = async () => {
      const row = await repo.findDetail(
        db.manager,
        patientId,
        code,
        PATIENT_STATES,
      );
      expect(row).not.toBeNull();
      return toDetail(row!, NO_EXTRAS).moc;
    };
    await setMoc(XN, TD, HT);
    expect(await read()).toEqual(EXPECTED);
    await setMoc(null, null, null);
    expect(await read()).toEqual(NONE);
    await setMoc(null, TD, null);
    expect(await read()).toEqual({ ...NONE, tiepDon: EXPECTED.tiepDon });
  });
});

describe('MOC-20 Bác sĩ: câu chi tiết và toDoctorDetail trả `moc`', () => {
  it('ba mốc ISO UTC đúng cột; lịch cũ ⇒ ba null; bác sĩ khác vẫn không thấy lịch (null, không lộ mốc)', async () => {
    const { w, code, doctorId, setMoc } = await given('HoanThanh');
    const repo = new DoctorAppointmentsRepository();
    await setMoc(XN, TD, HT);
    const row = await repo.findDetail(db.manager, doctorId, code);
    expect(row).not.toBeNull();
    expect(toDoctorDetail(row!).moc).toEqual(EXPECTED);

    await setMoc(null, null, null);
    expect(
      toDoctorDetail((await repo.findDetail(db.manager, doctorId, code))!).moc,
    ).toEqual(NONE);

    const stranger = (await fx.admin.doctor(w.branch)).profile.taiKhoanId;
    expect(await repo.findDetail(db.manager, stranger, code)).toBeNull();
  });
});

describe('MOC-21 và MOC-22 Lễ tân và Quản trị viên: MỘT câu chi tiết và toOperationsDetail dùng chung trả `moc`', () => {
  it('ba mốc ISO UTC đúng cột; lịch cũ ⇒ ba null; ngoài chi nhánh vẫn không thấy lịch', async () => {
    const { code, branchId, setMoc } = await given('DaTiepDon');
    const repo = new OperationsAppointmentsRepository();
    await setMoc(XN, TD, null);
    const row = await repo.findDetail(db.manager, branchId, code);
    expect(row).not.toBeNull();
    expect(toOperationsDetail(row!).moc).toEqual({
      ...EXPECTED,
      hoanThanh: null,
    });
    // Phạm vi toàn hệ thống (chiNhanhId undefined) cùng kết quả
    const all = await repo.findDetail(db.manager, undefined, code);
    expect(toOperationsDetail(all!).moc).toEqual({
      ...EXPECTED,
      hoanThanh: null,
    });

    await setMoc(null, null, null);
    expect(
      toOperationsDetail((await repo.findDetail(db.manager, branchId, code))!)
        .moc,
    ).toEqual(NONE);

    const other = await fx.admin.branch();
    expect(
      await repo.findDetail(db.manager, other.chiNhanhId, code),
    ).toBeNull();
  });
});
