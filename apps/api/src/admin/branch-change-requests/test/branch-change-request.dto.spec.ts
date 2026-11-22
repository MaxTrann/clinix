import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import {
  ApproveBranchChangeRequestDto,
  BranchChangeRequestIdDto,
  BranchChangeRequestListDto,
  RejectBranchChangeRequestDto,
} from '../branch-change-request.dto.js';

// Admin B9, B10 — kiểm dữ liệu vào của yêu cầu thay đổi chi nhánh. Đơn vị, không DB.
// CN-61 (lý do từ chối), YCB-02 [đề xuất mã] (danh sách, id).
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = <T>(
  metatype: Type<T>,
  value: unknown,
  type: 'query' | 'body' | 'param' = 'query',
) => pipe.transform(value, { type, metatype }) as Promise<T>;
const fieldCodes = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    const body = (error as { getResponse(): unknown }).getResponse() as {
      maLoi: string;
      loi: { truong: string; ma: string }[];
    };
    return { maLoi: body.maLoi, loi: body.loi };
  }
  throw new Error('mong đợi lỗi kiểm dữ liệu');
};

describe('CN-61 RejectBranchChangeRequestDto', () => {
  const reject = (body: unknown) =>
    parse(RejectBranchChangeRequestDto, body, 'body');

  it('lý do được trim; biên 1 và 255 ký tự qua', async () => {
    expect((await reject({ lyDo: '  Giờ mới chưa hợp lý  ' })).lyDo).toBe(
      'Giờ mới chưa hợp lý',
    );
    await expect(reject({ lyDo: 'x' })).resolves.toBeDefined();
    await expect(reject({ lyDo: 'x'.repeat(255) })).resolves.toBeDefined();
  });

  it.each([
    ['thiếu', {}],
    ['rỗng', { lyDo: '' }],
    ['chỉ khoảng trắng', { lyDo: '   ' }],
    ['256 ký tự', { lyDo: 'x'.repeat(256) }],
    ['không phải chuỗi', { lyDo: 123 }],
    ['giống bí mật (audit sẽ từ chối)', { lyDo: 'password=abc123456' }],
  ])('%s ⇒ 400 LY_DO_BAT_BUOC', async (_label, body) => {
    expect(await fieldCodes(reject(body))).toEqual({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
    });
  });

  it('trường lạ (người duyệt gửi từ body) ⇒ 400', async () => {
    const result = await fieldCodes(
      reject({ lyDo: 'Lý do', nguoiDuyetId: '1' }),
    );
    expect(result.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
  });
});

describe('YCB-02 BranchChangeRequestListDto, BranchChangeRequestIdDto', () => {
  it('mặc định trang 1, 20 dòng; lọc trạng thái và chi nhánh', async () => {
    expect(
      await parse(BranchChangeRequestListDto, {
        trangThai: 'ChoDuyet',
        chiNhanhId: '9007199254740993',
      }),
    ).toMatchObject({
      page: 1,
      pageSize: 20,
      trangThai: 'ChoDuyet',
      chiNhanhId: '9007199254740993',
    });
  });

  it('trạng thái ngoài enum, chi nhánh không phải id dương, pageSize 101 ⇒ 400', async () => {
    for (const query of [
      { trangThai: 'QuaHan' },
      { chiNhanhId: '0' },
      { chiNhanhId: 'abc' },
      { pageSize: '101' },
    ])
      expect(
        (await fieldCodes(parse(BranchChangeRequestListDto, query))).maLoi,
      ).toBe('DU_LIEU_KHONG_HOP_LE');
  });

  it('id: chuỗi số dương qua; 0, âm, chữ ⇒ 400', async () => {
    expect(
      (await parse(BranchChangeRequestIdDto, { id: '12' }, 'param')).id,
    ).toBe('12');
    for (const id of ['0', '-1', 'abc', '1.5'])
      expect(
        (await fieldCodes(parse(BranchChangeRequestIdDto, { id }, 'param')))
          .maLoi,
      ).toBe('DU_LIEU_KHONG_HOP_LE');
  });
});

// Admin B10 — YCB-10 [đề xuất mã]: thời điểm "dự kiến có hiệu lực" khi duyệt, dạng giờ VN 'YYYY-MM-DD HH:mm:ss' (Trung chốt 22/11/2026)
describe('YCB-10 ApproveBranchChangeRequestDto', () => {
  const approve = (body: unknown) =>
    parse(ApproveBranchChangeRequestDto, body, 'body');

  it('đúng dạng và là ngày có thật ⇒ qua, giữ nguyên chuỗi; 29/02 năm nhuận qua', async () => {
    expect(
      (await approve({ hieuLucTu: '2026-12-01 08:00:00' })).hieuLucTu,
    ).toBe('2026-12-01 08:00:00');
    await expect(
      approve({ hieuLucTu: '2028-02-29 23:59:59' }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['thiếu', {}],
    ['không phải chuỗi', { hieuLucTu: 1764550800000 }],
    ['ISO có T', { hieuLucTu: '2026-12-01T08:00:00' }],
    ['ISO có độ lệch', { hieuLucTu: '2026-12-01T08:00:00+07:00' }],
    ['thiếu giây', { hieuLucTu: '2026-12-01 08:00' }],
    ['chỉ ngày', { hieuLucTu: '2026-12-01' }],
    ['30/02 không có thật', { hieuLucTu: '2026-02-30 08:00:00' }],
    ['29/02 năm không nhuận', { hieuLucTu: '2027-02-29 08:00:00' }],
    ['24:00:00', { hieuLucTu: '2026-12-01 24:00:00' }],
    ['phút 60', { hieuLucTu: '2026-12-01 08:60:00' }],
    ['khoảng trắng thừa', { hieuLucTu: ' 2026-12-01 08:00:00' }],
  ])('%s ⇒ 400 HIEU_LUC_KHONG_HOP_LE', async (_label, body) => {
    expect(await fieldCodes(approve(body))).toEqual({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'hieuLucTu', ma: 'HIEU_LUC_KHONG_HOP_LE' }],
    });
  });

  it('trường lạ (người duyệt, số ngày gửi từ body) ⇒ 400', async () => {
    expect(
      (
        await fieldCodes(
          approve({ hieuLucTu: '2026-12-01 08:00:00', soNgayBaoTruoc: 0 }),
        )
      ).maLoi,
    ).toBe('DU_LIEU_KHONG_HOP_LE');
  });
});
