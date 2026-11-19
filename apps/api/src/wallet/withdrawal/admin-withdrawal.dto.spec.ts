import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminWithdrawalsQueryDto,
  WithdrawalDecisionDto,
} from './admin-withdrawal.dto.js';
import {
  buildWithdrawalApprovedText,
  buildWithdrawalRejectedText,
} from './withdrawal-notifier.js';

// payment B12 — XRT-01 (query danh sách), XRT-06 (ghi chú: cắt khoảng trắng, tối đa 200 ký tự, thông báo ≤ 500). Chạy cùng cách ValidationPipe toàn cục (transform + validate). Không DB.
const checkQuery = async (raw: Record<string, unknown>) => {
  const dto = plainToInstance(AdminWithdrawalsQueryDto, raw);
  return { dto, errors: await validate(dto) };
};
const checkBody = async (raw: Record<string, unknown>) => {
  const dto = plainToInstance(WithdrawalDecisionDto, raw);
  return { dto, errors: await validate(dto) };
};

describe('XRT-01 AdminWithdrawalsQueryDto', () => {
  it('không tham số ⇒ trang 1, kichThuoc 20, offset 0, không lọc', async () => {
    const { dto, errors } = await checkQuery({});
    expect(errors).toEqual([]);
    expect([dto.trang, dto.kichThuoc, dto.offset, dto.trangThai]).toEqual([
      1,
      20,
      0,
      undefined,
    ]);
  });

  it('biên và ca âm: kichThuoc 50 đạt, 51 và 0 lỗi; trang 0 lỗi; trangThai lạ lỗi; offset theo trang', async () => {
    expect((await checkQuery({ kichThuoc: '50' })).errors).toEqual([]);
    for (const raw of [
      { kichThuoc: '51' },
      { kichThuoc: '0' },
      { trang: '0' },
      { trang: '1.5' },
      { trangThai: 'Khac' },
    ])
      expect((await checkQuery(raw)).errors).not.toEqual([]);
    expect((await checkQuery({ trang: '3', kichThuoc: '10' })).dto.offset).toBe(
      20,
    );
    for (const trangThai of ['ChoDuyet', 'DaDuyet', 'TuChoi'])
      expect((await checkQuery({ trangThai })).errors).toEqual([]);
  });
});

describe('XRT-06 WithdrawalDecisionDto và câu thông báo', () => {
  it('ghiChu: bỏ trống, khoảng trắng ⇒ coi như không có; có chữ thì cắt khoảng trắng hai đầu', async () => {
    expect((await checkBody({})).dto.ghiChu).toBeUndefined();
    const blank = await checkBody({ ghiChu: '   ' });
    expect(blank.errors).toEqual([]);
    expect(blank.dto.ghiChu).toBeUndefined();
    expect((await checkBody({ ghiChu: '  Đã chuyển  ' })).dto.ghiChu).toBe(
      'Đã chuyển',
    );
  });

  it('biên: đúng 200 ký tự đạt, 201 lỗi; không phải chuỗi lỗi', async () => {
    expect((await checkBody({ ghiChu: 'x'.repeat(200) })).errors).toEqual([]);
    expect((await checkBody({ ghiChu: 'x'.repeat(201) })).errors).not.toEqual(
      [],
    );
    for (const ghiChu of [123, ['a'], {}, true])
      expect((await checkBody({ ghiChu })).errors).not.toEqual([]);
  });

  it('câu thông báo: có số tiền; ghi chú nối cuối; ghi chú tối đa vẫn ≤ 500 ký tự', () => {
    expect(buildWithdrawalApprovedText('100000.00')).toContain('100.000đ');
    expect(buildWithdrawalApprovedText('100000.00', 'Đã chuyển')).toContain(
      'Ghi chú: Đã chuyển',
    );
    expect(buildWithdrawalRejectedText('100000.00')).not.toContain('Ghi chú');
    for (const build of [
      buildWithdrawalApprovedText,
      buildWithdrawalRejectedText,
    ])
      expect(build('2000000.00', 'x'.repeat(200)).length).toBeLessThanOrEqual(
        500,
      );
  });
});
