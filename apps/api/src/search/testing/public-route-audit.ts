import { RequestMethod, type Type } from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { PUBLIC_ROUTE_PREFIX } from '../search.constants.js';

/**
 * CC-04 — quét metadata của controller (lấy từ module đã compile, không giữ danh sách route thủ công) và trả về danh sách vi phạm:
 * mọi route phải là `@Public`, đường dẫn bắt đầu bằng `public/`, chỉ phương thức GET, không `@Roles`, không tham số `@CurrentUser`
 * (mọi decorator tham số tuỳ biến đều bị coi là vi phạm vì route công khai không biết người gọi là ai). Rỗng = đạt.
 */
export function auditPublicControllers(
  controllers: Iterable<Type<unknown> | Function>,
): string[] {
  const failures: string[] = [];
  const reflector = new Reflector();
  const scanner = new MetadataScanner();
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>;
    const rootPaths = toPaths(Reflect.getMetadata(PATH_METADATA, controller));
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      const targets = [handler, controller];
      const leafPaths = toPaths(Reflect.getMetadata(PATH_METADATA, handler));
      const problems: string[] = [];

      if (Reflect.getMetadata(METHOD_METADATA, handler) !== RequestMethod.GET)
        problems.push('không phải GET');
      const fullPaths = rootPaths.flatMap((root) =>
        leafPaths.map((leaf) =>
          [root, leaf]
            .filter(Boolean)
            .join('/')
            .replace(/^\/+|\/+$/g, ''),
        ),
      );
      if (
        !fullPaths.every(
          (path) =>
            path === PUBLIC_ROUTE_PREFIX ||
            path.startsWith(`${PUBLIC_ROUTE_PREFIX}/`),
        )
      )
        problems.push(`đường dẫn không bắt đầu bằng ${PUBLIC_ROUTE_PREFIX}/`);
      if (reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) !== true)
        problems.push('thiếu @Public');
      if (
        reflector.getAllAndOverride<unknown>(ROLES_KEY, targets) !== undefined
      )
        problems.push('có @Roles');
      if (hasCustomParamDecorator(controller, name))
        problems.push('có decorator tham số tuỳ biến (@CurrentUser)');

      if (problems.length > 0)
        failures.push(`${controller.name}.${name}: ${problems.join('; ')}`);
    }
  }
  return failures;
}

// Decorator tham số tuỳ biến (createParamDecorator) lưu khoá chứa CUSTOM_ROUTE_ARGS_METADATA trên constructor của controller.
function hasCustomParamDecorator(
  controller: Type<unknown> | Function,
  method: string,
): boolean {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ??
    {}) as Record<string, unknown>;
  return Object.keys(args).some((key) =>
    key.includes(CUSTOM_ROUTE_ARGS_METADATA),
  );
}

function toPaths(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : [''];
}
