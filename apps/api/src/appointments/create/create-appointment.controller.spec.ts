import 'reflect-metadata';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { CreateAppointmentController } from './create-appointment.controller.js';
import {
  CreateAppointmentDto,
  type CreatedAppointment,
} from './create-appointment.dto.js';
import type { CreateAppointmentService } from './create-appointment.service.js';

// Task B8 — CreateAppointmentController: chỉ nhận/trả (không DB). TAO-05, QB-02, QB-03, QB-07, QB-08 mức đơn vị (TRACKING booking 3.21 B8-G). Mã TAO-nn là [đề xuất].
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'BenhNhan',
};
const CREATED: CreatedAppointment = {
  maLichHen: 'CLX-20261102-ABCDE',
  trangThai: 'DaXacNhan',
  hanThanhToan: null,
  giaApDung: '150000.00',
  tienCoc: '0.00',
  canThanhToan: false,
  thoiGianMayChu: '2026-11-02T01:00:00.000Z',
};

function setup() {
  const create = vi.fn((..._args: unknown[]) => Promise.resolve(CREATED));
  const controller = new CreateAppointmentController({
    create,
  } as unknown as CreateAppointmentService);
  return { controller, create };
}

const handlerName = 'create' as const;
const handler = CreateAppointmentController.prototype[handlerName];
const reflector = new Reflector();

describe('CreateAppointmentController: nối dây route (TAO-05, QB-02, QB-07, QB-08)', () => {
  it('QB-07 controller dưới đường dẫn booking; route POST appointments', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, CreateAppointmentController),
    ).toBe('booking');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('appointments');
  });

  it('QB-02, QB-07 @Roles("BenhNhan") DUY NHẤT ghi trên route (RolesGuard cho qua route không có @Roles), không @Public', () => {
    expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
      'BenhNhan',
    ]);
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler)).toBeFalsy();
  });

  it('QB-08 @Header Cache-Control no-store ghi trên route (dữ liệu cá nhân)', () => {
    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as {
      name: string;
      value: string;
    }[];

    expect(headers).toStrictEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
  });

  it('TAO-05 trả 201: dùng mặc định của @Post, KHÔNG khai @HttpCode (route này TẠO lịch hẹn)', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBeUndefined();
  });

  it('QB-03 nhận thân bằng CreateAppointmentDto (giá trị lớp, để ValidationPipe kiểm lúc chạy)', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      CreateAppointmentController.prototype,
      'create',
    ) as unknown[];

    expect(paramTypes).toContain(CreateAppointmentDto);
  });
});

describe('CreateAppointmentController: chỉ chuyển giao (QB-03, DL-25)', () => {
  it('TAO-05 truyền accountId của access token và đúng BA trường của thân; vắng ⇒ null; trả nguyên kết quả của dịch vụ', async () => {
    const { controller, create } = setup();
    const dto = Object.assign(new CreateAppointmentDto(), { khungGioId: '10' });

    const result = await controller.create(USER, dto);

    expect(result).toBe(CREATED);
    expect(create).toHaveBeenCalledExactlyOnceWith('77', {
      khungGioId: '10',
      hoSoNguoiThanId: null,
      lyDoKham: null,
    });
  });

  it('giữ hoSoNguoiThanId và lyDoKham của thân; KHÔNG chuyển khoá lạ nào, kể cả khi DTO bị gắn thêm (benhNhanId, bacSiId, trangThai)', async () => {
    const { controller, create } = setup();
    const dto = Object.assign(new CreateAppointmentDto(), {
      khungGioId: '10',
      hoSoNguoiThanId: '9',
      lyDoKham: 'Đau đầu',
      benhNhanId: '1',
      bacSiId: '2',
      trangThai: 'DaHuy',
    });

    await controller.create(USER, dto);

    expect(create).toHaveBeenCalledExactlyOnceWith('77', {
      khungGioId: '10',
      hoSoNguoiThanId: '9',
      lyDoKham: 'Đau đầu',
    });
  });
});
