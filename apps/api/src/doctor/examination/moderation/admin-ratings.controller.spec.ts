import 'reflect-metadata';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AuthenticatedUser } from '../../../auth/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator.js';
import { ADMIN_SCOPE_KEY, type AdminScope } from '../../../rbac/admin-scope.js';
import { AdminScopeGuard } from '../../../rbac/guards/admin-scope.guard.js';
import { ParseRecordIdPipe } from '../../common/parse-record-id.pipe.js';
import { AdminRatingsController } from './admin-ratings.controller.js';
import {
  AdminRatingsQueryDto,
  type AdminRatingDetail,
  type AdminRatingsPage,
} from './admin-ratings.dto.js';
import type { AdminRatingsService } from './admin-ratings.service.js';
import { HideRatingDto } from './rating-hide.dto.js';
import type { RatingHideService } from './rating-hide.service.js';

// doctor-exam B7 — AdminRatingsController: chỉ nhận/trả, không DB (PLAN 5.8, 5.11; KDD-11, KDD-12, KDD-16, QHK-01, QHK-09, QHK-12). Hành vi qua HTTP thật (guard trước pipe, no-store, 404 cùng thân): test/doctor-exam-admin-ratings.e2e-spec.ts.
// `@RequireAdminScope` CHƯA có bộ quét chung (QHK-09 chỉ quét `@Roles`): ca riêng ở đây khẳng định MỖI route có đủ ba thứ.
// B8 thêm route `hide` (`POST :id/hide`): bảng route thành BA dòng (KDD-13: không route hiện lại); mọi khẳng định của hai route đọc GIỮ NGUYÊN. Hành vi qua HTTP thật của `hide`: test/doctor-exam-admin-hide-rating.e2e-spec.ts.
const SCOPE: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };
const PAGE: AdminRatingsPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  demTheoTrangThai: { HienThi: 0, DaAn: 0 },
};
const DETAIL = { danhGiaId: '501' } as AdminRatingDetail;

const proto = AdminRatingsController.prototype;
const handlerOf = (name: 'list' | 'detail' | 'hide') =>
  Reflect.get(proto, name) as (...args: unknown[]) => unknown;
// Hai route ĐỌC (B7): các ca bên dưới áp cho từng dòng này. Route ghi `hide` (B8) có describe riêng.
const ROUTES = [
  ['list', ''],
  ['detail', ':id'],
] as const;
const ACTOR = { accountId: '3' } as AuthenticatedUser;
const HIDDEN = { danhGiaId: '501', biAn: true } as const;

function setup() {
  const list = vi.fn((..._args: unknown[]) => Promise.resolve(PAGE));
  const get = vi.fn((..._args: unknown[]) => Promise.resolve(DETAIL));
  const hide = vi.fn((..._args: unknown[]) => Promise.resolve(HIDDEN));
  const controller = new AdminRatingsController(
    { list, get } as unknown as AdminRatingsService,
    { hide } as unknown as RatingHideService,
  );
  return { controller, list, get, hide };
}

