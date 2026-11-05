import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { PhamViQuanTri } from '../../admin/entities/enums.js';
import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';

/**
 * Hàng kết quả của câu đọc hồ sơ: ĐÚNG các cột này (danh sách trắng, TRACKING B1-D). Không có `mat_khau_bam`, `so_lan_dang_nhap_sai`,
 * `khoa_dang_nhap_den`, `tai_khoan_id`, `anh_dai_dien`: dữ liệu nhạy cảm không đi qua tầng dịch vụ một cách vô ích.
 */
export interface ProfileRow {
  loaiTaiKhoan: LoaiTaiKhoan;
  trangThai: TrangThaiTaiKhoan;
  hoTen: string;
  email: string;
  soDienThoai: string;
  gioiTinh: string | null;
  ngaySinh: string | null;
  diaChi: string | null;
  /** Chỉ có nghĩa với Quản trị viên (`NOT NULL` ở bảng `quan_tri_vien`): `null` ở Quản trị viên nghĩa là thiếu hàng vai trò */
  phamViQuanTri: PhamViQuanTri | null;
  /** Chi nhánh của ĐÚNG bảng vai trò ứng với `loai_tai_khoan`; `null` với Bệnh nhân và Quản trị viên Toàn hệ thống */
  chiNhanhId: string | null;
  chiNhanhTen: string | null;
}

// MỘT câu SELECT thường (không khoá): mọi cột lấy từ cùng một ảnh chụp nên nhất quán với nhau.
//  - LEFT JOIN vì Bệnh nhân không có hàng nào ở ba bảng vai trò.
//  - Chi nhánh chọn bằng CASE theo `loai_tai_khoan` (không COALESCE ba cột) để một hàng thừa ở bảng vai trò khác không lấn sang.
//  - `ngay_sinh` PHẢI qua DATE_FORMAT: câu SQL thô trả cột DATE thành `Date` lệch múi giờ (ngày 1990-05-15 ra 1990-05-14T17:00:00.000Z
//    ở +07:00). `bigint` (chi_nhanh_id) ra chuỗi. Đã thử thật trên MySQL (TRACKING B1-D).
export const PROFILE_SQL = `SELECT t.loai_tai_khoan AS loaiTaiKhoan, t.trang_thai AS trangThai, t.ho_ten AS hoTen,
  t.email AS email, t.so_dien_thoai AS soDienThoai, t.gioi_tinh AS gioiTinh,
  DATE_FORMAT(t.ngay_sinh, '%Y-%m-%d') AS ngaySinh, t.dia_chi AS diaChi,
  qtv.pham_vi_quan_tri AS phamViQuanTri, cn.chi_nhanh_id AS chiNhanhId, cn.ten AS chiNhanhTen
FROM tai_khoan t
LEFT JOIN bac_si bs ON bs.tai_khoan_id = t.tai_khoan_id
LEFT JOIN le_tan lt ON lt.tai_khoan_id = t.tai_khoan_id
LEFT JOIN quan_tri_vien qtv ON qtv.tai_khoan_id = t.tai_khoan_id
LEFT JOIN chi_nhanh cn ON cn.chi_nhanh_id = CASE t.loai_tai_khoan
  WHEN 'BacSi' THEN bs.chi_nhanh_id
  WHEN 'LeTan' THEN lt.chi_nhanh_id
  WHEN 'QuanTriVien' THEN qtv.chi_nhanh_id
END
WHERE t.tai_khoan_id = ?`;

@Injectable()
export class ProfileRepository {
  /** Đọc hồ sơ của một tài khoản; `null` nếu không có hàng. Nhận `em` để B2 đọc lại trong giao dịch của nó. */
  async findProfile(
    em: EntityManager,
    accountId: string,
  ): Promise<ProfileRow | null> {
    const rows = await em.query<ProfileRow[]>(PROFILE_SQL, [accountId]);
    return rows[0] ?? null;
  }
}
