import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { CauHinhHeThong } from '../entities/cau-hinh-he-thong.entity.js';
import { SystemConfigRepository } from './system-config.repository.js';

@Injectable()
export class SystemConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(
    @Inject(SystemConfigRepository)
    private readonly configs: SystemConfigRepository,
  ) {}

  get(): Promise<CauHinhHeThong | null> {
    // Không cache: lần xử lý sau phải đọc cấu hình đã commit mới nhất.
    return this.configs.get();
  }

  async getOrThrow(): Promise<CauHinhHeThong> {
    const config = await this.get();
    if (config === null) {
      throw new AppException(409, 'HE_THONG_CHUA_CAU_HINH', {
        thongBao: 'Hệ thống chưa được cấu hình.',
      });
    }
    return config;
  }

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.configs.count()) === 0) {
      this.logger.warn(
        'Hệ thống chưa được cấu hình. Các chức năng cần cấu hình sẽ từ chối xử lý cho đến khi được thiết lập.',
      );
    }
  }
}
