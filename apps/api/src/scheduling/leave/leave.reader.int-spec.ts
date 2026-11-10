import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { DoctorFixtures } from '../../doctor/testing/doctor-fixtures.js';
import { LeaveReader } from './leave.reader.js';

// Doctor B5 trên MySQL 8.4 THẬT — HD-03: `findBlockingLeave` / `listBlocking` theo trạng thái, hình thức nghỉ và biên ngày.
let db: DataSource;
let fx: DoctorFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new DoctorFixtures(d);
});

const reader = new LeaveReader();
const D10 = '2026-12-10';

/** Bác sĩ thứ hai cùng chi nhánh, để kiểm không lẫn người. */
async function twoDoctors() {
  const w = await fx.world();
  const other = await fx.admin.doctor(w.branch);
  return {
    a: w.doctor.account.taiKhoanId,
    b: other.account.taiKhoanId,
    admin: w.systemAdmin.account.taiKhoanId,
  };
}

/** Yêu cầu đã xử lý cần người và thời điểm xử lý (CHECK chk_nghi_phep_xu_ly). */
const handled = (admin: string) => ({
  nguoiXuLyId: admin,
  thoiDiemXuLy: '2026-12-01 09:00:00',
});

describe('LeaveReader.findBlockingLeave trên MySQL thật', () => {
  it('HD-03 ChoDuyet chặn (khác search KGI-03 cũ): trả id và trạng thái', async () => {
    const { a } = await twoDoctors();
    const id = await fx.leaveRequest({ bacSiId: a, batDau: D10 });
    expect(
      await reader.findBlockingLeave(db.manager, {
        bacSiId: a,
        ngay: D10,
        ca: 'CaSang',
      }),
    ).toEqual({ yeuCauNghiPhepId: id, trangThai: 'ChoDuyet' });
  });

  it('HD-03 DaDuyet chặn; TuChoi KHÔNG chặn', async () => {
    const { a, admin } = await twoDoctors();
    const approved = await fx.leaveRequest({
      bacSiId: a,
      batDau: D10,
      trangThai: 'DaDuyet',
      ...handled(admin),
    });
    await fx.leaveRequest({
      bacSiId: a,
      batDau: '2026-12-11',
      trangThai: 'TuChoi',
      ...handled(admin),
    });
    const find = (ngay: string) =>
      reader.findBlockingLeave(db.manager, {
        bacSiId: a,
        ngay,
        ca: 'CaChieu',
      });
    expect(await find(D10)).toEqual({
      yeuCauNghiPhepId: approved,
      trangThai: 'DaDuyet',
    });
    expect(await find('2026-12-11')).toBeNull();
  });

  it('HD-03 TheoCa chỉ chặn đúng ca; CaNgay chặn cả hai ca', async () => {
    const { a } = await twoDoctors();
    await fx.leaveRequest({
      bacSiId: a,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: D10,
    });
    await fx.leaveRequest({ bacSiId: a, batDau: '2026-12-15' });
    const find = (ngay: string, ca: 'CaSang' | 'CaChieu') =>
      reader.findBlockingLeave(db.manager, { bacSiId: a, ngay, ca });

    expect(await find(D10, 'CaSang')).not.toBeNull();
    expect(await find(D10, 'CaChieu')).toBeNull();
    expect(await find('2026-12-15', 'CaSang')).not.toBeNull();
    expect(await find('2026-12-15', 'CaChieu')).not.toBeNull();
  });

  it('HD-03 biên ngày của khoảng CaNgay nhiều ngày: gồm hai đầu, loại ngày liền kề', async () => {
    const { a } = await twoDoctors();
    await fx.leaveRequest({ bacSiId: a, batDau: D10, ketThuc: '2026-12-12' });
    const find = (ngay: string) =>
      reader.findBlockingLeave(db.manager, {
        bacSiId: a,
        ngay,
        ca: 'CaSang',
      });
    expect(await find('2026-12-09')).toBeNull();
    for (const ngay of [D10, '2026-12-11', '2026-12-12'])
      expect(await find(ngay), ngay).not.toBeNull();
    expect(await find('2026-12-13')).toBeNull();
  });

  it('HD-03 không lẫn bác sĩ khác', async () => {
    const { a, b } = await twoDoctors();
    await fx.leaveRequest({ bacSiId: a, batDau: D10 });
    expect(
      await reader.findBlockingLeave(db.manager, {
        bacSiId: b,
        ngay: D10,
        ca: 'CaSang',
      }),
    ).toBeNull();
  });

  it('HD-03 có cả ChoDuyet và DaDuyet chồng nhau ⇒ trả DaDuyet', async () => {
    const { a, admin } = await twoDoctors();
    await fx.leaveRequest({ bacSiId: a, batDau: D10 });
    const approved = await fx.leaveRequest({
      bacSiId: a,
      batDau: D10,
      trangThai: 'DaDuyet',
      ...handled(admin),
    });
    expect(
      await reader.findBlockingLeave(db.manager, {
        bacSiId: a,
        ngay: D10,
        ca: 'CaSang',
      }),
    ).toEqual({ yeuCauNghiPhepId: approved, trangThai: 'DaDuyet' });
  });
});

describe('LeaveReader.listBlocking trên MySQL thật', () => {
  it('HD-03 trả yêu cầu ChoDuyet/DaDuyet giao với khoảng ngày, ngày ở dạng chuỗi, bỏ TuChoi và bác sĩ không được hỏi', async () => {
    const { a, b, admin } = await twoDoctors();
    const inRange = await fx.leaveRequest({
      bacSiId: a,
      batDau: '2026-12-09',
      ketThuc: '2026-12-11',
    });
    const approved = await fx.leaveRequest({
      bacSiId: b,
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
      batDau: '2026-12-20',
      trangThai: 'DaDuyet',
      ...handled(admin),
    });
    await fx.leaveRequest({
      bacSiId: a,
      batDau: '2026-12-12',
      trangThai: 'TuChoi',
      ...handled(admin),
    });
    await fx.leaveRequest({ bacSiId: a, batDau: '2026-12-30' }); // ngoài khoảng hỏi

    const list = await reader.listBlocking(db.manager, {
      bacSiIds: [a, b],
      tuNgay: D10,
      denNgay: '2026-12-25',
    });
    expect(list.map((x) => x.yeuCauNghiPhepId).sort()).toEqual(
      [inRange, approved].sort(),
    );
    expect(list.find((x) => x.yeuCauNghiPhepId === inRange)).toEqual({
      yeuCauNghiPhepId: inRange,
      bacSiId: a,
      trangThai: 'ChoDuyet',
      hinhThucNghi: 'CaNgay',
      ngayBatDau: '2026-12-09',
      ngayKetThuc: '2026-12-11',
      ca: null,
    });
    expect(list.find((x) => x.yeuCauNghiPhepId === approved)).toMatchObject({
      bacSiId: b,
      hinhThucNghi: 'TheoCa',
      ca: 'CaChieu',
      ngayBatDau: '2026-12-20',
    });
  });

  it('HD-03 danh sách bác sĩ rỗng ⇒ [] và không truy vấn lỗi', async () => {
    expect(
      await reader.listBlocking(db.manager, {
        bacSiIds: [],
        tuNgay: D10,
        denNgay: D10,
      }),
    ).toEqual([]);
  });
});
