import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { SearchPatientsQueryDto } from './patient-lookup.dto.js';

// Task B6 — `SearchPatientsQueryDto` NỐI DÂY đúng luật của `q` và phân trang qua ĐÚNG cấu hình ValidationPipe của configureApp (app.setup.ts).
// Luật thuần đã có test riêng ở keyword-policy.spec.ts; ở đây chứng minh DTO gắn đúng decorator và mã lỗi (kết quả đo ValidationPipe thật ở TRACKING B6-B).
// Mã ca PLD-nn là [đề xuất]. Mọi giá trị là chuỗi giả. Query của Express 5 (bộ phân tích đơn giản): `a[x]=1` là khoá chuỗi `a[x]`, `a=1&a=2` là mảng.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const KEYWORD = 'TU_KHOA_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';

const parse = (query: unknown) =>
  pipe.transform(query, {
    type: 'query',
    metatype: SearchPatientsQueryDto,
  }) as Promise<SearchPatientsQueryDto>;

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

const keywordError: FieldError[] = [{ truong: 'q', ma: KEYWORD }];

describe('SearchPatientsQueryDto — q', () => {
  it('PLD-01 (TC-06) q hợp lệ: cắt khoảng trắng hai đầu, đổi NFD thành NFC, biên 2 và 100; page 1 và pageSize 20 mặc định', async () => {
    const trimmed = await parse({ q: '  ab  ' });
    expect(trimmed.q).toBe('ab');
    expect(trimmed.page).toBe(1);
    expect(trimmed.pageSize).toBe(20);
    expect(trimmed.offset).toBe(0);
    expect((await parse({ q: 'Nguyễn'.normalize('NFD') })).q).toBe('Nguyễn');
    expect((await parse({ q: 'x'.repeat(100) })).q).toHaveLength(100);
    expect((await parse({ q: '😀'.repeat(100) })).q).toBe('😀'.repeat(100));
  });

  it.each([
    ['thiếu hẳn', {}],
    ['rỗng', { q: '' }],
    ['chỉ khoảng trắng', { q: '   ' }],
    ['một ký tự', { q: 'a' }],
    ['một ký tự sau khi cắt', { q: ' a ' }],
    ['101 ký tự', { q: 'x'.repeat(101) }],
    ['101 emoji', { q: '😀'.repeat(101) }],
    ['mảng (?q=a&q=b)', { q: ['aa', 'bb'] }],
    ['mảng một phần tử', { q: ['ab'] }],
    ['số', { q: 12 }],
    ['null', { q: null }],
    ['NUL', { q: 'a\u0000b' }],
    ['hai NUL', { q: '\u0000\u0000' }],
    ['tab ở giữa', { q: 'a\tb' }],
    ['ZWSP', { q: 'a​b' }],
  ])(
    'PLD-02 (TC-06) q %s ⇒ 400 đúng MỘT lỗi { q, TU_KHOA_KHONG_HOP_LE }',
    async (_label, query) => {
      expect(await errorsOf(query)).toStrictEqual(keywordError);
    },
  );

  it('PLD-03 (TC-06) q là đối tượng (?q[x]=1, Express 5 chỉ có khoá lạ "q[x]") ⇒ khoá lạ đứng trước, rồi lỗi của q', async () => {
    expect(await errorsOf({ 'q[x]': '1' })).toStrictEqual([
      { truong: 'q[x]', ma: NOT_ALLOWED },
      { truong: 'q', ma: KEYWORD },
    ]);
    expect(await errorsOf({ q: 'ab', 'q[x]': '1' })).toStrictEqual([
      { truong: 'q[x]', ma: NOT_ALLOWED },
    ]);
    expect(await errorsOf({ Q: 'ab' })).toStrictEqual([
      { truong: 'Q', ma: NOT_ALLOWED },
      { truong: 'q', ma: KEYWORD },
    ]);
  });

  it('PLD-04 (QP-05, H3) tham số lạ benhNhanId, chiNhanhId, taiKhoanId ⇒ 400 TRUONG_KHONG_DUOC_PHEP (không bị bỏ qua), kể cả khi q hợp lệ', async () => {
    for (const name of ['benhNhanId', 'chiNhanhId', 'taiKhoanId']) {
      expect(await errorsOf({ q: 'ab', [name]: '1' })).toStrictEqual([
        { truong: name, ma: NOT_ALLOWED },
      ]);
    }
  });

  it('PLD-05 q không bao giờ nằm trong thân lỗi: kết quả lỗi chỉ có truong và ma, giá trị gửi lên không xuất hiện (H5)', async () => {
    const trace = 'DauVetRiengZQ9X';
    let thrown: unknown;
    try {
      await parse({ q: trace, page: '0' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppException);
    expect(
      JSON.stringify((thrown as AppException).getResponse()),
    ).not.toContain(trace);
  });
});

describe('SearchPatientsQueryDto — phân trang (kế thừa PageQueryDto)', () => {
  it('PLD-06 (TC-09) page 1 và pageSize 100 hợp lệ; offset = (page - 1) * pageSize', async () => {
    const dto = await parse({ q: 'ab', page: '3', pageSize: '100' });
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(100);
    expect(dto.offset).toBe(200);
  });

  it.each([
    ['page=0', { page: '0' }, [{ truong: 'page', ma: 'MIN' }]],
    ['page=-1', { page: '-1' }, [{ truong: 'page', ma: 'MIN' }]],
    ['page rỗng', { page: '' }, [{ truong: 'page', ma: 'MIN' }]],
    ['page=1.5', { page: '1.5' }, [{ truong: 'page', ma: 'IS_INT' }]],
    [
      'page=abc',
      { page: 'abc' },
      [
        { truong: 'page', ma: 'MIN' },
        { truong: 'page', ma: 'IS_INT' },
      ],
    ],
    [
      'page lặp (?page=1&page=2)',
      { page: ['1', '2'] },
      [
        { truong: 'page', ma: 'MIN' },
        { truong: 'page', ma: 'IS_INT' },
      ],
    ],
    ['pageSize=0', { pageSize: '0' }, [{ truong: 'pageSize', ma: 'MIN' }]],
    ['pageSize rỗng', { pageSize: '' }, [{ truong: 'pageSize', ma: 'MIN' }]],
    ['pageSize=101', { pageSize: '101' }, [{ truong: 'pageSize', ma: 'MAX' }]],
  ])(
    'PLD-07 (TC-09) %s ⇒ 400 với đúng mã của trường đó',
    async (_label, extra, expected) => {
      expect(await errorsOf({ q: 'ab', ...extra })).toStrictEqual(expected);
    },
  );

  it('PLD-08 (TC-09) lỗi q và lỗi phân trang cùng lúc ⇒ có đủ cả hai (so theo tập, không dựa thứ tự)', async () => {
    const errors = await errorsOf({ q: 'a', page: '0' });
    expect(errors).toHaveLength(2);
    expect(errors).toEqual(
      expect.arrayContaining([
        { truong: 'q', ma: KEYWORD },
        { truong: 'page', ma: 'MIN' },
      ]),
    );
  });

  it('PLD-09 DTO chấp nhận page rất lớn (không có @Max): page=9223372036854775807 qua DTO với offset không an toàn; service phải tránh gửi nó cho MySQL (PLS-02)', async () => {
    const dto = await parse({ q: 'ab', page: '9223372036854775807' });
    expect(dto.page).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(dto.offset).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
  });
});
