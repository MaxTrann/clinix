import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { noStore } from '../notification/center/notification-center.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ArticleAdminController } from './admin/article-admin.controller.js';
import { ArticleAdminRepository } from './admin/article-admin.repository.js';
import { ArticleAdminService } from './admin/article-admin.service.js';
import { HashtagAdminController } from './admin/hashtag-admin.controller.js';
import { HashtagAdminService } from './admin/hashtag-admin.service.js';
import { HashtagRepository } from './admin/hashtag.repository.js';

// Module "Bài viết và cẩm nang sức khỏe" (scope article; PLAN docs/features/article/PLAN.md). article B1: nền bài viết và API quản trị (danh sách, chi tiết, tạo, `PATCH`) và gợi ý thẻ.
// article B2 thêm route công khai (`public/articles…`), B3 thêm API đánh giá (`patient/articles/:id/rating`), B4 thêm ảnh: cùng module này, mỗi phần một thư mục riêng.
// `RbacModule` cho `AdminScopeGuard` và `BranchAccessPolicy` (phạm vi Quản trị viên đọc từ DB mỗi yêu cầu). `DataSource` có sẵn toàn cục từ `DatabaseModule`.
@Module({
  imports: [RbacModule],
  controllers: [ArticleAdminController, HashtagAdminController],
  providers: [
    ArticleAdminService,
    ArticleAdminRepository,
    HashtagAdminService,
    HashtagRepository,
  ],
})
export class ArticleModule implements NestModule {
  // Route quản trị là dữ liệu biên tập chưa công bố: `Cache-Control: no-store` cho MỌI phản hồi, kể cả 401, 403, 404 (middleware chạy trước guard; T10).
  // Dùng lại đúng hàm của Trung tâm thông báo (như `ChatModule`), không viết lại.
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(noStore)
      .forRoutes(ArticleAdminController, HashtagAdminController);
  }
}
