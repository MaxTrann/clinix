import { ValidationPipe } from '@nestjs/common';
import type {
  AppException,
  FieldError,
} from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { PutRatingDto } from './patient-rating.dto.js';

// article B3: kiểm DTO thân của `PUT /patient/articles/:id/rating` bằng đúng cấu hình ValidationPipe của app thật (app.setup.ts). Phủ phần dữ liệu vào của ABR-06 (loại lạ ⇒
// 400 `DU_LIEU_KHONG_HOP_LE` với `loi[{ truong: 'loai', ma: 'LOAI_DANH_GIA_KHONG_HOP_LE' }]`) và ABR-01 (khoá lạ, nhất là `benhNhanId`: chủ phiếu chỉ lấy từ token).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

async function errorsOf(value: unknown): Promise<FieldError[]> {
  try {
    await pipe.transform(value, { type: 'body', metatype: PutRatingDto });
    return [];
  } catch (error) {
    const body = (error as AppException).getResponse() as {
      maLoi: string;
      loi: FieldError[];
    };
    expect(body.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    return body.loi;
  }
}

const INVALID_TYPE: FieldError = {
  truong: 'loai',
  ma: 'LOAI_DANH_GIA_KHONG_HOP_LE',
};

describe('article B3 — DTO của PUT đánh giá', () => {
  it.each(['Thich', 'KhongThich'])('ABR-02: loai %s hợp lệ', async (loai) => {
    expect(await errorsOf({ loai })).toEqual([]);
  });

  it.each([
    ['rỗng', ''],
    ['sai hoa thường', 'thich'],
    ['chữ hoa hết', 'THICH'],
    ['có dấu cách thừa', ' Thich'],
    ['chữ khác', 'Yeuthich'],
    ['có dấu tiếng Việt', 'Thích'],
    ['null', null],
    ['số', 1],
    ['mảng', ['Thich']],
    ['đối tượng', { a: 1 }],
    ['boolean', true],
  ])('ABR-06: loai %s ⇒ LOAI_DANH_GIA_KHONG_HOP_LE', async (_name, loai) => {
    expect(await errorsOf({ loai })).toEqual([INVALID_TYPE]);
  });

  it('ABR-06: thân rỗng hay thiếu loai ⇒ LOAI_DANH_GIA_KHONG_HOP_LE (PUT không có thân cũng vậy)', async () => {
    expect(await errorsOf({})).toEqual([INVALID_TYPE]);
    expect(await errorsOf(undefined)).toEqual([INVALID_TYPE]);
  });

  it.each([
    ['benhNhanId', { loai: 'Thich', benhNhanId: '5' }],
    ['baiVietId', { loai: 'Thich', baiVietId: '7' }],
    ['luotThich', { loai: 'Thich', luotThich: 99 }],
  ])(
    'ABR-01: khoá lạ %s ⇒ TRUONG_KHONG_DUOC_PHEP (mã chủ phiếu không nhận từ thân)',
    async (key, body) => {
      expect(await errorsOf(body)).toEqual([
        { truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    },
  );

  it('ABR-06: loai lạ kèm khoá lạ ⇒ báo cả hai lỗi', async () => {
    expect(
      (await errorsOf({ loai: 'x', benhNhanId: '5' })).map((e) => e.ma).sort(),
    ).toEqual(['LOAI_DANH_GIA_KHONG_HOP_LE', 'TRUONG_KHONG_DUOC_PHEP']);
  });
});