describe('AdminRatingsController: metadata của các route', () => {
  it('KDD-16, KDD-13 chỉ có đúng BA route: hai GET (đọc) và một POST `:id/hide`; không route hiện lại, không PUT, PATCH, DELETE', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminRatingsController)).toBe(
      'admin/doctor-ratings',
    );
    const methods = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor',
    );
    expect(methods.toSorted()).toEqual(['detail', 'hide', 'list']);
    for (const [name, path] of ROUTES) {
      expect(Reflect.getMetadata(METHOD_METADATA, handlerOf(name))).toBe(
        RequestMethod.GET,
      );
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf(name))).toBe(
        path === '' ? '/' : path,
      );
    }
    expect(Reflect.getMetadata(METHOD_METADATA, handlerOf('hide'))).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handlerOf('hide'))).toBe(
      ':id/hide',
    );
  });

  it.each(ROUTES)(
    'QHK-09, KDD-11: route `%s` có @Roles("QuanTriVien") và @RequireAdminScope("Any") NGAY TRÊN route (AdminScopeGuard), không @Public',
    (name) => {
      const reflector = new Reflector();
      const handler = handlerOf(name);
      expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
        'QuanTriVien',
      ]);
      expect(reflector.get<string>(ADMIN_SCOPE_KEY, handler)).toBe('Any');
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        AdminScopeGuard,
      ]);
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(
        reflector.get<boolean>(IS_PUBLIC_KEY, AdminRatingsController),
      ).toBeUndefined();
    },
  );

  it.each(ROUTES)(
    'QHK-12: route `%s` có Cache-Control: no-store khai bằng @Header (Nest áp sau guard và TRƯỚC pipe nên 400 do query và 404 do id cũng có); 200 mặc định',
    (name) => {
      expect(Reflect.getMetadata(HEADERS_METADATA, handlerOf(name))).toEqual([
        { name: 'Cache-Control', value: 'no-store' },
      ]);
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf(name)),
      ).toBeUndefined();
    },
  );

  it('danh sách: MỘT Query là AdminRatingsQueryDto (import giá trị); KHÔNG Param, KHÔNG Body', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AdminRatingsController,
      'list',
    ) as Record<string, { data?: unknown }>;
    const keys = Object.keys(args);
    const kinds = (type: RouteParamtypes) =>
      keys.filter((key) => key.startsWith(`${String(type)}:`));
    expect(keys).toHaveLength(2); // phạm vi của Admin và query
    expect(kinds(RouteParamtypes.QUERY)).toHaveLength(1);
    expect(kinds(RouteParamtypes.PARAM)).toEqual([]);
    expect(kinds(RouteParamtypes.BODY)).toEqual([]);
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      proto,
      'list',
    ) as unknown[];
    expect(paramTypes).toContain(AdminRatingsQueryDto);
  });

  it('KDD-12 chi tiết: `:id` đi qua ParseRecordIdPipe (id sai dạng ⇒ 404 ngay ở pipe); KHÔNG Query, KHÔNG Body', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AdminRatingsController,
      'detail',
    ) as Record<string, { data?: unknown; pipes?: unknown[] }>;
    const keys = Object.keys(args);
    expect(keys).toHaveLength(2); // phạm vi của Admin và id
    const param = Object.entries(args).find(([key]) =>
      key.startsWith(`${String(RouteParamtypes.PARAM)}:`),
    )?.[1];
    expect(param?.data).toBe('id');
    expect(param?.pipes).toEqual([ParseRecordIdPipe]);
    expect(
      keys.filter((key) => key.startsWith(`${String(RouteParamtypes.QUERY)}:`)),
    ).toEqual([]);
  });
});

describe('B8 route `hide` (POST :id/hide): metadata', () => {
  const hide = () => handlerOf('hide');

  it('QHK-09, KDD-11: có @Roles("QuanTriVien") và @RequireAdminScope("Any") NGAY TRÊN route (AdminScopeGuard), không @Public', () => {
    const reflector = new Reflector();
    expect(reflector.get<string[]>(ROLES_KEY, hide())).toStrictEqual([
      'QuanTriVien',
    ]);
    expect(reflector.get<string>(ADMIN_SCOPE_KEY, hide())).toBe('Any');
    expect(Reflect.getMetadata(GUARDS_METADATA, hide())).toEqual([
      AdminScopeGuard,
    ]);
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, hide())).toBeUndefined();
  });

  it('QHK-12: Cache-Control: no-store khai bằng @Header (áp sau guard và TRƯỚC pipe nên 400 do thân và 404 do id cũng có); 200 tường minh (đổi trạng thái của tài nguyên có sẵn, không tạo mới)', () => {
    expect(Reflect.getMetadata(HEADERS_METADATA, hide())).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, hide())).toBe(200);
  });

  it('KDD-12, QHK-03: `:id` qua ParseRecordIdPipe; thân là HideRatingDto (import giá trị); người ẩn từ @CurrentUser; KHÔNG Query', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AdminRatingsController,
      'hide',
    ) as Record<string, { data?: unknown; pipes?: unknown[] }>;
    const keys = Object.keys(args);
    const kinds = (type: RouteParamtypes) =>
      keys.filter((key) => key.startsWith(`${String(type)}:`));
    expect(keys).toHaveLength(4); // phạm vi của Admin, người dùng, id, thân
    expect(kinds(RouteParamtypes.QUERY)).toEqual([]);
    expect(kinds(RouteParamtypes.BODY)).toHaveLength(1);
    expect(kinds(RouteParamtypes.PARAM)).toHaveLength(1);
    const param = Object.entries(args).find(([key]) =>
      key.startsWith(`${String(RouteParamtypes.PARAM)}:`),
    )?.[1];
    expect(param?.data).toBe('id');
    expect(param?.pipes).toEqual([ParseRecordIdPipe]);
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      proto,
      'hide',
    ) as unknown[];
    expect(paramTypes).toContain(HideRatingDto);
  });

  it('KDD-04: chuyển phạm vi, NGƯỜI ẨN từ access token (không từ thân), id đã qua pipe và thân nguyên vẹn; trả kết quả của service', async () => {
    const t = setup();
    const body = { lyDo: 'Nội dung quảng cáo, không liên quan' };
    expect(await t.controller.hide(SCOPE, ACTOR, '501', body)).toBe(HIDDEN);
    expect(t.hide).toHaveBeenCalledTimes(1);
    expect(t.hide.mock.calls[0]).toEqual([SCOPE, '3', '501', body]);
    expect(t.list).not.toHaveBeenCalled();
    expect(t.get).not.toHaveBeenCalled();
  });
});

