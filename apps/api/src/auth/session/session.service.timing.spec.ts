import { timingSafeEqual } from 'node:crypto';
import { vi } from 'vitest';
import type { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import type { PhienDangNhapRepository } from '../repositories/phien-dang-nhap.repository.js';
import { createTestConfigService } from '../testing/auth-test-config.js';
import { SessionService } from './session.service.js';
import { TokenService, sha256Hex } from './token.service.js';

// Bọc `timingSafeEqual` để biết nó được gọi với đối số nào; vẫn gọi hàm thật nên kết quả so sánh không đổi.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

// Task A9 — (e) băm refresh token của phiên được so với băm của token gửi lên bằng `timingSafeEqual` (thời gian không đổi), không bằng `===`.
// Thời gian không kiểm bằng đồng hồ được (chênh lệch quá nhỏ và chập chờn), nên test khoá CÁCH so: hàm so thời gian không đổi phải được gọi với
// đúng hai bản băm. Đây là test khoá cấu trúc, không chứng minh thời gian; đột biến đổi sang `===` làm test đỏ. Mã RT-nn là [đề xuất].
const tokens = new TokenService(createTestConfigService());
const NOW = new Date('2026-11-02T01:30:00.000Z');

function build(storedHash: string) {
  const session = {
    phienDangNhapId: '7',
    taiKhoanId: '3',
    refreshTokenBam: storedHash,
    taoLuc: new Date('2026-11-02T01:00:00.000Z'),
    hetHanLuc: new Date('2026-11-02T02:00:00.000Z'),
    thuHoiLuc: null,
  } as PhienDangNhap;
  const repo = {
    inTransaction: (
      _manager: unknown,
      work: (em: object) => Promise<unknown>,
    ) => work({}),
    findByIdForUpdate: vi.fn(() => Promise.resolve(session)),
    revokeIfActive: vi.fn(() => Promise.resolve(true)),
    findAccountStatus: vi.fn(() => Promise.resolve('DangHoatDong')),
    rotate: vi.fn(() => Promise.resolve()),
  };
  return {
    repo,
    service: new SessionService(
      repo as unknown as PhienDangNhapRepository,
      tokens,
    ),
  };
}

/** Các cặp đối số (dạng chuỗi) mà `timingSafeEqual` đã nhận. */
const comparedPairs = (): [string, string][] =>
  vi
    .mocked(timingSafeEqual)
    .mock.calls.map(([a, b]) => [
      (a as Buffer).toString(),
      (b as Buffer).toString(),
    ]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.mocked(timingSafeEqual).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('so băm refresh token bằng thời gian không đổi', () => {
  it('RT-01 băm khớp: timingSafeEqual nhận đúng băm đang lưu và băm của token gửi lên, rồi làm mới thành công', async () => {
    const issued = tokens.issueRefreshToken('7');
    const { service } = build(issued.hash);

    const result = await service.refresh(issued.token);

    expect(result.ok).toBe(true);
    expect(comparedPairs()).toContainEqual([issued.hash, issued.hash]);
  });

  it('RT-02 băm không khớp: vẫn đi qua timingSafeEqual với cặp (băm lưu, băm token gửi lên), kết quả dùng lại và phiên bị thu hồi', async () => {
    const current = tokens.issueRefreshToken('7');
    const old = tokens.issueRefreshToken('7');
    const { service, repo } = build(current.hash);

    const result = await service.refresh(old.token);

    expect(result).toEqual({ ok: false, reason: 'REUSE_DETECTED' });
    expect(comparedPairs()).toContainEqual([
      current.hash,
      sha256Hex(old.token),
    ]);
    expect(repo.revokeIfActive).toHaveBeenCalledTimes(1);
  });
});
