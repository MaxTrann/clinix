import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import { collectSecretValues } from '../../common/logging/sanitize.js';
import { createTestConfigService } from '../testing/auth-test-config.js';
import { TEST_AUTH_ENV } from '../testing/auth-test-env.js';
import { ResetTokenService } from './reset-token.service.js';

// Task A11, khoá ký resetToken (S2; cùng quy tắc OTP_HMAC_SECRET của A2). Mã RT-Knn là [đề xuất]:
//  - đặt JWT_RESET_SECRET thì dùng nó;
//  - khoá ngẫu nhiên theo từng lần khởi động CHỈ dùng ở NODE_ENV=development (kèm cảnh báo không in khoá);
//  - test, staging, production thiếu khoá thì KHÔNG khởi động được (không bao giờ tự sinh khoá);
//  - tên biến khớp collectSecretValues của P5 nên bị che khỏi log.
const SECRET = TEST_AUTH_ENV.JWT_RESET_SECRET;
const T0 = new Date('2026-10-27T01:00:00.000Z');
const ids = { taiKhoanId: '42', maXacThucId: '77' };

const create = (overrides: Record<string, unknown>): ResetTokenService =>
  new ResetTokenService(createTestConfigService(overrides));
const keyOf = (service: ResetTokenService) =>
  Reflect.get(service, 'key') as Uint8Array;

let warnings: string[];
beforeEach(() => {
  warnings = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ResetTokenService — khoá ký (RT-K)', () => {
  it('RT-K01 đặt JWT_RESET_SECRET: dùng đúng giá trị đó, không cảnh báo', () => {
    const service = create({ JWT_RESET_SECRET: SECRET, NODE_ENV: 'staging' });
    expect(
      Buffer.from(keyOf(service)).equals(Buffer.from(SECRET, 'utf8')),
    ).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('RT-K02 development không đặt khoá: khoá ngẫu nhiên 32 byte, mỗi lần khởi động một khoá khác, token của khoá này không qua được khoá kia', async () => {
    const a = create({ JWT_RESET_SECRET: undefined, NODE_ENV: 'development' });
    const b = create({ JWT_RESET_SECRET: undefined, NODE_ENV: 'development' });
    expect(keyOf(a)).toHaveLength(32);
    expect(Buffer.from(keyOf(a)).equals(Buffer.from(keyOf(b)))).toBe(false);
    const { token } = await a.sign({ ...ids, issuedAt: T0 });
    expect(await a.verify(token, T0)).toEqual(ids);
    expect(await b.verify(token, T0)).toBeNull();
  });

  it('RT-K03 development không đặt khoá: cảnh báo nêu tên biến và hậu quả, KHÔNG in khoá (hex, base64 hay chữ)', () => {
    const service = create({
      JWT_RESET_SECRET: undefined,
      NODE_ENV: 'development',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('JWT_RESET_SECRET');
    expect(warnings[0]).toContain('khởi động lại');
    const key = Buffer.from(keyOf(service));
    expect(warnings[0]).not.toContain(key.toString('hex'));
    expect(warnings[0]).not.toContain(key.toString('base64'));
    expect(warnings[0]).not.toContain(key.toString('utf8'));
  });

  it.each(['test', 'staging', 'production'])(
    'RT-K04 NODE_ENV=%s không đặt khoá: không khởi động được (không bao giờ tự sinh khoá), thông báo chỉ nêu tên biến',
    (nodeEnv) => {
      let message = '';
      try {
        create({ JWT_RESET_SECRET: undefined, NODE_ENV: nodeEnv });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe(
        'JWT_RESET_SECRET: bắt buộc khi NODE_ENV khác development',
      );
      expect(warnings).toEqual([]);
    },
  );

  it('RT-K05 khoá rỗng cũng coi như chưa đặt', () => {
    expect(() =>
      create({ JWT_RESET_SECRET: '', NODE_ENV: 'production' }),
    ).toThrow('JWT_RESET_SECRET');
  });

  it('RT-K06 tên biến khớp quy tắc che log của P5 (collectSecretValues lấy giá trị làm bí mật cần che)', () => {
    expect(collectSecretValues({ JWT_RESET_SECRET: SECRET })).toEqual([SECRET]);
  });
});
