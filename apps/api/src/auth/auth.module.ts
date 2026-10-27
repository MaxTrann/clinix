import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BenhNhan } from './entities/benh-nhan.entity.js';
import { MaXacThuc } from './entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from './entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './entities/tai-khoan.entity.js';
import { ViNoiBo } from './entities/vi-noi-bo.entity.js';
import { OriginGuard } from './guards/origin.guard.js';
import { PasswordHasher } from './password/password-hasher.service.js';
import { PhienDangNhapRepository } from './repositories/phien-dang-nhap.repository.js';
import { RefreshCookieService } from './session/refresh-cookie.service.js';
import { SessionService } from './session/session.service.js';
import { TokenService } from './session/token.service.js';

const AUTH_ENTITIES = [TaiKhoan, BenhNhan, ViNoiBo, MaXacThuc, PhienDangNhap];

// Khung module auth: xuất 5 entity (task P3), PasswordHasher (A1) và các dịch vụ token/phiên/cookie (A3) để module khác
// (admin…) import, không sao chép. Controller và guard đăng nhập của từng use case được thêm ở các task A* sau.
@Module({
  imports: [TypeOrmModule.forFeature(AUTH_ENTITIES)],
  providers: [
    PasswordHasher,
    TokenService,
    PhienDangNhapRepository,
    SessionService,
    RefreshCookieService,
    OriginGuard,
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
