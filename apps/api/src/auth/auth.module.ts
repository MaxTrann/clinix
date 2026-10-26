import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BenhNhan } from './entities/benh-nhan.entity.js';
import { MaXacThuc } from './entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from './entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './entities/tai-khoan.entity.js';
import { ViNoiBo } from './entities/vi-noi-bo.entity.js';
import { PasswordHasher } from './password-hasher.service.js';

const AUTH_ENTITIES = [TaiKhoan, BenhNhan, ViNoiBo, MaXacThuc, PhienDangNhap];

// Khung module auth: xuất 5 entity (task P3) và PasswordHasher (task A1) để module khác (admin…) import,
// không sao chép. Controller, service và repository của từng use case được thêm ở các task A* sau.
@Module({
  imports: [TypeOrmModule.forFeature(AUTH_ENTITIES)],
  providers: [PasswordHasher],
  exports: [TypeOrmModule, PasswordHasher],
})
export class AuthModule {}
