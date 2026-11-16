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
import { vi } from 'vitest';
import { ParseAppointmentCodePipe } from '../../../appointments/appointment-code.pipe.js';
import type { AuthenticatedUser } from '../../../auth/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator.js';
import { RatingController } from './rating.controller.js';
import { RatingDto, type RatingView } from './rating.dto.js';
import type { RatingService } from './rating.service.js';

// doctor-exam B6 — RatingController: chỉ nhận/trả, không DB (PLAN 5.7, 5.11; QHK-01, QHK-03, QHK-09, QHK-12). Hành vi qua HTTP thật: test/doctor-exam-rating.e2e-spec.ts.
const USER: AuthenticatedUser = {
  accountId: '55',
  sessionId: 's1',
  role: 'BenhNhan',
};
const CODE = 'CLX-20261110-7K3QD';
const VIEW: RatingView = {
  soSao: 5,
  nhanXet: null,
  thoiDiemTao: '2026-11-10T02:00:00.000Z',
};

const handler = Reflect.get(RatingController.prototype, 'submit') as (
  ...args: unknown[]
) => unknown;

function setup() {
  const submit = vi.fn((..._args: unknown[]) => Promise.resolve(VIEW));
  const controller = new RatingController({
    submit,
  } as unknown as RatingService);
  return { controller, submit };
}

describe('RatingController: metadata của route', () => {
  it('QHK-09: POST patient/exam-records/:maLichHen/rating; @Roles("BenhNhan") (đúng một vai trò) ngay trên route, không @Public', () => {
    const reflector = new Reflector();
    expect(Reflect.getMetadata(PATH_METADATA, RatingController)).toBe(
      'patient/exam-records',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':maLichHen/rating',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
      'BenhNhan',
    ]);
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler)).toBeUndefined();
    expect(
      reflector.get<boolean>(IS_PUBLIC_KEY, RatingController),
    ).toBeUndefined();
  });

  it('DGB-01: trả 201 (tạo mới một đánh giá), không 200', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(201);
  });

  it('QHK-12: Cache-Control: no-store khai bằng @Header (Nest áp sau guard và TRƯỚC pipe nên mọi 400, 404, 409 cũng có)', () => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
  });

  it('QHK-03: tham số là CurrentUser, Param `maLichHen` qua ParseAppointmentCodePipe và Body là RatingDto (import giá trị); KHÔNG Query', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      RatingController,
      'submit',
    ) as Record<string, { data?: unknown; pipes?: unknown[] }>;
    const withPipe = Object.values(args).filter(
      (entry) => entry.data === 'maLichHen' && entry.pipes?.length === 1,
    );
    expect(withPipe).toHaveLength(1);
    expect(withPipe[0]?.pipes?.[0]).toBe(ParseAppointmentCodePipe);
    const keys = Object.keys(args);
    expect(keys).toHaveLength(3);
    expect(
      keys.filter((key) => key.startsWith(`${String(RouteParamtypes.BODY)}:`)),
    ).toHaveLength(1);
    expect(
      keys.filter((key) => key.startsWith(`${String(RouteParamtypes.QUERY)}:`)),
    ).toEqual([]);
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      RatingController.prototype,
      'submit',
    ) as unknown[];
    expect(paramTypes).toContain(RatingDto);
  });
});

describe('RatingController: hành vi', () => {
  it('QHK-03: Bệnh nhân CHỈ lấy từ người dùng đã xác thực; mã lịch và thân đi nguyên sang service; trả đúng kết quả của service', async () => {
    const t = setup();
    const body: RatingDto = { soSao: 5, nhanXet: 'Tốt' };
    await expect(t.controller.submit(USER, CODE, body)).resolves.toBe(VIEW);
    expect(t.submit).toHaveBeenCalledWith('55', CODE, body);
  });

  it('lỗi của service (400, 404, 409, 503) đi nguyên ra ngoài, controller không bắt', async () => {
    const t = setup();
    const failure = new Error('lỗi của service');
    t.submit.mockRejectedValueOnce(failure);
    await expect(t.controller.submit(USER, CODE, {} as RatingDto)).rejects.toBe(
      failure,
    );
  });
});
