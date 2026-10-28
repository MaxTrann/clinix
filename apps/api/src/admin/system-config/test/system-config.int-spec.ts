import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../../database/testing/test-database.js';
import { CauHinhHeThong } from '../../entities/cau-hinh-he-thong.entity.js';
import { SystemConfigRepository } from '../system-config.repository.js';
import { SystemConfigService } from '../system-config.service.js';

let db: DataSource;
let service: SystemConfigService;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  service = new SystemConfigService(new SystemConfigRepository(db));
});
beforeEach(async () => {
  await db.getRepository(CauHinhHeThong).clear();
});
afterAll(async () => {
  await db?.destroy();
});

describe('CH-10 — service và repository trên MySQL thật', () => {
  it('thiếu dòng: null/409, cảnh báo khởi động và không tạo cấu hình ngầm', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      expect(await service.get()).toBeNull();
      await expect(service.getOrThrow()).rejects.toMatchObject({
        status: 409,
        maLoi: 'HE_THONG_CHUA_CAU_HINH',
      });
      await service.onApplicationBootstrap();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(await db.getRepository(CauHinhHeThong).count()).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('đọc đủ giá trị thật/JSON/decimal; không cache null hoặc thay đổi đã commit', async () => {
    expect(await service.get()).toBeNull();
    const repo = db.getRepository(CauHinhHeThong);
    const row = {
      id: 1,
      thoiGianGiuCho: 12,
      thoiDiemNhacLich: [48, 12],
      soLichHenToiDaMoiHoSo: 3,
      soLanTuDoiLichToiDa: 0,
      checkInTruocPhut: 30,
      checkInSauPhut: 15,
      thoiHanPhanHoiLoiMoi: 60,
      soMucChoToiDa: 0,
      nguongNoShow: 3,
      soNgayBaoTruocDoiGioLam: 3,
      trongSoW1: '0.60',
      trongSoW2: '0.40',
    };
    await repo.insert(row);
    expect(await service.getOrThrow()).toEqual(row);
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      await service.onApplicationBootstrap();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    await db.transaction((manager) =>
      manager.update(CauHinhHeThong, 1, { soNgayBaoTruocDoiGioLam: 5 }),
    );
    expect((await service.getOrThrow()).soNgayBaoTruocDoiGioLam).toBe(5);
    await repo.delete(1);
    expect(await service.get()).toBeNull();
  });
});
