import { Module } from '@nestjs/common';
import { PublicClinicInfoRepository } from './site/public-clinic-info.repository.js';
import { PublicClinicInfoService } from './site/public-clinic-info.service.js';
import { PublicSiteController } from './site/public-site.controller.js';

// Module tra cứu công khai (chỉ đọc). Các task B1–B9 thêm controller/provider vào đây.
// Không import module admin: chúng không export gì; DataSource có sẵn toàn cục từ DatabaseModule.
@Module({
  controllers: [PublicSiteController],
  providers: [PublicClinicInfoService, PublicClinicInfoRepository],
})
export class SearchModule {}
