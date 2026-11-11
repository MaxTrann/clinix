import 'reflect-metadata';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { BookingChecksDto } from './booking-checks.dto.js';
import type { BookingChecksService } from './booking-checks.service.js';
import { BookingChecksController } from './booking-checks.controller.js';
import type { BookingEligibilityService } from './booking-eligibility.service.js';

// Task B7 — BookingChecksController: chỉ nhận/trả (không DB). Mã QB-nn, BCK-nn là [đề xuất] (TRACKING booking 3.18.3).
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'BenhNhan',
};
const ELIGIBILITY = { choPhepDatLich: true, soLichHenToiDaMoiHoSo: 3 };
const CHECK_RESULT = { tomTat: {}, thoiGianMayChu: 'x' };

function setup() {
  const eligibility = vi.fn((..._args: unknown[]) =>
    Promise.resolve(ELIGIBILITY),
  );
  const checks = vi.fn((..._args: unknown[]) => Promise.resolve(CHECK_RESULT));
  const controller = new BookingChecksController(
    { check: eligibility } as unknown as BookingEligibilityService,
    { check: checks } as unknown as BookingChecksService,
  );
  return { controller, eligibility, checks };
}

const handler = (name: 'eligibility' | 'checks') =>
  BookingChecksController.prototype[name];
const reflector = new Reflector();

describe('BookingChecksController: nối dây hai route (QB-02, QB-07, AR-02)', () => {
  it('QB-07 cả controller dưới đường dẫn booking; hai route đúng phương thức và đường dẫn', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BookingChecksController)).toBe(
      'booking',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('eligibility'))).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('eligibility'))).toBe(
      'eligibility',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('checks'))).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('checks'))).toBe(
      'checks',
    );
  });

  it.each(['eligibility', 'checks'] as const)(
    'QB-02, QB-07 route %s: @Roles("BenhNhan") DUY NHẤT ghi trên route, không @Public',
    (name) => {
      expect(reflector.get<string[]>(ROLES_KEY, handler(name))).toStrictEqual([
        'BenhNhan',
      ]);
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler(name))).toBeFalsy();
    },
  );

  it.each(['eligibility', 'checks'] as const)(
    'QB-08 route %s: @Header Cache-Control no-store ghi trên route (dữ liệu cá nhân, không cho trình duyệt hay proxy lưu)',
    (name) => {
      const headers = Reflect.getMetadata(HEADERS_METADATA, handler(name)) as {
        name: string;
        value: string;
      }[];

      expect(headers).toStrictEqual([
        { name: 'Cache-Control', value: 'no-store' },
      ]);
    },
  );

  it('BCK-11 POST checks trả 200 (mặc định của @Post là 201, đã khai @HttpCode(200)); GET eligibility dùng mặc định 200', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('checks'))).toBe(
      200,
    );
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, handler('eligibility')),
    ).toBeUndefined();
  });

  it('QB-03 eligibility KHÔNG khai @Body, @Query hay @Param: query lạ như benhNhanId không có chỗ để lọt vào', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      BookingChecksController,
      'eligibility',
    ) as Record<string, unknown> | undefined;

    // chỉ có `@CurrentUser()` (tham số tuỳ biến), không có body/query/param
    expect(
      Object.keys(args ?? {}).filter((key) => /^[0-5]:/.test(key)),
    ).toStrictEqual([]);
  });

  it('QB-03 checks nhận thân bằng BookingChecksDto (giá trị lớp, để ValidationPipe kiểm lúc chạy)', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      BookingChecksController.prototype,
      'checks',
    ) as unknown[];

    expect(paramTypes).toContain(BookingChecksDto);
  });
});

describe('BookingChecksController: chỉ chuyển giao (QB-03)', () => {
  it('QB-03 eligibility truyền accountId của access token, không gì khác', async () => {
    const { controller, eligibility } = setup();

    const result = await controller.eligibility(USER);

    expect(result).toBe(ELIGIBILITY);
    expect(eligibility).toHaveBeenCalledWith('77');
  });

  it('QB-03 checks truyền accountId của token và CHỈ hai trường của thân; hoSoNguoiThanId vắng ⇒ null', async () => {
    const { controller, checks } = setup();
    const dto = Object.assign(new BookingChecksDto(), { khungGioId: '10' });

    const result = await controller.checks(USER, dto);

    expect(result).toBe(CHECK_RESULT);
    expect(checks).toHaveBeenCalledWith('77', {
      khungGioId: '10',
      hoSoNguoiThanId: null,
    });
  });

  it('QB-03 checks giữ hoSoNguoiThanId của thân (chuỗi) và không chuyển khoá lạ nào, kể cả khi DTO bị gắn thêm', async () => {
    const { controller, checks } = setup();
    const dto = Object.assign(new BookingChecksDto(), {
      khungGioId: '10',
      hoSoNguoiThanId: '9',
      benhNhanId: '1',
    });

    await controller.checks(USER, dto);

    expect(checks).toHaveBeenCalledWith('77', {
      khungGioId: '10',
      hoSoNguoiThanId: '9',
    });
  });
});
