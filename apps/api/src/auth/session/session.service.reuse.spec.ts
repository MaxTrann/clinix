import { vi } from 'vitest';
import type { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import type { PhienDangNhapRepository } from '../repositories/phien-dang-nhap.repository.js';
import { createTestConfigService } from '../testing/auth-test-config.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

// Task A13 — nhánh dùng lại refresh token thu hồi SAU khi giao dịch làm mới commit. Mã RV-nn là [đề xuất].
const tokens = new TokenService(createTestConfigService());

function build() {
  const current = tokens.issueRefreshToken('7');
  const order: string[] = [];
  const repo = {
    inTransaction: async (
      _manager: unknown,
      work: (em: object) => Promise<unknown>,
    ) => {
      const result = await work({});
      order.push('commit');
      return result;
    },
    inReadCommitted: (work: (em: object) => Promise<unknown>) => work({}),
    findByIdForUpdate: vi.fn(() =>
      Promise.resolve({
        phienDangNhapId: '7',
        taiKhoanId: '3',
        refreshTokenBam: current.hash,
        thuHoiLuc: null,
      } as PhienDangNhap),
    ),
    findAccountIdOf: vi.fn(() => Promise.resolve('3')),
    lockAccountForShare: vi.fn(() => {
      order.push('khoá tài khoản');
      return Promise.resolve(true);
    }),
    revokeIfActive: vi.fn(() => {
      order.push('thu hồi');
      return Promise.resolve(true);
    }),
  };
  const service = new SessionService(
    repo as unknown as PhienDangNhapRepository,
    tokens,
  );
  return { repo, service, order, replay: tokens.issueRefreshToken('7').token };
}

describe('dùng lại refresh token', () => {
  it('RV-12 thu hồi sau commit, khoá tài khoản trước; kết quả công khai đúng hình cũ, không có trường nội bộ', async () => {
    const { service, order, replay } = build();

    const result = await service.refresh(replay);

    expect(order).toEqual(['commit', 'khoá tài khoản', 'thu hồi']);
    expect(Object.keys(result).sort()).toEqual(['ok', 'reason']);
    expect(result).toEqual({ ok: false, reason: 'REUSE_DETECTED' });
  });

  it('RV-13 lần thu hồi sau commit lỗi: ném tiếp (thành 500), không nuốt và không báo REUSE_DETECTED', async () => {
    const { repo, service, replay } = build();
    repo.revokeIfActive.mockRejectedValueOnce(new Error('giả lập mất DB'));

    await expect(service.refresh(replay)).rejects.toThrow('giả lập mất DB');
  });
});
