import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import { insertRelativeRow } from '../patient/testing/relatives-helpers.js';
import { appointmentAt } from '../patient/testing/relatives-deactivate-helpers.js';
import { findActiveAppointments } from './active-appointment.query.js';
import {
  isVisitProfileUsable,
  lockVisitProfile,
} from './visit-profile.query.js';

// Task B5 — hai hàm của `appointments/` trên MySQL 8.4 THẬT (PLAN patient Q13, NT-14, NT-18; TRACKING B5-B, B5-G). Mã ca RDA-nn là [đề xuất].
// Dữ liệu cá nhân giả, không CCCD thật. Ngừng sử dụng đầy đủ: patient/relatives/relatives.service.deactivate.int-spec.ts.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

const newPatient = async () => (await fx.patient()).account.taiKhoanId;

describe('lockVisitProfile / isVisitProfileUsable trên MySQL thật', () => {
  it('RDA-05 (NT-18, H3) hồ sơ đã ngừng ⇒ false; hồ sơ (đang dùng và đã ngừng) của Bệnh nhân khác ⇒ false; id không có ⇒ false; hồ sơ đang hiệu lực của chính chủ ⇒ true; hồ sơ bản thân (null) ⇒ true', async () => {
    const owner = await newPatient();
    const other = await newPatient();
    const active = await insertRelativeRow(db, owner, {
      hoTen: 'Đang dùng',
      active: true,
    });
    const stopped = await insertRelativeRow(db, owner, {
      hoTen: 'Đã ngừng',
      active: false,
    });
    const othersActive = await insertRelativeRow(db, other, {
      hoTen: 'Của người khác, đang dùng',
      active: true,
    });
    const othersStopped = await insertRelativeRow(db, other, {
      hoTen: 'Của người khác, đã ngừng',
      active: false,
    });

    const answers = await db.transaction(async (em) => ({
      active: await isVisitProfileUsable(em, owner, active),
      stopped: await isVisitProfileUsable(em, owner, stopped),
      othersActive: await isVisitProfileUsable(em, owner, othersActive),
      othersStopped: await isVisitProfileUsable(em, owner, othersStopped),
      missing: await isVisitProfileUsable(em, owner, '99999'),
      self: await isVisitProfileUsable(em, owner, null),
      states: [
        await lockVisitProfile(em, owner, active),
        await lockVisitProfile(em, owner, stopped),
        await lockVisitProfile(em, owner, othersActive),
        await lockVisitProfile(em, owner, null),
      ],
    }));

    expect(answers).toStrictEqual({
      active: true,
      stopped: false,
      othersActive: false,
      othersStopped: false,
      missing: false,
      self: true,
      states: ['active', 'inactive', 'missing', 'active'],
    });
  });
});

describe('findActiveAppointments trên MySQL thật', () => {
  it('RDA-06 (NT-14, quy tắc 37) null chỉ thấy lịch BẢN THÂN; id người thân chỉ thấy lịch của đúng hồ sơ đó; lịch của Bệnh nhân khác và lịch không chặn không lọt vào', async () => {
    const owner = await newPatient();
    const other = await newPatient();
    const r1 = await insertRelativeRow(db, owner, {
      hoTen: 'R1',
      active: true,
    });
    const r2 = await insertRelativeRow(db, owner, {
      hoTen: 'R2',
      active: true,
    });
    const othersRelative = await insertRelativeRow(db, other, {
      hoTen: 'R của người khác',
      active: true,
    });
    const self = await appointmentAt(fx, owner, null, 'DaTiepDon', {
      thoiGian: '2026-11-02T08:00:00+07:00',
    });
    const forR1 = await appointmentAt(fx, owner, r1, 'DaXacNhan', {
      thoiGian: '2026-11-02T09:00:00+07:00',
    });
    await appointmentAt(fx, owner, r2, 'ChoThanhToan', {
      thoiGian: '2026-11-02T10:00:00+07:00',
    });
    await appointmentAt(fx, owner, r1, 'HoanThanh', {
      thoiGian: '2026-11-02T11:00:00+07:00',
    });
    await appointmentAt(fx, other, null, 'DaXacNhan', {
      thoiGian: '2026-11-02T12:00:00+07:00',
    });
    await appointmentAt(fx, other, othersRelative, 'DaXacNhan', {
      thoiGian: '2026-11-02T13:00:00+07:00',
    });

    const codesOf = async (benhNhanId: string, relativeId: string | null) =>
      (await findActiveAppointments(db.manager, benhNhanId, relativeId)).map(
        (a) => a.maLichHen,
      );

    expect(await codesOf(owner, null)).toEqual([self.appointment.maLichHen]);
    expect(await codesOf(owner, r1)).toEqual([forR1.appointment.maLichHen]);
    expect(await codesOf(owner, othersRelative)).toEqual([]);
  });
});
