import { ScheduleModule } from '@nestjs/schedule';
import 'reflect-metadata';
import { AppModule } from '../app.module.js';
import { DoctorModule } from '../doctor/doctor.module.js';
import { walkModuleTree } from '../doctor/testing/architecture-scan.js';
import { AppointmentsModule } from './appointments.module.js';

// Task P1 — AR-03, phần cây import của AppModule (PLAN booking 7.11; TRACKING 3.3 P1-I mục 6). Phần không cần AppModule (hướng phụ thuộc H20, không `forRoot(` trong
// appointments/) nằm ở architecture.spec.ts. Nằm ở *.int-spec.ts vì import AppModule cần biến môi trường test (như HD-10 của doctor); không dùng DB.
// Trùng một phần HD-01, HD-10 của doctor là CÓ CHỦ ĐÍCH: doctor đổi hay xoá test của họ thì booking vẫn tự canh. E2E-J02 của auth (`test/auth-cleanup-job.e2e-spec.ts`) vẫn phải xanh.
// Mỗi lời gọi `ScheduleModule.forRoot()` là MỘT tham chiếu trong cây (walkModuleTree đếm cả dynamic module), nên đếm tham chiếu đã bắt được lời gọi thứ hai ở bất kỳ file nào.
// Từ doctor B15, `DoctorModule` cũng import `AppointmentsModule` (duyệt nghỉ phép gọi `cancel` và `findAffectedByLeave`): một module TĨNH được nhiều module import vẫn chỉ có MỘT thể hiện
// trong Nest, nên tổng số tham chiếu trong cây không còn là 1 (và sẽ tăng khi payment, wallet import). Điều cần canh là `AppModule` tự đăng ký nó đúng MỘT lần (không thêm lần hai ở file khác)
// và nó không bao giờ là dynamic module; `ScheduleModule.forRoot()` thì vẫn đúng một tham chiếu trong cả cây.
describe('AR-03 cây import của AppModule', () => {
  it('ScheduleModule đúng một lần, AppModule đăng ký AppointmentsModule đúng một lần, có DoctorModule, không chu trình', async () => {
    const tree = await walkModuleTree(AppModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.get(ScheduleModule)).toBe(1);
    const direct = (
      Reflect.getMetadata('imports', AppModule) as unknown[]
    ).filter((item) => item === AppointmentsModule);
    expect(direct).toHaveLength(1);
    expect(tree.references.has(AppointmentsModule)).toBe(true);
    expect(tree.references.has(DoctorModule)).toBe(true);
  });
});
