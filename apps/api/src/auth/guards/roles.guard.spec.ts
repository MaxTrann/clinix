import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../decorators/current-user.decorator.js';
import { Roles } from '../decorators/roles.decorator.js';
import { LOAI_TAI_KHOAN, type LoaiTaiKhoan } from '../entities/enums.js';
import {
  expectHttpError,
  fakeHttpContext,
  thrownBy,
} from '../testing/http-test-helpers.js';
import { RolesGuard } from './roles.guard.js';

// Task A4. Test case (mức đơn vị): DN-26, DM-05, SE-05 (nửa 403). Bản chạy qua HTTP thật ở test/auth-guards.e2e-spec.ts.
class NoRolesController {
  handler(): string {
    return 'chi-can-dang-nhap';
  }
}
class AdminOnlyController {
  @Roles('QuanTriVien')
  handler(): string {
    return 'admin';
  }
}
class StaffController {
  @Roles('BacSi', 'LeTan')
  handler(): string {
    return 'nhan-su';
  }
}
// @Roles ở class và ở method: method THAY THẾ class (không gộp)
@Roles('QuanTriVien')
class MixedController {
  @Roles('BacSi')
  overridden(): string {
    return 'method';
  }

  inherited(): string {
    return 'class';
  }
}

const guard = new RolesGuard(new Reflector());

const userWith = (role: LoaiTaiKhoan): AuthenticatedUser => ({
  accountId: '7',
  sessionId: '42',
  role,
});
const requestOf = (user?: AuthenticatedUser): AuthenticatedRequest =>
  ({ headers: {}, user }) as unknown as AuthenticatedRequest;

describe('RolesGuard — không có @Roles thì chỉ cần đăng nhập (DM-05)', () => {
  it.each(LOAI_TAI_KHOAN)('vai trò %s đi qua route không có @Roles', (role) => {
    const context = fakeHttpContext(
      requestOf(userWith(role)),
      NoRolesController,
      'handler',
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('route không có @Roles không đòi user (việc bắt đăng nhập là của JwtAuthGuard, ví dụ route @Public)', () => {
    const context = fakeHttpContext(requestOf(), NoRolesController, 'handler');

    expect(guard.canActivate(context)).toBe(true);
  });
});

describe('RolesGuard — @Roles(...) theo vai trò (DN-26, SE-05)', () => {
  it('đúng vai trò QuanTriVien ⇒ qua', () => {
    const context = fakeHttpContext(
      requestOf(userWith('QuanTriVien')),
      AdminOnlyController,
      'handler',
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it.each(LOAI_TAI_KHOAN.filter((role) => role !== 'QuanTriVien'))(
    'vai trò %s vào route chỉ QuanTriVien ⇒ 403 KHONG_DU_QUYEN',
    async (role) => {
      const context = fakeHttpContext(
        requestOf(userWith(role)),
        AdminOnlyController,
        'handler',
      );

      const error = await thrownBy(() => guard.canActivate(context));

      expectHttpError(error, 403, AUTH_ERROR_CODES.FORBIDDEN);
    },
  );

  it.each(['BacSi', 'LeTan'] as const)(
    '@Roles nhiều giá trị: %s nằm trong danh sách ⇒ qua',
    (role) => {
      const context = fakeHttpContext(
        requestOf(userWith(role)),
        StaffController,
        'handler',
      );

      expect(guard.canActivate(context)).toBe(true);
    },
  );

  it.each(['BenhNhan', 'QuanTriVien'] as const)(
    '@Roles(BacSi, LeTan): %s không nằm trong danh sách ⇒ 403 KHONG_DU_QUYEN',
    async (role) => {
      const context = fakeHttpContext(
        requestOf(userWith(role)),
        StaffController,
        'handler',
      );

      const error = await thrownBy(() => guard.canActivate(context));

      expectHttpError(error, 403, AUTH_ERROR_CODES.FORBIDDEN);
    },
  );

  it('@Roles ở method thay thế @Roles ở class: BacSi qua, QuanTriVien (vai trò của class) bị 403', async () => {
    const asDoctor = fakeHttpContext(
      requestOf(userWith('BacSi')),
      MixedController,
      'overridden',
    );
    const asAdmin = fakeHttpContext(
      requestOf(userWith('QuanTriVien')),
      MixedController,
      'overridden',
    );

    expect(guard.canActivate(asDoctor)).toBe(true);
    expectHttpError(
      await thrownBy(() => guard.canActivate(asAdmin)),
      403,
      AUTH_ERROR_CODES.FORBIDDEN,
    );
  });

  it('method không có @Roles thừa hưởng @Roles của class', async () => {
    const asAdmin = fakeHttpContext(
      requestOf(userWith('QuanTriVien')),
      MixedController,
      'inherited',
    );
    const asDoctor = fakeHttpContext(
      requestOf(userWith('BacSi')),
      MixedController,
      'inherited',
    );

    expect(guard.canActivate(asAdmin)).toBe(true);
    expectHttpError(
      await thrownBy(() => guard.canActivate(asDoctor)),
      403,
      AUTH_ERROR_CODES.FORBIDDEN,
    );
  });
});

describe('RolesGuard — đóng mặc định', () => {
  it('có @Roles mà chưa có user (route @Public, hoặc guard chạy sai thứ tự) ⇒ 401 CHUA_DANG_NHAP, không phải 403, không cho qua', async () => {
    const context = fakeHttpContext(
      requestOf(),
      AdminOnlyController,
      'handler',
    );

    const error = await thrownBy(() => guard.canActivate(context));

    expectHttpError(error, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
  });
});
