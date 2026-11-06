import type { PublicOverviewRepository } from './public-overview.repository.js';
import { PublicOverviewService } from './public-overview.service.js';

// B9 — chỉ giữ ba trường danh sách trắng.
describe('B9 — PublicOverviewService', () => {
  it('trả đúng ba con số, bỏ cột thừa', async () => {
    const count = vi.fn().mockResolvedValue({
      soChuyenKhoa: 8,
      soBacSi: 12,
      soDichVu: 20,
      email: 'khong-duoc-lo@example.com',
    });
    const result = await new PublicOverviewService({
      count,
    } as unknown as PublicOverviewRepository).get();
    expect(result).toEqual({ soChuyenKhoa: 8, soBacSi: 12, soDichVu: 20 });
  });
});
