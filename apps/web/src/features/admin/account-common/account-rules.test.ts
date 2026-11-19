import {
  BRANCH_PATIENT_FIELD_IDS,
  accountActions,
  relockOutlook,
  visibleFields,
} from './account-rules';
import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  type AccountRole,
  type AccountStatus,
  type AdminScopeKind,
  type PatientAccount,
} from './account-types';

// admin F9, quy tắc thuần (mã TKF9-01 đến 05 là [đề xuất], TRACKING admin 9A.12 mục 3). Phủ TK-26 và TK-34 ở mức hàm thuần.

const SCOPES: AdminScopeKind[] = ['ToanHeThong', 'ChiNhanh'];
const FLAGS = [true, false, null] as const;

const NONE = { canLock: false, canUnlock: false, canUnlockNoShow: false };

const patient: PatientAccount = {
  taiKhoanId: '7',
  loaiTaiKhoan: 'BenhNhan',
  hoTen: 'Nguyễn Văn An',
  email: 'an@example.test',
  soDienThoai: '0900000001',
  ngaySinh: '1990-05-07',
  gioiTinh: 'Nam',
  trangThai: 'DangHoatDong',
  diaChi: 'Địa chỉ riêng tư',
  daXacMinhEmail: true,
  thoiDiemTao: '2026-11-18T17:30:00.000Z',
  khoaDatLichDoNoShow: true,
  soLanNoShow: 3,
};

function facts(
  loaiTaiKhoan: AccountRole,
  trangThai: AccountStatus,
  khoaDatLichDoNoShow?: boolean | null,
) {
  return { loaiTaiKhoan, trangThai, khoaDatLichDoNoShow };
}

describe('TKF9-01 ma trận nút: các hàng chốt của PLAN 5.6', () => {
  it('TKF9-01 Toàn hệ thống × Bệnh nhân đang hoạt động, không bị khoá no-show: chỉ có "Khoá"', () => {
    expect(
      accountActions('ToanHeThong', facts('BenhNhan', 'DangHoatDong', false)),
    ).toEqual({ ...NONE, canLock: true });
  });

  it('TKF9-01 Toàn hệ thống × Bệnh nhân ngừng hoạt động và đang bị khoá no-show: "Mở khoá" và "Mở khoá no-show"', () => {
    expect(
      accountActions('ToanHeThong', facts('BenhNhan', 'NgungHoatDong', true)),
    ).toEqual({ ...NONE, canUnlock: true, canUnlockNoShow: true });
  });

  it('TKF9-01 Toàn hệ thống × Bệnh nhân đang hoạt động nhưng bị khoá no-show: "Khoá" và "Mở khoá no-show" (cờ không phụ thuộc trạng thái)', () => {
    expect(
      accountActions('ToanHeThong', facts('BenhNhan', 'DangHoatDong', true)),
    ).toEqual({ ...NONE, canLock: true, canUnlockNoShow: true });
  });

  it('TKF9-01 Chi nhánh khoá được Bác sĩ và Lễ tân, mở khoá được khi ngừng hoạt động', () => {
    for (const role of ['BacSi', 'LeTan'] as const) {
      expect(accountActions('ChiNhanh', facts(role, 'DangHoatDong'))).toEqual({
        ...NONE,
        canLock: true,
      });
      expect(accountActions('ChiNhanh', facts(role, 'NgungHoatDong'))).toEqual({
        ...NONE,
        canUnlock: true,
      });
    }
  });

  it('TKF9-01 Chi nhánh KHÔNG khoá được Bệnh nhân hay Quản trị viên', () => {
    for (const role of ['BenhNhan', 'QuanTriVien'] as const) {
      for (const status of ACCOUNT_STATUSES) {
        expect(accountActions('ChiNhanh', facts(role, status, true))).toEqual(
          NONE,
        );
      }
    }
  });

  it('TKF9-01 Toàn hệ thống khoá được cả bốn loại', () => {
    for (const role of ACCOUNT_ROLES) {
      expect(
        accountActions('ToanHeThong', facts(role, 'DangHoatDong')).canLock,
      ).toBe(true);
    }
  });
});

describe('TKF9-02 ma trận nút: MỌI tổ hợp (2 phạm vi × 4 loại × 3 trạng thái × 3 giá trị cờ)', () => {
  const rows = SCOPES.flatMap((scope) =>
    ACCOUNT_ROLES.flatMap((role) =>
      ACCOUNT_STATUSES.flatMap((status) =>
        FLAGS.map((flag) => [scope, role, status, flag] as const),
      ),
    ),
  );

  it('TKF9-02 có đúng 72 tổ hợp', () => {
    expect(rows).toHaveLength(72);
  });

  it.each(rows)(
    'TKF9-02 %s × %s × %s × cờ %s: bất biến của ma trận',
    (scope, role, status, flag) => {
      const actions = accountActions(scope, facts(role, status, flag));
      // A6: tài khoản chờ kích hoạt không khoá, không mở khoá được
      if (status === 'ChoKichHoat') {
        expect(actions.canLock).toBe(false);
        expect(actions.canUnlock).toBe(false);
      }
      // Không bao giờ vừa khoá vừa mở khoá
      expect(actions.canLock && actions.canUnlock).toBe(false);
      // Q31: "Mở khoá no-show" đúng khi và chỉ khi Toàn hệ thống × Bệnh nhân × cờ BẬT (false và null không tính)
      expect(actions.canUnlockNoShow).toBe(
        scope === 'ToanHeThong' && role === 'BenhNhan' && flag === true,
      );
      // Admin Chi nhánh KHÔNG có nút nào với Bệnh nhân (TK-15) và Quản trị viên
      if (
        scope === 'ChiNhanh' &&
        (role === 'BenhNhan' || role === 'QuanTriVien')
      )
        expect(actions).toEqual(NONE);
    },
  );

  it('TKF9-02 cờ vắng mặt (undefined) và null đều KHÔNG hiện nút no-show', () => {
    expect(
      accountActions('ToanHeThong', facts('BenhNhan', 'DangHoatDong'))
        .canUnlockNoShow,
    ).toBe(false);
    expect(
      accountActions('ToanHeThong', facts('BenhNhan', 'DangHoatDong', null))
        .canUnlockNoShow,
    ).toBe(false);
  });
});

