import { ValidationPipe } from '@nestjs/common';
import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  OPERATIONS_DEFAULT_STATES,
  OperationsAppointmentsQueryDto,
} from './operations-appointments.dto.js';

// Task B3 — `OperationsAppointmentsQueryDto` NỐI DÂY đúng các decorator dùng chung (đã có test riêng ở list-query.decorators.spec.ts) và phân trang qua ĐÚNG cấu hình ValidationPipe của
// configureApp. Mã DSV-nn là PLAN 7.7; DSV-14 là [đề xuất] (TRACKING 3.17.3).
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
    metatype: OperationsAppointmentsQueryDto,
  }) as Promise<OperationsAppointmentsQueryDto>;

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

describe('tập trạng thái mặc định của nhân sự (DSV-12)', () => {
  it('DSV-12 mặc định là sáu trạng thái hiển thị: ĐÚNG mọi trạng thái trừ DaDoiLich (câu (j))', () => {
    expect(OPERATIONS_DEFAULT_STATES).toHaveLength(6);
    expect(OPERATIONS_DEFAULT_STATES).not.toContain('DaDoiLich');
    expect([...OPERATIONS_DEFAULT_STATES].sort()).toStrictEqual(
      TRANG_THAI_LICH_HEN.filter((state) => state !== 'DaDoiLich').sort(),
    );
  });
});

describe('OperationsAppointmentsQueryDto', () => {
  it('DSV-06 mặc định page = 1, pageSize = 20, offset = 0; pageSize 100 là tối đa; mọi bộ lọc để trống', async () => {
    const empty = await parse({});
    expect(empty).toMatchObject({ page: 1, pageSize: 20, offset: 0 });
    expect(empty.trangThai).toBeUndefined();
    expect(empty.chiNhanhId).toBeUndefined();
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
  ])('DSV-06 ca âm: %s ⇒ 400', async (_name, query) => {
    const errors = await errorsOf(query);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors)
      expect(['page', 'pageSize']).toContain(error.truong);
  });

  it('DSV-12, DSV-14 `trangThai` nhận cả bảy trạng thái, kể cả DaDoiLich (khác Bệnh nhân)', async () => {
    for (const state of TRANG_THAI_LICH_HEN)
      expect((await parse({ trangThai: state })).trangThai).toStrictEqual([
        state,
      ]);
  });

  it('DSV-14 `trangThai` các dạng: một giá trị, dấu phẩy, bỏ trùng; giá trị lạ, chuỗi rỗng ⇒ 400 IS_IN', async () => {
    expect(
      (await parse({ trangThai: 'DaDoiLich,DaHuy,DaHuy' })).trangThai,
    ).toStrictEqual(['DaDoiLich', 'DaHuy']);
    expect(
      (await parse({ trangThai: ['DaXacNhan', 'VangMat'] })).trangThai,
    ).toStrictEqual(['DaXacNhan', 'VangMat']);
    for (const bad of ['HoanTat', '', 'dahuy', ' DaHuy'])
      expect(await errorsOf({ trangThai: bad }), bad).toStrictEqual([
        { truong: 'trangThai', ma: 'IS_IN' },
      ]);
  });

  it('DSV-14 đủ chín bộ lọc cùng lúc (chuỗi id giữ nguyên dạng chuỗi), `q` được chuẩn hoá', async () => {
    const parsed = await parse({
      trangThai: 'DaHuy,VangMat',
      chiNhanhId: '9007199254740993',
      chuyenKhoaId: '34',
      bacSiId: '12',
      dichVuKhamId: '56',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: ' Đặng ',
    });
    expect(parsed).toMatchObject({
      trangThai: ['DaHuy', 'VangMat'],
      chiNhanhId: '9007199254740993',
      chuyenKhoaId: '34',
      bacSiId: '12',
      dichVuKhamId: '56',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'Đặng',
    });
  });

  it.each([
    ['chiNhanhId', 'abc'],
    ['chiNhanhId', '0'],
    ['chuyenKhoaId', '1.5'],
    ['bacSiId', '9223372036854775808'],
    ['dichVuKhamId', '-1'],
  ])('DSV-14 id lọc sai dạng: %s = %s ⇒ 400 IS_BIGINT_ID', async (key, bad) => {
    expect(await errorsOf({ [key]: bad })).toStrictEqual([
      { truong: key, ma: 'IS_BIGINT_ID' },
    ]);
  });

  it('DSV-04, DSV-14 ngày không có thật ⇒ IS_CALENDAR_DATE; `denNgay` trước `tuNgay` ⇒ IS_NOT_BEFORE_FROM; cùng ngày là hợp lệ', async () => {
    expect(await errorsOf({ tuNgay: '2026-13-45' })).toStrictEqual([
      { truong: 'tuNgay', ma: 'IS_CALENDAR_DATE' },
    ]);
    expect(
      await errorsOf({ tuNgay: '2026-11-10', denNgay: '2026-11-09' }),
    ).toStrictEqual([{ truong: 'denNgay', ma: 'IS_NOT_BEFORE_FROM' }]);
    expect(
      await parse({ tuNgay: '2026-11-10', denNgay: '2026-11-10' }),
    ).toMatchObject({ tuNgay: '2026-11-10', denNgay: '2026-11-10' });
  });

  it.each([
    ['rỗng', ''],
    ['một ký tự', 'a'],
    ['101 ký tự', 'a'.repeat(101)],
    ['có ký tự điều khiển', 'ab\ncd'],
  ])('DSV-07 `q` %s ⇒ MỘT lỗi TU_KHOA_KHONG_HOP_LE', async (_name, q) => {
    expect(await errorsOf({ q })).toStrictEqual([
      { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
    ]);
  });

  it.each([
    ['benhNhanId (chủ sở hữu không do client gửi)', { benhNhanId: '1' }],
    ['thanhToan (chờ payment)', { thanhToan: 'DaThanhToanDu' }],
    ['nhom (của Bệnh nhân)', { nhom: 'SapToi' }],
    ['hoSoNguoiThanId (của Bệnh nhân)', { hoSoNguoiThanId: 'BanThan' }],
    ['sapXep (Lễ tân luôn tăng dần)', { sapXep: 'MoiNhat' }],
    ['khoá lạ', { foo: '1' }],
  ])(
    'DSV-14, QB-03 ca âm: %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP',
    async (_name, query) => {
      const errors = await errorsOf(query);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.ma).toBe('TRUONG_KHONG_DUOC_PHEP');
    },
  );

  it('DSV-01, DSV-14 `chiNhanhId` đúng dạng được nhận (service của Lễ tân bỏ qua, của Toàn hệ thống dùng làm bộ lọc)', async () => {
    expect((await parse({ chiNhanhId: '2' })).chiNhanhId).toBe('2');
  });
});
