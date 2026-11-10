import { ValidationPipe } from '@nestjs/common';
import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import { ACTIVE_APPOINTMENT_STATES } from '../active-appointment-states.js';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  NHOM_STATES,
  PATIENT_VISIBLE_STATES,
  PatientAppointmentsQueryDto,
} from './patient-appointments.dto.js';

// Task B1 — `PatientAppointmentsQueryDto` NỐI DÂY đúng các decorator dùng chung (đã có test riêng ở list-query.decorators.spec.ts) và phân trang qua ĐÚNG cấu hình
// ValidationPipe của configureApp. Mã LSH-nn là [đề xuất] (TRACKING 3.13.4).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const parse = (query: unknown) =>
  pipe.transform(query, {
    type: 'query',
    metatype: PatientAppointmentsQueryDto,
  }) as Promise<PatientAppointmentsQueryDto>;

async function errorsOf(query: unknown) {
  try {
    await parse(query);
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    return (error.getResponse() as { loi: { truong: string; ma: string }[] })
      .loi;
  }
  throw new Error('query lẽ ra phải bị từ chối');
}

describe('tập trạng thái của danh sách Bệnh nhân (LSH-02, LSH-06)', () => {
  it('LSH-06 sáu trạng thái hiển thị, ĐÚNG là mọi trạng thái trừ DaDoiLich', () => {
    expect(PATIENT_VISIBLE_STATES).toHaveLength(6);
    expect(PATIENT_VISIBLE_STATES).not.toContain('DaDoiLich');
    expect([...PATIENT_VISIBLE_STATES].sort()).toStrictEqual(
      TRANG_THAI_LICH_HEN.filter((state) => state !== 'DaDoiLich').sort(),
    );
  });

  it('LSH-02 SapToi là ba trạng thái hoạt động (cùng nguồn ACTIVE_APPOINTMENT_STATES); LichSu là ba trạng thái kết thúc; hai nhóm không chung phần tử và hợp lại đủ sáu', () => {
    expect(NHOM_STATES.SapToi).toStrictEqual([
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
    ]);
    expect(NHOM_STATES.SapToi).toBe(ACTIVE_APPOINTMENT_STATES);
    expect([...NHOM_STATES.LichSu].sort()).toStrictEqual([
      'DaHuy',
      'HoanThanh',
      'VangMat',
    ]);
    expect(
      NHOM_STATES.SapToi.filter((s) => NHOM_STATES.LichSu.includes(s)),
    ).toStrictEqual([]);
    expect([...NHOM_STATES.SapToi, ...NHOM_STATES.LichSu].sort()).toStrictEqual(
      [...PATIENT_VISIBLE_STATES].sort(),
    );
  });
});

describe('PatientAppointmentsQueryDto', () => {
  it('LSH-07 mặc định page = 1, pageSize = 20, offset = 0; pageSize 100 là tối đa; mọi bộ lọc để trống', async () => {
    const empty = await parse({});
    expect(empty).toMatchObject({ page: 1, pageSize: 20, offset: 0 });
    expect(empty.trangThai).toBeUndefined();
    expect(empty.q).toBeUndefined();
    expect(await parse({ page: '3', pageSize: '100' })).toMatchObject({
      page: 3,
      pageSize: 100,
      offset: 200,
    });
  });

  it.each([
    ['page 0', { page: '0' }],
    ['pageSize 101', { pageSize: '101' }],
    ['pageSize 0', { pageSize: '0' }],
    ['page chữ', { page: 'abc' }],
  ])('LSH-07 ca âm: %s ⇒ 400', async (_name, query) => {
    const errors = await errorsOf(query);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors)
      expect(['page', 'pageSize']).toContain(error.truong);
  });

  it('LSH-03 mọi trạng thái hiển thị được nhận; DaDoiLich ngoài tập của API ⇒ 400 IS_IN', async () => {
    for (const state of PATIENT_VISIBLE_STATES)
      expect((await parse({ trangThai: state })).trangThai).toStrictEqual([
        state,
      ]);
    expect(await errorsOf({ trangThai: 'DaDoiLich' })).toStrictEqual([
      { truong: 'trangThai', ma: 'IS_IN' },
    ]);
  });

  it('LSH-02 nhom nhận SapToi và LichSu; giá trị khác ⇒ 400 IS_IN (kể cả khác hoa thường và lặp khoá)', async () => {
    expect((await parse({ nhom: 'SapToi' })).nhom).toBe('SapToi');
    expect((await parse({ nhom: 'LichSu' })).nhom).toBe('LichSu');
    for (const bad of ['saptoi', 'TatCa', '', ['SapToi', 'LichSu']])
      expect(await errorsOf({ nhom: bad }), String(bad)).toStrictEqual([
        { truong: 'nhom', ma: 'IS_IN' },
      ]);
  });

  it('LSH-04 hoSoNguoiThanId nhận BanThan và id; LSH-12 ngày; LSH-08 q: đủ cả tám bộ lọc cùng lúc', async () => {
    const parsed = await parse({
      trangThai: 'DaHuy,VangMat',
      nhom: 'LichSu',
      hoSoNguoiThanId: 'BanThan',
      bacSiId: '12',
      chuyenKhoaId: '34',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: ' Đặng ',
    });
    expect(parsed).toMatchObject({
      trangThai: ['DaHuy', 'VangMat'],
      nhom: 'LichSu',
      hoSoNguoiThanId: 'BanThan',
      bacSiId: '12',
      chuyenKhoaId: '34',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'Đặng',
    });
  });

  it.each([
    ['benhNhanId (chủ sở hữu không do client gửi)', { benhNhanId: '1' }],
    ['chiNhanhId', { chiNhanhId: '1' }],
    ['khoá lạ', { foo: '1' }],
    ['sapXep', { sapXep: 'tang' }],
  ])('QB-03 ca âm: %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP', async (_name, query) => {
    const errors = await errorsOf(query);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.ma).toBe('TRUONG_KHONG_DUOC_PHEP');
  });
});
