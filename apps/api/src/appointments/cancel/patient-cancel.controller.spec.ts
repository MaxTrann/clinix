import 'reflect-metadata';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { Inject, Injectable, Module, RequestMethod } from '@nestjs/common';
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
import { AppointmentQueries } from '../queries/appointment-queries.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import { AppointmentCancellationService } from './appointment-cancellation.service.js';
import type { CancelOutcome } from './cancel.types.js';
import { CancelPreviewService } from './cancel-preview.service.js';
import { PatientCancelController } from './patient-cancel.controller.js';
import { PatientCancelDto } from './patient-cancel.dto.js';

// Task B10 — HBN-01: PatientCancelController chỉ nhận/trả (không DB). Mã QB-02, QB-07, QB-08 là của PLAN 7.9 (phần route huỷ, một phần B10); HBN-01 là mã MỚI `[đề xuất]` (PLAN 7.29; TRACKING 3.23 B10-I).
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'BenhNhan',
};
const CODE = 'CLX-20261110-AAA01';
const PREVIEW = { choPhepHuy: true, hoanCoc: null };

function setup(outcome: CancelOutcome) {
  const preview = vi.fn((..._args: unknown[]) => Promise.resolve(PREVIEW));
  const cancel = vi.fn((..._args: unknown[]) => Promise.resolve(outcome));
  const controller = new PatientCancelController(
    { preview } as unknown as CancelPreviewService,
    { cancel } as unknown as AppointmentCancellationService,
  );
  return { controller, preview, cancel };
}

const handler = (name: 'preview' | 'cancel') =>
  PatientCancelController.prototype[name];
const reflector = new Reflector();
const NAMES = ['preview', 'cancel'] as const;

describe('HBN-01 PatientCancelController: nối dây hai route (QB-02, QB-07, QB-08, AR-02)', () => {
  it('cùng tiền tố patient/appointments với controller của B1, B2; hai route đúng phương thức và đường dẫn (nhiều hơn một đoạn nên không đụng GET :maLichHen)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PatientCancelController)).toBe(
      'patient/appointments',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('preview'))).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('preview'))).toBe(
      ':maLichHen/cancel-preview',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('cancel'))).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('cancel'))).toBe(
      ':maLichHen/cancel',
    );
  });

  it.each(NAMES)(
    'QB-02, QB-07 route %s: @Roles("BenhNhan") DUY NHẤT ghi trên route, không @Public',
    (name) => {
      expect(reflector.get<string[]>(ROLES_KEY, handler(name))).toStrictEqual([
        'BenhNhan',
      ]);
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler(name))).toBeFalsy();
    },
  );

  it.each(NAMES)(
    'QB-08 route %s: @Header Cache-Control no-store ghi trên route',
    (name) => {
      const headers = Reflect.getMetadata(HEADERS_METADATA, handler(name)) as {
        name: string;
        value: string;
      }[];
      expect(headers).toContainEqual({
        name: 'Cache-Control',
        value: 'no-store',
      });
    },
  );

  it('POST trả 200 (không phải 201 mặc định của @Post); GET giữ 200 mặc định', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('cancel'))).toBe(
      200,
    );
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, handler('preview')),
    ).toBeUndefined();
  });

  it('tham số của handler: CurrentUser và Param `maLichHen` qua ParseAppointmentCodePipe; POST thêm Body là PatientCancelDto (import giá trị); KHÔNG Query', () => {
    for (const name of NAMES) {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        PatientCancelController,
        name,
      ) as Record<string, { data?: unknown; pipes?: unknown[] }>;
      const entries = Object.values(args);
      const withPipe = entries.filter(
        (entry) => entry.data === 'maLichHen' && entry.pipes?.length === 1,
      );
      expect(withPipe).toHaveLength(1);
      expect(withPipe[0]?.pipes?.[0]).toBe(ParseAppointmentCodePipe);
      // khoá của Nest có dạng `<loại tham số>:<vị trí>`; KHÔNG có Query (chủ sở hữu và mã không đến từ query)
      expect(
        Object.keys(args).filter((key) =>
          key.startsWith(`${String(RouteParamtypes.QUERY)}:`),
        ),
      ).toEqual([]);
      // preview: CurrentUser và Param; cancel: thêm Body
      expect(Object.keys(args)).toHaveLength(name === 'cancel' ? 3 : 2);
    }
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      PatientCancelController.prototype,
      'cancel',
    ) as unknown[];
    expect(paramTypes).toContain(PatientCancelDto);
  });
});

