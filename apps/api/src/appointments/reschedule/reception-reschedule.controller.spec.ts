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
import { ReschedulePreviewQueryDto } from './patient-reschedule.dto.js';
import { ReceptionRescheduleController } from './reception-reschedule.controller.js';
import { ReceptionRescheduleDto } from './reception-reschedule.dto.js';
import { ReceptionReschedulePreviewService } from './reception-reschedule-preview.service.js';
import { ReceptionRescheduleService } from './reception-reschedule.service.js';

// Task reschedule B7 — QDL-10 (AR-02: mọi route khai `@Roles('LeTan')` trên TỪNG route, không `@Public`; controller có trong `controllers` của module), BDL-03 (`Cache-Control: no-store` ghi trên từng route), nối dây
// (đường dẫn, mã 201 mặc định của POST, thứ tự tham số: `@Param` có pipe đứng TRƯỚC `@Query`/`@Body`), controller chỉ nhận/trả. Không DB. Mã QDL-10 là `[đề xuất]`. Hành vi HTTP thật: e2e.
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'LeTan',
};
const CODE = 'CLX-20261110-AAA01';
const SLOT = '9007199254740993';
const REASON = 'Bệnh nhân gọi điện xin dời sang buổi chiều';
const PREVIEW = { choPhepDoi: true };
const RESULT = { ketQua: 'DaDoi' };

function setup() {
  const preview = vi.fn((..._args: unknown[]) => Promise.resolve(PREVIEW));
  const reschedule = vi.fn((..._args: unknown[]) => Promise.resolve(RESULT));
  const controller = new ReceptionRescheduleController(
    { preview } as unknown as ReceptionReschedulePreviewService,
    { reschedule } as unknown as ReceptionRescheduleService,
  );
  return { controller, preview, reschedule };
}

const handler = (name: 'preview' | 'reschedule') =>
  ReceptionRescheduleController.prototype[name];
const reflector = new Reflector();
const NAMES = ['preview', 'reschedule'] as const;

describe('QDL-10, BDL-03 ReceptionRescheduleController: nối dây hai route (AR-02, QB-07)', () => {
  it('cùng tiền tố reception/appointments với controller của B3 và B12; hai route đúng phương thức và đường dẫn (nhiều hơn một đoạn nên không đụng GET :maLichHen)', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, ReceptionRescheduleController),
    ).toBe('reception/appointments');
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
    'QDL-10 route %s: @Roles("LeTan") DUY NHẤT ghi trên route (Quản trị viên KHÔNG có route đổi hộ, Q7 (i)), không @Public',
    (name) => {
      expect(reflector.get<string[]>(ROLES_KEY, handler(name))).toStrictEqual([
        'LeTan',
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

  it('không có @HttpCode ở cả hai route: GET 200 và POST 201 là mặc định của Nest (PLAN 5.8: đổi lịch TẠO lịch mới)', () => {
    for (const name of NAMES)
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, handler(name)),
      ).toBeUndefined();
  });

  it('DLO-07 tham số: CurrentUser, Param `maLichHen` qua ParseAppointmentCodePipe, rồi Query (preview) hoặc Body (reschedule); Param đứng TRƯỚC để 404 của pipe thắng 400 của DTO', () => {
    for (const [name, last] of [
      ['preview', RouteParamtypes.QUERY],
      ['reschedule', RouteParamtypes.BODY],
    ] as const) {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        ReceptionRescheduleController,
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
        ReceptionRescheduleController.prototype,
        'preview',
      ),
    ).toContain(ReschedulePreviewQueryDto);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        ReceptionRescheduleController.prototype,
        'reschedule',
      ),
    ).toContain(ReceptionRescheduleDto);
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

  it('reschedule: tài khoản từ token; CHỈ hai trường khungGioId và lyDo đi tiếp (không chuyển nguyên DTO, không có chi nhánh); trả nguyên kết quả', async () => {
    const { controller, reschedule } = setup();
    const body = Object.assign(new ReceptionRescheduleDto(), {
      khungGioId: SLOT,
      lyDo: REASON,
    });
    await expect(controller.reschedule(USER, CODE, body)).resolves.toBe(RESULT);
    expect(reschedule).toHaveBeenLastCalledWith('77', CODE, {
      khungGioId: SLOT,
      lyDo: REASON,
    });
    expect(Object.keys(reschedule.mock.calls[0]?.[2] ?? {}).sort()).toEqual([
      'khungGioId',
      'lyDo',
    ]);
  });

  it('lỗi của dịch vụ (AppException hay lỗi hệ thống) đi nguyên ra ngoài, không bị nuốt', async () => {
    const notFound = new AppException(404, 'KHONG_TIM_THAY');
    const boom = new Error('hỏng');
    const controller = new ReceptionRescheduleController(
      {
        preview: () => Promise.reject(notFound),
      } as unknown as ReceptionReschedulePreviewService,
      {
        reschedule: () => Promise.reject(boom),
      } as unknown as ReceptionRescheduleService,
    );
    await expect(
      controller.preview(USER, CODE, new ReschedulePreviewQueryDto()),
    ).rejects.toBe(notFound);
    await expect(
      controller.reschedule(
        USER,
        CODE,
        Object.assign(new ReceptionRescheduleDto(), {
          khungGioId: SLOT,
          lyDo: REASON,
        }),
      ),
    ).rejects.toBe(boom);
  });
});

// AppointmentsModule có service đọc DB nên đòi `DataSource`; app thật có sẵn toàn cục, còn test dựng riêng module cấp một DataSource GIẢ bằng `useMocker` (như BPO-01).
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

describe('QDL-10 nối dây trong AppointmentsModule', () => {
  it('controller có trong `controllers` của module và qua luật AR-02 (mọi route có @Roles, không @Public)', () => {
    const controllers = (Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppointmentsModule,
    ) ?? []) as Parameters<typeof findRouteRoleViolations>[0];
    expect([...controllers]).toContain(ReceptionRescheduleController);
    expect(findRouteRoleViolations([ReceptionRescheduleController])).toEqual(
      [],
    );
  });

  it('module dựng được với DI thật: controller và hai dịch vụ của B7 được tiêm đủ (thiếu provider thì Nest báo lỗi ở đây, không đợi lúc chạy)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .useMocker(noDatabase)
      .compile();
    expect(moduleRef.get(ReceptionRescheduleController)).toBeInstanceOf(
      ReceptionRescheduleController,
    );
    expect(moduleRef.get(ReceptionRescheduleService)).toBeInstanceOf(
      ReceptionRescheduleService,
    );
    expect(moduleRef.get(ReceptionReschedulePreviewService)).toBeInstanceOf(
      ReceptionReschedulePreviewService,
    );
    await moduleRef.close();
  });
});
