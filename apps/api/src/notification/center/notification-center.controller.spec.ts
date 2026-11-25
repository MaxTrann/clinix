import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { NotificationCenterController } from './notification-center.controller.js';
import { NotificationListQueryDto } from './notification-center.dto.js';
import { noStore } from './notification-center.module.js';
import type { NotificationCenterService } from './notification-center.service.js';

// notification B2 — controller chỉ nhận/trả: QTB-04 (@Roles bốn vai trò trên TỪNG route), QTB-05 (không RequireAdminScope), tài khoản chỉ lấy từ token,
// thứ tự route tĩnh trước `:id`; TTB-15 phần đơn vị (middleware no-store). HTTP thật, gồm no-store ở 401 do guard trả, ở test/notification-center.e2e-spec.ts.
const user = { accountId: '5', sessionId: '12', role: 'BacSi' } as const;
const ROUTES = [
  ['list', RequestMethod.GET, '/'],
  ['unreadCount', RequestMethod.GET, 'unread-count'],
  ['markAllRead', RequestMethod.POST, 'read-all'],
  ['detail', RequestMethod.GET, ':id'],
  ['markRead', RequestMethod.POST, ':id/read'],
] as const;
const handlerOf = (name: string) =>
  Object.getOwnPropertyDescriptor(NotificationCenterController.prototype, name)
    ?.value as object;

describe('NotificationCenterController', () => {
  it('QTB-04: mọi route có @Roles đủ bốn vai trò, ghi trên TỪNG handler', () => {
    const reflector = new Reflector();
    for (const [name] of ROUTES)
      expect(reflector.get(ROLES_KEY, handlerOf(name) as never), name).toEqual([
        'BenhNhan',
        'BacSi',
        'LeTan',
        'QuanTriVien',
      ]);
  });

  it('QTB-05: không route nào đòi phạm vi quản trị (không RequireAdminScope)', () => {
    for (const [name] of ROUTES) {
      const keys = Reflect.getMetadataKeys(handlerOf(name)).map(String);
      expect(
        keys.some((key) => /scope/i.test(key)),
        name,
      ).toBe(false);
    }
  });

  it('đường dẫn và phương thức đúng; route tĩnh khai trước `:id`', () => {
    const declared = Object.getOwnPropertyNames(
      NotificationCenterController.prototype,
    ).filter((name) => name !== 'constructor');
    for (const [name, method, path] of ROUTES) {
      expect(Reflect.getMetadata(METHOD_METADATA, handlerOf(name)), name).toBe(
        method,
      );
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf(name)), name).toBe(
        path,
      );
    }
    expect(declared.indexOf('unreadCount')).toBeLessThan(
      declared.indexOf('detail'),
    );
    expect(declared.indexOf('markAllRead')).toBeLessThan(
      declared.indexOf('detail'),
    );
  });

  it('QTB-04: tài khoản lấy từ token, id từ đường dẫn; trả nguyên kết quả của service', async () => {
    const result = { ok: true };
    const service = {
      list: vi.fn(() => Promise.resolve(result)),
      unreadCount: vi.fn(() => Promise.resolve(result)),
      markAllRead: vi.fn(() => Promise.resolve(result)),
      detail: vi.fn(() => Promise.resolve(result)),
      markRead: vi.fn(() => Promise.resolve(result)),
    };
    const controller = new NotificationCenterController(
      service as unknown as NotificationCenterService,
    );
    const query = new NotificationListQueryDto();
    await expect(controller.list(user, query)).resolves.toBe(result);
    await expect(controller.unreadCount(user)).resolves.toBe(result);
    await expect(controller.markAllRead(user)).resolves.toBe(result);
    await expect(controller.detail(user, '9')).resolves.toBe(result);
    await expect(controller.markRead(user, '9')).resolves.toBe(result);
    expect(service.list.mock.calls).toEqual([['5', query]]);
    expect(service.unreadCount.mock.calls).toEqual([['5']]);
    expect(service.markAllRead.mock.calls).toEqual([['5']]);
    expect(service.detail.mock.calls).toEqual([['5', '9']]);
    expect(service.markRead.mock.calls).toEqual([['5', '9']]);
  });

  it('TTB-15 (đơn vị): middleware đặt Cache-Control: no-store rồi chuyển tiếp', () => {
    const setHeader = vi.fn();
    const next = vi.fn() as unknown as NextFunction;
    noStore({} as Request, { setHeader } as unknown as Response, next);
    expect(setHeader.mock.calls).toEqual([['Cache-Control', 'no-store']]);
    expect(next).toHaveBeenCalledOnce();
  });
});
