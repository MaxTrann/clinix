import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { DoctorFixtures } from '../../doctor/testing/doctor-fixtures.js';
import { ShiftQueries } from './shift-queries.js';

// Doctor B7 trên MySQL 8.4 THẬT — HD-05: `findFutureShiftsAtBranch` (quy tắc 13) và `listDoctorShifts`.
let db: DataSource;
let fx: DoctorFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new DoctorFixtures(d);
});

const queries = new ShiftQueries();

describe('ShiftQueries trên MySQL thật', () => {
  it('HD-05 ca hôm nay tính là còn; ca quá khứ và chi nhánh khác thì không', async () => {
    const w = await fx.world();
    const doctor = w.doctor.profile;
    const other = await fx.admin.branch();
    const shift = (
      ngay: string,
      ca: 'CaSang' | 'CaChieu',
      chiNhanhId?: string,
    ) =>
      fx.admin.shift(doctor, { ngay, ca, ...(chiNhanhId && { chiNhanhId }) });
    await shift('2026-12-06', 'CaSang'); // quá khứ so với tuNgay
    const today = await shift('2026-12-07', 'CaSang'); // đúng ngày tuNgay ⇒ còn
    const later = await shift('2026-12-09', 'CaChieu');
    await shift('2026-12-08', 'CaSang', other.chiNhanhId); // chi nhánh khác

    const rows = await queries.findFutureShiftsAtBranch(db.manager, {
      bacSiId: doctor.taiKhoanId,
      chiNhanhId: w.branch.chiNhanhId,
      tuNgay: '2026-12-07',
    });
    expect(rows).toEqual([
      { lichLamViecId: today.lichLamViecId, ngay: '2026-12-07', ca: 'CaSang' },
      { lichLamViecId: later.lichLamViecId, ngay: '2026-12-09', ca: 'CaChieu' },
    ]);
  });

  it('HD-05 không lẫn bác sĩ khác cùng chi nhánh', async () => {
    const w = await fx.world();
    const colleague = await fx.admin.doctor(w.branch);
    await fx.admin.shift(colleague.profile, {
      ngay: '2026-12-07',
      ca: 'CaSang',
    });
    expect(
      await queries.findFutureShiftsAtBranch(db.manager, {
        bacSiId: w.doctor.account.taiKhoanId,
        chiNhanhId: w.branch.chiNhanhId,
        tuNgay: '2026-12-01',
      }),
    ).toEqual([]);
  });

  it('listDoctorShifts: gồm hai đầu khoảng, kèm chi nhánh ghi trên ca, đúng thứ tự', async () => {
    const w = await fx.world();
    const doctor = w.doctor.profile;
    const other = await fx.admin.branch();
    await fx.admin.shift(doctor, { ngay: '2026-12-10', ca: 'CaChieu' });
    await fx.admin.shift(doctor, {
      ngay: '2026-12-07',
      ca: 'CaSang',
      chiNhanhId: other.chiNhanhId,
    });
    await fx.admin.shift(doctor, { ngay: '2026-12-11', ca: 'CaSang' }); // ngoài khoảng

    const rows = await queries.listDoctorShifts(db.manager, {
      bacSiId: doctor.taiKhoanId,
      tuNgay: '2026-12-07',
      denNgay: '2026-12-10',
    });
    expect(
      rows.map((r) => [r.ngay, r.ca, r.chiNhanhId, r.chiNhanhTen]),
    ).toEqual([
      ['2026-12-07', 'CaSang', other.chiNhanhId, other.ten],
      ['2026-12-10', 'CaChieu', w.branch.chiNhanhId, w.branch.ten],
    ]);
  });
});
