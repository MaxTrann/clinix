import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { IS_PUBLIC_KEY } from '../../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator.js';
import { auditAdminControllers } from '../../../rbac/testing/admin-route-audit.js';
import { StaffActivationController } from '../staff-activation.controller.js';
import { CompleteStaffActivationDto } from '../staff-activation.dto.js';

// Task B16 (admin) — hình dạng công khai của hai route kích hoạt (PLAN admin 5.3; SE-A13; quyết định (b) không dùng OriginGuard). Mã NSB16-11 là [đề xuất].
// Test CẤU TRÚC trên metadata: không dựng ứng dụng. Việc "đúng hai route là công khai trong ứng dụng thật" do E2E-KH06 khẳng định.
const prototype = StaffActivationController.prototype;
const handlers = ['validate', 'complete'] as const;
// Đọc phương thức qua Reflect (không tham chiếu thẳng `prototype.validate`) để không thành "unbound method"
const handlerOf = (name: (typeof handlers)[number]): object =>
  Reflect.get(prototype, name) as object;

describe('StaffActivationController: công khai, đúng hai route, không đụng cookie hay guard', () => {
  it('NSB16-11 @Public() ở cấp lớp; không @Roles, không @UseGuards (OriginGuard) ở lớp lẫn từng route', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, StaffActivationController)).toBe(
      true,
    );
    for (const target of [
      StaffActivationController,
      handlerOf('validate'),
      handlerOf('complete'),
    ]) {
      expect(Reflect.getMetadata(ROLES_KEY, target)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, target)).toBeUndefined();
    }
  });

  it('NSB16-11 đường dẫn gốc `staff-activation` (KHÔNG dưới admin/); đúng hai route POST validate và complete, đều 200', () => {
    expect(Reflect.getMetadata(PATH_METADATA, StaffActivationController)).toBe(
      'staff-activation',
    );
    const routes = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        Reflect.getMetadata(
          METHOD_METADATA,
          prototype[name as keyof typeof prototype],
        ) !== undefined,
    );
    expect(routes.sort()).toEqual(['complete', 'validate']);
    const expectedPath = { validate: 'validate', complete: 'complete' };
    for (const name of handlers) {
      const handler = handlerOf(name);
      expect(Reflect.getMetadata(METHOD_METADATA, handler), name).toBe(
        RequestMethod.POST,
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler), name).toBe(
        expectedPath[name],
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler), name).toBe(200);
    }
  });

  it('NSB16-11 (NS-35) `validate` nhận thân kiểu Object (ValidationPipe toàn cục bỏ qua nên mọi lỗi định dạng ra CÙNG LIEN_KET); `complete` nhận DTO', () => {
    expect(
      Reflect.getMetadata('design:paramtypes', prototype, 'validate'),
    ).toEqual([Object]);
    expect(
      Reflect.getMetadata('design:paramtypes', prototype, 'complete'),
    ).toEqual([CompleteStaffActivationDto]);
  });

  it('NSB16-11 bộ quét admin-scope không xét controller này (đường dẫn không bắt đầu bằng admin/): trả rỗng, không báo @Public là lỗi', () => {
    expect(auditAdminControllers([StaffActivationController])).toEqual([]);
  });
});
