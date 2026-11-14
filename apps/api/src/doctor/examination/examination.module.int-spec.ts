import { Test } from '@nestjs/testing';
import { AppModule } from '../../app.module.js';
import { DoctorModule } from '../doctor.module.js';
import { walkModuleTree } from '../testing/architecture-scan.js';
import { ExaminationModule } from './examination.module.js';

// doctor-exam P3 (#393) — "ExaminationModule nạp được trong AppModule" (issue #393 "Đóng khi"). Nằm ở *.int-spec.ts vì AppModule nối MySQL thật (DB test), như doctor/architecture.int-spec.ts (HD-10).
// Không có mã test case riêng trong PLAN; phần đơn vị (cây import của riêng module) ở examination.architecture.spec.ts.
describe('ExaminationModule trong AppModule', () => {
  it('cây import của AppModule có ExaminationModule đúng một lần (qua DoctorModule) và không có chu trình', async () => {
    const tree = await walkModuleTree(AppModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.has(DoctorModule)).toBe(true);
    expect(tree.references.get(ExaminationModule)).toBe(1);
  });

  it('AppModule biên dịch được với ExaminationModule (mọi phụ thuộc tiêm được) và lấy được thể hiện của nó', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    try {
      expect(
        moduleRef.get(ExaminationModule, { strict: false }),
      ).toBeInstanceOf(ExaminationModule);
    } finally {
      await moduleRef.close();
    }
  });
});