describe('TKF9-03 trường được hiện theo phạm vi (Q26, TK-04 phía giao diện)', () => {
  // API (hay một mock) lỡ trả thừa mọi thứ, kể cả khoá không có trong hợp đồng
  const overfull = {
    ...patient,
    matKhauBam: 'khong-bao-gio-duoc-hien',
    maXacThuc: 'khong-bao-gio-duoc-hien',
  } as PatientAccount;

  it('TKF9-03 Chi nhánh: ĐÚNG sáu dòng theo đúng thứ tự, dù đối tượng có thêm địa chỉ, ngày tạo, no-show, băm', () => {
    const rows = visibleFields('ChiNhanh', overfull);
    expect(rows.map((row) => row.id)).toEqual([...BRANCH_PATIENT_FIELD_IDS]);
    expect(rows.map((row) => row.label)).toEqual([
      'Họ tên',
      'Email',
      'Số điện thoại',
      'Ngày sinh',
      'Giới tính',
      'Trạng thái',
    ]);
    const text = JSON.stringify(rows);
    for (const leaked of [
      'Địa chỉ riêng tư',
      'khong-bao-gio-duoc-hien',
      '2026',
      'no-show',
    ]) {
      expect(text).not.toContain(leaked);
    }
    // ngày sinh 1990-05-07 là chuỗi ngày sinh, không phải ngày tạo
    expect(text).toContain('07/05/1990');
  });

  it('TKF9-03 Toàn hệ thống: sáu dòng đầu giống Chi nhánh, thêm năm dòng; không bao giờ có khoá ngoài hợp đồng', () => {
    const rows = visibleFields('ToanHeThong', overfull);
    expect(rows.map((row) => row.id)).toEqual([
      ...BRANCH_PATIENT_FIELD_IDS,
      'diaChi',
      'daXacMinhEmail',
      'thoiDiemTao',
      'khoaNoShow',
      'soLanNoShow',
    ]);
    expect(JSON.stringify(rows)).not.toContain('khong-bao-gio-duoc-hien');
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.value]));
    expect(byId).toMatchObject({
      hoTen: 'Nguyễn Văn An',
      trangThai: 'Đang hoạt động',
      diaChi: 'Địa chỉ riêng tư',
      daXacMinhEmail: 'Đã xác minh',
      // 17:30 UTC ngày 18 là 00:30 ngày 19 giờ Việt Nam
      thoiDiemTao: '19/11/2026 00:30',
      khoaNoShow: 'Đang bị khoá',
      soLanNoShow: '3',
    });
  });
});

describe('TKF9-04 giá trị thiếu', () => {
  const unverified: PatientAccount = {
    ...patient,
    ngaySinh: null,
    gioiTinh: null,
    diaChi: null,
    daXacMinhEmail: false,
    khoaDatLichDoNoShow: null,
    soLanNoShow: null,
  };

  it('TKF9-04 Bệnh nhân chưa xác minh OTP: no-show là "Chưa có" (không phải "Không bị khoá" hay 0)', () => {
    const byId = Object.fromEntries(
      visibleFields('ToanHeThong', unverified).map((row) => [
        row.id,
        row.value,
      ]),
    );
    expect(byId).toMatchObject({
      ngaySinh: 'Chưa có',
      gioiTinh: 'Chưa có',
      diaChi: 'Chưa có',
      daXacMinhEmail: 'Chưa xác minh',
      khoaNoShow: 'Chưa có',
      soLanNoShow: 'Chưa có',
    });
  });

  it('TKF9-04 cờ false là "Không bị khoá", số lần 0 là "0"', () => {
    const byId = Object.fromEntries(
      visibleFields('ToanHeThong', {
        ...patient,
        khoaDatLichDoNoShow: false,
        soLanNoShow: 0,
      }).map((row) => [row.id, row.value]),
    );
    expect(byId).toMatchObject({
      khoaNoShow: 'Không bị khoá',
      soLanNoShow: '0',
    });
  });
});

describe('TKF9-05 no-show kế tiếp có khoá lại ngay không (Q31, S + 1 ≥ N theo mark-no-show.ts)', () => {
  it.each([
    // [số lần S, ngưỡng N, kết quả]
    [3, 3, 'relock'],
    [2, 3, 'relock'],
    [4, 3, 'relock'],
    [1, 3, 'below'],
    [0, 3, 'below'],
    [0, 1, 'relock'],
    [9, 10, 'relock'],
    [8, 10, 'below'],
    [1_000_000, 3, 'relock'],
  ] as const)('TKF9-05 S=%s, N=%s ⇒ %s', (soLan, nguong, kind) => {
    expect(relockOutlook(soLan, nguong)).toEqual({ kind, nguong });
  });

  it.each([
    [3, null],
    [3, undefined],
    [3, 0],
    [3, -1],
    [3, 1.5],
    [3, Number.NaN],
    [3, Number.POSITIVE_INFINITY],
    [null, 3],
    [undefined, 3],
    [-1, 3],
    [2.5, 3],
  ] as const)(
    'TKF9-05 S=%s, N=%s: chưa biết nên KHÔNG đoán',
    (soLan, nguong) => {
      expect(relockOutlook(soLan, nguong)).toEqual({ kind: 'unknown' });
    },
  );
});
