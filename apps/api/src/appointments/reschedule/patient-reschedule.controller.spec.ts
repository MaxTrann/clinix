import 'reflect-metadata';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
import { AppointmentsModule } from '../appointments.module.js';
import { findRouteRoleViolations } from '../testing/architecture-rules.js';
import {
  PatientRescheduleDto,
  ReschedulePreviewQueryDto,
} from './patient-reschedule.dto.js';
import { PatientRescheduleController } from './patient-reschedule.controller.js';
import { PatientRescheduleService } from './patient-reschedule.service.js';
import { ReschedulePreviewService } from './reschedule-preview.service.js';

// Task reschedule B6 — QDL-04 (AR-02: mọi route khai `@Roles` trên TỪNG route, không `@Public`; controller có trong `controllers` của module), BDL-03 (`Cache-Control: no-store` ghi trên từng route), nối dây
// (đường dẫn, mã 201 mặc định của POST, thứ tự tham số: `@Param` có pipe đứng TRƯỚC `@Query`/`@Body`), controller chỉ nhận/trả. Không DB. Mã DLH-62 (thứ tự pipe) là `[đề xuất]`. Hành vi HTTP thật: e2e.
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'BenhNhan',
};
const CODE = 'CLX-20261110-AAA01';
const SLOT = '9007199254740993';
const PREVIEW = { choPhepDoi: true };
const RESULT = { ketQua: 'DaDoi' };

function setup() {
  const preview = vi.fn((..._args: unknown[]) => Promise.resolve(PREVIEW));
  const reschedule = vi.fn((..._args: unknown[]) => Promise.resolve(RESULT));
  const controller = new PatientRescheduleController(
    { preview } as unknown as ReschedulePreviewService,
    { reschedule } as unknown as PatientRescheduleService,
  );
  return { controller, preview, reschedule };
}

const handler = (name: 'preview' | 'reschedule') =>
  PatientRescheduleController.prototype[name];
const reflector = new Reflector();
const NAMES = ['preview', 'reschedule'] as const;

describe('QDL-04, BDL-03 PatientRescheduleController: nối dây hai route (AR-02, QB-07)', () => {
  it('cùng tiền tố patient/appointments với controller của B1, B2, B10; hai route đúng phương thức và đường dẫn (nhiều hơn một đoạn nên không đụng GET :maLichHen)', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, PatientRescheduleController),
    ).toBe('patient/appointments');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('preview'))).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('preview'))).toBe(
      ':maLichHen/reschedule-preview',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('reschedule'))).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('reschedule'))).toBe(
      ':maLichHen/reschedule',
    );
  });

  it.each(NAMES)(
    'QDL-04 route %s: @Roles("BenhNhan") DUY NHẤT ghi trên route, không @Public',
    (name) => {
      expect(reflector.get<string[]>(ROLES_KEY, handler(name))).toStrictEqual([
        'BenhNhan',
      ]);
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler(name))).toBeFalsy();
    },
  );

  it.each(NAMES)(
    'BDL-03 route %s: @Header Cache-Control no-store ghi trên route',
    (name) => {
      // `?? []`: route mất `@Header` thì metadata là `undefined`; ca phải đỏ bằng khẳng định "chứa no-store", không bằng TypeError của `expect`
      const headers = (Reflect.getMetadata(HEADERS_METADATA, handler(name)) ??
        []) as {
        name: string;
        value: string;
      }[];
      expect(headers).toContainEqual({
        name: 'Cache-Control',
        value: 'no-store',
      });
    },
  );

  it('không có @HttpCode ở cả hai route: GET 200 và POST 201 là mặc định của Nest (PLAN 5.8: đổi lịch TẠO lịch mới hay yêu cầu)', () => {
    for (const name of NAMES)
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, handler(name)),
      ).toBeUndefined();
  });

  it('DLH-62 tham số: CurrentUser, Param `maLichHen` qua ParseAppointmentCodePipe, rồi Query (preview) hoặc Body (reschedule); Param đứng TRƯỚC để 404 của pipe thắng 400 của DTO', () => {
    for (const [name, last] of [
      ['preview', RouteParamtypes.QUERY],
      ['reschedule', RouteParamtypes.BODY],
    ] as const) {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        PatientRescheduleController,
        name,
      ) as Record<string, { index: number; data?: unknown; pipes?: unknown[] }>;
      expect(Object.keys(args)).toHaveLength(3);
      const param = Object.entries(args).find(
        ([, entry]) => entry.data === 'maLichHen',
      );
      expect(param?.[1].pipes).toEqual([ParseAppointmentCodePipe]);
      const lastEntry = Object.entries(args).find(([key]) =>
        key.startsWith(`${String(last)}:`),
      );
      expect(lastEntry).toBeDefined();
      expect(param?.[1].index).toBeLessThan(lastEntry?.[1].index ?? -1);
    }
    // DTO là import GIÁ TRỊ: ValidationPipe cần metadata của lớp lúc chạy
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        PatientRescheduleController.prototype,
        'preview',
      ),
    ).toContain(ReschedulePreviewQueryDto);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        PatientRescheduleController.prototype,
        'reschedule',
      ),
    ).toContain(PatientRescheduleDto);
  });
});

