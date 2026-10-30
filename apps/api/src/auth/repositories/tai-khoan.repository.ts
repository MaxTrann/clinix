import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { RegistrationData } from '../otp/otp.types.js';

// Truy vấn bảng `tai_khoan` cho đăng ký (task A5), xác minh OTP đăng ký (A6), job dọn tài khoản chưa xác minh (A7), đăng nhập (A8) và quên mật khẩu (A11, A12); A13 thêm hàm vào đây khi cần. Chỉ chứa câu lệnh; quy tắc nghiệp vụ
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

// Các cột mà đăng nhập (task A8) cần: thêm băm mật khẩu, bộ đếm sai và khoá tạm vào các cột "sự kiện" ở trên
const LOGIN_COLUMNS = [
  ...FACT_COLUMNS,
  't.matKhauBam',
  't.soLanDangNhapSai',
  't.khoaDangNhapDen',
];

// Các cột mà quên mật khẩu (task A11) cần: thêm họ tên (lời chào trong thư) và băm mật khẩu (chỉ để biết đã có mật khẩu hay chưa, S4) vào các cột "sự kiện"
const PASSWORD_RESET_COLUMNS = [...FACT_COLUMNS, 't.hoTen', 't.matKhauBam'];

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
   * Đăng nhập (task A8), pha ĐỌC: đọc THƯỜNG (không khoá) theo email để chọn đường đi và lấy băm mật khẩu đem đi so. Quyết định thật đọc lại dưới
   * khoá bằng `findForLoginForUpdate`. So sánh email bằng `=` của DB (utf8mb4_unicode_ci: không phân biệt hoa/thường, DN-04).
   */
  findForLogin(em: EntityManager, email: string): Promise<TaiKhoan | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(LOGIN_COLUMNS)
      .where('t.email = :email', { email })
      .getOne();
  }

  /** Đăng nhập (task A8), pha QUYẾT ĐỊNH: khoá MỘT hàng theo khoá chính (SELECT … FOR UPDATE; hàng đã có nên không có khoá khoảng) và đọc lại các cột đăng nhập. */
  findForLoginForUpdate(
    em: EntityManager,
    id: string,
  ): Promise<TaiKhoan | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(LOGIN_COLUMNS)
      .setLock('pessimistic_write')
      .where('t.taiKhoanId = :id', { id })
      .getOne();
  }

  /**
   * Quên mật khẩu (task A11), pha ĐỌC: đọc THƯỜNG (không khoá) theo email để chọn đường đi. Quyết định thật đọc lại dưới khoá bằng
   * `findForPasswordResetForUpdate`. So sánh email bằng `=` của DB (utf8mb4_unicode_ci: không phân biệt hoa/thường).
   */
  findForPasswordReset(
    em: EntityManager,
    email: string,
  ): Promise<TaiKhoan | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(PASSWORD_RESET_COLUMNS)
      .where('t.email = :email', { email })
      .getOne();
  }

  /** Quên mật khẩu (task A11), pha QUYẾT ĐỊNH: khoá MỘT hàng theo khoá chính (hàng đã có nên không có khoá khoảng) và đọc lại các cột cần. */
  findForPasswordResetForUpdate(
    em: EntityManager,
    id: string,
  ): Promise<TaiKhoan | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(PASSWORD_RESET_COLUMNS)
      .setLock('pessimistic_write')
      .where('t.taiKhoanId = :id', { id })
      .getOne();
  }

  /**
   * Ghi MỘT lần đăng nhập sai (bộ đếm mới và khoá tạm mới hoặc NULL). Người gọi đã khoá hàng và đã kiểm trạng thái; điều kiện `DangHoatDong` vẫn nằm
   * trong CHÍNH câu UPDATE (cùng ý với activateRegistration) để dù tầng trên kiểm sai, tài khoản ngưng hoặc chờ kích hoạt không bị đếm. Trả true nếu ghi được.
   */
  async saveLoginFailure(
    em: EntityManager,
    id: string,
    state: { failures: number; lockedUntil: Date | null },
  ): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(TaiKhoan)
      .set({
        soLanDangNhapSai: state.failures,
        khoaDangNhapDen: state.lockedUntil,
      })
      .where("tai_khoan_id = :id AND trang_thai = 'DangHoatDong'", { id })
      .execute();
    return (result.affected ?? 0) === 1;
  }

  /** Đăng nhập đúng: bộ đếm về 0 và bỏ khoá (kể cả khi chưa xác minh, DN-17). Người gọi đã khoá hàng. */
  async resetLoginFailures(em: EntityManager, id: string): Promise<void> {
    await em
      .createQueryBuilder()
      .update(TaiKhoan)
      .set({ soLanDangNhapSai: 0, khoaDangNhapDen: null })
      .where('tai_khoan_id = :id', { id })
      .execute();
  }

  /**
   * Quên mật khẩu (task A12): ghi mật khẩu mới, bộ đếm sai về 0 và bỏ khoá tạm (S4, QM-15). Người gọi đã khoá hàng và đã kiểm tư cách; điều kiện
   * "không phải ChoKichHoat" vẫn nằm trong CHÍNH câu UPDATE (cùng ý với activateRegistration) để dù tầng trên kiểm sai, nhân sự chưa kích hoạt không bị gán
   * mật khẩu ngoài liên kết kích hoạt (và không đụng CHECK chk_tai_khoan_mat_khau). NgungHoatDong được ghi (S4: đặt lại được nhưng vẫn ngưng).
   * KHÔNG đổi da_xac_minh_email (Q6). Trả true nếu đúng một hàng được cập nhật.
   */
  async setPasswordAfterReset(
    em: EntityManager,
    id: string,
    matKhauBam: string,
  ): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(TaiKhoan)
      .set({ matKhauBam, soLanDangNhapSai: 0, khoaDangNhapDen: null })
      .where("tai_khoan_id = :id AND trang_thai <> 'ChoKichHoat'", { id })
      .execute();
    return (result.affected ?? 0) === 1;
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
   * Mã các Bệnh nhân chưa xác minh đang hoạt động đã sống từ 24 giờ trở lên tính tới `cutoff` (= bây giờ − 24 giờ, đồng hồ ứng dụng), theo khoá chính TĂNG DẦN,
   * chỉ lấy mã LỚN HƠN `afterId` (con trỏ của lô trước) và tối đa `limit` mã (task A7). Nửa mở như `isExpiredUnverifiedPatient`: `thoi_diem_tao <= cutoff` là
   * `bây giờ >= thoi_diem_tao + 24 giờ`. Đọc THƯỜNG, không khoá: chỉ là danh sách ứng viên, quyết định thật do `UnverifiedPatientCleaner.purgeIfExpired`
   * đọc lại dưới khoá. Mỗi điều kiện một dòng và có test khớp từng ca với hàm thuần (CJ-04).
   */
  async findExpiredUnverifiedPatientIds(
    em: EntityManager,
    cutoff: Date,
    afterId: string,
    limit: number,
  ): Promise<string[]> {
    const rows = await em
      .createQueryBuilder(TaiKhoan, 't')
      .select('t.taiKhoanId')
      .where("t.loaiTaiKhoan = 'BenhNhan'")
      .andWhere('t.daXacMinhEmail = 0')
      .andWhere("t.trangThai = 'DangHoatDong'")
      .andWhere('t.thoiDiemTao <= :cutoff', { cutoff })
      .andWhere('t.taiKhoanId > :afterId', { afterId })
      .orderBy('t.taiKhoanId', 'ASC')
      .limit(limit)
      .getMany();
    return rows.map((row) => row.taiKhoanId);
  }

  /**
   * Hoàn tất đăng ký khi OTP đúng (task A6): ghi dữ liệu của CHÍNH lần đăng ký đã xác minh (họ tên, SĐT, băm mật khẩu) vào tài khoản, đặt đã
   * xác minh email, và đặt lại bộ đếm đăng nhập sai + khoá đăng nhập (tài khoản chưa từng đăng nhập được nên mọi giá trị cũ đều vô nghĩa).
   * Điều kiện bảo vệ nằm trong CHÍNH câu UPDATE (cùng ý với deleteUnverifiedPatient): dù tầng trên kiểm sai, nhân sự, tài khoản đã xác
   * minh và tài khoản bị ngưng vẫn không thể bị ghi đè mật khẩu. Trả true nếu đúng một hàng được cập nhật. `thoi_diem_tao` KHÔNG đổi (Q4).
   */
  async activateRegistration(
    em: EntityManager,
    id: string,
    data: RegistrationData,
  ): Promise<boolean> {
    const result = await em
      .createQueryBuilder()
      .update(TaiKhoan)
      .set({
        hoTen: data.hoTen,
        soDienThoai: data.soDienThoai,
        matKhauBam: data.matKhauBam,
        daXacMinhEmail: true,
        soLanDangNhapSai: 0,
        khoaDangNhapDen: null,
      })
      .where(
        "tai_khoan_id = :id AND loai_tai_khoan = 'BenhNhan' AND da_xac_minh_email = 0 AND trang_thai = 'DangHoatDong'",
        { id },
      )
      .execute();
    return (result.affected ?? 0) === 1;
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
