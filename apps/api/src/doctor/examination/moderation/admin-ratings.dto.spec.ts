import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { AdminRatingsQueryDto } from './admin-ratings.dto.js';

// doctor-exam B7 — AdminRatingsQueryDto qua ĐÚNG cấu hình ValidationPipe của configureApp (PLAN 5.8; X1 M9; KDD-02, KDD-19; QHK-07). Không DB.
// HTTP thật (guard trước pipe, no-store): test/doctor-exam-admin-ratings.e2e-spec.ts. Mã `ma` của ràng buộc có sẵn là tên ràng buộc SNAKE_CASE hoa (isInt ⇒ IS_INT).
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
    metatype: AdminRatingsQueryDto,
  }) as Promise<AdminRatingsQueryDto>;

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

describe('KDD-02 query hợp lệ và giá trị mặc định', () => {
  it('query rỗng: không lỗi; page 1, pageSize 20, offset 0; mọi bộ lọc vắng', async () => {
    const query = await parse({});
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.offset).toBe(0);
    for (const key of [
      'trangThai',
      'soSao',
      'bacSiId',
      'chiNhanhId',
      'q',
    ] as const)
      expect(query[key]).toBeUndefined();
  });

  it('đủ bộ lọc: chuỗi của query được đổi thành số; id giữ dạng chuỗi (kể cả giá trị lớn nhất của BIGINT); offset = (page − 1) × pageSize', async () => {
    const query = await parse({
      trangThai: 'DaAn',
      soSao: '3',
      bacSiId: '9223372036854775807',
      chiNhanhId: '7',
      q: 'khám',
      page: '3',
      pageSize: '50',
    });
    expect(query).toMatchObject({
      trangThai: 'DaAn',
      soSao: 3,
      bacSiId: '9223372036854775807',
      chiNhanhId: '7',
      q: 'khám',
      page: 3,
      pageSize: 50,
    });
    expect(query.offset).toBe(100);
  });

  it('KDD-02 biên phân trang: pageSize 50 đạt, 51 ⇒ MAX, 0 ⇒ MIN, trần KHÔNG phải 100 của PageQueryDto; page 0 ⇒ MIN; chữ ⇒ IS_INT', async () => {
    expect((await parse({ pageSize: '50' })).pageSize).toBe(50);
    expect((await errorsOf({ pageSize: '51' })).loi).toEqual([
      { truong: 'pageSize', ma: 'MAX' },
    ]);
    expect((await errorsOf({ pageSize: '100' })).loi).toEqual([
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

describe('KDD-02 trangThai và soSao ngoài miền ⇒ 400', () => {
  it('trangThai: HienThi và DaAn đạt; chữ thường, chữ lạ, rỗng, lặp khoá ⇒ IS_IN', async () => {
    for (const ok of ['HienThi', 'DaAn'] as const)
      expect((await parse({ trangThai: ok })).trangThai).toBe(ok);
    for (const bad of ['hienthi', 'DaAnn', 'Da An', '', ['HienThi', 'DaAn']])
      expect((await errorsOf({ trangThai: bad })).loi).toEqual([
        { truong: 'trangThai', ma: 'IS_IN' },
      ]);
  });

  it('soSao: 1 đến 5 đạt; 0 ⇒ MIN; 6 ⇒ MAX; rỗng ⇒ MIN; 3,5 và chữ ⇒ IS_INT; MỘT phần tử trong mảng (soSao[]=1) và lặp khoá ⇒ IS_INT', async () => {
    for (const ok of ['1', '2', '3', '4', '5'])
      expect((await parse({ soSao: ok })).soSao).toBe(Number(ok));
    expect((await errorsOf({ soSao: '0' })).loi).toEqual([
      { truong: 'soSao', ma: 'MIN' },
    ]);
    expect((await errorsOf({ soSao: '6' })).loi).toEqual([
      { truong: 'soSao', ma: 'MAX' },
    ]);
    expect((await errorsOf({ soSao: '' })).loi).toEqual([
      { truong: 'soSao', ma: 'MIN' },
    ]);
    for (const bad of ['3.5', 'abc', ['1'], ['1', '2']])
      expect((await errorsOf({ soSao: bad })).loi).toContainEqual({
        truong: 'soSao',
        ma: 'IS_INT',
      });
  });

  it('bacSiId và chiNhanhId: id dương đạt; 0, số 0 đầu, âm, chữ, rỗng, 20 chữ số, lặp khoá ⇒ MATCHES (id đúng dạng mà không có dòng nào ⇒ 200 rỗng, thuộc int)', async () => {
    for (const key of ['bacSiId', 'chiNhanhId'] as const) {
      expect((await parse({ [key]: '1' }))[key]).toBe('1');
      for (const bad of [
        '0',
        '017',
        '-1',
        'abc',
        '',
        '12345678901234567890',
        ['1', '2'],
      ])
        expect((await errorsOf({ [key]: bad })).loi).toEqual([
          { truong: key, ma: 'MATCHES' },
        ]);
    }
  });
});

describe('KDD-19 q: bỏ khoảng trắng, NFC, rỗng như vắng, tối đa 100', () => {
  it('bỏ khoảng trắng đầu cuối; tiếng Việt tổ hợp (NFD) được chuẩn hoá NFC', async () => {
    expect((await parse({ q: '  khám kỹ  ' })).q).toBe('khám kỹ');
    const nfd = 'Nguyễn'.normalize('NFD');
    expect(nfd).not.toBe('Nguyễn');
    expect((await parse({ q: nfd })).q).toBe('Nguyễn');
  });

  it('rỗng hay chỉ khoảng trắng (kể cả tab) ⇒ q vắng, KHÔNG phải lỗi', async () => {
    for (const blank of ['', ' ', '   ', '\t \t'])
      expect((await parse({ q: blank })).q).toBeUndefined();
  });

  it('ký tự đặc biệt của LIKE đi qua nguyên văn (việc thoát làm ở repository)', async () => {
    for (const special of ['50%', '_', '!', '\\', '%_!\\'])
      expect((await parse({ q: special })).q).toBe(special);
  });

  it('biên 100: 100 ký tự đạt, 101 ⇒ MAX_LENGTH; lặp khoá ⇒ IS_STRING', async () => {
    expect((await parse({ q: 'a'.repeat(100) })).q).toHaveLength(100);
    expect((await errorsOf({ q: 'a'.repeat(101) })).loi).toEqual([
      { truong: 'q', ma: 'MAX_LENGTH' },
    ]);
    expect((await errorsOf({ q: ['a', 'b'] })).loi).toContainEqual({
      truong: 'q',
      ma: 'IS_STRING',
    });
  });
});

describe('KDD-02, QHK-07 khoá lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP, lỗi không lặp lại giá trị', () => {
  it.each([
    'benhNhanId',
    'nguoiDatId',
    'biAn',
    'lyDoAn',
    'lichHenId',
    'maLichHen',
    'hoTen',
    'tuyY',
  ])(
    'khoá `%s` ở query bị từ chối đúng một lần, kèm tên trường, không kèm giá trị',
    async (key) => {
      const giaTriThu = 'GIA-TRI-NHAY-CAM-12345';
      const { loi, text } = await errorsOf({ [key]: giaTriThu });
      expect(loi).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
      expect(text).not.toContain(giaTriThu);
    },
  );

  it('khoá lạ cạnh khoá hợp lệ: chỉ khoá lạ bị báo', async () => {
    expect((await errorsOf({ soSao: '5', biAn: 'true' })).loi).toEqual([
      { truong: 'biAn', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  });
});
