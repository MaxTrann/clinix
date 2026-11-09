import { ScheduleModule } from '@nestjs/schedule';
import { AppModule } from '../app.module.js';
import { DoctorModule } from '../doctor/doctor.module.js';
import { walkModuleTree } from '../doctor/testing/architecture-scan.js';
import { AppointmentsModule } from './appointments.module.js';

// Task P1 — AR-03, phần cây import của AppModule (PLAN booking 7.11; TRACKING 3.3 P1-I mục 6). Phần không cần AppModule (hướng phụ thuộc H20, không `forRoot(` trong
// appointments/) nằm ở architecture.spec.ts. Nằm ở *.int-spec.ts vì import AppModule cần biến môi trường test (như HD-10 của doctor); không dùng DB.
// Trùng một phần HD-01, HD-10 của doctor là CÓ CHỦ ĐÍCH: doctor đổi hay xoá test của họ thì booking vẫn tự canh. E2E-J02 của auth (`test/auth-cleanup-job.e2e-spec.ts`) vẫn phải xanh.
// Mỗi lời gọi `ScheduleModule.forRoot()` là MỘT tham chiếu trong cây (walkModuleTree đếm cả dynamic module), nên đếm tham chiếu đã bắt được lời gọi thứ hai ở bất kỳ file nào.
describe('AR-03 cây import của AppModule', () => {
  it('ScheduleModule đúng một lần, AppointmentsModule đúng một lần, có DoctorModule, không chu trình', async () => {
    const tree = await walkModuleTree(AppModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.get(ScheduleModule)).toBe(1);
    expect(tree.references.get(AppointmentsModule)).toBe(1);
    expect(tree.references.has(DoctorModule)).toBe(true);
  });
});
