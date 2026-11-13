import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import { AdminOverrideDto } from './admin-override.dto.js';
import { isValidReasonText } from './required-reason.decorator.js';

// Task B14 — CT-15 (`lyDo` thiếu, rỗng, > 255), OVR-05 (`lyDo` giống bí mật ⇒ 400), QB-03 và MT-03/CT-16 ở mức DTO (bảy giá trị `trangThai`): DTO thân `POST /admin/appointments/:maLichHen/override-status` qua ĐÚNG cấu hình
// ValidationPipe của configureApp (PLAN booking 5.7, 5.14, 7.5, 7.37 `[đề xuất]`; TRACKING 3.31 B14-C).
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
    metatype: AdminOverrideDto,
  }) as Promise<AdminOverrideDto>;

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
const REASON = 'Bệnh nhân đã có mặt tại quầy';
const STATES = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'VangMat',
  'DaDoiLich',
];

describe('OVR-06 (DTO) trangThai: đủ BẢY giá trị (để MT-03 và CT-16 ra 409 chứ không 400), ngoài bảy là 400', () => {
  it.each(STATES)(
    'trangThai %s kèm lyDo hợp lệ ⇒ nhận (đích ngoài Q24 do dịch vụ trả 409)',
    async (trangThai) => {
      expect(await parse({ trangThai, lyDo: REASON })).toEqual({
        trangThai,
        lyDo: REASON,
      });
    },
  );

  it('thiếu, sai chữ hoa, không phải chuỗi, rỗng ⇒ 400 trangThai IS_IN', async () => {
    for (const body of [
      { lyDo: REASON },
      { trangThai: 'vangmat', lyDo: REASON },
      { trangThai: 'Huy', lyDo: REASON },
      { trangThai: '', lyDo: REASON },
      { trangThai: 5, lyDo: REASON },
      { trangThai: null, lyDo: REASON },
      { trangThai: ['VangMat'], lyDo: REASON },
    ])
      expect(await errorsOf(body)).toContainEqual({
        truong: 'trangThai',
        ma: 'IS_IN',
      });
  });
});

describe('CT-15 lyDo BẮT BUỘC cho MỌI đích, 1 đến 255 ký tự sau khi cắt khoảng trắng (Q24, Q27)', () => {
  it.each(STATES)(
    'đích %s: lyDo được cắt khoảng trắng hai đầu',
    async (trangThai) => {
      expect((await parse({ trangThai, lyDo: '  Bận việc \n' })).lyDo).toBe(
        'Bận việc',
      );
    },
  );

  it.each(STATES)(
    'đích %s mà lyDo thiếu, rỗng, chỉ khoảng trắng, null hay không phải chuỗi ⇒ 400 lyDo LY_DO_BAT_BUOC (mã TRƯỜNG ở loi[].ma; KHÁC Lễ tân, nơi chỉ DaHuy cần lý do)',
    async (trangThai) => {
      for (const extra of [
        {},
        { lyDo: '' },
        { lyDo: '   \t\n' },
        { lyDo: null },
        { lyDo: 123 },
        { lyDo: ['a'] },
      ])
        expect(await errorsOf({ trangThai, ...extra })).toEqual([
          REASON_REQUIRED,
        ]);
    },
  );

  it('biên 255 và 256 ký tự (đếm SAU khi cắt khoảng trắng): 255 hợp lệ, 256 ⇒ 400 LY_DO_BAT_BUOC', async () => {
    const body = { trangThai: 'VangMat' };
    expect((await parse({ ...body, lyDo: 'a'.repeat(255) })).lyDo).toHaveLength(
      255,
    );
    expect(
      (await parse({ ...body, lyDo: ` ${'a'.repeat(255)} ` })).lyDo,
    ).toHaveLength(255);
    expect(await errorsOf({ ...body, lyDo: 'a'.repeat(256) })).toEqual([
      REASON_REQUIRED,
    ]);
  });
});

describe('OVR-05 lyDo giống bí mật bị chặn ở DTO bằng ĐÚNG bộ kiểm của audit (nếu không audit ném AUDIT_SENSITIVE_DATA và override ra 500)', () => {
  it.each([
    'token=abc123xyz',
    'Bearer abcdefghijklmnop',
    'password: hunter2',
    `mã băm ${'a'.repeat(64)}`,
    'otp=123456',
  ])('"%s" ⇒ 400 lyDo LY_DO_BAT_BUOC', async (lyDo) => {
    expect(await errorsOf({ trangThai: 'DaHuy', lyDo })).toEqual([
      REASON_REQUIRED,
    ]);
  });

  it.each([
    'Bệnh nhân gọi điện báo đã đến, SĐT 0901234567',
    'Lịch trùng với lịch 08:30 ngày 10/11/2026',
    'Hủy theo yêu cầu của bác sĩ phụ trách',
  ])('lý do bình thường "%s" vẫn được nhận', async (lyDo) => {
    expect((await parse({ trangThai: 'DaHuy', lyDo })).lyDo).toBe(lyDo);
  });

  it('isValidReasonText: cờ rejectSecrets chỉ bật cho Quản trị viên (Lễ tân không ghi audit nên không bị chặn thêm)', () => {
    expect(isValidReasonText('token=abc123xyz')).toBe(true);
    expect(isValidReasonText('token=abc123xyz', { rejectSecrets: true })).toBe(
      false,
    );
    expect(isValidReasonText('', { rejectSecrets: true })).toBe(false);
  });
});

describe('QB-03 (phần override) khoá lạ bị từ chối: phạm vi chỉ từ AdminScopeCtx, người thực hiện chỉ từ access token', () => {
  it('benhNhanId, chiNhanhId, maLichHen, hoanCoc, actorId… ⇒ 400 TRUONG_KHONG_DUOC_PHEP', async () => {
    for (const extra of [
      'benhNhanId',
      'chiNhanhId',
      'maLichHen',
      'hoanCoc',
      'lichHenId',
      'actorId',
    ]) {
      expect(
        await errorsOf({ trangThai: 'VangMat', lyDo: REASON, [extra]: '1' }),
      ).toEqual([{ truong: extra, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
    }
  });
});
