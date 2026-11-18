import type { AdminScope } from '../../../rbac/admin-scope.js';
import {
  ACCOUNT_ROW_KEYS,
  toAccountDetail,
  toAccountView,
  toActivationLinkView,
  type AccountRow,
} from '../account-view.js';
import { findSecretLeaks } from '../testing/secret-leak.js';

const system: AdminScope = { kind: 'ToanHeThong' };
const branch: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };
const CREATED = new Date('2026-11-01T03:00:00.000Z');

const row = (overrides: Partial<AccountRow> = {}): AccountRow => ({
  taiKhoanId: '10',
  loaiTaiKhoan: 'BenhNhan',
  hoTen: 'Nguyễn Văn A',
  email: 'a@example.com',
  soDienThoai: '0901234567',
  ngaySinh: '1990-05-17',
  gioiTinh: 'Nam',
  diaChi: '12 Lê Lợi',
  trangThai: 'DangHoatDong',
  daXacMinhEmail: 1,
  thoiDiemTao: CREATED,
  khoaDatLichDoNoShow: 0,
  soLanNoShow: 2,
  phamViQuanTri: null,
  chiNhanhId: null,
  chiNhanhTen: null,
  ...overrides,
});
const doctor = row({
  loaiTaiKhoan: 'BacSi',
  khoaDatLichDoNoShow: null,
  soLanNoShow: null,
  chiNhanhId: '7',
  chiNhanhTen: 'Chi nhánh Quận 7',
});
const receptionist = { ...doctor, loaiTaiKhoan: 'LeTan' as const };
const branchAdmin = row({
  loaiTaiKhoan: 'QuanTriVien',
  khoaDatLichDoNoShow: null,
  soLanNoShow: null,
  phamViQuanTri: 'ChiNhanh',
  chiNhanhId: '7',
  chiNhanhTen: 'Chi nhánh Quận 7',
});
const systemAdmin = row({
  loaiTaiKhoan: 'QuanTriVien',
  khoaDatLichDoNoShow: null,
  soLanNoShow: null,
  phamViQuanTri: 'ToanHeThong',
});

const keysOf = (value: object) => Object.keys(value).sort();

const STAFF_KEYS = [
  'chiNhanh',
  'diaChi',
  'email',
  'gioiTinh',
  'hoTen',
  'loaiTaiKhoan',
  'ngaySinh',
  'soDienThoai',
  'taiKhoanId',
  'thoiDiemTao',
  'trangThai',
];
const PATIENT_BRANCH_KEYS = [
  'email',
  'gioiTinh',
  'hoTen',
  'loaiTaiKhoan',
  'ngaySinh',
  'soDienThoai',
  'taiKhoanId',
  'trangThai',
];
const PATIENT_SYSTEM_KEYS = [
  ...PATIENT_BRANCH_KEYS,
  'daXacMinhEmail',
  'diaChi',
  'khoaDatLichDoNoShow',
  'soLanNoShow',
  'thoiDiemTao',
].sort();

