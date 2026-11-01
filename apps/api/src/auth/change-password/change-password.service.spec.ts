import { UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { OtpService } from '../otp/otp.service.js';
import type { PasswordHasher } from '../password/password-hasher.service.js';
import type { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import type { SessionService } from '../session/session.service.js';
import { ChangePasswordService } from './change-password.service.js';

// Task A13 — luồng của dịch vụ với mock: thứ tự việc, băm ngoài giao dịch, lỗi nghiệp vụ ném SAU khi giao dịch kết thúc. Mã DMU-Snn là [đề xuất].
const HASH = 'bam-cu';
const em = { em: true };
const rotated = { refreshToken: 'moi', refreshTokenExpiresAt: new Date(0) };
const input = {
  accountId: '5',
  sessionId: '12',
  matKhauCu: 'cu',
  matKhauMoi: 'moi',
};

function build() {
  const order: string[] = [];
  const step =
    <T>(name: string, value: T) =>
    () => {
      order.push(name);
      return Promise.resolve(value);
    };
  const accounts = {
    findForPasswordChange: vi.fn(
      step('đọc thường', {
        taiKhoanId: '5',
        trangThai: 'DangHoatDong',
        matKhauBam: HASH,
      } as object | null),
    ),
    findForLoginForUpdate: vi.fn(
      step('khoá tài khoản', {
        trangThai: 'DangHoatDong',
        matKhauBam: HASH,
      } as object | null),
    ),
    setPasswordAfterChange: vi.fn(step('ghi mật khẩu', true)),
  };
  const hasher = {
    verify: vi.fn(step('so', true)),
    hash: vi.fn(step('băm', 'bam-moi')),
  };
  const sessions = {
    rotateRefreshToken: vi.fn(step('xoay', rotated as object | null)),
    revokeAll: vi.fn(step('thu hồi', 2)),
  };
  const otp = {
    transaction: vi.fn(async (work: (manager: object) => Promise<unknown>) => {
      order.push('mở giao dịch');
      const result = await work(em);
      order.push('commit');
      return result;
    }),
  };
  const service = new ChangePasswordService(
    { manager: {} } as unknown as DataSource,
    accounts as unknown as TaiKhoanRepository,
    hasher as unknown as PasswordHasher,
    otp as unknown as OtpService,
    sessions as unknown as SessionService,
  );
  return { service, order, accounts, hasher, sessions, otp };
}

const expectWrongPassword = (work: Promise<unknown>) =>
  expect(work).rejects.toSatisfy(
    (error) =>
      error instanceof AppException &&
      error.getStatus() === 400 &&
      error.maLoi === 'MAT_KHAU_CU_SAI',
  );

const expectSessionLost = (work: Promise<unknown>) =>
  expect(work).rejects.toSatisfy(
    (error) =>
      error instanceof UnauthorizedException &&
      error.message === 'PHIEN_HET_HIEU_LUC',
  );

describe('ChangePasswordService', () => {
  it('DMU-S01 đúng thứ tự: so và băm NGOÀI giao dịch; trong giao dịch khoá tài khoản → xoay → ghi mật khẩu → thu hồi phiên khác; truyền đúng manager và phiên được giữ', async () => {
    const { service, order, accounts, hasher, sessions } = build();

    expect(await service.change(input)).toBe(rotated);

    expect(order).toEqual([
      'đọc thường',
      'so',
      'băm',
      'mở giao dịch',
      'khoá tài khoản',
      'xoay',
      'ghi mật khẩu',
      'thu hồi',
      'commit',
    ]);
    expect(hasher.verify).toHaveBeenCalledWith(HASH, 'cu');
    expect(hasher.hash).toHaveBeenCalledWith('moi');
    expect(sessions.rotateRefreshToken).toHaveBeenCalledWith('12', {
      manager: em,
    });
    expect(accounts.setPasswordAfterChange).toHaveBeenCalledWith(
      em,
      '5',
      'bam-moi',
    );
    expect(sessions.revokeAll).toHaveBeenCalledWith('5', {
      manager: em,
      exceptSessionId: '12',
    });
  });

  it('DMU-S02 DM-03 sai mật khẩu cũ: 400 MAT_KHAU_CU_SAI, không mở giao dịch, không băm thêm', async () => {
    const { service, hasher, otp } = build();
    hasher.verify.mockResolvedValueOnce(false);

    await expectWrongPassword(service.change(input));

    expect(hasher.hash).not.toHaveBeenCalled();
    expect(otp.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['không còn hàng', null],
    ['không hoạt động', { trangThai: 'NgungHoatDong', matKhauBam: HASH }],
    [
      'chờ kích hoạt, chưa có mật khẩu',
      { trangThai: 'DangHoatDong', matKhauBam: null },
    ],
  ])(
    'DMU-S03 tài khoản %s: 401 PHIEN_HET_HIEU_LUC, không so mật khẩu, không giao dịch',
    async (_label, row) => {
      const { service, accounts, hasher, otp } = build();
      accounts.findForPasswordChange.mockResolvedValueOnce(row);

      await expectSessionLost(service.change(input));

      expect(hasher.verify).not.toHaveBeenCalled();
      expect(otp.transaction).not.toHaveBeenCalled();
    },
  );

  it('DMU-S04 băm dưới khoá khác băm đã so (đổi song song): 400 sau commit, không xoay, không ghi', async () => {
    const { service, order, accounts, sessions } = build();
    accounts.findForLoginForUpdate.mockResolvedValueOnce({
      trangThai: 'DangHoatDong',
      matKhauBam: 'bam-khac',
    });

    await expectWrongPassword(service.change(input));

    expect(order.at(-1)).toBe('commit');
    expect(sessions.rotateRefreshToken).not.toHaveBeenCalled();
    expect(accounts.setPasswordAfterChange).not.toHaveBeenCalled();
  });

  it('DMU-S05 tài khoản bị khoá trong lúc băm: 401 sau commit, không xoay, không ghi', async () => {
    const { service, order, accounts, sessions } = build();
    accounts.findForLoginForUpdate.mockResolvedValueOnce({
      trangThai: 'NgungHoatDong',
      matKhauBam: HASH,
    });

    await expectSessionLost(service.change(input));

    expect(order.at(-1)).toBe('commit');
    expect(sessions.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('DMU-S06 phiên chết trong lúc băm: 401 sau commit, không ghi mật khẩu, không thu hồi', async () => {
    const { service, order, accounts, sessions } = build();
    sessions.rotateRefreshToken.mockResolvedValueOnce(null);

    await expectSessionLost(service.change(input));

    expect(order.at(-1)).toBe('commit');
    expect(accounts.setPasswordAfterChange).not.toHaveBeenCalled();
    expect(sessions.revokeAll).not.toHaveBeenCalled();
  });

  it('DMU-S07 đã khoá và kiểm mà không ghi được mật khẩu: lỗi trong giao dịch để hoàn tác, không thu hồi', async () => {
    const { service, order, accounts, sessions } = build();
    accounts.setPasswordAfterChange.mockResolvedValueOnce(false);

    await expect(service.change(input)).rejects.toThrow('Không ghi được');

    expect(order).not.toContain('commit');
    expect(sessions.revokeAll).not.toHaveBeenCalled();
  });
});
