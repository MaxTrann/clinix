import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { walkModuleTree } from '../../doctor/testing/architecture-scan.js';
import { SchedulingModule } from '../../scheduling/scheduling.module.js';
import { PublicDoctorQueryDto } from '../doctors/public-doctor.dto.js';
import { SLOT_MAX_DOCTORS } from '../search.constants.js';
import { SearchModule } from '../search.module.js';
import { auditPublicControllers } from '../testing/public-route-audit.js';
import { PublicSlotController } from './public-slot.controller.js';
import { PublicSlotRepository } from './public-slot.repository.js';
import { PublicSlotService } from './public-slot.service.js';

// Search Slots PR-C1 — KGC-15, KGC-16: nối module và trần bác sĩ (không cần DB).
const metadata = <T>(key: string): T[] =>
  (Reflect.getMetadata(key, SearchModule) as T[] | undefined) ?? [];
const names = (modules: Iterable<{ name: string }>) =>
  [...modules].map((module) => module.name);

describe('KGC-15 SearchModule nối đúng', () => {
  it('import SchedulingModule (nơi xuất AvailableSlotsReader); có controller và hai provider mới', () => {
    expect(metadata('imports')).toContain(SchedulingModule);
    expect(metadata('controllers')).toContain(PublicSlotController);
    expect(metadata('providers')).toEqual(
      expect.arrayContaining([PublicSlotService, PublicSlotRepository]),
    );
  });

  it('cây import không chu trình và không chứa AppointmentsModule hay DoctorModule (chiều phụ thuộc một hướng)', async () => {
    const tree = await walkModuleTree(SearchModule);
    expect(tree.cycle).toBeNull();
    expect(tree.references.has(SchedulingModule)).toBe(true);
    const all = names(tree.references.keys());
    expect(all).not.toContain('AppointmentsModule');
    expect(all).not.toContain('DoctorModule');
  });

  it('route nằm ở đường dẫn RIÊNG `public/doctor-slots` (không dưới `public/doctors/` nên `:id` không bắt nhầm) và đạt kiểm route công khai', () => {
    expect(Reflect.getMetadata('path', PublicSlotController)).toBe(
      'public/doctor-slots',
    );
    expect(auditPublicControllers([PublicSlotController])).toEqual([]);
  });
});

describe('KGC-16 SLOT_MAX_DOCTORS bằng pageSize lớn nhất của danh sách công khai', () => {
  const errorsFor = (pageSize: number) =>
    validateSync(
      plainToInstance(PublicDoctorQueryDto, { pageSize: String(pageSize) }),
    );

  it('đúng bằng: pageSize = trần đạt, trần + 1 hỏng (đổi một trong hai số thì ca này đỏ)', () => {
    expect(errorsFor(SLOT_MAX_DOCTORS)).toHaveLength(0);
    expect(errorsFor(SLOT_MAX_DOCTORS + 1)).not.toHaveLength(0);
  });
});
