import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../../auth/decorators/current-user.decorator.js';
import { ADMIN_SCOPE_KEY, type AdminScope } from '../../../rbac/admin-scope.js';
import { auditAdminControllers } from '../../../rbac/testing/admin-route-audit.js';
import type { PageQueryDto } from '../../../common/paging/page-query.dto.js';
import type { SystemConfigAdminService } from '../system-config-admin.service.js';
import type { SystemConfigHistoryService } from '../system-config-history.service.js';
import { SystemConfigController } from '../system-config.controller.js';
import type { UpdateSystemConfigDto } from '../system-config.dto.js';

// Controller chỉ nhận/trả (không DB). Guard chạy thật ở e2e (test/admin-system-config.e2e-spec.ts, CH-09).
const scope: AdminScope = { kind: 'ToanHeThong' };
const user: AuthenticatedUser = {
  accountId: '42',
  sessionId: 's1',
  role: 'QuanTriVien',
};

describe('B5 CH — SystemConfigController', () => {
  const reflector = new Reflector();
  const prototype = SystemConfigController.prototype;

  it('CHB5-14: bộ quét route admin của rbac không thấy route nào thiếu bảo vệ Admin', () => {
    expect(auditAdminControllers([SystemConfigController])).toStrictEqual([]);
  });

  it.each(['get', 'update', 'history'] as const)(
    'CH-09 và CHB6-17: %s chỉ cho vai trò QuanTriVien và phạm vi ToanHeThong (KHÔNG phải Any, kể cả khi đặt ở cấp hàm): Admin Chi nhánh bị 403',
    (name) => {
      const targets = [prototype[name], SystemConfigController];
      expect(reflector.getAllAndOverride(ROLES_KEY, targets)).toEqual([
        'QuanTriVien',
      ]);
      expect(reflector.getAllAndOverride(ADMIN_SCOPE_KEY, targets)).toBe(
        'ToanHeThong',
      );
    },
  );

  it('GET gọi read(); PUT chuyển phạm vi, MÃ TÀI KHOẢN của người đăng nhập và thân cho update()', async () => {
    const saved = { chuaCauHinh: false };
    const service = {
      read: vi.fn().mockResolvedValue(saved),
      update: vi.fn().mockResolvedValue(saved),
    };
    const controller = new SystemConfigController(
      service as unknown as SystemConfigAdminService,
      {} as SystemConfigHistoryService,
    );
    expect(await controller.get()).toBe(saved);
    expect(service.read).toHaveBeenCalledTimes(1);
    const input = { lyDo: 'Thử', thoiGianGiuCho: 20 } as UpdateSystemConfigDto;
    expect(await controller.update(scope, user, input)).toBe(saved);
    expect(service.update).toHaveBeenCalledExactlyOnceWith(scope, '42', input);
  });

  it('CHB6-17: GET history chuyển phạm vi và PageQueryDto cho SystemConfigHistoryService.history() rồi trả nguyên kết quả', async () => {
    const paged = { items: [], total: 0, page: 2, pageSize: 10 };
    const history = { history: vi.fn().mockResolvedValue(paged) };
    const controller = new SystemConfigController(
      {} as SystemConfigAdminService,
      history as unknown as SystemConfigHistoryService,
    );
    const query = { page: 2, pageSize: 10, offset: 10 } as PageQueryDto;
    expect(await controller.history(scope, query)).toBe(paged);
    expect(history.history).toHaveBeenCalledExactlyOnceWith(scope, query);
  });
});