describe('KDD-12 ParseRecordIdPipe: id sai dạng ⇒ 404 KHONG_TIM_THAY cùng thân', () => {
  const pipe = new ParseRecordIdPipe();

  it.each(['-1', '0', 'abc', '', '1.5', '9223372036854775808', '017'])(
    'id %j bị từ chối với đúng một thân 404',
    (raw) => {
      let thrown: unknown;
      try {
        pipe.transform(raw);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(AppException);
      expect((thrown as AppException).getStatus()).toBe(404);
      expect((thrown as AppException).getResponse()).toEqual(
        expect.objectContaining({ maLoi: 'KHONG_TIM_THAY' }),
      );
    },
  );

  it('id hợp lệ (kể cả BIGINT lớn nhất) đi qua nguyên văn, giữ dạng chuỗi', () => {
    expect(pipe.transform('501')).toBe('501');
    expect(pipe.transform('9223372036854775807')).toBe('9223372036854775807');
  });
});

describe('AdminRatingsController: hành vi', () => {
  it('KDD-01, QHK-07: danh sách chuyển nguyên phạm vi của Admin và TỪNG giá trị của query, kể cả offset lấy từ getter THẬT của DTO', async () => {
    const t = setup();
    const query = Object.assign(new AdminRatingsQueryDto(), {
      trangThai: 'DaAn' as const,
      soSao: 4,
      bacSiId: '31',
      chiNhanhId: '9',
      q: 'khám',
      page: 3,
      pageSize: 10,
    });
    expect(await t.controller.list(SCOPE, query)).toBe(PAGE);
    expect(t.list).toHaveBeenCalledTimes(1);
    expect(t.list.mock.calls[0]?.[0]).toBe(SCOPE);
    expect(t.list.mock.calls[0]?.[1]).toEqual({
      trangThai: 'DaAn',
      soSao: 4,
      bacSiId: '31',
      chiNhanhId: '9',
      q: 'khám',
      page: 3,
      pageSize: 10,
      offset: 20,
    });
  });

  it('KDD-02: query rỗng ⇒ mặc định page 1, pageSize 20, offset 0 và bộ lọc vắng; `chiNhanhId` KHÔNG bị controller đổi (việc ép chi nhánh là của service)', async () => {
    const t = setup();
    await t.controller.list(SCOPE, new AdminRatingsQueryDto());
    expect(t.list.mock.calls[0]?.[1]).toEqual({
      trangThai: undefined,
      soSao: undefined,
      bacSiId: undefined,
      chiNhanhId: undefined,
      q: undefined,
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });

  it('KDD-03: chi tiết chuyển phạm vi và id đã qua pipe', async () => {
    const t = setup();
    expect(await t.controller.detail(SCOPE, '501')).toBe(DETAIL);
    expect(t.get).toHaveBeenCalledWith(SCOPE, '501');
  });
});
