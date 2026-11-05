import 'reflect-metadata';
import { Controller, Get, Post, SetMetadata } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY, Roles } from '../../auth/decorators/roles.decorator.js';
import { PatientModule } from '../patient.module.js';
import { ProfileController } from '../profile/profile.controller.js';
import { auditPatientControllers } from './patient-route-audit.js';

// QP-08 — bộ quét route của PatientModule: mỗi route phải có @Roles. Mã ca RA-nn là [đề xuất] (TRACKING patient B1-H).
@Controller('x')
class Valid {
  @Get() @Roles('BenhNhan', 'BacSi') list() {}
  @Post() @Roles('LeTan') create() {}
}
@Controller('x')
class MissingRoles {
  @Get() ok() {}
}
@Controller('x')
class EmptyRoles {
  @Get() @SetMetadata(ROLES_KEY, []) list() {}
}
@Controller('x')
@Public()
class PublicRoute {
  @Get() @Roles('BenhNhan') list() {}
}
@Controller('x')
class UnknownRole {
  @Get() @SetMetadata(ROLES_KEY, ['Khach']) list() {}
}
@Controller('x')
@Roles('BenhNhan')
class ClassLevelRolesOverriddenEmpty {
  @Get() fine() {}
  @Post() @SetMetadata(ROLES_KEY, []) broken() {}
}
@Controller('x')
@Roles('BenhNhan')
class ClassLevelRoles {
  @Get() fine() {}
}
@Controller('x')
class WithHelper {
  @Get() @Roles('BenhNhan') list() {
    return this.helper();
  }
  helper() {
    return 1;
  }
}

describe('QP-08 — quét route của PatientModule', () => {
  it('RA-01 controller đúng quy ước: không vi phạm', () =>
    expect(auditPatientControllers([Valid])).toEqual([]));

  it('RA-02 route thiếu @Roles bị bắt, thông điệp có TênController.tênHàm', () => {
    expect(auditPatientControllers([MissingRoles])).toEqual([
      'MissingRoles.ok: thiếu @Roles (hoặc rỗng)',
    ]);
  });

  it('RA-03 @Roles rỗng (SetMetadata lách kiểu tuple) bị bắt', () => {
    const failures = auditPatientControllers([EmptyRoles]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('EmptyRoles.list');
  });

  it('RA-04 route @Public bị bắt dù có @Roles', () => {
    const failures = auditPatientControllers([PublicRoute]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('@Public');
  });

  it('RA-05 vai trò lạ trong @Roles bị bắt', () => {
    const failures = auditPatientControllers([UnknownRole]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('LOAI_TAI_KHOAN');
  });

  it('RA-06 @Roles ở class đủ cho mọi route (khớp RolesGuard), nhưng route ghi đè bằng @Roles rỗng bị bắt', () => {
    expect(auditPatientControllers([ClassLevelRoles])).toEqual([]);
    expect(auditPatientControllers([ClassLevelRolesOverriddenEmpty])).toEqual([
      'ClassLevelRolesOverriddenEmpty.broken: thiếu @Roles (hoặc rỗng)',
    ]);
  });

  it('RA-07 hàm không phải route (không có metadata HTTP) bị bỏ qua', () => {
    expect(auditPatientControllers([WithHelper])).toEqual([]);
  });

  it('RA-08 controller thật của PatientModule đều đạt, và danh sách không rỗng (không đạt giả vì rỗng)', () => {
    const controllers = (Reflect.getMetadata('controllers', PatientModule) ??
      []) as Function[];

    expect(controllers).toContain(ProfileController);
    expect(auditPatientControllers(controllers)).toEqual([]);
  });
});