describe('TKB17-05 (TK-04, Q26, Q27, SE-A12) — hàng DB thành phản hồi theo vai người xem', () => {
  describe('tập khoá khoá chặt cho từng ô của bảng 2.3 (so BẰNG tập, không chỉ "chứa")', () => {
    it('Toàn hệ thống × Bệnh nhân: 13 khoá', () => {
      const view = toAccountView(system, row());
      expect(keysOf(view)).toEqual(PATIENT_SYSTEM_KEYS);
      expect(Object.keys(view)).toHaveLength(13);
    });

    it('Chi nhánh × Bệnh nhân (Q26): đúng 8 khoá, KHÔNG địa chỉ, thời điểm tạo, no-show, xác minh email', () => {
      const view = toAccountView(branch, row());
      expect(keysOf(view)).toEqual(PATIENT_BRANCH_KEYS);
      expect(Object.keys(view)).toHaveLength(8);
      for (const forbidden of [
        'diaChi',
        'thoiDiemTao',
        'khoaDatLichDoNoShow',
        'soLanNoShow',
        'daXacMinhEmail',
      ])
        expect(view).not.toHaveProperty(forbidden);
    });

    it.each([
      ['Toàn hệ thống', system],
      ['Chi nhánh', branch],
    ] as const)('%s × Bác sĩ và Lễ tân: 11 khoá', (_name, scope) => {
      for (const account of [doctor, receptionist]) {
        const view = toAccountView(scope, account);
        expect(keysOf(view)).toEqual(STAFF_KEYS);
        expect(Object.keys(view)).toHaveLength(11);
      }
    });

    it('Toàn hệ thống × Quản trị viên: 12 khoá (nhân sự + phamViQuanTri)', () => {
      const view = toAccountView(system, branchAdmin);
      expect(keysOf(view)).toEqual([...STAFF_KEYS, 'phamViQuanTri'].sort());
      expect(Object.keys(view)).toHaveLength(12);
    });
  });

  describe('giá trị', () => {
    it('Bệnh nhân (Toàn hệ thống) đổi cờ số của MySQL thành boolean và giữ ngày sinh là chuỗi', () => {
      expect(toAccountView(system, row())).toEqual({
        taiKhoanId: '10',
        loaiTaiKhoan: 'BenhNhan',
        hoTen: 'Nguyễn Văn A',
        email: 'a@example.com',
        soDienThoai: '0901234567',
        ngaySinh: '1990-05-17',
        gioiTinh: 'Nam',
        diaChi: '12 Lê Lợi',
        trangThai: 'DangHoatDong',
        daXacMinhEmail: true,
        thoiDiemTao: CREATED,
        khoaDatLichDoNoShow: false,
        soLanNoShow: 2,
      });
    });

    it('cờ no-show là true khi DB trả 1; số lần no-show dạng chuỗi được đổi thành số', () => {
      const view = toAccountView(
        system,
        row({ khoaDatLichDoNoShow: 1, soLanNoShow: '3' }),
      );
      expect(view).toMatchObject({ khoaDatLichDoNoShow: true, soLanNoShow: 3 });
    });

    it('Bệnh nhân chưa xác minh (không có dòng benh_nhan): hai khoá no-show là null, daXacMinhEmail false', () => {
      const view = toAccountView(
        system,
        row({
          daXacMinhEmail: 0,
          khoaDatLichDoNoShow: null,
          soLanNoShow: null,
        }),
      );
      expect(view).toMatchObject({
        daXacMinhEmail: false,
        khoaDatLichDoNoShow: null,
        soLanNoShow: null,
      });
    });

    it('Bác sĩ có chi nhánh {chiNhanhId, ten}', () => {
      expect(toAccountView(branch, doctor)).toMatchObject({
        loaiTaiKhoan: 'BacSi',
        chiNhanh: { chiNhanhId: '7', ten: 'Chi nhánh Quận 7' },
      });
    });

    it('hồ sơ con thiếu (dữ liệu hỏng): chiNhanh là null, không ném lỗi', () => {
      const broken = row({
        loaiTaiKhoan: 'BacSi',
        chiNhanhId: null,
        chiNhanhTen: null,
      });
      expect(toAccountView(system, broken)).toMatchObject({ chiNhanh: null });
    });

    it('Quản trị viên Toàn hệ thống có chiNhanh null; Quản trị viên Chi nhánh có chi nhánh', () => {
      expect(toAccountView(system, systemAdmin)).toMatchObject({
        phamViQuanTri: 'ToanHeThong',
        chiNhanh: null,
      });
      expect(toAccountView(system, branchAdmin)).toMatchObject({
        phamViQuanTri: 'ChiNhanh',
        chiNhanh: { chiNhanhId: '7' },
      });
    });

    it('ngày sinh và giới tính null được giữ null', () => {
      expect(
        toAccountView(branch, row({ ngaySinh: null, gioiTinh: null })),
      ).toMatchObject({ ngaySinh: null, gioiTinh: null });
    });
  });

  describe('đóng mặc định (Q27)', () => {
    it.each([branchAdmin, systemAdmin])(
      'Admin Chi nhánh nhận hàng Quản trị viên (%#) ⇒ NÉM LỖI, không bao giờ trả dữ liệu',
      (admin) => {
        expect(() => toAccountView(branch, admin)).toThrow(/Quản trị viên/);
        expect(() => toAccountDetail(branch, admin, null)).toThrow(
          /Quản trị viên/,
        );
      },
    );
  });

  describe('danh sách cho phép, không trải hàng thô', () => {
    it('một cột lạ lọt vào hàng thô (kể cả băm mật khẩu) KHÔNG xuất hiện ở bất kỳ phản hồi nào', () => {
      const polluted = {
        ...row(),
        matKhauBam: '$argon2id$v=19$m=19456,t=2,p=1$mau$mau',
        maBam: 'a'.repeat(64),
      } as unknown as AccountRow;
      for (const scope of [system, branch])
        for (const account of [polluted, { ...polluted, ...doctor }])
          expect(findSecretLeaks(toAccountView(scope, account))).toEqual([]);
      expect(
        findSecretLeaks(
          toAccountDetail(system, { ...polluted, ...doctor }, null),
        ),
      ).toEqual([]);
    });

    it('ACCOUNT_ROW_KEYS có 16 khoá, không trùng, không có khoá bí mật', () => {
      expect(new Set(ACCOUNT_ROW_KEYS).size).toBe(ACCOUNT_ROW_KEYS.length);
      expect(ACCOUNT_ROW_KEYS).toHaveLength(16);
      expect(
        findSecretLeaks(
          Object.fromEntries(ACCOUNT_ROW_KEYS.map((k) => [k, 1])),
        ),
      ).toEqual([]);
    });
  });

  describe('chi tiết = danh sách + lienKetKichHoat cho nhân sự', () => {
    const link = { trangThai: 'HOP_LE', hetHanLuc: CREATED } as const;

    it('nhân sự có thêm đúng một khoá lienKetKichHoat (12 khoá; Quản trị viên 13)', () => {
      const staff = toAccountDetail(system, doctor, link);
      expect(Object.keys(staff)).toHaveLength(12);
      expect(staff).toMatchObject({ lienKetKichHoat: link });
      const admin = toAccountDetail(system, branchAdmin, null);
      expect(Object.keys(admin)).toHaveLength(13);
      expect(admin).toMatchObject({ lienKetKichHoat: null });
    });

    it('chi tiết Bệnh nhân giống hệt danh sách, KHÔNG có lienKetKichHoat (Chi nhánh: 8 khoá, Toàn hệ thống: 13)', () => {
      expect(toAccountDetail(branch, row(), link)).toEqual(
        toAccountView(branch, row()),
      );
      expect(Object.keys(toAccountDetail(branch, row(), link))).toHaveLength(8);
      expect(Object.keys(toAccountDetail(system, row(), link))).toHaveLength(
        13,
      );
    });

    it('ngoài lienKetKichHoat, chi tiết nhân sự bằng đúng dòng của danh sách', () => {
      const { lienKetKichHoat: _link, ...rest } = toAccountDetail(
        branch,
        doctor,
        null,
      ) as ReturnType<typeof toAccountView> & { lienKetKichHoat: unknown };
      expect(rest).toEqual(toAccountView(branch, doctor));
    });
  });
});

