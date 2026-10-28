import 'reflect-metadata';
import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SystemConfigModule } from '../system-config.module.js';
import { SystemConfigService } from '../system-config.service.js';
import { CauHinhHeThong } from '../../entities/cau-hinh-he-thong.entity.js';

@Injectable()
class Consumer {
  constructor(
    @Inject(SystemConfigService) readonly config: SystemConfigService,
  ) {}
}

@Module({ imports: [SystemConfigModule], providers: [Consumer] })
class ConsumerModule {}

describe('CH-10 — export module và vòng đời khởi động thật của Nest', () => {
  it('inject qua consumer, query singleton, cảnh báo khi app init và không tự tạo dòng', async () => {
    const rows = {
      findOneBy: vi.fn().mockResolvedValue(null),
      countBy: vi.fn().mockResolvedValue(0),
    };
    const getRepository = vi.fn().mockReturnValue(rows);
    // Thay kết nối DB bằng fake; giữ nguyên module/service/repository thật.
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const root = await Test.createTestingModule({ imports: [ConsumerModule] })
      .useMocker((token) =>
        token === DataSource ? { getRepository } : undefined,
      )
      .compile();
    const app = root.createNestApplication();
    try {
      await app.init();
      expect(warn).toHaveBeenCalledTimes(1);
      const config = root.get(Consumer).config;
      expect(config).toBeInstanceOf(SystemConfigService);
      expect(await config.get()).toBeNull();
      expect(getRepository).toHaveBeenCalledWith(CauHinhHeThong);
      expect(rows.countBy).toHaveBeenCalledExactlyOnceWith({ id: 1 });
      expect(rows.findOneBy).toHaveBeenCalledExactlyOnceWith({ id: 1 });
    } finally {
      await app.close();
      warn.mockRestore();
    }
  });
});
