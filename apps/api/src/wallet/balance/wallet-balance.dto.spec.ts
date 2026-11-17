import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WalletTransactionsQueryDto } from './wallet-balance.dto.js';

// payment B1 — SDV-06: query của lịch sử giao dịch. Chạy cùng cách ValidationPipe toàn cục (transform + validate). Không DB.
const check = async (raw: Record<string, unknown>) => {
  const dto = plainToInstance(WalletTransactionsQueryDto, raw);
  return { dto, errors: await validate(dto) };
};

describe('SDV-06 WalletTransactionsQueryDto', () => {
  it('không tham số ⇒ trang 1, kichThuoc 20, offset 0, không lọc', async () => {
    const { dto, errors } = await check({});
    expect(errors).toEqual([]);
    expect([dto.trang, dto.kichThuoc, dto.offset, dto.loai]).toEqual([
      1,
      20,
      0,
      undefined,
    ]);
  });

  it('biên: kichThuoc 1 và 50 đạt, offset theo trang; mỗi loại hợp lệ đạt', async () => {
    for (const kichThuoc of ['1', '50'])
      expect((await check({ kichThuoc })).errors).toEqual([]);
    const { dto } = await check({ trang: '3', kichThuoc: '50' });
    expect(dto.offset).toBe(100);
    for (const loai of ['Nap', 'ThanhToan', 'HoanTien', 'Rut'])
      expect((await check({ loai })).errors).toEqual([]);
  });

  it.each([
    { trang: '0' },
    { trang: '-1' },
    { trang: '1.5' },
    { trang: 'abc' },
    { kichThuoc: '0' },
    { kichThuoc: '51' },
    { loai: 'nap' },
    { loai: 'KhongCo' },
    { loai: '' },
  ])('%j ⇒ không hợp lệ', async (raw) => {
    expect((await check(raw)).errors.length).toBeGreaterThan(0);
  });
});
