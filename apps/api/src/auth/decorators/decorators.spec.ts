import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import {
  expectHttpError,
  handlerOf,
  thrownBy,
} from '../testing/http-test-helpers.js';
import {
  currentUserOf,
  type AuthenticatedRequest,
} from './current-user.decorator.js';
import { IS_PUBLIC_KEY, Public } from './public.decorator.js';
import { ROLES_KEY, Roles } from './roles.decorator.js';

// Task A4. Test case (mức đơn vị): DN-26, SE-05. Cách @CurrentUser() lấy user qua HTTP thật ở test/auth-guards.e2e-spec.ts.
const reflector = new Reflector();

class Sample {
  @Public()
  open(): string {
    return 'mo';
  }

  @Roles('BacSi', 'LeTan')
  staff(): string {
    return 'nhan-su';
  }

  plain(): string {
    return 'tron';
  }
}

describe('@Public()', () => {
  it('đặt metadata IS_PUBLIC_KEY = true lên method; method khác không có', () => {
    expect(reflector.get(IS_PUBLIC_KEY, handlerOf(Sample, 'open'))).toBe(true);
    expect(
      reflector.get(IS_PUBLIC_KEY, handlerOf(Sample, 'plain')),
    ).toBeUndefined();
  });
});

describe('@Roles()', () => {
  it('đặt metadata ROLES_KEY đúng danh sách vai trò theo thứ tự khai báo', () => {
    expect(reflector.get(ROLES_KEY, handlerOf(Sample, 'staff'))).toEqual([
      'BacSi',
      'LeTan',
    ]);
    expect(
      reflector.get(ROLES_KEY, handlerOf(Sample, 'plain')),
    ).toBeUndefined();
  });

  it('chỉ nhận vai trò thuộc LoaiTaiKhoan và phải có ít nhất một (kiểm lúc biên dịch bằng tsc)', () => {
    // @ts-expect-error @Roles() không đối số bị từ chối: tránh route vô tình không giới hạn vai trò
    Roles();
    // @ts-expect-error vai trò ngoài LoaiTaiKhoan bị từ chối
    Roles('QuanLy');
    expect(true).toBe(true);
  });
});

describe('currentUserOf (lõi của @CurrentUser())', () => {
  it('trả đúng user mà JwtAuthGuard đã gắn', () => {
    const user = { accountId: '7', sessionId: '42', role: 'LeTan' } as const;
    const request = { headers: {}, user } as unknown as AuthenticatedRequest;

    expect(currentUserOf(request)).toBe(user);
  });

  it('chưa có user (route @Public dùng @CurrentUser) ⇒ 401 CHUA_DANG_NHAP thay vì trả undefined', async () => {
    const request = { headers: {} } as unknown as AuthenticatedRequest;

    const error = await thrownBy(() => currentUserOf(request));

    expectHttpError(error, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
  });
});
