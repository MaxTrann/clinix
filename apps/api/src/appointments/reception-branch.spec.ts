import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import type { ReceptionScopeService } from '../rbac/reception-scope.service.js';
import { resolveReceptionBranch } from './reception-branch.js';

// Task B12 — RTS-06 (phần phạm vi): hàm kiểm phạm vi chi nhánh của Lễ tân dùng CHUNG cho route đọc (B3) và route ghi (B12), tách nguyên văn từ B3 (TRACKING 3.26 câu (j)). QB-04, QB-10 mức đơn vị.
// `resolve` thật có kiểu trả về hẹp (`ChiNhanh`); test cố ý trả giá trị SAI kiểu (ToanHeThong, thiếu id) để chứng minh kiểm lúc chạy
const scopesReturning = (scope: unknown) =>
  ({
    resolve: vi.fn(() => Promise.resolve(scope)),
  }) as unknown as Pick<ReceptionScopeService, 'resolve'>;

describe('resolveReceptionBranch: chỉ nhận đúng ChiNhanh có chiNhanhId là chuỗi', () => {
  it('ChiNhanh kèm chiNhanhId chuỗi ⇒ trả đúng phạm vi; tài khoản lấy từ tham số', async () => {
    const scopes = scopesReturning({ kind: 'ChiNhanh', chiNhanhId: '5' });
    await expect(resolveReceptionBranch(scopes, '12')).resolves.toEqual({
      kind: 'ChiNhanh',
      chiNhanhId: '5',
    });
    expect(vi.mocked(scopes.resolve)).toHaveBeenCalledExactlyOnceWith('12');
  });

  it.each([
    [
      'ToanHeThong (không lọc chi nhánh: sẽ mở toàn hệ thống)',
      { kind: 'ToanHeThong' },
    ],
    ['ChiNhanh thiếu chiNhanhId', { kind: 'ChiNhanh' }],
    ['ChiNhanh có chiNhanhId là số', { kind: 'ChiNhanh', chiNhanhId: 5 }],
    ['ChiNhanh có chiNhanhId là null', { kind: 'ChiNhanh', chiNhanhId: null }],
  ])(
    '%s ⇒ 403 KHONG_DU_QUYEN (mã chung, không lộ lý do)',
    async (_ten, scope) => {
      const error = await resolveReceptionBranch(
        scopesReturning(scope),
        '12',
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(403);
      expect((error as AppException).getResponse()).toMatchObject({
        maLoi: 'KHONG_DU_QUYEN',
      });
    },
  );

  it('ReceptionScopeService ném 403 (tài khoản bị khoá, không phải Lễ tân…) ⇒ lỗi đi nguyên ra, không bị nuốt', async () => {
    const boom = new AppException(403, 'KHONG_DU_QUYEN');
    const scopes = {
      resolve: vi.fn(() => Promise.reject(boom)),
    } as unknown as Pick<ReceptionScopeService, 'resolve'>;
    await expect(resolveReceptionBranch(scopes, '12')).rejects.toBe(boom);
  });
});
