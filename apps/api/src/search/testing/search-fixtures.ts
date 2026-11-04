import type { DataSource, EntityManager } from 'typeorm';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { BacSi } from '../../admin/entities/bac-si.entity.js';
import { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { ChiNhanhDichVuKham } from '../../admin/entities/chi-nhanh-dich-vu-kham.entity.js';
import { ChiNhanhLichHoatDong } from '../../admin/entities/chi-nhanh-lich-hoat-dong.entity.js';
import { ChuyenKhoa } from '../../admin/entities/chuyen-khoa.entity.js';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import { PhuPhiBacSi } from '../../admin/entities/phu-phi-bac-si.entity.js';

// Tọa độ minh họa (không phải dữ liệu thật của ai).
const SAMPLE_LAT = '10.7769000';
const SAMPLE_LNG = '106.7009000';

/**
 * Dựng dữ liệu cho test của module search, đặt trên AdminFixtures (cùng quy tắc: chỉ ghi vào DB `*_test`).
 * Mỗi hàm tạo đúng MỘT tình huống mà điều kiện công khai (PLAN 5.3) phải phân biệt được.
 */
export class SearchFixtures {
  readonly admin: AdminFixtures;

  constructor(private readonly db: DataSource | EntityManager) {
    this.admin = new AdminFixtures(db);
  }

  /** Chi nhánh có toạ độ (cho "chi nhánh gần nhất"). */
  branchWithCoordinates(overrides: Partial<ChiNhanh> = {}) {
    return this.admin.branch({
      toaDoLat: SAMPLE_LAT,
      toaDoLng: SAMPLE_LNG,
      ...overrides,
    });
  }

  /** Chi nhánh không toạ độ (cột NULL) — bị bỏ qua khi tính khoảng cách. */
  branchWithoutCoordinates(overrides: Partial<ChiNhanh> = {}) {
    return this.admin.branch({ toaDoLat: null, toaDoLng: null, ...overrides });
  }

  /** Lịch tuần chỉ có các thứ được liệt kê (1 = Thứ Hai … 7 = Chủ Nhật); thứ còn lại không có dòng nào. */
  async partialWeeklySchedule(branchId: string, weekdays: readonly number[]) {
    await this.admin.weeklySchedule(branchId);
    const missing = [1, 2, 3, 4, 5, 6, 7].filter((d) => !weekdays.includes(d));
    for (const thuTrongTuan of missing) {
      await this.db
        .getRepository(ChiNhanhLichHoatDong)
        .delete({ chiNhanhId: branchId, thuTrongTuan });
    }
  }

  /** Bác sĩ công khai bình thường: tài khoản hoạt động, chuyên khoa hoạt động, cặp chi nhánh–dịch vụ còn. */
  publicDoctor(
    branch: ChiNhanh,
    overrides: Partial<BacSi> = {},
    accountOverrides: Partial<TaiKhoan> = {},
  ) {
    return this.admin.doctor(branch, overrides, {
      trangThai: 'DangHoatDong',
      ...accountOverrides,
    });
  }

  /** Bác sĩ có tài khoản ChoKichHoat (chưa kích hoạt) — phải ẩn (Q13). */
  async pendingDoctor(branch: ChiNhanh, overrides: Partial<BacSi> = {}) {
    // CHECK chk_tai_khoan_mat_khau: ChoKichHoat là trạng thái duy nhất được phép không có mật khẩu.
    return this.admin.doctor(branch, overrides, {
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
  }

  /** Bác sĩ có tài khoản NgungHoatDong (bị khoá) — phải ẩn (Q13). */
  suspendedDoctor(branch: ChiNhanh, overrides: Partial<BacSi> = {}) {
    return this.admin.doctor(branch, overrides, {
      trangThai: 'NgungHoatDong',
    });
  }

  /** Bác sĩ thuộc chuyên khoa NgungHoatDong — bác sĩ và chuyên khoa đều phải ẩn (Q1, Q13). */
  async doctorOfInactiveSpecialty(
    branch: ChiNhanh,
    overrides: Partial<BacSi> = {},
  ) {
    const doctor = await this.publicDoctor(branch, overrides);
    await this.db
      .getRepository(ChuyenKhoa)
      .update(doctor.profile.chuyenKhoaId, {
        trangThaiHoatDong: 'NgungHoatDong',
      });
    return doctor;
  }

  /** Bác sĩ mà chi nhánh đã bỏ dịch vụ khám của họ — phải ẩn (Q10, Q13). */
  async doctorWithRemovedService(branch: ChiNhanh) {
    const doctor = await this.publicDoctor(branch);
    await this.db.getRepository(ChiNhanhDichVuKham).delete({
      chiNhanhId: doctor.profile.chiNhanhId,
      dichVuKhamId: doctor.profile.dichVuKhamId,
    });
    return doctor;
  }

  /** Một quy tắc phụ phí (bảng `phu_phi_bac_si`); `apDung = false` là mốc đã tắt. */
  surchargeRule(
    chucDanh: ChucDanhBacSi,
    soNamKinhNghiemTu: number,
    phuPhi: string,
    apDung = true,
  ) {
    const repo = this.db.getRepository(PhuPhiBacSi);
    return repo.save(
      repo.create({ chucDanh, soNamKinhNghiemTu, phuPhi, apDung }),
    );
  }
}
