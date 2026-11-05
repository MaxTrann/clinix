import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { PhamViQuanTri } from '../../admin/entities/enums.js';
import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';

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

/**
 * Năm cột hồ sơ mà `PUT /profile` được ghi (task B2). Bắt buộc ĐỦ 5 khoá, dùng `null` chứ không `undefined`: TypeORM bỏ qua khoá `undefined`
 * trong `.set()`, nên một khoá thiếu sẽ lặng lẽ không được ghi (TRACKING B2-D). Không có `email`, `anhDaiDien`, mật khẩu, trạng thái.
 */
export type ProfileChanges = Pick<
  TaiKhoan,
  'hoTen' | 'soDienThoai' | 'gioiTinh' | 'ngaySinh' | 'diaChi'
>;

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

  /**
   * Ghi đúng 5 cột hồ sơ của MỘT tài khoản đang hoạt động (task B2; TRACKING B2-C, B2-D). Trả số hàng KHỚP điều kiện.
   *  - Điều kiện `trang_thai = 'DangHoatDong'` nằm trong CHÍNH câu UPDATE: dù guard đã kiểm, tài khoản có thể bị khoá ngay sau đó (H9) ⇒ 0 hàng.
   *  - PHỤ THUỘC cờ kết nối `FOUND_ROWS` mà `mysql2` bật mặc định: `affected` là số hàng KHỚP chứ không phải số hàng ĐỔI, nên PUT giống hệt dữ liệu
   *    cũ vẫn báo 1 hàng (đã thử thật). Nếu ai đó tắt cờ này, PUT giống hệt sẽ báo 0 ⇒ 401 oan: ca PUI-06 và PUI-13 canh điều đó.
   *  - `null` ghi thành NULL; `ngaySinh` là chuỗi `YYYY-MM-DD` đi thẳng vào cột DATE (không qua `Date`, không lệch múi giờ).
   * Gọi trong giao dịch của service để đọc lại cùng giao dịch (khoá hàng giữ tới commit).
   */
  async updateProfile(
    em: EntityManager,
    accountId: string,
    changes: ProfileChanges,
  ): Promise<number> {
    const result = await em
      .createQueryBuilder()
      .update(TaiKhoan)
      .set({
        hoTen: changes.hoTen,
        soDienThoai: changes.soDienThoai,
        gioiTinh: changes.gioiTinh,
        ngaySinh: changes.ngaySinh,
        diaChi: changes.diaChi,
      })
      .where('taiKhoanId = :accountId', { accountId })
      .andWhere('trangThai = :active', { active: 'DangHoatDong' })
      .execute();
    return result.affected ?? 0;
  }
}