describe('controller chỉ nhận và trả', () => {
  it('preview: tài khoản từ token, mã đã chuẩn hoá và khungGioId (hoặc undefined) cho dịch vụ; trả nguyên kết quả', async () => {
    const { controller, preview } = setup();
    await expect(
      controller.preview(
        USER,
        CODE,
        Object.assign(new ReschedulePreviewQueryDto(), { khungGioId: SLOT }),
      ),
    ).resolves.toBe(PREVIEW);
    expect(preview).toHaveBeenLastCalledWith('77', CODE, SLOT);
    await controller.preview(USER, CODE, new ReschedulePreviewQueryDto());
    expect(preview).toHaveBeenLastCalledWith('77', CODE, undefined);
  });

  it('reschedule: tài khoản từ token; KHÔNG truyền khoá lyDoYeuCau khi vắng; truyền khi có; trả nguyên kết quả', async () => {
    const { controller, reschedule } = setup();
    const without = Object.assign(new PatientRescheduleDto(), {
      khungGioId: SLOT,
    });
    await expect(controller.reschedule(USER, CODE, without)).resolves.toBe(
      RESULT,
    );
    expect(reschedule).toHaveBeenLastCalledWith('77', CODE, {
      khungGioId: SLOT,
    });
    expect(reschedule.mock.calls[0]?.[2]).not.toHaveProperty('lyDoYeuCau');
    const withReason = Object.assign(new PatientRescheduleDto(), {
      khungGioId: SLOT,
      lyDoYeuCau: 'Tôi có việc đột xuất',
    });
    await controller.reschedule(USER, CODE, withReason);
    expect(reschedule).toHaveBeenLastCalledWith('77', CODE, {
      khungGioId: SLOT,
      lyDoYeuCau: 'Tôi có việc đột xuất',
    });
  });

  it('lỗi của dịch vụ (AppException hay lỗi hệ thống) đi nguyên ra ngoài, không bị nuốt', async () => {
    const notFound = new AppException(404, 'KHONG_TIM_THAY');
    const boom = new Error('hỏng');
    const controller = new PatientRescheduleController(
      {
        preview: () => Promise.reject(notFound),
      } as unknown as ReschedulePreviewService,
      {
        reschedule: () => Promise.reject(boom),
      } as unknown as PatientRescheduleService,
    );
    await expect(
      controller.preview(USER, CODE, new ReschedulePreviewQueryDto()),
    ).rejects.toBe(notFound);
    await expect(
      controller.reschedule(
        USER,
        CODE,
        Object.assign(new PatientRescheduleDto(), { khungGioId: SLOT }),
      ),
    ).rejects.toBe(boom);
  });
});

// AppointmentsModule có service đọc DB nên đòi `DataSource`; app thật có sẵn toàn cục, còn test dựng riêng module cấp một DataSource GIẢ bằng `useMocker` (như BPO-01).
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

describe('QDL-04 nối dây trong AppointmentsModule', () => {
  it('controller có trong `controllers` của module và qua luật AR-02 (mọi route có @Roles, không @Public)', () => {
    const controllers = (Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppointmentsModule,
    ) ?? []) as Parameters<typeof findRouteRoleViolations>[0];
    expect([...controllers]).toContain(PatientRescheduleController);
    expect(findRouteRoleViolations([PatientRescheduleController])).toEqual([]);
  });

  it('module dựng được với DI thật: controller và hai dịch vụ của B6 được tiêm đủ (thiếu provider thì Nest báo lỗi ở đây, không đợi lúc chạy)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .useMocker(noDatabase)
      .compile();
    expect(moduleRef.get(PatientRescheduleController)).toBeInstanceOf(
      PatientRescheduleController,
    );
    expect(moduleRef.get(PatientRescheduleService)).toBeInstanceOf(
      PatientRescheduleService,
    );
    expect(moduleRef.get(ReschedulePreviewService)).toBeInstanceOf(
      ReschedulePreviewService,
    );
    await moduleRef.close();
  });
});
