import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module.js';
import { ActivationLinkRepository } from './activation-link.repository.js';
import { ActivationLinkService } from './activation-link.service.js';

// Liên kết kích hoạt nhân sự (task B14). Chưa có controller: B15 (tạo tài khoản), B16 (kích hoạt công khai) và B20 (gửi lại) import module này
// và `@Inject(ActivationLinkService)`. Cố ý CHƯA đăng ký vào AppModule: chưa có ai dùng, B15 import nó thì Nest tự khởi tạo.
// DataSource và ConfigService là toàn cục (TypeOrmModule.forRoot, ConfigModule.forRoot) nên không cần import ở đây.
@Module({
  imports: [MailModule],
  providers: [ActivationLinkRepository, ActivationLinkService],
  exports: [ActivationLinkService],
})
export class StaffActivationModule {}
