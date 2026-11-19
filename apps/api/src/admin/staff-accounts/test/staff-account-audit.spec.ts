import { validateAuditEntry } from '../../../audit/audit-validation.js';
import { buildCreateAudit } from '../staff-account-rules.js';
import type { StaffAccountInput } from '../staff-account.types.js';

// Task B15 (admin) — dòng audit TaoTaiKhoanNhanSu (PLAN admin 5.10; NS-24). Mỗi entry qua validateAuditEntry THẬT của C2. Mã NSB15-18 là [đề xuất].

const common = {
  hoTen: 'Trần Thị Hoa',
  email: 'hoa.tran@example.com',
  soDienThoai: '0987654321',
};

const doctor: StaffAccountInput = {
  ...common,
  vaiTro: 'BacSi',
  chiNhanhId: '12',
  chuyenKhoaId: '3',
  dichVuKhamId: '5',
  chucDanh: 'TS_BS',
  hocVi: 'TS',
  soNamKinhNghiem: 20,
};
const receptionist: StaffAccountInput = {
  ...common,
  vaiTro: 'LeTan',
  chiNhanhId: '12',
};
const systemAdmin: StaffAccountInput = {
  ...common,
  vaiTro: 'QuanTriVien',
  phamVi: 'ToanHeThong',
};
const branchAdmin: StaffAccountInput = {
  ...common,
  vaiTro: 'QuanTriVien',
  phamVi: 'ChiNhanh',
  chiNhanhId: '12',
};

describe('buildCreateAudit (NS-24)', () => {
  it('NSB15-18 Bác sĩ và Lễ tân: chi_nhanh_id = chi nhánh, KHÔNG có pham_vi, branchId = chi nhánh', () => {
    for (const [input, loai] of [
      [doctor, 'BacSi'],
      [receptionist, 'LeTan'],
    ] as const) {
      const entry = buildCreateAudit('99', '501', input);
      expect(entry).toEqual({
        actorId: '99',
        branchId: '12',
        action: 'TaoTaiKhoanNhanSu',
        targetType: 'tai_khoan',
        targetId: '501',
        result: 'ThanhCong',
        changes: { loai_tai_khoan: loai, chi_nhanh_id: '12' },
      });
      expect(validateAuditEntry(entry)).toEqual(entry);
    }
  });

  it('NSB15-18 Quản trị viên Toàn hệ thống: branchId null, chi_nhanh_id null, pham_vi ToanHeThong', () => {
    const entry = buildCreateAudit('99', '502', systemAdmin);
    expect(entry.branchId).toBeNull();
    expect(entry.changes).toEqual({
      loai_tai_khoan: 'QuanTriVien',
      chi_nhanh_id: null,
      pham_vi: 'ToanHeThong',
    });
    expect(validateAuditEntry(entry)).toEqual(entry);
  });

  it('NSB15-18 Quản trị viên Chi nhánh: branchId = chi nhánh, pham_vi ChiNhanh', () => {
    const entry = buildCreateAudit('99', '503', branchAdmin);
    expect(entry.branchId).toBe('12');
    expect(entry.changes).toEqual({
      loai_tai_khoan: 'QuanTriVien',
      chi_nhanh_id: '12',
      pham_vi: 'ChiNhanh',
    });
    expect(validateAuditEntry(entry)).toEqual(entry);
  });

  it('NSB15-18 (NS-24) KHÔNG copy DTO vào audit: không họ tên, email, SĐT, chức danh, chuyên khoa, dịch vụ, mật khẩu, token', () => {
    for (const input of [doctor, receptionist, systemAdmin, branchAdmin]) {
      const text = JSON.stringify(buildCreateAudit('99', '504', input));
      for (const forbidden of [
        common.hoTen,
        common.email,
        common.soDienThoai,
        'TS_BS',
        'chuyen_khoa',
        'mat_khau',
        'token',
        'ma_bam',
      ]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});
