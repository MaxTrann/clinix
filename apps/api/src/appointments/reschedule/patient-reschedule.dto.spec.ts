import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import {
  PatientRescheduleDto,
  ReschedulePreviewQueryDto,
} from './patient-reschedule.dto.js';

// Task reschedule B6 — DLH-11 (DTO của hai route đổi lịch Bệnh nhân) qua ĐÚNG cấu hình ValidationPipe của `configureApp` (QDL-08: chủ sở hữu chỉ từ access token). Không DB.
// Biên của `khungGioId` (id BIGINT dạng chuỗi) ở cả thân và query thuộc DLH-11. Độ dài `lyDoYeuCau` (5 đến 500) CỐ Ý không kiểm ở DTO (xem `patient-reschedule.dto.ts`); ca "độ dài khi dùng đến" ở
// `patient-reschedule.service.spec.ts` và e2e.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const parseBody = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: PatientRescheduleDto,
  }) as Promise<PatientRescheduleDto>;
const parseQuery = (query: unknown) =>
  pipe.transform(query, {
    type: 'query',
    metatype: ReschedulePreviewQueryDto,
  }) as Promise<ReschedulePreviewQueryDto>;

async function errorsOf(parse: () => Promise<unknown>) {
  try {
    await parse();
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    const response = error.getResponse() as {
      maLoi: string;
      loi: { truong: string; ma: string }[];
    };
    expect(response.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    return response.loi;
  }
  throw new Error('đầu vào lẽ ra phải bị từ chối');
}

const BAD_IDS: [string, unknown][] = [
  ['số JSON', 12],
  ['chuỗi rỗng', ''],
  ['chỉ khoảng trắng', ' '],
  ['khoảng trắng đầu', ' 12'],
  ['số 0', '0'],
  ['số 0 đứng đầu', '012'],
  ['số âm', '-1'],
  ['số thập phân', '1.5'],
  ['chữ', 'abc'],
  ['vượt BIGINT (2^63)', '9223372036854775808'],
  ['mảng', ['1', '2']],
  ['đối tượng', { id: '1' }],
  ['null', null],
];

describe('DLH-11 PatientRescheduleDto: khungGioId bắt buộc, id BIGINT dạng chuỗi', () => {
  it('id hợp lệ giữ NGUYÊN chuỗi, kể cả id lớn hơn 2^53 và id lớn nhất của BIGINT', async () => {
    expect((await parseBody({ khungGioId: '12' })).khungGioId).toBe('12');
    expect(
      (await parseBody({ khungGioId: '9007199254740993' })).khungGioId,
    ).toBe('9007199254740993');
    expect(
      (await parseBody({ khungGioId: '9223372036854775807' })).khungGioId,
    ).toBe('9223372036854775807');
  });

  it('thiếu khungGioId (thân rỗng) ⇒ 400 khungGioId IS_BIGINT_ID', async () => {
    expect(await errorsOf(() => parseBody({}))).toEqual([
      { truong: 'khungGioId', ma: 'IS_BIGINT_ID' },
    ]);
  });

  it.each(BAD_IDS)('khungGioId %s ⇒ 400 IS_BIGINT_ID', async (_name, value) => {
    expect(await errorsOf(() => parseBody({ khungGioId: value }))).toEqual([
      { truong: 'khungGioId', ma: 'IS_BIGINT_ID' },
    ]);
  });
});

describe('DLH-11, QDL-08 PatientRescheduleDto: khoá lạ bị từ chối (chủ sở hữu chỉ từ access token)', () => {
  it.each([
    'benhNhanId',
    'accountId',
    'lichHenId',
    'trangThai',
    'hoSoNguoiThanId',
  ])('khoá lạ %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP', async (key) => {
    expect(
      await errorsOf(() => parseBody({ khungGioId: '12', [key]: '5' })),
    ).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
  });
});

describe('DLH-11 PatientRescheduleDto: lyDoYeuCau tuỳ chọn, chuẩn hoá, KHÔNG kiểm độ dài ở DTO', () => {
  const withReason = (lyDoYeuCau: unknown) =>
    parseBody({ khungGioId: '12', lyDoYeuCau });

  it('vắng ⇒ undefined', async () => {
    expect((await parseBody({ khungGioId: '12' })).lyDoYeuCau).toBeUndefined();
  });

  it('null, rỗng hoặc chỉ khoảng trắng ASCII ⇒ coi như VẮNG (không 400): hết lần thì web được nhắc nhập lý do', async () => {
    expect((await withReason(null)).lyDoYeuCau).toBeUndefined();
    expect((await withReason('')).lyDoYeuCau).toBeUndefined();
    expect((await withReason('   ')).lyDoYeuCau).toBeUndefined();
    expect((await withReason(' \t\r\n ')).lyDoYeuCau).toBeUndefined();
  });

  it('có chữ ⇒ giữ, đã cắt khoảng trắng ASCII hai đầu và chuẩn hoá NFC (cùng normalizeRequestReason của B5)', async () => {
    expect((await withReason('  Có việc đột xuất \n')).lyDoYeuCau).toBe(
      'Có việc đột xuất',
    );
    // "é" dựng sẵn (U+00E9) và "e" + dấu sắc rời (U+0065 U+0301) về cùng MỘT dạng
    expect((await withReason('Café bận')).lyDoYeuCau).toBe('Café bận');
  });

  it('NBSP (U+00A0) KHÔNG phải khoảng trắng ASCII nên giữ nguyên và coi là CÓ lý do (B5 cố ý không String.trim())', async () => {
    expect((await withReason(' ')).lyDoYeuCau).toBe(' ');
  });

  it('độ dài KHÔNG kiểm ở DTO: 3 ký tự và 501 ký tự vẫn qua (dịch vụ B5 kiểm khi dùng đến; lý do thừa bị bỏ qua khi còn lần)', async () => {
    expect((await withReason('abc')).lyDoYeuCau).toBe('abc');
    expect((await withReason('a'.repeat(501))).lyDoYeuCau).toHaveLength(501);
  });

  it.each([
    ['số', 123],
    ['đối tượng', { a: 1 }],
    ['mảng', ['abc']],
    ['boolean', true],
  ])('sai KIỂU (%s) ⇒ 400 lyDoYeuCau IS_STRING', async (_name, value) => {
    expect(await errorsOf(() => withReason(value))).toEqual([
      { truong: 'lyDoYeuCau', ma: 'IS_STRING' },
    ]);
  });
});

describe('DLH-11 ReschedulePreviewQueryDto: khungGioId tuỳ chọn, cùng ràng buộc id', () => {
  it('vắng ⇒ hợp lệ (chỉ hỏi điều kiện đổi)', async () => {
    expect((await parseQuery({})).khungGioId).toBeUndefined();
  });

  it('id hợp lệ giữ nguyên chuỗi, kể cả lớn hơn 2^53', async () => {
    expect(
      (await parseQuery({ khungGioId: '9007199254740993' })).khungGioId,
    ).toBe('9007199254740993');
  });

  it.each(BAD_IDS.filter(([name]) => name !== 'null'))(
    'khungGioId %s ⇒ 400 IS_BIGINT_ID (kể cả lặp khoá ra mảng và chuỗi rỗng)',
    async (_name, value) => {
      expect(await errorsOf(() => parseQuery({ khungGioId: value }))).toEqual([
        { truong: 'khungGioId', ma: 'IS_BIGINT_ID' },
      ]);
    },
  );

  it('khoá lạ ở query (benhNhanId) ⇒ 400 TRUONG_KHONG_DUOC_PHEP (QDL-08)', async () => {
    expect(await errorsOf(() => parseQuery({ benhNhanId: '5' }))).toEqual([
      { truong: 'benhNhanId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  });
});