describe('HBN-01 hành vi của controller', () => {
  it('preview: chuyển tài khoản từ token và mã đã chuẩn hoá cho dịch vụ, trả nguyên kết quả', async () => {
    const { controller, preview } = setup({ kind: 'NotFound' });
    await expect(controller.preview(USER, CODE)).resolves.toBe(PREVIEW);
    expect(preview).toHaveBeenCalledExactlyOnceWith('77', CODE);
  });

  it('cancel thành công: actor BenhNhan từ token, reason BenhNhanHuy; trả đúng BA khoá { maLichHen, trangThai: DaHuy, hoanCoc } (không lộ id nội bộ)', async () => {
    const hoanCoc = { tyLe: 50, soTien: '50000.00' };
    const { controller, cancel } = setup({
      kind: 'Cancelled',
      maLichHen: CODE,
      hoanCoc,
    });
    const body = Object.assign(new PatientCancelDto(), { lyDo: 'Bận' });
    const result = await controller.cancel(USER, CODE, body);
    expect(result).toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaHuy',
      hoanCoc,
    });
    expect(cancel).toHaveBeenCalledExactlyOnceWith({
      maLichHen: CODE,
      actor: { kind: 'BenhNhan', accountId: '77' },
      reason: 'BenhNhanHuy',
      lyDo: 'Bận',
    });
  });

  it('cancel thành công không có lyDo: KHÔNG truyền khoá lyDo (dịch vụ dùng chữ hằng); hoanCoc null được giữ', async () => {
    const { controller, cancel } = setup({
      kind: 'Cancelled',
      maLichHen: CODE,
      hoanCoc: null,
    });
    const result = await controller.cancel(USER, CODE, new PatientCancelDto());
    expect(result.hoanCoc).toBeNull();
    expect(cancel.mock.calls[0]?.[0]).not.toHaveProperty('lyDo');
  });

  it('NotFound ⇒ ném 404; AlreadyCancelled và NotCancellable ⇒ ném 409 LICH_HEN_KHONG_CHO_HUY kèm trangThai (dùng cancelOutcomeException)', async () => {
    for (const [outcome, status, trangThai] of [
      [{ kind: 'NotFound' }, 404, undefined],
      [{ kind: 'AlreadyCancelled' }, 409, 'DaHuy'],
      [{ kind: 'NotCancellable', trangThai: 'DaTiepDon' }, 409, 'DaTiepDon'],
    ] as const) {
      const { controller } = setup(outcome);
      const error = await controller
        .cancel(USER, CODE, new PatientCancelDto())
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(status);
      if (trangThai !== undefined)
        expect((error as AppException).getResponse()).toMatchObject({
          chiTiet: { trangThai },
        });
    }
  });

  it('lỗi hệ thống của dịch vụ đi nguyên ra ngoài (không bị nuốt thành 404 hay 409)', async () => {
    const boom = new Error('hỏng');
    const controller = new PatientCancelController(
      {} as unknown as CancelPreviewService,
      {
        cancel: () => Promise.reject(boom),
      } as unknown as AppointmentCancellationService,
    );
    await expect(
      controller.cancel(USER, CODE, new PatientCancelDto()),
    ).rejects.toBe(boom);
  });
});

// AppointmentsModule có service đọc DB nên đòi `DataSource`; app thật có sẵn toàn cục, còn test dựng riêng module cấp một DataSource GIẢ bằng `useMocker` (như BPO-01).
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

describe('HBN-01 nối dây trong AppointmentsModule: DI thật và hợp đồng xuất cho doctor (B10-C)', () => {
  it('module dựng được với DI thật: controller và hai dịch vụ của B10 được tiêm đủ (thiếu BranchAccessPolicy hay cổng thì Nest báo lỗi ở đây, không đợi lúc chạy app)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .useMocker(noDatabase)
      .compile();
    expect(moduleRef.get(PatientCancelController)).toBeInstanceOf(
      PatientCancelController,
    );
    expect(moduleRef.get(CancelPreviewService)).toBeInstanceOf(
      CancelPreviewService,
    );
    await moduleRef.close();
  });

  it('AppointmentsModule XUẤT đúng ba lớp (AppointmentTransitionService và AppointmentQueries của B11, AppointmentCancellationService của B10): module `doctor` nhập AppointmentsModule rồi tiêm được AppointmentCancellationService, không tiêm được CancelPreviewService', async () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, AppointmentsModule),
    ).toEqual([
      AppointmentTransitionService,
      AppointmentQueries,
      AppointmentCancellationService,
    ]);

    @Injectable()
    class Consumer {
      constructor(
        @Inject(AppointmentCancellationService)
        readonly cancellation: AppointmentCancellationService,
      ) {}
    }
    @Module({ imports: [AppointmentsModule], providers: [Consumer] })
    class ConsumerModule {}
    const ok = await Test.createTestingModule({ imports: [ConsumerModule] })
      .useMocker(noDatabase)
      .compile();
    expect(ok.get(Consumer).cancellation).toBeInstanceOf(
      AppointmentCancellationService,
    );
    await ok.close();

    @Injectable()
    class Hidden {
      constructor(
        @Inject(CancelPreviewService)
        readonly preview: CancelPreviewService,
      ) {}
    }
    @Module({ imports: [AppointmentsModule], providers: [Hidden] })
    class HiddenModule {}
    await expect(
      Test.createTestingModule({ imports: [HiddenModule] })
        .useMocker(noDatabase)
        .compile(),
    ).rejects.toThrow(/CancelPreviewService/);
  });
});
