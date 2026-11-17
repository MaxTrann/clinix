import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { HideRatingDto } from './rating-hide.dto.js';

// doctor-exam B8 — HideRatingDto qua ĐÚNG cấu hình ValidationPipe của configureApp (PLAN 5.8; X1 M9; KDD-05, QHK-03; BDK-04). DTO CHỈ ĐÁNH DẤU trường: quy tắc ở rating-hide.rules.spec.ts. Không DB.
// HTTP thật (guard trước pipe, no-store): test/doctor-exam-admin-hide-rating.e2e-spec.ts.
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
    metatype: HideRatingDto,
  }) as Promise<HideRatingDto>;

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
    return { loi: response.loi, text: JSON.stringify(response) };
  }
  throw new Error('thân lẽ ra phải bị từ chối');
}

describe('KDD-05 lyDo: DTO chỉ chặn KIỂU; vắng, null, rỗng, rất dài đi qua nguyên vẹn (mã LY_DO_* là việc của rules)', () => {
  it('thân `{}`, `lyDo` vắng, `null`, rỗng, toàn khoảng trắng, rất dài: không lỗi, giữ nguyên giá trị', async () => {
    expect((await parse({})).lyDo).toBeUndefined();
    expect((await parse({ lyDo: null })).lyDo).toBeNull();
    expect((await parse({ lyDo: '' })).lyDo).toBe('');
    expect((await parse({ lyDo: '   ' })).lyDo).toBe('   ');
    const long = 'ế'.repeat(100_000);
    expect((await parse({ lyDo: long })).lyDo).toHaveLength(100_000);
  });

  it('chuỗi hợp lệ đi qua nguyên văn (chuẩn hoá và độ dài ở rules, không ở DTO)', async () => {
    const reason = '  Nội dung quảng cáo, không liên quan  ';
    expect((await parse({ lyDo: reason })).lyDo).toBe(reason);
  });

  it.each([
    ['số', 12345],
    ['số 0', 0],
    ['true', true],
    ['mảng', ['một lý do đủ dài']],
    ['đối tượng', { noiDung: 'một lý do đủ dài' }],
  ])(
    '%s ⇒ đúng một lỗi IS_STRING của lyDo, không lặp lại giá trị (BDK-04)',
    async (_name, value) => {
      const { loi, text } = await errorsOf({ lyDo: value });
      expect(loi).toEqual([{ truong: 'lyDo', ma: 'IS_STRING' }]);
      expect(text).not.toContain('đủ dài');
    },
  );
});

describe('QHK-03 khoá lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP, lỗi không lặp lại giá trị', () => {
  it.each([
    'biAn',
    'lyDoAn',
    'bacSiId',
    'danhGiaId',
    'lichHenId',
    'nhanXet',
    'soSao',
    'adminId',
    'taiKhoanId',
    'chiNhanhId',
  ])(
    'khoá `%s` ở thân bị từ chối đúng một lần, kèm tên trường, không kèm giá trị',
    async (key) => {
      const giaTriThu = 'GIA-TRI-NHAY-CAM-12345';
      const { loi, text } = await errorsOf({
        lyDo: 'Nội dung quảng cáo',
        [key]: giaTriThu,
      });
      expect(loi).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
      expect(text).not.toContain(giaTriThu);
    },
  );

  it('khoá lạ cạnh `lyDo` không phải chuỗi: cả hai lỗi được báo, mỗi trường một lỗi', async () => {
    const { loi } = await errorsOf({ lyDo: 5, biAn: false });
    expect(loi).toHaveLength(2);
    expect(loi).toContainEqual({ truong: 'lyDo', ma: 'IS_STRING' });
    expect(loi).toContainEqual({
      truong: 'biAn',
      ma: 'TRUONG_KHONG_DUOC_PHEP',
    });
  });
});
