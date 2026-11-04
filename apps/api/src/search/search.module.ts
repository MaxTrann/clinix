import { Module } from '@nestjs/common';

// Module tra cứu công khai (chỉ đọc). Các task B1–B9 thêm controller/provider vào đây.
// Không import module admin: chúng không export gì; DataSource có sẵn toàn cục từ DatabaseModule.
@Module({})
export class SearchModule {}
