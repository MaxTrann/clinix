import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';

// Truy vấn bảng `tai_khoan` cho đăng ký (task A5); A8, A11–A13 thêm hàm vào đây khi cần. Chỉ chứa câu lệnh; quy tắc nghiệp vụ
// (đăng ký mở, hết 24 giờ) nằm ở register/unverified-account-rules.ts. Mọi hàm nhận `em` để chạy trong GIAO DỊCH của người gọi.
//
// Quy ước khoá: hàng `tai_khoan` LUÔN được khoá TRƯỚC các hàng con (ma_xac_thuc, phien_dang_nhap), cùng thứ tự với A2 và A3.
// So sánh email dùng `=` của DB (utf8mb4_unicode_ci: không phân biệt hoa/thường) nên cùng là một tài khoản dù khác hoa/thường (DK-17).

// Chỉ các cột mà quy tắc đăng ký cần: băm mật khẩu và dữ liệu cá nhân khác không bị kéo qua tầng dịch vụ một cách vô ích
const FACT_COLUMNS = [
  't.taiKhoanId',
  't.email',
  't.loaiTaiKhoan',
  't.daXacMinhEmail',
  't.trangThai',
  't.thoiDiemTao',
];

export interface NewPatientRow {
  hoTen: string;
  email: string;
  soDienThoai: string;
  matKhauBam: string;
  /** Ghi tường minh từ đồng hồ ứng dụng (đã cắt giây), không dùng DEFAULT CURRENT_TIMESTAMP của DB */
  createdAt: Date;
}

@Injectable()
export class TaiKhoanRepository {
  /** Đọc THƯỜNG (không khoá, không khoá khoảng): chỉ để chọn đường đi; quyết định thật đọc lại dưới khoá. */
  findByEmail(em: EntityManager, email: string): Promise<TaiKhoan | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(FACT_COLUMNS)
      .where('t.email = :email', { email })
      .getOne();
  }

  /** Khoá hàng theo email (SELECT … FOR UPDATE). Chỉ gọi khi hàng ĐÃ có: khoá email chưa có là khoá khoảng chỉ mục, dễ deadlock (RG-S1, RG-S5). */
  findByEmailForUpdate(
    em: EntityManager,
    email: string,
  ): Promise<TaiKhoan | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(FACT_COLUMNS)
      .setLock('pessimistic_write')
      .where('t.email = :email', { email })
      .getOne();
  }

  findByIdForUpdate(em: EntityManager, id: string): Promise<TaiKhoan | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(FACT_COLUMNS)
      .setLock('pessimistic_write')
      .where('t.taiKhoanId = :id', { id })
      .getOne();
  }

  /**
   * Chèn tài khoản Bệnh nhân vừa đăng ký: DangHoatDong, CHƯA xác minh email. Trùng email thì MySQL ném 1062 (đúng chỗ cần: đó là cách
   * duy nhất không có khe hở để biết "người khác vừa tạo", xem RG-S2/S4). Trả mã tài khoản.
   */
  async insertPatient(em: EntityManager, row: NewPatientRow): Promise<string> {
    const result = await em.insert(TaiKhoan, {
      hoTen: row.hoTen,
      email: row.email,
      soDienThoai: row.soDienThoai,
      matKhauBam: row.matKhauBam,
      trangThai: 'DangHoatDong',
      daXacMinhEmail: false,
      soLanDangNhapSai: 0,
      loaiTaiKhoan: 'BenhNhan',
      thoiDiemTao: row.createdAt,
    });
    return String(result.identifiers[0]?.taiKhoanId);
  }

  /**
   * Xoá MỘT tài khoản Bệnh nhân chưa xác minh đang hoạt động (đã xoá hàng con trước, H2). Điều kiện bảo vệ nằm trong CHÍNH câu DELETE
   * để dù tầng trên kiểm sai thì nhân sự, tài khoản đã xác minh và tài khoản bị ngưng vẫn không thể bị xoá (H1). Trả true nếu xoá được.
   */
  async deleteUnverifiedPatient(
    em: EntityManager,
    id: string,
  ): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .delete()
      .from(TaiKhoan)
      .where(
        "tai_khoan_id = :id AND loai_tai_khoan = 'BenhNhan' AND da_xac_minh_email = 0 AND trang_thai = 'DangHoatDong'",
        { id },
      )
      .execute();
    return (result.affected ?? 0) === 1;
  }
}
