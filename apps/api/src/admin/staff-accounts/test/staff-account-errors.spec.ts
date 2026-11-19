import { AppException } from '../../../common/errors/app.exception.js';
import { ERROR_CODE_PATTERN } from '../../../common/errors/error-codes.js';
import {
  STAFF_ACCOUNT_ERROR_CODES,
  STAFF_ACCOUNT_FIELD_CODES,
  emailInUse,
  invalidBranch,
  invalidSpecialty,
  notAllowed,
  serviceNotAtBranch,
  titleDegreeMismatch,
} from '../staff-account.errors.js';

// Task B15 (admin) — mã lỗi và chữ của tạo tài khoản nhân sự (PLAN admin 5.9; NS-06, 07, 09, 13, 14, 16). Mã NSB15-11 là [đề xuất].

const bodyOf = (error: AppException): unknown => error.getResponse();

describe('mã lỗi nghiệp vụ (PLAN 5.9)', () => {
  it('NSB15-11 (NS-09) EMAIL_DA_DUNG: 409, chữ của PLAN 5.9 (không có "Vui lòng đăng nhập" của auth)', () => {
    const error = emailInUse();
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error)).toEqual({
      maLoi: 'EMAIL_DA_DUNG',
      thongBao: 'Email này đã được sử dụng.',
    });
  });

  it('NSB15-11 (NS-14) CHUC_DANH_HOC_VI_KHONG_TUONG_THICH: 400, chữ của PLAN 5.9', () => {
    const error = titleDegreeMismatch();
    expect(error.getStatus()).toBe(400);
    expect(bodyOf(error)).toEqual({
      maLoi: 'CHUC_DANH_HOC_VI_KHONG_TUONG_THICH',
      thongBao: 'Chức danh và học vị không tương thích.',
    });
  });

  it('NSB15-11 (NS-13) DICH_VU_KHONG_O_CHI_NHANH: 400, chữ của PLAN 5.9', () => {
    const error = serviceNotAtBranch();
    expect(error.getStatus()).toBe(400);
    expect(bodyOf(error)).toEqual({
      maLoi: 'DICH_VU_KHONG_O_CHI_NHANH',
      thongBao: 'Dịch vụ khám chính không được cung cấp tại chi nhánh đã chọn.',
    });
  });

  it('NSB15-11 (NS-07) KHONG_DU_QUYEN: 403, mã chung', () => {
    const error = notAllowed();
    expect(error.getStatus()).toBe(403);
    expect(error.maLoi).toBe('KHONG_DU_QUYEN');
  });
});

describe('lỗi theo trường (400 DU_LIEU_KHONG_HOP_LE)', () => {
  it('NSB15-11 (NS-06, Q40) chi nhánh ngoài phạm vi và chi nhánh không tồn tại dùng CÙNG một thân (không lộ chi nhánh khác)', () => {
    // Cả hai nhánh của service gọi cùng một hàm dựng lỗi; hai lần gọi phải cho thân bằng nhau tuyệt đối
    expect(bodyOf(invalidBranch())).toEqual(bodyOf(invalidBranch()));
    expect(invalidBranch().getStatus()).toBe(400);
    expect(bodyOf(invalidBranch())).toEqual({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      thongBao: 'Dữ liệu không hợp lệ.',
      loi: [{ truong: 'chiNhanhId', ma: 'CHI_NHANH_KHONG_HOP_LE' }],
    });
  });

  it('NSB15-11 (NS-16, Q19) chuyên khoa không hợp lệ: lỗi trên đúng trường chuyenKhoaId', () => {
    expect(invalidSpecialty().getStatus()).toBe(400);
    expect(bodyOf(invalidSpecialty())).toEqual({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      thongBao: 'Dữ liệu không hợp lệ.',
      loi: [{ truong: 'chuyenKhoaId', ma: 'CHUYEN_KHOA_KHONG_HOP_LE' }],
    });
  });

  it('NSB15-11 mọi mã đều theo mẫu HOA_VA_GACH_DUOI (AppException không nhận mã tự do) và không có mã trùng', () => {
    const codes = [
      ...Object.values(STAFF_ACCOUNT_ERROR_CODES),
      ...Object.values(STAFF_ACCOUNT_FIELD_CODES),
    ];
    for (const code of codes) {
      expect(ERROR_CODE_PATTERN.test(code)).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});
