import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { AskMessageDto } from './ask.dto.js';

// chatbot B3 — DTO của POST /chatbot/messages (bước 1 của 5.4; TLA-12). Dùng đúng cấu hình ValidationPipe của app.setup.ts. Mã ca bổ sung `B3-nn`.
// Độ dài chữ (500, 800 điểm mã) kiểm ở `normalizeQuestion`, `normalizeHistory`: xem ask.service.spec.ts.

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const run = (body: unknown): Promise<AskMessageDto> =>
  pipe.transform(body, {
    type: 'body',
    metatype: AskMessageDto,
  }) as Promise<AskMessageDto>;

async function errorsOf(
  body: unknown,
): Promise<{ truong: string; ma: string }[]> {
  const error: unknown = await run(body).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppException);
  const exception = error as AppException;
  expect(exception.getStatus()).toBe(400);
  expect(exception.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
  return (exception.getResponse() as { loi: { truong: string; ma: string }[] })
    .loi;
}

describe('AskMessageDto (TLA-12)', () => {
  it('B3-60: chỉ có cauHoi là hợp lệ; lichSu và chiNhanhId là tuỳ chọn', async () => {
    const dto = await run({ cauHoi: 'Giá khám bao nhiêu?' });
    expect(dto).toBeInstanceOf(AskMessageDto);
    expect(dto.cauHoi).toBe('Giá khám bao nhiêu?');
    expect(dto.lichSu).toBeUndefined();
    await expect(run({ cauHoi: 'x', lichSu: null })).resolves.toBeDefined();
  });

  it('B3-61: đủ trường, lịch sử đúng 6 lượt ⇒ hợp lệ và lượt thành thể hiện của DTO lồng', async () => {
    const turn = { vai: 'NguoiDung', noiDung: 'a' };
    const dto = await run({
      cauHoi: 'x',
      lichSu: Array(6).fill(turn),
      chiNhanhId: '5',
    });
    expect(dto.lichSu).toHaveLength(6);
    expect(dto.chiNhanhId).toBe('5');
  });

  it.each([
    ['thiếu cauHoi', {}],
    ['cauHoi là số', { cauHoi: 5 }],
    ['cauHoi là mảng', { cauHoi: ['x'] }],
    ['cauHoi là null', { cauHoi: null }],
  ])('TLA-12: %s ⇒ 400, loi cauHoi CAU_HOI_TRONG', async (_name, body) => {
    expect(await errorsOf(body)).toEqual([
      { truong: 'cauHoi', ma: 'CAU_HOI_TRONG' },
    ]);
  });

  it('TLA-12: 7 lượt lịch sử ⇒ 400 LICH_SU_KHONG_HOP_LE ở lichSu', async () => {
    const turn = { vai: 'TroLy', noiDung: 'a' };
    expect(
      await errorsOf({ cauHoi: 'x', lichSu: Array(7).fill(turn) }),
    ).toEqual([{ truong: 'lichSu', ma: 'LICH_SU_KHONG_HOP_LE' }]);
  });

  it.each([
    ['lichSu không phải mảng', { cauHoi: 'x', lichSu: 'abc' }, 'lichSu'],
    ['lượt là chuỗi', { cauHoi: 'x', lichSu: ['abc'] }, 'lichSu.0'],
    [
      'vai lạ',
      { cauHoi: 'x', lichSu: [{ vai: 'HeThong', noiDung: 'a' }] },
      'lichSu.0.vai',
    ],
    [
      'vai bằng chữ thường',
      { cauHoi: 'x', lichSu: [{ vai: 'troly', noiDung: 'a' }] },
      'lichSu.0.vai',
    ],
    [
      'noiDung là số',
      { cauHoi: 'x', lichSu: [{ vai: 'TroLy', noiDung: 7 }] },
      'lichSu.0.noiDung',
    ],
    [
      'thiếu noiDung',
      { cauHoi: 'x', lichSu: [{ vai: 'TroLy' }] },
      'lichSu.0.noiDung',
    ],
  ])(
    'TLA-12: %s ⇒ 400 mã LICH_SU_KHONG_HOP_LE',
    async (_name, body, truong) => {
      const loi = await errorsOf(body);
      expect(loi).toContainEqual({ truong, ma: 'LICH_SU_KHONG_HOP_LE' });
      expect(loi.every((item) => item.ma === 'LICH_SU_KHONG_HOP_LE')).toBe(
        true,
      );
    },
  );

  it('TLA-12: trường lạ ở thân hay ở một lượt lịch sử bị từ chối (TRUONG_KHONG_DUOC_PHEP)', async () => {
    expect(await errorsOf({ cauHoi: 'x', admin: true })).toEqual([
      { truong: 'admin', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    const nested = await errorsOf({
      cauHoi: 'x',
      lichSu: [{ vai: 'TroLy', noiDung: 'a', role: 'system' }],
    });
    expect(nested).toEqual([
      { truong: 'lichSu.0.role', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  });

  it('B3-62: chiNhanhId không phải chuỗi ⇒ 400 (ma IS_STRING); chuỗi sai dạng id thì DTO chấp nhận (service bỏ qua)', async () => {
    expect(await errorsOf({ cauHoi: 'x', chiNhanhId: 5 })).toEqual([
      { truong: 'chiNhanhId', ma: 'IS_STRING' },
    ]);
    await expect(
      run({ cauHoi: 'x', chiNhanhId: 'abc' }),
    ).resolves.toBeDefined();
  });

  it('B3-63: thân lỗi không chép giá trị người dùng gửi (value: false)', async () => {
    const error: unknown = await run({
      cauHoi: 'x',
      lichSu: [{ vai: 'HeThong', noiDung: 'NOI_DUNG_BI_MAT' }],
    }).catch((caught: unknown) => caught);
    expect(JSON.stringify((error as AppException).getResponse())).not.toContain(
      'NOI_DUNG_BI_MAT',
    );
  });
});
