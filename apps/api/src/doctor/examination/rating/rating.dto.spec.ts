import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { RatingDto } from './rating.dto.js';

// doctor-exam B6 — RatingDto qua ĐÚNG cấu hình ValidationPipe của configureApp (PLAN 5.7; X1 M9; DGB-02, DGB-10, QHK-03). DTO CHỈ ĐÁNH DẤU trường: quy tắc ở rating.rules.spec.ts.
// Ca ĐẦU TIÊN kiểm rủi ro (1) của kế hoạch: `@Allow()` có giữ `soSao` qua `whitelist` (mọi kiểu giá trị) mà không sinh lỗi kiểu hay không. Không DB. HTTP thật: test/doctor-exam-rating.e2e-spec.ts.
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
    metatype: RatingDto,
  }) as Promise<RatingDto>;

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

describe('DGB-02 soSao: DTO giữ trường qua whitelist với MỌI kiểu giá trị (kiểu và miền là việc của rules)', () => {
  it('@Allow() giữ soSao: số hợp lệ, số sai miền, số lẻ, chuỗi, null, boolean, mảng, đối tượng đều đi qua nguyên vẹn, không lỗi kiểu', async () => {
    for (const value of [1, 5, 0, 6, -1, 3.5, '3', null, true, [4], { a: 1 }]) {
      const parsed = await parse({ soSao: value });
      expect(parsed.soSao).toStrictEqual(value);
    }
  });

  it('soSao vắng: thân `{}` và thân chỉ có nhận xét đều đi qua (BAT_BUOC do rules quyết, không phải DTO)', async () => {
    expect((await parse({})).soSao).toBeUndefined();
    expect((await parse({ nhanXet: 'Tốt' })).soSao).toBeUndefined();
  });
});

describe('DGB-03 nhanXet: tuỳ chọn; DTO chỉ chặn kiểu', () => {
  it('vắng, null, chuỗi rỗng, chuỗi rất dài đi qua nguyên vẹn (độ dài và chuẩn hoá ở rules)', async () => {
    expect((await parse({ soSao: 5 })).nhanXet).toBeUndefined();
    expect((await parse({ soSao: 5, nhanXet: null })).nhanXet).toBeNull();
    expect((await parse({ soSao: 5, nhanXet: '' })).nhanXet).toBe('');
    const long = 'ế'.repeat(100_000);
    expect((await parse({ soSao: 5, nhanXet: long })).nhanXet).toHaveLength(
      100_000,
    );
  });

  it('không phải chuỗi (số, mảng, đối tượng, boolean) ⇒ 400 nhanXet IS_STRING (mã tự sinh, nếp B2; không thêm mã mới)', async () => {
    for (const bad of [5, ['x'], { a: 1 }, true])
      expect(await errorsOf({ soSao: 5, nhanXet: bad })).toEqual([
        { truong: 'nhanXet', ma: 'IS_STRING' },
      ]);
  });
});

describe('DGB-10, QHK-03 khoá lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP; không lặp lại giá trị', () => {
  it.each([
    'bacSiId',
    'biAn',
    'lyDoAn',
    'lichHenId',
    'thoiDiemTao',
    'benhNhanId',
    'maLichHen',
    'danhGiaId',
    'tuyY',
  ])(
    '%s ⇒ mã TRƯỜNG; chủ sở hữu và lịch không bao giờ lấy từ thân',
    async (extra) => {
      expect(await errorsOf({ soSao: 5, [extra]: '1' })).toEqual([
        { truong: extra, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    },
  );

  it('lỗi KHÔNG chứa giá trị người dùng gửi (chuỗi dấu hiệu đặt trong giá trị sai của nhanXet và giá trị của khoá lạ)', async () => {
    const mark = 'DGBLEAKMARK';
    const errors = await errorsOf({
      soSao: mark,
      nhanXet: [mark],
      bacSiId: mark,
      biAn: mark,
    });
    expect(JSON.stringify(errors)).not.toContain(mark);
  });
});
