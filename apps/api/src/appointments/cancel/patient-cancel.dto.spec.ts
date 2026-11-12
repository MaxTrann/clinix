import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { PatientCancelDto } from './patient-cancel.dto.js';

// Task B10 — HBN-02: DTO thân `POST /patient/appointments/:maLichHen/cancel` qua ĐÚNG cấu hình ValidationPipe của configureApp (HL-13, QB-03; PLAN 7.29 `[đề xuất]`; TRACKING 3.23 B10-G). Không DB.
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
    metatype: PatientCancelDto,
  }) as Promise<PatientCancelDto>;

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

describe('HBN-02 PatientCancelDto: lyDo tuỳ chọn, cắt khoảng trắng, ≤ 255', () => {
  it('thân rỗng ⇒ hợp lệ, lyDo vắng (dùng chữ hằng "Bệnh nhân hủy lịch hẹn", HL-13)', async () => {
    expect((await parse({})).lyDo).toBeUndefined();
  });

  it('lyDo có chữ ⇒ giữ, đã cắt khoảng trắng hai đầu', async () => {
    expect((await parse({ lyDo: 'Bận việc' })).lyDo).toBe('Bận việc');
    expect((await parse({ lyDo: '  Bận việc \n' })).lyDo).toBe('Bận việc');
  });

  it('lyDo rỗng hoặc chỉ khoảng trắng ⇒ coi như VẮNG (không 400): giao diện của Bệnh nhân không có ô nhập', async () => {
    expect((await parse({ lyDo: '' })).lyDo).toBeUndefined();
    expect((await parse({ lyDo: '   ' })).lyDo).toBeUndefined();
  });

  it('biên 255 và 256 ký tự (đếm SAU khi cắt khoảng trắng): 255 hợp lệ, 256 ⇒ 400 lyDo MAX_LENGTH', async () => {
    expect((await parse({ lyDo: 'a'.repeat(255) })).lyDo).toHaveLength(255);
    expect((await parse({ lyDo: ` ${'a'.repeat(255)} ` })).lyDo).toHaveLength(
      255,
    );
    expect(await errorsOf({ lyDo: 'a'.repeat(256) })).toEqual([
      { truong: 'lyDo', ma: 'MAX_LENGTH' },
    ]);
  });

  it('lyDo không phải chuỗi (số, mảng, đối tượng, true) ⇒ 400 lyDo IS_STRING', async () => {
    for (const lyDo of [123, ['a'], { a: 1 }, true]) {
      const errors = await errorsOf({ lyDo });
      expect(errors).toContainEqual({ truong: 'lyDo', ma: 'IS_STRING' });
    }
  });

  it('trường lạ bị từ chối (QB-03): benhNhanId, trangThai, hoanCoc… ⇒ 400 TRUONG_KHONG_DUOC_PHEP; chủ sở hữu chỉ từ access token', async () => {
    for (const extra of ['benhNhanId', 'trangThai', 'hoanCoc', 'maLichHen']) {
      expect(await errorsOf({ [extra]: '1' })).toEqual([
        { truong: extra, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    }
  });
});
