import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { BookingChecksDto } from './booking-checks.dto.js';

// Task B7 — DTO thân `POST /booking/checks` qua ĐÚNG cấu hình ValidationPipe của configureApp (BCK-02, QB-03; TRACKING 3.18.2 mục 3). Mã BCK-nn là [đề xuất].
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const parse = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: BookingChecksDto,
  }) as Promise<BookingChecksDto>;

async function errorsOf(body: unknown) {
  try {
    await parse(body);
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
  throw new Error('thân lẽ ra phải bị từ chối');
}

describe('BookingChecksDto: thân hợp lệ (BCK-02)', () => {
  it('BCK-02 chỉ khungGioId ⇒ hợp lệ, hoSoNguoiThanId vắng (hồ sơ bản thân)', async () => {
    const dto = await parse({ khungGioId: '123' });

    expect(dto.khungGioId).toBe('123');
    expect(dto.hoSoNguoiThanId).toBeUndefined();
  });

  it('BCK-02 hoSoNguoiThanId là null ⇒ hợp lệ (cùng nghĩa với vắng)', async () => {
    const dto = await parse({ khungGioId: '123', hoSoNguoiThanId: null });

    expect(dto.hoSoNguoiThanId).toBeNull();
  });

  it('BCK-02 hoSoNguoiThanId là chuỗi id ⇒ hợp lệ; id lớn hơn 2^53 giữ nguyên CHUỖI, không qua Number', async () => {
    const dto = await parse({
      khungGioId: '9007199254740993',
      hoSoNguoiThanId: '9223372036854775807',
    });

    expect(dto.khungGioId).toBe('9007199254740993');
    expect(dto.hoSoNguoiThanId).toBe('9223372036854775807');
  });
});

describe('BookingChecksDto: khungGioId sai (BCK-02)', () => {
  it.each([
    { ten: 'vắng', body: {} },
    { ten: 'null', body: { khungGioId: null } },
    { ten: 'số JSON (không ép chuỗi)', body: { khungGioId: 12 } },
    { ten: 'chuỗi rỗng', body: { khungGioId: '' } },
    { ten: '0', body: { khungGioId: '0' } },
    { ten: 'số 0 đứng đầu', body: { khungGioId: '012' } },
    { ten: 'có dấu cách đầu', body: { khungGioId: ' 12' } },
    { ten: 'có dấu cách cuối', body: { khungGioId: '12 ' } },
    { ten: 'số âm', body: { khungGioId: '-1' } },
    { ten: 'chữ', body: { khungGioId: 'abc' } },
    { ten: 'số thập phân', body: { khungGioId: '1.5' } },
    {
      ten: 'lớn hơn BIGINT lớn nhất',
      body: { khungGioId: '9223372036854775808' },
    },
    { ten: 'mảng', body: { khungGioId: ['1'] } },
    { ten: 'đối tượng', body: { khungGioId: { $gt: '0' } } },
  ])('BCK-02 khungGioId $ten ⇒ 400, lỗi ở đúng trường', async ({ body }) => {
    const loi = await errorsOf(body);

    expect(loi.some((item) => item.truong === 'khungGioId')).toBe(true);
    expect(loi.find((item) => item.truong === 'khungGioId')?.ma).toBe(
      'IS_BIGINT_ID',
    );
  });

  it('BCK-02 thân là mảng hoặc không phải đối tượng ⇒ không bao giờ lọt (khungGioId vẫn thiếu)', async () => {
    for (const body of [[], 'x', 7, null, undefined]) {
      await expect(parse(body)).rejects.toBeInstanceOf(AppException);
    }
  });
});

describe('BookingChecksDto: hoSoNguoiThanId sai (BCK-02)', () => {
  it.each([
    { ten: 'chữ', value: 'abc' },
    { ten: 'số JSON', value: 12 },
    { ten: 'chuỗi rỗng', value: '' },
    { ten: '0', value: '0' },
    { ten: 'có dấu cách', value: ' 5' },
    {
      ten: 'BanThan (chỉ của bộ lọc danh sách, không phải thân checks)',
      value: 'BanThan',
    },
    { ten: 'lớn hơn BIGINT', value: '9223372036854775808' },
  ])(
    'BCK-02 hoSoNguoiThanId $ten ⇒ 400, lỗi ở đúng trường',
    async ({ value }) => {
      const loi = await errorsOf({ khungGioId: '5', hoSoNguoiThanId: value });

      expect(loi).toStrictEqual([
        { truong: 'hoSoNguoiThanId', ma: 'IS_BIGINT_ID' },
      ]);
    },
  );
});

describe('BookingChecksDto: khoá lạ (BCK-02, QB-03)', () => {
  it.each([
    'benhNhanId',
    'bacSiId',
    'chiNhanhId',
    'dichVuKhamId',
    'trangThai',
    'lyDoKham',
    'taiKhoanId',
    'khungGioID',
  ])(
    'BCK-02 khoá "%s" ⇒ 400 TRUONG_KHONG_DUOC_PHEP (chủ sở hữu chỉ từ access token)',
    async (key) => {
      const loi = await errorsOf({ khungGioId: '5', [key]: '1' });

      expect(loi).toStrictEqual([
        { truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    },
  );

  it('BCK-02 khoá lạ đi cùng khungGioId sai ⇒ báo cả hai lỗi (không che nhau)', async () => {
    const loi = await errorsOf({ khungGioId: 'x', benhNhanId: '1' });

    expect(loi.map((item) => item.truong).sort()).toStrictEqual([
      'benhNhanId',
      'khungGioId',
    ]);
  });
});
