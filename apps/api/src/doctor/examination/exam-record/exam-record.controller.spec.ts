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
import { ExamRecordController } from './exam-record.controller.js';
import { ExamRecordDto, type ExamRecordView } from './exam-record.dto.js';
import type { ExamRecordService } from './exam-record.service.js';

// doctor-exam B2 — ExamRecordController: chỉ nhận/trả, không DB (PLAN 5.5, 5.11; QHK-01, QHK-02, QHK-09, QHK-12). Hành vi qua HTTP thật: test/doctor-exam-record.e2e-spec.ts.
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'BacSi',
};
const CODE = 'CLX-20261110-7K3QD';
const VIEW: ExamRecordView = {
  trieuChung: 'Ho',
  chanDoanSoBo: 'Viêm họng',
  huongXuLy: 'Nghỉ',
  ngayTaiKhamDuKien: null,
  capNhatLanCuoi: '2026-11-10T02:00:00.000Z',
};

const handler = Reflect.get(ExamRecordController.prototype, 'save') as (
  ...args: unknown[]
) => unknown;

function setup() {
  const save = vi.fn((..._args: unknown[]) => Promise.resolve(VIEW));
  const controller = new ExamRecordController({
    save,
  } as unknown as ExamRecordService);
  return { controller, save };
}

describe('ExamRecordController: metadata của route', () => {
  it('QHK-09: PUT doctor/appointments/:maLichHen/exam-record; @Roles("BacSi") ngay trên route, không @Public', () => {
    const reflector = new Reflector();
    expect(Reflect.getMetadata(PATH_METADATA, ExamRecordController)).toBe(
      'doctor/appointments',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':maLichHen/exam-record',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.PUT,
    );
    expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
      'BacSi',
    ]);
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler)).toBeUndefined();
    expect(
      reflector.get<boolean>(IS_PUBLIC_KEY, ExamRecordController),
    ).toBeUndefined();
  });

  it('HSK-01: trả 200 cho cả ghi lần đầu và sửa (không 201)', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });

  it('QHK-12: Cache-Control: no-store khai bằng @Header (Nest áp sau guard và TRƯỚC pipe nên mọi 400, 404, 409 cũng có)', () => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
  });

  it('QHK-02: tham số là CurrentUser, Param `maLichHen` qua ParseAppointmentCodePipe và Body là ExamRecordDto (import giá trị); KHÔNG Query', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ExamRecordController,
      'save',
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
      ExamRecordController.prototype,
      'save',
    ) as unknown[];
    expect(paramTypes).toContain(ExamRecordDto);
  });
});

describe('ExamRecordController: hành vi', () => {
  it('QHK-02: bác sĩ CHỈ lấy từ người dùng đã xác thực; mã lịch và thân đi nguyên sang service; trả đúng kết quả của service', async () => {
    const t = setup();
    const body: ExamRecordDto = {
      trieuChung: 'Ho',
      chanDoanSoBo: 'Viêm họng',
      huongXuLy: 'Nghỉ',
      capNhatLanCuoi: null,
    };
    await expect(t.controller.save(USER, CODE, body)).resolves.toBe(VIEW);
    expect(t.save).toHaveBeenCalledWith('77', CODE, body);
  });

  it('lỗi của service (400, 404, 409, 503) đi nguyên ra ngoài, controller không bắt', async () => {
    const t = setup();
    const failure = new Error('lỗi của service');
    t.save.mockRejectedValueOnce(failure);
    await expect(
      t.controller.save(USER, CODE, {} as ExamRecordDto),
    ).rejects.toBe(failure);
  });
});
