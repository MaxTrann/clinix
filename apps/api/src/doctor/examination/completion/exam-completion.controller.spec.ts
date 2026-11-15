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
import { ExamCompletionController } from './exam-completion.controller.js';
import {
  ExamCompleteDto,
  type ExamCompletionResult,
} from './exam-completion.dto.js';
import type { ExamCompletionService } from './exam-completion.service.js';

// doctor-exam B1 — ExamCompletionController: chỉ nhận/trả, không DB (PLAN 5.4, 5.11; QHK-01, QHK-02, QHK-09, QHK-12). Hành vi qua HTTP thật: test/doctor-exam-complete.e2e-spec.ts.
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'BacSi',
};
const CODE = 'CLX-20261110-7K3QD';
const RESULT: ExamCompletionResult = {
  maLichHen: CODE,
  trangThai: 'HoanThanh',
};

const handler = Reflect.get(ExamCompletionController.prototype, 'complete') as (
  ...args: unknown[]
) => unknown;

function setup() {
  const complete = vi.fn((..._args: unknown[]) => Promise.resolve(RESULT));
  const controller = new ExamCompletionController({
    complete,
  } as unknown as ExamCompletionService);
  return { controller, complete };
}

describe('ExamCompletionController: metadata của route', () => {
  it('QHK-09: POST doctor/appointments/:maLichHen/complete; @Roles("BacSi") ngay trên route, không @Public', () => {
    const reflector = new Reflector();
    expect(Reflect.getMetadata(PATH_METADATA, ExamCompletionController)).toBe(
      'doctor/appointments',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':maLichHen/complete',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
      'BacSi',
    ]);
    expect(reflector.get<boolean | undefined>(IS_PUBLIC_KEY, handler)).toBe(
      undefined,
    );
  });

  it('HTK-01: POST trả 200 (không phải 201 mặc định của @Post)', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });

  it('QHK-12: Cache-Control: no-store khai bằng @Header (Nest áp sau guard và TRƯỚC pipe nên 404 của pipe và 400 của DTO cũng có)', () => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toStrictEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
  });

  it('QHK-02: tham số là CurrentUser, Param `maLichHen` qua ParseAppointmentCodePipe và Body là ExamCompleteDto (import giá trị); KHÔNG Query', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ExamCompletionController,
      'complete',
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
      ExamCompletionController.prototype,
      'complete',
    ) as unknown[];
    expect(paramTypes).toContain(ExamCompleteDto);
  });

  it('ExamCompleteDto không có trường nào: thể hiện rỗng (whitelist + forbidNonWhitelisted từ chối mọi khoá gửi lên)', () => {
    expect(Object.keys(new ExamCompleteDto())).toEqual([]);
  });
});

describe('ExamCompletionController: hành vi', () => {
  it('QHK-02: bác sĩ CHỈ lấy từ người dùng đã xác thực; khoá lạ gán vào thân (`bacSiId`) KHÔNG tới service; kết quả trả nguyên', async () => {
    const { controller, complete } = setup();
    const body = Object.assign(new ExamCompleteDto(), { bacSiId: '999' });
    const result = await controller.complete(USER, CODE, body);
    expect(result).toBe(RESULT);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]).toStrictEqual(['77', CODE]);
    expect(JSON.stringify(complete.mock.calls[0])).not.toContain('999');
  });

  it('lỗi của service (404, 409, 503) đi nguyên ra ngoài, controller không bắt', async () => {
    const failure = new Error('lỗi của service');
    const controller = new ExamCompletionController({
      complete: () => Promise.reject(failure),
    } as unknown as ExamCompletionService);
    await expect(
      controller.complete(USER, CODE, new ExamCompleteDto()),
    ).rejects.toBe(failure);
  });
});
