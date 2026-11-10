import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  CalendarDayParam,
  IdFilterParam,
  KeywordParam,
  NotBeforeParam,
  StateListParam,
  VisitProfileFilterParam,
} from './list-query.decorators.js';

// Task B1 — các decorator dùng chung của query danh sách lịch hẹn, qua ĐÚNG cấu hình ValidationPipe của configureApp (app.setup.ts). Mã LSH-nn là [đề xuất]
// (TRACKING 3.13.4). Query của Express 5 (bộ phân tích đơn giản): `a[x]=1` là khoá chuỗi `a[x]`, `a=1&a=2` là mảng. Mọi giá trị là chuỗi giả.

class ProbeQuery {
  @StateListParam(['DaHuy', 'VangMat', 'DaXacNhan'])
  trangThai?: string[];

  @VisitProfileFilterParam()
  hoSo?: string;

  @IdFilterParam()
  bacSiId?: string;

  @CalendarDayParam()
  tuNgay?: string;

  @CalendarDayParam()
  @NotBeforeParam('tuNgay')
  denNgay?: string;

  @KeywordParam()
  q?: string;
}

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
    metatype: ProbeQuery,
  }) as Promise<ProbeQuery>;

interface FieldError {
  truong: string;
  ma: string;
}

async function errorsOf(query: unknown): Promise<FieldError[]> {
  try {
    await parse(query);
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    return (error.getResponse() as { loi: FieldError[] }).loi;
  }
  throw new Error('query lẽ ra phải bị từ chối');
}

