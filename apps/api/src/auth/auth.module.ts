import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BenhNhan } from './entities/benh-nhan.entity.js';
import { MaXacThuc } from './entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from './entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './entities/tai-khoan.entity.js';
import { ViNoiBo } from './entities/vi-noi-bo.entity.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { OriginGuard } from './guards/origin.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordHasher } from './password/password-hasher.service.js';
import { PhienDangNhapRepository } from './repositories/phien-dang-nhap.repository.js';
import { RefreshCookieService } from './session/refresh-cookie.service.js';
import { SessionService } from './session/session.service.js';
import { TokenService } from './session/token.service.js';

const AUTH_ENTITIES = [TaiKhoan, BenhNhan, ViNoiBo, MaXacThuc, PhienDangNhap];

// Khung module auth: xuất 5 entity (task P3), PasswordHasher (A1) và các dịch vụ token/phiên/cookie (A3) để module khác
// (admin…) import, không sao chép. Controller của từng use case được thêm ở các task A* sau.
//
// Task A4: hai guard TOÀN CỤC (APP_GUARD) nằm ở đây để mọi module graph có AuthModule đều tự có chúng:
// mặc định MỌI route cần đăng nhập, mở bằng @Public(), giới hạn vai trò bằng @Roles(). Hai APP_GUARD chạy theo đúng thứ tự
// khai báo dưới đây: JwtAuthGuard (gắn request.user) trước, RolesGuard (đọc request.user) sau; đừng đảo.
@Module({
  imports: [TypeOrmModule.forFeature(AUTH_ENTITIES)],
  providers: [
    PasswordHasher,
    TokenService,
    PhienDangNhapRepository,
    SessionService,
    RefreshCookieService,
    OriginGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [
    TypeOrmModule,
    PasswordHasher,
    TokenService,
    SessionService,
    RefreshCookieService,
    OriginGuard,
  ],
})
export class AuthModule {}
