import type { Type } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { LOAI_TAI_KHOAN } from '../../auth/entities/enums.js';

/**
 * QP-08 — quét metadata của controller (lấy từ module, không giữ danh sách route viết tay) và trả về danh sách vi phạm; rỗng = đạt.
 * Mỗi route của PatientModule phải có `@Roles` rõ ràng, kể cả khi cho cả bốn vai trò: không có `@Roles` thì RolesGuard cho mọi vai trò
 * đã đăng nhập đi qua, nên một route quên `@Roles` lặng lẽ mở cho người không được phép.
 * Đọc metadata CÙNG cách RolesGuard (method thay thế class), nên `@Roles` ở class vẫn tính; `@Roles` rỗng hay vai trò lạ, hay `@Public`, là vi phạm.
 * Giới hạn: lấy controller từ metadata của chính PatientModule; nếu sau này module import module con có controller thì phải quét thêm `imports`.
 */
export function auditPatientControllers(
  controllers: Iterable<Type<unknown> | Function>,
): string[] {
  const failures: string[] = [];
  const reflector = new Reflector();
  const scanner = new MetadataScanner();
  const knownRoles: readonly unknown[] = LOAI_TAI_KHOAN;
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      // Chỉ xét hàm là route (có metadata phương thức HTTP); hàm phụ trợ của controller bị bỏ qua
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      const targets = [handler, controller];
      const problems: string[] = [];
      const roles = reflector.getAllAndOverride<unknown>(ROLES_KEY, targets);
      if (!Array.isArray(roles) || roles.length === 0) {
        problems.push('thiếu @Roles (hoặc rỗng)');
      } else if (roles.some((role) => !knownRoles.includes(role))) {
        problems.push('@Roles có vai trò không thuộc LOAI_TAI_KHOAN');
      }
      if (reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true)
        problems.push('có @Public');
      if (problems.length > 0)
        failures.push(`${controller.name}.${name}: ${problems.join('; ')}`);
    }
  }
  return failures;
}
