import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { ReceptionStatusDto } from './reception-status.dto.js';

// Task B12 — RTS-01…RTS-03: DTO thân `POST /reception/appointments/:maLichHen/status` qua ĐÚNG cấu hình ValidationPipe của configureApp (CT-02, MT-03, QB-03; PLAN booking 5.7, 7.32 `[đề xuất]`; TRACKING 3.26 B12-E).
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
    metatype: ReceptionStatusDto,
  }) as Promise<ReceptionStatusDto>;

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

const REASON_REQUIRED = { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' };
const STATES = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'VangMat',
  'DaDoiLich',
];

describe('RTS-01 trangThai: đủ BẢY giá trị (để MT-03 và CT-08 ra 409 chứ không 400), ngoài bảy là 400', () => {
  it.each(STATES.filter((state) => state !== 'DaHuy'))(
    'trangThai %s hợp lệ mà không cần lyDo',
    async (trangThai) => {
      expect((await parse({ trangThai })).trangThai).toBe(trangThai);
    },
  );

  it('thiếu, sai chữ hoa, không phải chuỗi, rỗng ⇒ 400 trangThai IS_IN', async () => {
    for (const body of [
      {},
      { trangThai: 'vangmat' },
      { trangThai: 'Huy' },
      { trangThai: '' },
      { trangThai: 5 },
      { trangThai: null },
      { trangThai: ['VangMat'] },
    ])
      expect(await errorsOf(body)).toContainEqual({
        truong: 'trangThai',
        ma: 'IS_IN',
      });
  });
});

describe('RTS-02 lyDo: bắt buộc 1 đến 255 ký tự CHỈ khi trangThai = DaHuy (CT-02, Q27)', () => {
  it('DaHuy kèm lyDo: giữ, đã cắt khoảng trắng hai đầu', async () => {
    expect(
      (await parse({ trangThai: 'DaHuy', lyDo: 'Bệnh nhân gọi điện' })).lyDo,
    ).toBe('Bệnh nhân gọi điện');
    expect(
      (await parse({ trangThai: 'DaHuy', lyDo: '  Bận việc \n' })).lyDo,
    ).toBe('Bận việc');
  });

  it('DaHuy mà thiếu, rỗng, chỉ khoảng trắng, null hay không phải chuỗi ⇒ 400 lyDo LY_DO_BAT_BUOC (mã TRƯỜNG ở loi[].ma)', async () => {
    for (const body of [
      { trangThai: 'DaHuy' },
      { trangThai: 'DaHuy', lyDo: '' },
      { trangThai: 'DaHuy', lyDo: '   \t\n' },
      { trangThai: 'DaHuy', lyDo: null },
      { trangThai: 'DaHuy', lyDo: 123 },
      { trangThai: 'DaHuy', lyDo: ['a'] },
    ])
      expect(await errorsOf(body)).toEqual([REASON_REQUIRED]);
  });

  it('biên 255 và 256 ký tự (đếm SAU khi cắt khoảng trắng): 255 hợp lệ, 256 ⇒ 400 LY_DO_BAT_BUOC', async () => {
    expect(
      (await parse({ trangThai: 'DaHuy', lyDo: 'a'.repeat(255) })).lyDo,
    ).toHaveLength(255);
    expect(
      (await parse({ trangThai: 'DaHuy', lyDo: ` ${'a'.repeat(255)} ` })).lyDo,
    ).toHaveLength(255);
    expect(
      await errorsOf({ trangThai: 'DaHuy', lyDo: 'a'.repeat(256) }),
    ).toEqual([REASON_REQUIRED]);
  });

  it.each(STATES.filter((state) => state !== 'DaHuy'))(
    'trangThai %s: lyDo KHÔNG bắt buộc (vắng vẫn hợp lệ) và, nếu có, không bị kiểm (bị BỎ QUA, không ghi đi đâu)',
    async (trangThai) => {
      expect((await parse({ trangThai })).lyDo).toBeUndefined();
      await expect(parse({ trangThai, lyDo: '' })).resolves.toBeDefined();
      await expect(
        parse({ trangThai, lyDo: 'a'.repeat(1000) }),
      ).resolves.toBeDefined();
    },
  );
});

describe('RTS-03 khoá lạ bị từ chối (QB-03): chủ sở hữu và chi nhánh chỉ từ access token và DB', () => {
  it('benhNhanId, chiNhanhId, maLichHen, hoanCoc… ⇒ 400 TRUONG_KHONG_DUOC_PHEP', async () => {
    for (const extra of [
      'benhNhanId',
      'chiNhanhId',
      'maLichHen',
      'hoanCoc',
      'lichHenId',
    ]) {
      expect(await errorsOf({ trangThai: 'VangMat', [extra]: '1' })).toEqual([
        { truong: extra, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    }
  });
});
