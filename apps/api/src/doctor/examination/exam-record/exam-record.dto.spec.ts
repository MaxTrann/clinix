import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { ExamRecordDto } from './exam-record.dto.js';

// doctor-exam B2 — ExamRecordDto qua ĐÚNG cấu hình ValidationPipe của configureApp (PLAN 5.5; X1 M9; HSK-05, HSK-15, QHK-02, BDK-04). DTO CHỈ kiểm KIỂU: quy tắc nội dung ở exam-record.rules.spec.ts.
// Không DB. HTTP thật (guard, pipe mã lịch, no-store): test/doctor-exam-record.e2e-spec.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});
const OK = { trieuChung: 'Ho', chanDoanSoBo: 'Viêm họng', huongXuLy: 'Nghỉ' };

const parse = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: ExamRecordDto,
  }) as Promise<ExamRecordDto>;

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

describe('ExamRecordDto: thân hợp lệ', () => {
  it('ba trường chữ + ngày + token: nhận nguyên; ngày và token là TUỲ CHỌN (vắng hoặc null đều được: xoá ngày cũ, "chưa thấy hồ sơ")', async () => {
    const full = {
      ...OK,
      ngayTaiKhamDuKien: '2026-12-01',
      capNhatLanCuoi: '2026-11-10T02:00:00.000Z',
    };
    expect(await parse(full)).toMatchObject(full);
    expect(await parse(OK)).toMatchObject(OK);
    const nulls = await parse({
      ...OK,
      ngayTaiKhamDuKien: null,
      capNhatLanCuoi: null,
    });
    expect(nulls.ngayTaiKhamDuKien).toBeNull();
    expect(nulls.capNhatLanCuoi).toBeNull();
  });

  it('DTO không chặn độ dài hay nội dung (việc của `validateRecordInput`): chuỗi rất dài và chuỗi rỗng đi qua; thân lớn nhất hợp lệ không bị DTO từ chối', async () => {
    const big = { ...OK, huongXuLy: 'ế'.repeat(100_000) };
    expect((await parse(big)).huongXuLy).toHaveLength(100_000);
    expect(await parse({ ...OK, trieuChung: '' })).toBeDefined();
  });
});

describe('HSK-05 kiểu sai ⇒ BAT_BUOC (ba trường chữ) / NGAY_KHONG_HOP_LE (ngày)', () => {
  it.each(['trieuChung', 'chanDoanSoBo', 'huongXuLy'])(
    '%s vắng, null, số, mảng, đối tượng, boolean ⇒ đúng MỘT lỗi BAT_BUOC của trường đó',
    async (field) => {
      const { [field]: _removed, ...rest } = OK as Record<string, string>;
      expect(await errorsOf(rest)).toEqual([{ truong: field, ma: 'BAT_BUOC' }]);
      for (const bad of [null, 5, ['a'], { a: 1 }, true])
        expect(await errorsOf({ ...OK, [field]: bad })).toEqual([
          { truong: field, ma: 'BAT_BUOC' },
        ]);
    },
  );

  it('thiếu cả ba ⇒ ba lỗi BAT_BUOC; thân `{}` cũng vậy', async () => {
    const expected = ['trieuChung', 'chanDoanSoBo', 'huongXuLy'].map(
      (truong) => ({ truong, ma: 'BAT_BUOC' }),
    );
    expect(await errorsOf({})).toEqual(expected);
  });

  it('ngayTaiKhamDuKien không phải chuỗi (số, mảng, đối tượng, boolean) ⇒ NGAY_KHONG_HOP_LE; chuỗi sai dạng đi qua DTO (rules quyết)', async () => {
    for (const bad of [20261110, ['2026-11-10'], { a: 1 }, true])
      expect(await errorsOf({ ...OK, ngayTaiKhamDuKien: bad })).toEqual([
        { truong: 'ngayTaiKhamDuKien', ma: 'NGAY_KHONG_HOP_LE' },
      ]);
    expect(
      (await parse({ ...OK, ngayTaiKhamDuKien: 'sai' })).ngayTaiKhamDuKien,
    ).toBe('sai');
  });

  it('capNhatLanCuoi không phải chuỗi (số, mảng, đối tượng, boolean) ⇒ 400 capNhatLanCuoi IS_STRING', async () => {
    for (const bad of [123, ['x'], { a: 1 }, true])
      expect(await errorsOf({ ...OK, capNhatLanCuoi: bad })).toEqual([
        { truong: 'capNhatLanCuoi', ma: 'IS_STRING' },
      ]);
  });
});

describe('HSK-15, QHK-02 khoá lạ ⇒ 400 TRUONG_KHONG_DUOC_PHEP; không lặp lại giá trị (BDK-04)', () => {
  it('bacSiId, lichHenId, benhNhanId, khoá tuỳ ý ⇒ mã TRƯỜNG; bác sĩ chỉ từ access token', async () => {
    for (const extra of [
      'bacSiId',
      'lichHenId',
      'benhNhanId',
      'maLichHen',
      'trangThai',
      'tuyY',
    ])
      expect(await errorsOf({ ...OK, [extra]: '1' })).toEqual([
        { truong: extra, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
  });

  it('lỗi KHÔNG chứa giá trị người dùng gửi (chuỗi dấu hiệu đặt trong giá trị sai và giá trị của khoá lạ)', async () => {
    const mark = 'BDK04LEAKMARK';
    const errors = await errorsOf({
      trieuChung: [mark],
      chanDoanSoBo: { x: mark },
      huongXuLy: 5,
      bacSiId: mark,
      ngayTaiKhamDuKien: [mark],
    });
    expect(JSON.stringify(errors)).not.toContain(mark);
  });
});
