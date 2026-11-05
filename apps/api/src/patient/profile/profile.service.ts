import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PhamViQuanTri } from '../../admin/entities/enums.js';
import { AUTH_ERROR_CODES } from '../../auth/auth.constants.js';
import type { ProfileBranch, ProfileResponse } from './profile.dto.js';
import { ProfileRepository, type ProfileRow } from './profile.repository.js';

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
}
