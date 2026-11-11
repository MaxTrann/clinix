import { ValidationPipe } from '@nestjs/common';
import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  DOCTOR_VISIBLE_STATES,
  DoctorAppointmentsQueryDto,
  SAP_XEP,
  SAP_XEP_ORDER,
} from './doctor-appointments.dto.js';

// Task B5 — `DoctorAppointmentsQueryDto` NỐI DÂY đúng các decorator dùng chung (đã có test riêng ở list-query.decorators.spec.ts) và phân trang qua ĐÚNG cấu hình ValidationPipe của configureApp.
// Mã DSB-nn là PLAN 7.8, TRACKING 3.20.3 (DSB-10, DSB-14 là [đề xuất]).
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
    metatype: DoctorAppointmentsQueryDto,
  }) as Promise<DoctorAppointmentsQueryDto>;

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

describe('tập trạng thái hiển thị và sắp xếp (DSB-04, DSB-10)', () => {
  it('DSB-10 sáu trạng thái hiển thị: ĐÚNG mọi trạng thái trừ DaDoiLich', () => {
    expect(DOCTOR_VISIBLE_STATES).toHaveLength(6);
    expect(DOCTOR_VISIBLE_STATES).not.toContain('DaDoiLich');
    expect([...DOCTOR_VISIBLE_STATES].sort()).toStrictEqual(
      TRANG_THAI_LICH_HEN.filter((state) => state !== 'DaDoiLich').sort(),
    );
  });

  it('DSB-04 `sapXep` có đúng hai giá trị của Q33: `MoiNhat` ⇒ giảm dần, `CuNhat` ⇒ tăng dần', () => {
    expect([...SAP_XEP]).toStrictEqual(['MoiNhat', 'CuNhat']);
    expect(SAP_XEP_ORDER).toStrictEqual({ MoiNhat: 'DESC', CuNhat: 'ASC' });
  });
});

