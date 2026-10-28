import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ImageProvider } from './image-provider.js';
import { ImageProcessor } from './image-processor.js';
import { UploadRepository } from './upload.repository.js';
import { SPECIALTY_IMAGE_POLICY as P } from './upload-policy.js';

@Injectable()
export class UploadService {
  constructor(
    @Inject(UploadRepository) private readonly images: UploadRepository,
    @Inject(ImageProcessor) private readonly processor: ImageProcessor,
    @Inject(ImageProvider) private readonly provider: ImageProvider,
  ) {}

  async assertSystemAdmin(accountId: string): Promise<void> {
    if (!(await this.images.isSystemAdmin(accountId)))
      throw new ForbiddenException('KHONG_DU_QUYEN');
  }

  async upload(
    accountId: string,
    data: Buffer,
    filename: string,
  ): Promise<{ uploadId: string; url: string; expiresAt: string }> {
    await this.assertSystemAdmin(accountId);
    if (!this.provider.configured) throw new ServiceUnavailableException();
    const processed = await this.processor.process(data, filename);
    const uploadId = randomUUID();
    const publicId = `${this.provider.prefix}/${uploadId}`;
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const expires = new Date(now.getTime() + P.pendingMs);
    await this.images.createPending(
      uploadId,
      publicId,
      accountId,
      now,
      expires,
    );
    let url: string;
    try {
      url = await this.provider.upload(processed, publicId);
    } catch (error) {
      await this.images.markUnknown(uploadId);
      throw error;
    }
    await this.images.confirm(
      uploadId,
      url,
      new Date(Math.floor(Date.now() / 1000) * 1000),
    );
    return { uploadId, url, expiresAt: expires.toISOString() };
  }
}
