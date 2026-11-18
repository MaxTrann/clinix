import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { BacSi } from '../entities/bac-si.entity.js';
import { LeTan } from '../entities/le-tan.entity.js';
import { QuanTriVien } from '../entities/quan-tri-vien.entity.js';
import type {
  BranchAdminInput,
  DoctorInput,
  ReceptionistInput,
  StaffRole,
  SystemAdminInput,
} from './staff-account.types.js';

// Truy vấn của task B15 (tạo tài khoản nhân sự). Chỉ chứa câu lệnh; quy tắc nằm ở staff-account-rules.ts và staff-account.service.ts.
// Mọi hàm nhận `em` để chạy trong GIAO DỊCH của người gọi (READ COMMITTED do ActivationLinkService.transaction mở).
// So sánh email dùng `=` của DB (utf8mb4_unicode_ci: không phân biệt hoa/thường) nên cùng là một tài khoản dù khác hoa/thường (NS-09).

/** Các cột mà luật "email này còn dùng được không" cần (khớp `AccountFacts` của auth/register/unverified-account-rules.ts), kèm mã tài khoản. */
export type EmailOwner = Pick<
  TaiKhoan,
  'taiKhoanId' | 'loaiTaiKhoan' | 'daXacMinhEmail' | 'trangThai' | 'thoiDiemTao'
>;

const OWNER_COLUMNS = [
  't.taiKhoanId',
  't.loaiTaiKhoan',
  't.daXacMinhEmail',
  't.trangThai',
  't.thoiDiemTao',
];

export interface NewAccountRow {
  hoTen: string;
  email: string;
  soDienThoai: string;
  loaiTaiKhoan: StaffRole;
  /** Ghi tường minh từ đồng hồ ứng dụng (đã cắt giây), không dùng DEFAULT CURRENT_TIMESTAMP của DB */
  createdAt: Date;
}

@Injectable()
export class StaffAccountRepository {
  /** Đọc THƯỜNG (không khoá, không khoá khoảng): chỉ để chọn đường đi; quyết định thật đọc lại dưới khoá. */
  findByEmail(em: EntityManager, email: string): Promise<EmailOwner | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(OWNER_COLUMNS)
      .where('t.email = :email', { email })
      .getOne();
  }

  /** Khoá hàng theo email (SELECT … FOR UPDATE). Chỉ gọi khi hàng ĐÃ có: khoá email chưa có là khoá khoảng chỉ mục, dễ deadlock (auth A5: RG-S1, RG-S5). */
  findByEmailForUpdate(
    em: EntityManager,
    email: string,
  ): Promise<EmailOwner | null> {
    return em
      .createQueryBuilder(TaiKhoan, 't')
      .select(OWNER_COLUMNS)
      .setLock('pessimistic_write')
      .where('t.email = :email', { email })
      .getOne();
  }

  /** Chi nhánh có tồn tại không. `chi_nhanh` không có cờ hoạt động và không có API xoá nên không cần khoá: khoá ngoại lúc chèn hồ sơ tự lo phần còn lại. */
  async branchExists(em: EntityManager, id: string): Promise<boolean> {
    const rows: unknown[] = await em.query(
      'SELECT 1 FROM chi_nhanh WHERE chi_nhanh_id = ?',
      [id],
    );
    return rows.length === 1;
  }

  /**
   * Chuyên khoa có tồn tại VÀ đang hoạt động không (Q19), đọc bằng `FOR SHARE` để người khác không ngừng hoạt động nó trước khi giao dịch này commit.
   * Lần chèn `bac_si` vốn đã khoá S hàng cha qua khoá ngoại; ở đây khoá đó chỉ được lấy SỚM hơn, ngay lúc kiểm.
   */
  async lockActiveSpecialty(em: EntityManager, id: string): Promise<boolean> {
    const rows: unknown[] = await em.query(
      "SELECT 1 FROM chuyen_khoa WHERE chuyen_khoa_id = ? AND trang_thai_hoat_dong = 'DangHoatDong' FOR SHARE",
      [id],
    );
    return rows.length === 1;
  }

  /** Dịch vụ khám có được cung cấp ở chi nhánh không (NS-13), đọc bằng `FOR SHARE` để không ai gỡ liên kết trước khi giao dịch này commit. */
  async lockServiceAtBranch(
    em: EntityManager,
    branchId: string,
    serviceId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await em.query(
      'SELECT 1 FROM chi_nhanh_dich_vu_kham WHERE chi_nhanh_id = ? AND dich_vu_kham_id = ? FOR SHARE',
      [branchId, serviceId],
    );
    return rows.length === 1;
  }

  /**
   * Chèn tài khoản nhân sự: `ChoKichHoat`, KHÔNG mật khẩu (`mat_khau_bam` NULL, CHECK `chk_tai_khoan_mat_khau`), email CHƯA xác minh (đặt true khi kích hoạt, Q24).
   * Trùng email thì MySQL ném 1062 (NS-22): người gọi đổi thành EMAIL_DA_DUNG. Trả mã tài khoản.
   */
  async insertAccount(em: EntityManager, row: NewAccountRow): Promise<string> {
    const result = await em.insert(TaiKhoan, {
      hoTen: row.hoTen,
      email: row.email,
      soDienThoai: row.soDienThoai,
      matKhauBam: null,
      trangThai: 'ChoKichHoat',
      daXacMinhEmail: false,
      soLanDangNhapSai: 0,
      loaiTaiKhoan: row.loaiTaiKhoan,
      thoiDiemTao: row.createdAt,
    });
    return String(result.identifiers[0]?.taiKhoanId);
  }

  async insertDoctor(
    em: EntityManager,
    taiKhoanId: string,
    input: DoctorInput,
  ): Promise<void> {
    await em.insert(BacSi, {
      taiKhoanId,
      chiNhanhId: input.chiNhanhId,
      chuyenKhoaId: input.chuyenKhoaId,
      dichVuKhamId: input.dichVuKhamId,
      chucDanh: input.chucDanh,
      hocVi: input.hocVi,
      soNamKinhNghiem: input.soNamKinhNghiem,
      // Biểu mẫu tạo không có ô này (quy tắc 20: tùy chọn); B13 cho nhập sau
      moTaChuyenMon: null,
    });
  }

  async insertReceptionist(
    em: EntityManager,
    taiKhoanId: string,
    input: ReceptionistInput,
  ): Promise<void> {
    await em.insert(LeTan, { taiKhoanId, chiNhanhId: input.chiNhanhId });
  }

  async insertAdmin(
    em: EntityManager,
    taiKhoanId: string,
    input: SystemAdminInput | BranchAdminInput,
  ): Promise<void> {
    await em.insert(QuanTriVien, {
      taiKhoanId,
      phamViQuanTri: input.phamVi,
      chiNhanhId: input.phamVi === 'ChiNhanh' ? input.chiNhanhId : null,
    });
  }
}
