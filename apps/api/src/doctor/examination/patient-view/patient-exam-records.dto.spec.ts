import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { PatientExamRecordsQueryDto } from './patient-exam-records.dto.js';

// doctor-exam B4 — PatientExamRecordsQueryDto qua ĐÚNG cấu hình ValidationPipe của configureApp (PLAN 5.6; X1 M9; XHS-05, XHS-12, XHS-13, QHK-03). Không DB.
// HTTP thật (guard trước pipe, no-store): test/doctor-exam-patient-records.e2e-spec.ts. Mã `ma` của ràng buộc có sẵn là tên ràng buộc SNAKE_CASE hoa (isInt ⇒ IS_INT).
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
    metatype: PatientExamRecordsQueryDto,
  }) as Promise<PatientExamRecordsQueryDto>;

async function errorsOf(query: unknown) {
  try {
    await parse(query);
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    const response = error.getResponse() as {
      maLoi: string;
      loi: { truong: string; ma: string }[];
    };
    expect(response.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    return { loi: response.loi, text: JSON.stringify(response) };
  }
  throw new Error('query lẽ ra phải bị từ chối');
}

describe('XHS-05 query hợp lệ và giá trị mặc định', () => {
  it('query rỗng: không lỗi; page 1, pageSize 20, offset 0; nguoiKham, nam, thang vắng', async () => {
    const query = await parse({});
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.offset).toBe(0);
    expect(query.nguoiKham).toBeUndefined();
    expect(query.nam).toBeUndefined();
    expect(query.thang).toBeUndefined();
  });

  it('chuỗi của query được đổi thành số; offset = (page − 1) × pageSize', async () => {
    const query = await parse({
      nguoiKham: 'BanThan',
      nam: '2026',
      thang: '11',
      page: '3',
      pageSize: '50',
    });
    expect(query).toMatchObject({
      nguoiKham: 'BanThan',
      nam: 2026,
      thang: 11,
      page: 3,
      pageSize: 50,
    });
    expect(query.offset).toBe(100);
  });

  it('XHS-05 biên: pageSize 50 đạt; 51 ⇒ MAX; 0 ⇒ MIN; page 0 ⇒ MIN; chữ ⇒ IS_INT', async () => {
    expect((await parse({ pageSize: '50' })).pageSize).toBe(50);
    expect((await errorsOf({ pageSize: '51' })).loi).toEqual([
      { truong: 'pageSize', ma: 'MAX' },
    ]);
    expect((await errorsOf({ pageSize: '0' })).loi).toEqual([
      { truong: 'pageSize', ma: 'MIN' },
    ]);
    expect((await errorsOf({ page: '0' })).loi).toEqual([
      { truong: 'page', ma: 'MIN' },
    ]);
    expect((await errorsOf({ pageSize: 'abc' })).loi).toContainEqual({
      truong: 'pageSize',
      ma: 'IS_INT',
    });
  });
});

describe('XHS-13 nam, thang, nguoiKham ngoài miền hay sai dạng ⇒ 400', () => {
  it('nam: 2000 và 2100 đạt; 1999 ⇒ MIN; 2101 ⇒ MAX; rỗng ⇒ MIN; thập phân và chữ ⇒ IS_INT; lặp khoá ⇒ lỗi', async () => {
    expect((await parse({ nam: '2000' })).nam).toBe(2000);
    expect((await parse({ nam: '2100' })).nam).toBe(2100);
    expect((await errorsOf({ nam: '1999' })).loi).toEqual([
      { truong: 'nam', ma: 'MIN' },
    ]);
    expect((await errorsOf({ nam: '2101' })).loi).toEqual([
      { truong: 'nam', ma: 'MAX' },
    ]);
    expect((await errorsOf({ nam: '' })).loi).toEqual([
      { truong: 'nam', ma: 'MIN' },
    ]);
    for (const bad of ['2026.5', 'abc', ['2026', '2027']])
      expect((await errorsOf({ nam: bad })).loi).toContainEqual({
        truong: 'nam',
        ma: 'IS_INT',
      });
  });

  it('thang: 1 và 12 đạt; 0 ⇒ MIN; 13 ⇒ MAX; 1,5 và chữ ⇒ IS_INT', async () => {
    expect((await parse({ thang: '1' })).thang).toBe(1);
    expect((await parse({ thang: '12' })).thang).toBe(12);
    expect((await errorsOf({ thang: '0' })).loi).toEqual([
      { truong: 'thang', ma: 'MIN' },
    ]);
    expect((await errorsOf({ thang: '13' })).loi).toEqual([
      { truong: 'thang', ma: 'MAX' },
    ]);
    for (const bad of ['1.5', 'abc'])
      expect((await errorsOf({ thang: bad })).loi).toContainEqual({
        truong: 'thang',
        ma: 'IS_INT',
      });
  });

  it('nguoiKham: BanThan và id BIGINT đạt (kể cả giá trị lớn nhất); chữ thường, chữ lạ, 0, số 0 đầu, vượt BIGINT, rỗng, lặp khoá ⇒ IS_VISIT_PROFILE_FILTER', async () => {
    for (const ok of ['BanThan', '17', '9223372036854775807'])
      expect((await parse({ nguoiKham: ok })).nguoiKham).toBe(ok);
    for (const bad of [
      'banThan',
      'abc',
      '0',
      '017',
      '9223372036854775808',
      '',
      ['1', '2'],
    ])
      expect((await errorsOf({ nguoiKham: bad })).loi).toEqual([
        { truong: 'nguoiKham', ma: 'IS_VISIT_PROFILE_FILTER' },
      ]);
  });
});

describe('XHS-12, QHK-03 khoá lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP, lỗi không lặp lại giá trị', () => {
  it.each(['benhNhanId', 'bacSiId', 'hoSoNguoiThanId', 'trangThai', 'tuyY'])(
    'khoá `%s` ở query bị từ chối đúng một lần, kèm tên trường, không kèm giá trị',
    async (key) => {
      const giaTriThu = 'GIA-TRI-NHAY-CAM-12345';
      const { loi, text } = await errorsOf({ [key]: giaTriThu });
      expect(loi).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
      expect(text).not.toContain(giaTriThu);
    },
  );

  it('khoá lạ cạnh khoá hợp lệ: chỉ khoá lạ bị báo', async () => {
    expect((await errorsOf({ nam: '2026', benhNhanId: '5' })).loi).toEqual([
      { truong: 'benhNhanId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  });
});
