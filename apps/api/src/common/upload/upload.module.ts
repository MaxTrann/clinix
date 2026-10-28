import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CloudinaryImageProvider } from './cloudinary-image.provider.js';
import { ImageProvider } from './image-provider.js';
import { ImageProcessor } from './image-processor.js';
import { readUploadConfig } from './upload-config.js';
import { UploadCleanupService } from './upload-cleanup.service.js';
import {
  UploadCapacityInterceptor,
  UploadController,
  UploadDeadlineInterceptor,
  SpecialtyUploadGuard,
} from './upload.controller.js';
import { UploadRepository } from './upload.repository.js';
import { UploadService } from './upload.service.js';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [UploadController],
  providers: [
    ImageProcessor,
    UploadRepository,
    UploadService,
    UploadCleanupService,
    SpecialtyUploadGuard,
    UploadCapacityInterceptor,
    UploadDeadlineInterceptor,
    {
      provide: ImageProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new CloudinaryImageProvider(
          readUploadConfig({
            NODE_ENV: config.get<string>('NODE_ENV'),
            CLOUDINARY_CLOUD_NAME: config.get<string>('CLOUDINARY_CLOUD_NAME'),
            CLOUDINARY_API_KEY: config.get<string>('CLOUDINARY_API_KEY'),
            CLOUDINARY_API_SECRET: config.get<string>('CLOUDINARY_API_SECRET'),
            CLOUDINARY_UPLOAD_PREFIX: config.get<string>(
              'CLOUDINARY_UPLOAD_PREFIX',
            ),
          }),
        ),
    },
  ],
  exports: [UploadService, UploadRepository],
})
export class UploadModule {}
