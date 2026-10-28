import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ImageProvider } from './image-provider.js';
import { UploadRepository } from './upload.repository.js';

@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);
  private running = false;
  constructor(
    @Inject(UploadRepository) private readonly images: UploadRepository,
    @Inject(ImageProvider) private readonly provider: ImageProvider,
  ) {}

  @Cron('0 0 * * * *', { name: 'specialty-image-cleanup' })
  async run(): Promise<void> {
    if (this.running || !this.provider.configured) return;
    this.running = true;
    try {
      const items = await this.images.claimCleanup(new Date());
      // Mỗi ảnh nhận lease 5 phút: kiểm lại trước network; ảnh cuối quá hạn chờ lượt sau.
      for (const item of items) {
        if (!(await this.images.cleanupOwned(item, new Date()))) continue;
        try {
          await this.provider.delete(item.publicId);
          await this.images.cleanupDone(item);
        } catch {
          await this.images.cleanupFailed(item, new Date());
          this.logger.warn(
            'P7: xóa ảnh thất bại, đã lưu lần thử; không ghi lỗi provider.',
          );
        }
      }
    } catch {
      this.logger.error(
        'P7: tác vụ dọn ảnh thất bại; cần kiểm tra DB/cấu hình.',
      );
    } finally {
      this.running = false;
    }
  }
}
