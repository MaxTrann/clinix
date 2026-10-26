import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BenhNhan } from './entities/benh-nhan.entity.js';
import { MaXacThuc } from './entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from './entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './entities/tai-khoan.entity.js';
import { ViNoiBo } from './entities/vi-noi-bo.entity.js';

const AUTH_ENTITIES = [TaiKhoan, BenhNhan, ViNoiBo, MaXacThuc, PhienDangNhap];

// Khung module auth (task P3): mới chỉ đăng ký và xuất 5 entity để module khác (admin…) import,
// không sao chép. Controller, service và repository của từng use case được thêm ở các task A*.
@Module({
  imports: [TypeOrmModule.forFeature(AUTH_ENTITIES)],
  exports: [TypeOrmModule],
})
export class AuthModule {}