describe('StateListParam (LSH-15)', () => {
  it('LSH-15 lặp khoá, một giá trị, dấu phẩy và bỏ trùng đều ra mảng đúng; không có thì để trống', async () => {
    expect(
      (await parse({ trangThai: ['DaHuy', 'VangMat'] })).trangThai,
    ).toStrictEqual(['DaHuy', 'VangMat']);
    expect((await parse({ trangThai: 'DaHuy' })).trangThai).toStrictEqual([
      'DaHuy',
    ]);
    expect(
      (await parse({ trangThai: 'DaHuy,VangMat,DaHuy' })).trangThai,
    ).toStrictEqual(['DaHuy', 'VangMat']);
    expect((await parse({})).trangThai).toBeUndefined();
  });

  it.each([
    ['giá trị lạ', { trangThai: 'DaXong' }],
    ['một giá trị lạ trong mảng', { trangThai: ['DaHuy', 'DaXong'] }],
    ['rỗng', { trangThai: '' }],
    ['dấu phẩy thừa', { trangThai: 'DaHuy,' }],
    ['khác hoa thường', { trangThai: 'dahuy' }],
    ['khoảng trắng', { trangThai: ' DaHuy' }],
    ['trạng thái ngoài tập cho phép', { trangThai: 'HoanThanh' }],
  ])('LSH-15 ca âm: %s ⇒ 400 IS_IN', async (_name, query) => {
    expect(await errorsOf(query)).toStrictEqual([
      { truong: 'trangThai', ma: 'IS_IN' },
    ]);
  });

  it('LSH-15 ca âm: khoá có ngoặc vuông bị whitelist chặn (đã đo M8: trangThai[]= và trangThai[0]= ⇒ TRUONG_KHONG_DUOC_PHEP)', async () => {
    expect(await errorsOf({ 'trangThai[]': '' })).toStrictEqual([
      { truong: 'trangThai[]', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    expect(await errorsOf({ 'trangThai[0]': 'DaHuy' })).toStrictEqual([
      { truong: 'trangThai[0]', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  });
});

describe('IdFilterParam, VisitProfileFilterParam (LSH-16)', () => {
  it('LSH-16 id và BanThan hợp lệ đi qua nguyên dạng chuỗi', async () => {
    const parsed = await parse({
      bacSiId: '9223372036854775807',
      hoSo: 'BanThan',
    });
    expect(parsed.bacSiId).toBe('9223372036854775807');
    expect(parsed.hoSo).toBe('BanThan');
    expect((await parse({ hoSo: '12' })).hoSo).toBe('12');
  });

  it.each([
    '0',
    'abc',
    '12345678901234567890',
    '9223372036854775808',
    '',
    '-1',
  ])('LSH-16 ca âm: bacSiId=%j ⇒ 400 IS_BIGINT_ID', async (value) => {
    expect(await errorsOf({ bacSiId: value })).toStrictEqual([
      { truong: 'bacSiId', ma: 'IS_BIGINT_ID' },
    ]);
  });

  it.each(['banthan', '0', '', 'BanThan,1'])(
    'LSH-16 ca âm: hoSo=%j ⇒ 400 IS_VISIT_PROFILE_FILTER',
    async (value) => {
      expect(await errorsOf({ hoSo: value })).toStrictEqual([
        { truong: 'hoSo', ma: 'IS_VISIT_PROFILE_FILTER' },
      ]);
    },
  );

  it('LSH-16 ca âm: lặp khoá (hai id) là mảng, không phải chuỗi ⇒ 400, không lấy phần tử đầu', async () => {
    expect(await errorsOf({ bacSiId: ['1', '2'] })).toStrictEqual([
      { truong: 'bacSiId', ma: 'IS_BIGINT_ID' },
    ]);
  });
});

describe('CalendarDayParam, NotBeforeParam (LSH-12)', () => {
  it('LSH-12 ngày có thật, kể cả ngày nhuận và hai đầu bằng nhau', async () => {
    const parsed = await parse({ tuNgay: '2028-02-29', denNgay: '2028-02-29' });
    expect(parsed.tuNgay).toBe('2028-02-29');
    expect(parsed.denNgay).toBe('2028-02-29');
    expect((await parse({ denNgay: '2026-11-10' })).denNgay).toBe('2026-11-10');
  });

  it.each([
    ['tháng 13 và ngày 45 (qua được @Matches, đã đo M8)', '2026-13-45'],
    ['30 tháng 2', '2026-02-30'],
    ['29 tháng 2 năm thường', '2026-02-29'],
    ['sai dạng ngày/tháng/năm', '10/11/2026'],
    ['có giờ', '2026-11-10T00:00:00'],
    ['không có số 0 đứng đầu', '2026-1-1'],
    ['rỗng', ''],
  ])('LSH-12 ca âm: tuNgay %s ⇒ 400 IS_CALENDAR_DATE', async (_name, value) => {
    expect(await errorsOf({ tuNgay: value })).toStrictEqual([
      { truong: 'tuNgay', ma: 'IS_CALENDAR_DATE' },
    ]);
  });

  it('LSH-12 ca âm: denNgay sai dạng chỉ báo IS_CALENDAR_DATE, không báo thêm lỗi thứ tự', async () => {
    expect(
      await errorsOf({ tuNgay: '2026-11-10', denNgay: '2026-13-45' }),
    ).toStrictEqual([{ truong: 'denNgay', ma: 'IS_CALENDAR_DATE' }]);
  });

  it('LSH-12 ca âm: denNgay trước tuNgay ⇒ 400 IS_NOT_BEFORE_FROM ở denNgay (một ngày là đủ trước)', async () => {
    expect(
      await errorsOf({ tuNgay: '2026-11-10', denNgay: '2026-11-09' }),
    ).toStrictEqual([{ truong: 'denNgay', ma: 'IS_NOT_BEFORE_FROM' }]);
  });

  it('LSH-12 ca biên: tuNgay sai và denNgay đúng chỉ báo lỗi của tuNgay; chỉ có denNgay thì không so thứ tự', async () => {
    expect(
      await errorsOf({ tuNgay: '2026-13-45', denNgay: '2026-11-09' }),
    ).toStrictEqual([{ truong: 'tuNgay', ma: 'IS_CALENDAR_DATE' }]);
    expect((await parse({ denNgay: '1900-01-01' })).denNgay).toBe('1900-01-01');
  });
});

describe('KeywordParam (LSH-08)', () => {
  it('LSH-08 q hợp lệ: cắt khoảng trắng hai đầu, đổi NFD thành NFC, biên 2 và 100 ký tự; không có thì để trống', async () => {
    expect((await parse({ q: '  ab  ' })).q).toBe('ab');
    expect((await parse({ q: 'Nguyễn'.normalize('NFD') })).q).toBe('Nguyễn');
    expect((await parse({ q: 'x'.repeat(100) })).q).toHaveLength(100);
    expect((await parse({ q: '😀'.repeat(100) })).q).toBe('😀'.repeat(100));
    expect((await parse({})).q).toBeUndefined();
  });

  it.each([
    ['rỗng', { q: '' }],
    ['chỉ khoảng trắng', { q: '   ' }],
    ['một ký tự', { q: 'a' }],
    ['101 ký tự', { q: 'x'.repeat(101) }],
    ['101 emoji', { q: '😀'.repeat(101) }],
    ['mảng (?q=a&q=b)', { q: ['aa', 'bb'] }],
    ['ký tự NUL', { q: 'a\u0000b' }],
    ['xuống dòng ở giữa', { q: 'a\nb' }],
  ])(
    'LSH-08 ca âm: %s ⇒ 400 đúng MỘT lỗi { q, TU_KHOA_KHONG_HOP_LE }',
    async (_name, query) => {
      expect(await errorsOf(query)).toStrictEqual([
        { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
      ]);
    },
  );

  it('LSH-08 ca âm: nhiều trường sai cùng lúc báo từng trường một lần', async () => {
    const errors = await errorsOf({
      q: 'a',
      bacSiId: 'x',
      tuNgay: 'sai',
      trangThai: 'Sai',
    });
    expect(errors).toHaveLength(4);
    expect(errors).toEqual(
      expect.arrayContaining([
        { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
        { truong: 'bacSiId', ma: 'IS_BIGINT_ID' },
        { truong: 'tuNgay', ma: 'IS_CALENDAR_DATE' },
        { truong: 'trangThai', ma: 'IS_IN' },
      ]),
    );
  });
});
