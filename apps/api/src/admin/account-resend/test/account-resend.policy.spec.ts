import type { LoaiTaiKhoan } from '../../../auth/entities/enums.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { decideResendAccess } from '../account-resend.policy.js';

// Task B20 (admin) — ma trận quyền "Gửi lại liên kết kích hoạt" (PLAN 5.6) ở dạng HÀM THUẦN: không DB, không đồng hồ.
// Mã TKB20-nn là [đề xuất]; mã PLAN ghi kèm (TK-22, TK-40, TK-44, Q27, Q40).

const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
const BRANCH: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };

type Outcome = 'CHO_QUA' | 'KHONG_TIM_THAY' | 'KHONG_DU_QUYEN';

// Kết quả quan sát được của hàm: cho qua (không ném) hoặc mã lỗi của AppException (kèm trạng thái HTTP để đối chiếu 404 và 403)
function outcomeOf(
  scope: AdminScope,
  loaiTaiKhoan: LoaiTaiKhoan,
  chiNhanhId: string | null,
): { outcome: Outcome; status: number | null } {
  try {
    decideResendAccess(scope, { loaiTaiKhoan, chiNhanhId });
    return { outcome: 'CHO_QUA', status: null };
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    const body = error.getResponse() as { maLoi: Outcome };
    return { outcome: body.maLoi, status: error.getStatus() };
  }
}

describe('TKB20-02 (TK-22, TK-40, TK-44, Q27, Q40) — decideResendAccess: ma trận quyền của PLAN 5.6', () => {
  it.each<[string, LoaiTaiKhoan, string | null]>([
    ['Bác sĩ chi nhánh mình', 'BacSi', '7'],
    ['Bác sĩ chi nhánh khác', 'BacSi', '8'],
    ['Lễ tân chi nhánh mình', 'LeTan', '7'],
    ['Lễ tân chi nhánh khác', 'LeTan', '8'],
    ['Quản trị viên Toàn hệ thống (không có chi nhánh)', 'QuanTriVien', null],
    ['Quản trị viên Chi nhánh', 'QuanTriVien', '7'],
    ['Quản trị viên Chi nhánh khác', 'QuanTriVien', '8'],
    [
      'Bệnh nhân (B14 trả 409 sau đó; không phải việc của ma trận)',
      'BenhNhan',
      null,
    ],
  ])('Toàn hệ thống + %s ⇒ cho qua (không ném)', (_label, loai, chiNhanhId) => {
    expect(outcomeOf(SYSTEM, loai, chiNhanhId)).toEqual({
      outcome: 'CHO_QUA',
      status: null,
    });
  });

  it.each<[string, LoaiTaiKhoan, string | null]>([
    ['Bác sĩ chi nhánh mình', 'BacSi', '7'],
    ['Lễ tân chi nhánh mình', 'LeTan', '7'],
  ])('Chi nhánh + %s ⇒ cho qua (TK-44)', (_label, loai, chiNhanhId) => {
    expect(outcomeOf(BRANCH, loai, chiNhanhId)).toEqual({
      outcome: 'CHO_QUA',
      status: null,
    });
  });

  it.each<[string, LoaiTaiKhoan, string | null]>([
    ['Bác sĩ chi nhánh khác', 'BacSi', '8'],
    ['Lễ tân chi nhánh khác', 'LeTan', '8'],
    ['Bác sĩ thiếu hồ sơ (không có chi nhánh)', 'BacSi', null],
    ['Quản trị viên Toàn hệ thống', 'QuanTriVien', null],
    ['Quản trị viên của CHÍNH chi nhánh mình (Q27)', 'QuanTriVien', '7'],
    ['Quản trị viên chi nhánh khác', 'QuanTriVien', '8'],
  ])(
    'Chi nhánh + %s ⇒ 404 KHONG_TIM_THAY (ngoài tầm nhìn, không phải 403)',
    (_label, loai, chiNhanhId) => {
      expect(outcomeOf(BRANCH, loai, chiNhanhId)).toEqual({
        outcome: 'KHONG_TIM_THAY',
        status: 404,
      });
    },
  );

  it('Chi nhánh + Bệnh nhân (thấy được vì có lịch tại chi nhánh) ⇒ 403 KHONG_DU_QUYEN, không phải 404 hay 409', () => {
    expect(outcomeOf(BRANCH, 'BenhNhan', null)).toEqual({
      outcome: 'KHONG_DU_QUYEN',
      status: 403,
    });
  });

  it('so chi nhánh bằng CHUỖI id: "7" khác "70" và khác "07" (không so lỏng)', () => {
    expect(outcomeOf(BRANCH, 'LeTan', '70').outcome).toBe('KHONG_TIM_THAY');
    expect(outcomeOf(BRANCH, 'LeTan', '07').outcome).toBe('KHONG_TIM_THAY');
  });
});
