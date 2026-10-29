import type { Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { ADMIN_SCOPE_KEY } from '../admin-scope.js';
import { AdminScopeGuard } from '../guards/admin-scope.guard.js';

// Dùng controller lấy từ module graph đã compile, không giữ danh sách route thủ công.
export function auditAdminControllers(
  controllers: Iterable<Type<unknown> | Function>,
): string[] {
  const failures: string[] = [];
  const reflector = new Reflector();
  const scanner = new MetadataScanner();
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>;
    const controllerPaths = paths(
      Reflect.getMetadata(PATH_METADATA, controller),
    );
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      const routePaths = paths(Reflect.getMetadata(PATH_METADATA, handler));
      if (
        !controllerPaths.some((root) =>
          routePaths.some((leaf) =>
            /^admin(?:\/|$)/.test(
              [root, leaf]
                .filter(Boolean)
                .join('/')
                .replace(/^\/+|\/+$/g, ''),
            ),
          ),
        )
      )
        continue;
      const targets = [handler, controller];
      const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
      const scope = reflector.getAllAndOverride<unknown>(
        ADMIN_SCOPE_KEY,
        targets,
      );
      const guards = reflector.getAllAndMerge<unknown[]>(
        GUARDS_METADATA,
        targets,
      );
      if (
        roles?.length !== 1 ||
        roles[0] !== 'QuanTriVien' ||
        (scope !== 'Any' && scope !== 'ToanHeThong') ||
        !guards.includes(AdminScopeGuard) ||
        reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true
      ) {
        failures.push(
          `${controller.name}.${name}: thiếu hoặc sai bảo vệ Admin`,
        );
      }
    }
  }
  return failures;
}

function paths(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : [''];
}