describe('TKB17-21 (TK A2, B14) — toActivationLinkView: chỉ trạng thái dẫn xuất và hạn', () => {
  const NOW = new Date('2026-11-18T05:00:00.000Z');
  const facts = (overrides: object = {}) => ({
    daDungLuc: null,
    daGuiLuc: new Date('2026-11-18T01:00:00.000Z'),
    thuHoiLuc: null,
    hetHanLuc: new Date('2026-11-19T01:00:00.000Z'),
    ...overrides,
  });

  it('còn hạn ⇒ HOP_LE kèm hạn', () => {
    expect(toActivationLinkView(facts(), NOW)).toEqual({
      trangThai: 'HOP_LE',
      hetHanLuc: new Date('2026-11-19T01:00:00.000Z'),
    });
  });

  it('đúng mốc hết hạn ⇒ HET_HAN (hạn là nửa mở); trước mốc 1 mili giây ⇒ vẫn HOP_LE', () => {
    const edge = facts({ hetHanLuc: NOW });
    expect(toActivationLinkView(edge, NOW)?.trangThai).toBe('HET_HAN');
    expect(
      toActivationLinkView(edge, new Date(NOW.getTime() - 1))?.trangThai,
    ).toBe('HOP_LE');
  });

  it('chỉ có HAI trạng thái hợp lệ để hiển thị; mọi trạng thái khác ⇒ null', () => {
    expect(toActivationLinkView(facts({ daDungLuc: NOW }), NOW)).toBeNull();
    expect(toActivationLinkView(facts({ thuHoiLuc: NOW }), NOW)).toBeNull();
    expect(toActivationLinkView(facts({ daGuiLuc: null }), NOW)).toBeNull();
  });

  it('chỉ có hai khoá trangThai và hetHanLuc (không id, không băm)', () => {
    const result = toActivationLinkView(
      { ...facts(), maBam: 'x'.repeat(64), maXacThucId: '9' } as never,
      NOW,
    );
    expect(Object.keys(result!).sort()).toEqual(['hetHanLuc', 'trangThai']);
  });
});
