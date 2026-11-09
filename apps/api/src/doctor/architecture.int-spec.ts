import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../app.module.js';
import { DoctorModule } from './doctor.module.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
  walkModuleTree,
} from './testing/architecture-scan.js';

// Doctor P5 — HD-10: toàn ứng dụng có ĐÚNG MỘT ScheduleModule (H9). Gọi ScheduleModule.forRoot() thêm lần nữa làm mọi job @Cron chạy gấp đôi
// (TECH_DEBT dòng 33). Nằm ở *.int-spec.ts vì import AppModule cần biến môi trường test; không dùng DB.
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

describe('HD-10 một ScheduleModule', () => {
  it('cây import của AppModule tham chiếu ScheduleModule đúng một lần, có DoctorModule, không có chu trình', async () => {
    const tree = await walkModuleTree(AppModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.get(ScheduleModule)).toBe(1);
    expect(tree.references.has(DoctorModule)).toBe(true);
  });

  it('trong mã nguồn chỉ có đúng một lời gọi ScheduleModule.forRoot(), nằm ở app.module.ts', () => {
    const callers = listSourceFiles(SRC_DIR).filter((file) =>
      /ScheduleModule\s*\.\s*forRoot\s*\(/.test(
        stripComments(readSource(file)),
      ),
    );
    expect(callers).toEqual([join(SRC_DIR, 'app.module.ts')]);
  });
});
