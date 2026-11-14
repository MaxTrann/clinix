import 'reflect-metadata';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
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
import { ReceptionStatusController } from './reception-status.controller.js';
import {
  ReceptionStatusDto,
  type ReceptionStatusResult,
} from './reception-status.dto.js';
import { ReceptionStatusService } from './reception-status.service.js';

// Task B12 — RTS-04: ReceptionStatusController chỉ nhận/trả (không DB). Mã QB-02, QB-07, QB-08 là của PLAN 7.9 (phần route đổi trạng thái của Lễ tân, một phần B12); RTS-04 là mã MỚI `[đề xuất]` (7.32; TRACKING 3.26).
const USER: AuthenticatedUser = {
  accountId: '5',
  sessionId: 's1',
  role: 'LeTan',
};
const CODE = 'CLX-20261110-AAA01';

function setup(result: ReceptionStatusResult | Error) {
  const change = vi.fn((..._args: unknown[]) =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  const controller = new ReceptionStatusController({
    change,
  } as unknown as ReceptionStatusService);
  return { controller, change };
}

// `prototype[name]` (không `prototype.change`): lấy hàm để đọc metadata, không gọi, nên tránh cảnh báo unbound-method như spec của B10
const handler = ReceptionStatusController.prototype['change'];
const reflector = new Reflector();

describe('RTS-04 ReceptionStatusController: nối dây route (QB-02, QB-07, QB-08, AR-02)', () => {
  it('cùng tiền tố reception/appointments với controller của B3; POST :maLichHen/status (hai đoạn nên không đụng GET :maLichHen)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ReceptionStatusController)).toBe(
      'reception/appointments',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':maLichHen/status',
    );
  });

  it('QB-02, QB-07: @Roles("LeTan") DUY NHẤT ghi trên route (Bệnh nhân, Bác sĩ, Quản trị viên nhận 403), không @Public', () => {
    expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
      'LeTan',
    ]);
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler)).toBeFalsy();
  });

  it('QB-08: @Header Cache-Control no-store ghi trên route', () => {
    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as {
      name: string;
      value: string;
    }[];
    expect(headers).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
  });

  it('POST trả 200 (không phải 201 mặc định của @Post: đổi trạng thái, không tạo gì)', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });

  it('tham số: CurrentUser, Param `maLichHen` qua ParseAppointmentCodePipe, Body là ReceptionStatusDto (import giá trị); KHÔNG Query (chủ, chi nhánh và mã không đến từ query)', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ReceptionStatusController,
      'change',
    ) as Record<string, { data?: unknown; pipes?: unknown[] }>;
    expect(Object.keys(args)).toHaveLength(3);
    const withPipe = Object.values(args).filter(
      (entry) => entry.data === 'maLichHen' && entry.pipes?.length === 1,
    );
    expect(withPipe).toHaveLength(1);
    expect(withPipe[0]?.pipes?.[0]).toBe(ParseAppointmentCodePipe);
    expect(
      Object.keys(args).filter((key) =>
        key.startsWith(`${String(RouteParamtypes.QUERY)}:`),
      ),
    ).toEqual([]);
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      ReceptionStatusController.prototype,
      'change',
    ) as unknown[];
    expect(paramTypes).toContain(ReceptionStatusDto);
  });
});

describe('RTS-04 hành vi của controller', () => {
  it('chuyển tài khoản từ token, mã đã chuẩn hoá và trangThai; trả nguyên kết quả của dịch vụ', async () => {
    const result: ReceptionStatusResult = {
      maLichHen: CODE,
      trangThai: 'DaTiepDon',
    };
    const { controller, change } = setup(result);
    const body = Object.assign(new ReceptionStatusDto(), {
      trangThai: 'DaTiepDon',
    });
    await expect(controller.change(USER, CODE, body)).resolves.toBe(result);
    expect(change).toHaveBeenCalledExactlyOnceWith('5', CODE, {
      trangThai: 'DaTiepDon',
    });
  });

  it('có lyDo thì truyền lyDo; KHÔNG có thì KHÔNG truyền khoá lyDo (exactOptionalPropertyTypes)', async () => {
    const { controller, change } = setup({
      maLichHen: CODE,
      trangThai: 'DaHuy',
      hoanCoc: null,
    });
    const huy = Object.assign(new ReceptionStatusDto(), {
      trangThai: 'DaHuy',
      lyDo: 'Bệnh nhân gọi điện',
    });
    await controller.change(USER, CODE, huy);
    expect(change.mock.calls[0]?.[2]).toStrictEqual({
      trangThai: 'DaHuy',
      lyDo: 'Bệnh nhân gọi điện',
    });
    const vangMat = Object.assign(new ReceptionStatusDto(), {
      trangThai: 'VangMat',
    });
    await controller.change(USER, CODE, vangMat);
    expect(change.mock.calls[1]?.[2]).not.toHaveProperty('lyDo');
  });

  it('lỗi nghiệp vụ và lỗi hệ thống của dịch vụ đi nguyên ra ngoài (không bị nuốt)', async () => {
    const conflict = new AppException(409, 'CHUA_QUA_GIO_HEN');
    const a = setup(conflict);
    await expect(
      a.controller.change(
        USER,
        CODE,
        Object.assign(new ReceptionStatusDto(), { trangThai: 'VangMat' }),
      ),
    ).rejects.toBe(conflict);
    const boom = new Error('hỏng');
    const b = setup(boom);
    await expect(
      b.controller.change(
        USER,
        CODE,
        Object.assign(new ReceptionStatusDto(), { trangThai: 'DaTiepDon' }),
      ),
    ).rejects.toBe(boom);
  });
});

// AppointmentsModule có service đọc DB nên đòi `DataSource`; app thật có sẵn toàn cục, còn test dựng riêng module cấp một DataSource GIẢ bằng `useMocker` (như HBN-01).
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

describe('RTS-04 nối dây trong AppointmentsModule: DI thật', () => {
  it('module dựng được với DI thật: controller và dịch vụ được tiêm đủ (thiếu cổng PAYMENT_SUMMARY_PORT, SystemConfigService hay ReceptionScopeService thì Nest báo lỗi ở đây, không đợi lúc chạy app)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .useMocker(noDatabase)
      .compile();
    expect(moduleRef.get(ReceptionStatusController)).toBeInstanceOf(
      ReceptionStatusController,
    );
    expect(moduleRef.get(ReceptionStatusService)).toBeInstanceOf(
      ReceptionStatusService,
    );
    await moduleRef.close();
  });
});