describe('DoctorAppointmentsQueryDto', () => {
  it('DSB-14 mặc định page = 1, pageSize = 20, offset = 0; pageSize 100 là tối đa; mọi bộ lọc để trống (`sapXep` để service đặt mặc định)', async () => {
    const empty = await parse({});
    expect(empty).toMatchObject({ page: 1, pageSize: 20, offset: 0 });
    for (const key of ['trangThai', 'ca', 'q', 'sapXep', 'bacSiId'] as const)
      expect(empty[key], key).toBeUndefined();
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
  ])('DSB-14 ca âm: %s ⇒ 400', async (_name, query) => {
    const errors = await errorsOf(query);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors)
      expect(['page', 'pageSize']).toContain(error.truong);
  });

  it('DSB-03, DSB-10 `trangThai` nhận sáu trạng thái hiển thị; DaDoiLich ⇒ 400 IS_IN (khác Lễ tân)', async () => {
    for (const state of DOCTOR_VISIBLE_STATES)
      expect((await parse({ trangThai: state })).trangThai).toStrictEqual([
        state,
      ]);
    expect(await errorsOf({ trangThai: 'DaDoiLich' })).toStrictEqual([
      { truong: 'trangThai', ma: 'IS_IN' },
    ]);
  });

  it('DSB-03 `trangThai` các dạng: một giá trị, dấu phẩy, lặp khoá, bỏ trùng; giá trị lạ, chuỗi rỗng, sai hoa thường ⇒ 400 IS_IN', async () => {
    expect(
      (await parse({ trangThai: 'DaHuy,VangMat,DaHuy' })).trangThai,
    ).toStrictEqual(['DaHuy', 'VangMat']);
    expect(
      (await parse({ trangThai: ['DaXacNhan', 'VangMat'] })).trangThai,
    ).toStrictEqual(['DaXacNhan', 'VangMat']);
    for (const bad of ['HoanTat', '', 'dahuy', ' DaHuy'])
      expect(await errorsOf({ trangThai: bad }), bad).toStrictEqual([
        { truong: 'trangThai', ma: 'IS_IN' },
      ]);
  });

  it('DSB-03 `ca` nhận cả ba giá trị của enum (CaToi hợp lệ, luôn rỗng); mảng (lặp khoá), giá trị lạ, chuỗi rỗng, sai hoa thường ⇒ 400 IS_IN', async () => {
    for (const ca of ['CaSang', 'CaChieu', 'CaToi'])
      expect((await parse({ ca })).ca).toBe(ca);
    for (const bad of [['CaSang', 'CaChieu'], 'CaDem', '', 'casang'])
      expect(await errorsOf({ ca: bad }), JSON.stringify(bad)).toStrictEqual([
        { truong: 'ca', ma: 'IS_IN' },
      ]);
  });

  it('DSB-04 `sapXep` nhận `MoiNhat`, `CuNhat`; giá trị lạ, chuỗi rỗng, sai hoa thường, mảng ⇒ 400 IS_IN', async () => {
    for (const sapXep of SAP_XEP)
      expect((await parse({ sapXep })).sapXep).toBe(sapXep);
    for (const bad of ['TangDan', '', 'moinhat', ['MoiNhat', 'CuNhat']])
      expect(
        await errorsOf({ sapXep: bad }),
        JSON.stringify(bad),
      ).toStrictEqual([{ truong: 'sapXep', ma: 'IS_IN' }]);
  });

  it('DSB-01 `bacSiId` đúng dạng được NHẬN (service không nhận nó nên bị bỏ qua); sai dạng ⇒ 400 IS_BIGINT_ID', async () => {
    expect((await parse({ bacSiId: '12' })).bacSiId).toBe('12');
    for (const bad of ['abc', '0', '1.5', '9223372036854775808', '-1'])
      expect(await errorsOf({ bacSiId: bad }), bad).toStrictEqual([
        { truong: 'bacSiId', ma: 'IS_BIGINT_ID' },
      ]);
  });

  it('DSB-14 đủ các bộ lọc cùng lúc, `q` được chuẩn hoá (cắt khoảng trắng, NFC)', async () => {
    const parsed = await parse({
      trangThai: 'DaHuy,VangMat',
      ca: 'CaChieu',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: ' Đặng ',
      sapXep: 'CuNhat',
      bacSiId: '12',
    });
    expect(parsed).toMatchObject({
      trangThai: ['DaHuy', 'VangMat'],
      ca: 'CaChieu',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'Đặng',
      sapXep: 'CuNhat',
    });
  });

  it('DSB-02 ngày không có thật ⇒ IS_CALENDAR_DATE; `denNgay` trước `tuNgay` ⇒ IS_NOT_BEFORE_FROM; cùng ngày và `9999-12-31` là hợp lệ', async () => {
    expect(await errorsOf({ tuNgay: '2026-13-45' })).toStrictEqual([
      { truong: 'tuNgay', ma: 'IS_CALENDAR_DATE' },
    ]);
    expect(
      await errorsOf({ tuNgay: '2026-11-10', denNgay: '2026-11-09' }),
    ).toStrictEqual([{ truong: 'denNgay', ma: 'IS_NOT_BEFORE_FROM' }]);
    expect(
      await parse({ tuNgay: '2026-11-10', denNgay: '2026-11-10' }),
    ).toMatchObject({ tuNgay: '2026-11-10', denNgay: '2026-11-10' });
    expect((await parse({ denNgay: '9999-12-31' })).denNgay).toBe('9999-12-31');
  });

  it.each([
    ['rỗng', ''],
    ['một ký tự', 'a'],
    ['101 ký tự', 'a'.repeat(101)],
    ['có ký tự điều khiển', 'ab\ncd'],
  ])('DSB-14 `q` %s ⇒ MỘT lỗi TU_KHOA_KHONG_HOP_LE', async (_name, q) => {
    expect(await errorsOf({ q })).toStrictEqual([
      { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
    ]);
  });

  it.each([
    ['chuyenKhoaId (Bác sĩ chỉ có một chuyên khoa)', { chuyenKhoaId: '1' }],
    ['dichVuKhamId', { dichVuKhamId: '1' }],
    ['chiNhanhId (phạm vi không do client gửi)', { chiNhanhId: '1' }],
    ['benhNhanId', { benhNhanId: '1' }],
    ['hoSoNguoiThanId (của Bệnh nhân)', { hoSoNguoiThanId: 'BanThan' }],
    ['nhom (của Bệnh nhân)', { nhom: 'SapToi' }],
    ['thanhToan (chờ payment)', { thanhToan: 'DaThanhToanDu' }],
    ['khoá lạ', { foo: '1' }],
  ])(
    'DSB-14, QB-03 ca âm: %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP',
    async (_name, query) => {
      const errors = await errorsOf(query);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.ma).toBe('TRUONG_KHONG_DUOC_PHEP');
    },
  );
});
