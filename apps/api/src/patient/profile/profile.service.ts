import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PhamViQuanTri } from '../../admin/entities/enums.js';
import { AUTH_ERROR_CODES } from '../../auth/auth.constants.js';
import type { ProfileBranch, ProfileResponse } from './profile.dto.js';
import {
  ProfileRepository,
  type ProfileChanges,
  type ProfileRow,
} from './profile.repository.js';

interface RoleDetails {
  chiNhanh: ProfileBranch | null;
  phamViQuanTri: PhamViQuanTri | null;
}

/**
 * Dữ liệu lệch: tài khoản Bác sĩ/Lễ tân/Quản trị viên không có hàng ở bảng vai trò (DB không ép `loai_tai_khoan` khớp bảng con, quy tắc 7 do service giữ).
 * Lỗi nội bộ có chủ ý, KHÔNG che bằng `chiNhanh: null`: bộ lọc lỗi trả 500 LOI_HE_THONG + requestId. Thông điệp chỉ có mã tài khoản và loại, không dữ liệu cá nhân.
 */
function inconsistentData(accountId: string, row: ProfileRow): Error {
  return new Error(
    `Dữ liệu lệch: tài khoản ${accountId} loại ${row.loaiTaiKhoan} thiếu hàng ở bảng vai trò hoặc chi nhánh`,
  );
}

function branchOf(accountId: string, row: ProfileRow): ProfileBranch {
  if (row.chiNhanhId === null || row.chiNhanhTen === null) {
    throw inconsistentData(accountId, row);
  }
  return { chiNhanhId: row.chiNhanhId, ten: row.chiNhanhTen };
}

// Phần chỉ đọc theo vai trò của hàng DB. Cột của vai trò khác (hàng thừa) bị bỏ qua.
function roleDetailsOf(accountId: string, row: ProfileRow): RoleDetails {
  switch (row.loaiTaiKhoan) {
    case 'BenhNhan':
      return { chiNhanh: null, phamViQuanTri: null };
    case 'BacSi':
    case 'LeTan':
      return { chiNhanh: branchOf(accountId, row), phamViQuanTri: null };
    case 'QuanTriVien': {
      if (row.phamViQuanTri === null) throw inconsistentData(accountId, row);
      return {
        chiNhanh:
          row.phamViQuanTri === 'ChiNhanh' ? branchOf(accountId, row) : null,
        phamViQuanTri: row.phamViQuanTri,
      };
    }
  }
}

/**
 * Dựng hồ sơ trả về từ hàng vừa đọc; dùng chung cho GET (B1) và PUT (B2, hồ sơ đọc lại sau khi ghi). Guard vừa kiểm tài khoản nhưng hàng có thể
 * mất hoặc bị khoá ngay sau đó (H9): không có hàng hoặc không `DangHoatDong` ⇒ 401 như MeService. Thứ tự: trạng thái trước, lệch dữ liệu sau.
 */
function buildProfile(
  accountId: string,
  row: ProfileRow | null,
): ProfileResponse {
  if (row?.trangThai !== 'DangHoatDong') {
    throw new UnauthorizedException(AUTH_ERROR_CODES.SESSION_INACTIVE);
  }
  const { chiNhanh, phamViQuanTri } = roleDetailsOf(accountId, row);
  // Chọn từng khoá một (không trải nguyên hàng) để cột thừa không bao giờ lọt ra ngoài
  return {
    hoTen: row.hoTen,
    email: row.email,
    soDienThoai: row.soDienThoai,
    gioiTinh: row.gioiTinh,
    ngaySinh: row.ngaySinh,
    diaChi: row.diaChi,
    anhDaiDien: null,
    vaiTro: row.loaiTaiKhoan,
    chiNhanh,
    phamViQuanTri,
  };
}

/**
 * GET /profile (task B1; PLAN patient 5.2, 5.7; TRACKING B1-A…). Chỉ ĐỌC: một câu SELECT thường, không giao dịch, không khoá (như MeService).
 * Một API cho cả bốn vai trò: dữ liệu hồ sơ nằm ở `tai_khoan`; chỉ phần chỉ đọc (chi nhánh, phạm vi) rẽ nhánh theo `loai_tai_khoan` của HÀNG vừa đọc
 * (không theo token, để chỉ có một nguồn cho một hàng). Guard vừa kiểm tài khoản nhưng hàng có thể mất hoặc bị khoá ngay sau đó (H9): 401 như MeService.
 */
@Injectable()
export class ProfileService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(ProfileRepository) private readonly profiles: ProfileRepository,
  ) {}

  async getProfile(accountId: string): Promise<ProfileResponse> {
    const row = await this.profiles.findProfile(
      this.dataSource.manager,
      accountId,
    );
    return buildProfile(accountId, row);
  }

  /**
   * PUT /profile (task B2; PLAN patient 5.2; TRACKING B2-C). Ghi 5 cột hồ sơ rồi ĐỌC LẠI trong CÙNG MỘT giao dịch:
   *  - UPDATE giữ khoá hàng tới commit nên không PUT khác chen vào giữa: phản hồi là đúng bộ vừa ghi (hai PUT đồng thời: bên sau chờ khoá rồi ghi,
   *    lần sau thắng trọn vẹn, mỗi bên nhận bộ của mình — Q24);
   *  - đọc lại ném lỗi (lệch dữ liệu: thiếu hàng vai trò, lỗi DB) ⇒ rollback, không "đã ghi nhưng báo 500".
   * 0 hàng khớp ⇒ hàng mất hoặc không còn DangHoatDong ⇒ 401 (H9). Không đọc thêm để "phân biệt": PUT giống hệt vẫn khớp 1 hàng nhờ FOUND_ROWS
   * (xem ProfileRepository.updateProfile). Chỉ ghi 5 cột của `tai_khoan`; không đụng benh_nhan/bac_si/le_tan/quan_tri_vien (H14). Không log.
   */
  async updateProfile(
    accountId: string,
    changes: ProfileChanges,
  ): Promise<ProfileResponse> {
    return this.dataSource.transaction(async (em) => {
      const matched = await this.profiles.updateProfile(em, accountId, changes);
      if (matched === 0) {
        throw new UnauthorizedException(AUTH_ERROR_CODES.SESSION_INACTIVE);
      }
      const row = await this.profiles.findProfile(em, accountId);
      return buildProfile(accountId, row);
    });
  }
}
