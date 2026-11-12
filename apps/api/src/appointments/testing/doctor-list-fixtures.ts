import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type {
  MoiQuanHeNguoiThan,
  TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { insertTaiKhoan } from '../../auth/entities/testing/auth-fixtures.js';
import type { BookInput } from './appointment-list-fixtures.js';
import type { BookingFixtures } from './booking-fixtures.js';
import type { OperationsListFixtures } from './operations-list-fixtures.js';

// Hạ tầng test dùng chung của danh sách và chi tiết lịch hẹn cho BÁC SĨ (task B5; int-spec và e2e cùng dựng một "thế giới" để jscpd không thấy hai bản; TRACKING 3.20.3). BỌC `OperationsListFixtures.world()`
// (hai chi nhánh, ba bác sĩ, hai Bệnh nhân, một hồ sơ người thân), không sửa nó, rồi thêm ba thứ B5 cần mà thế giới đó chưa có: (1) người khám có ĐỦ ngày sinh, giới tính, SĐT (và người thân KHÔNG
// có SĐT), (2) lịch ở ca CHIỀU (`ca` là `lich_lam_viec.ca`, không suy từ giờ), (3) tài khoản `BacSi` không có hàng `bac_si`. Mọi tên, ngày sinh, SĐT là MINH HOẠ cho test (SĐT không phải số thật).

/**
 * Ngày riêng của hai lịch ca chiều (`bookAfternoon`): KHÔNG trùng ngày nào mà `OperationsListFixtures.world()` đặt lịch cho bác sĩ A1 (10, 11, 12, 13, 14, 15/11), nếu không hai nơi cùng tạo ca
 * làm việc của một bác sĩ trong một ngày.
 */
export const AFTERNOON_DAY = '2026-11-16';

/** Mã đúng dạng Q13 (năm ký tự Crockford, không có I, L, O, U); `c` là lịch ca chiều của bác sĩ A1. */
export const DOCTOR_CODES = {
  c1: 'CLX-20261116-CCC01',
  c2: 'CLX-20261116-CCC02',
} as const;

// Hình dạng phản hồi (danh sách trắng, Q33; TRACKING 3.20.1), đã sắp xếp: dùng chung của int-spec và e2e để hai nơi không chép mảng khoá. Khoá nào thêm hay mất là test đỏ.
export const DOCTOR_ROOT_KEYS = [
  'demTheoTrangThai',
  'items',
  'page',
  'pageSize',
  'total',
];
export const DOCTOR_ITEM_KEYS = [
  'ca',
  'chuyenKhoa',
  'dichVu',
  'lyDoKham',
  'maLichHen',
  'nguoiKham',
  'thoiGian',
  'trangThai',
];
export const DOCTOR_EXAMINEE_KEYS = [
  'gioiTinh',
  'hoTen',
  'ngaySinh',
  'quanHe',
  'soDienThoai',
];
// Chi tiết = dòng cộng `chiNhanh`, `ghiChuKham`, `ngayDat`; KHÔNG `lyDoHuy`
export const DOCTOR_DETAIL_KEYS = [
  ...DOCTOR_ITEM_KEYS,
  'chiNhanh',
  'ghiChuKham',
  'ngayDat',
].sort();
/** Sáu khoá của `demTheoTrangThai`, mọi giá trị 0: số đếm của bác sĩ không có lịch nào. */
export const ZERO_STATUS_COUNTS = {
  ChoThanhToan: 0,
  DaXacNhan: 0,
  DaTiepDon: 0,
  HoanThanh: 0,
  DaHuy: 0,
  VangMat: 0,
};
/** `ngay_gio` ISO UTC có mili giây (`Date.toISOString()`). */
export const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Ngày sinh ở các hằng dưới là mốc đầu hoặc cuối năm cố ý: nếu cột `date` bị đổi qua múi giờ (UTC+7) thì lệch một ngày và test đỏ. */
export interface PersonFields {
  gioiTinh: string;
  ngaySinh: string;
}

export interface RelativeFields extends PersonFields {
  moiQuanHe: MoiQuanHeNguoiThan;
  /** `null` = người thân không có SĐT: kết quả phải là `null`, KHÔNG rơi sang SĐT người đặt */
  soDienThoai: string | null;
}

/** Bệnh nhân một (người đặt a1, a2, c2): tài khoản CÓ ngày sinh và giới tính. Bệnh nhân hai giữ nguyên (cả hai để trống) để thử nhánh `null`. */
export const ONE_ACCOUNT_FIELDS: PersonFields = {
  gioiTinh: 'Nam',
  ngaySinh: '1990-01-01',
};
/** Người thân của Bệnh nhân một ở lịch a2: có quan hệ, ngày sinh, giới tính, KHÔNG có SĐT. Tên là `RELATIVE_NAME` của `OperationsListFixtures`. */
export const DAUGHTER_FIELDS: RelativeFields = {
  moiQuanHe: 'Con',
  gioiTinh: 'Nu',
  ngaySinh: '2008-01-01',
  soDienThoai: null,
};
export const MOTHER_NAME = 'Lê Thị Đào';
export const MOTHER_PHONE = '0933333333';
/** Người thân của Bệnh nhân hai ở lịch c1: CÓ SĐT riêng (khác SĐT người đặt) và tên có `Đ` (thử gấp `đ`). */
export const MOTHER_FIELDS: RelativeFields = {
  moiQuanHe: 'Me',
  gioiTinh: 'Nu',
  ngaySinh: '1962-12-31',
  soDienThoai: MOTHER_PHONE,
};

export class DoctorListFixtures {
  // Khung giờ còn trống của ca chiều theo `bác sĩ|ngày`: một ca làm việc mỗi (bác sĩ, ngày, ca)
  private readonly afternoonSlots = new Map<string, string[]>();

  constructor(
    private readonly fx: BookingFixtures,
    private readonly ofx: OperationsListFixtures,
    private readonly db: DataSource,
  ) {}

  /** Ghi ngày sinh và giới tính của TÀI KHOẢN (cột có thể để trống; `benh_nhan` không có hai cột này). */
  async setAccountFields(accountId: string, fields: PersonFields) {
    await this.db.query(
      'UPDATE tai_khoan SET gioi_tinh = ?, ngay_sinh = ? WHERE tai_khoan_id = ?',
      [fields.gioiTinh, fields.ngaySinh, accountId],
    );
  }

  /** Ghi đè các cột của MỘT hồ sơ người thân (họ tên giữ nguyên). */
  async setRelativeFields(relativeId: string, fields: RelativeFields) {
    await this.db.query(
      `UPDATE ho_so_nguoi_than SET moi_quan_he = ?, gioi_tinh = ?, ngay_sinh = ?, so_dien_thoai = ?
        WHERE ho_so_nguoi_than_id = ?`,
      [
        fields.moiQuanHe,
        fields.gioiTinh,
        fields.ngaySinh,
        fields.soDienThoai,
        relativeId,
      ],
    );
  }

  /** Đặt `thoi_diem_tao` (ngày đặt) bằng CHUỖI giờ VN `YYYY-MM-DD HH:mm:ss`: không qua múi giờ của driver. */
  async setCreatedAt(lichHenId: string, gio: string) {
    await this.db.query(
      'UPDATE lich_hen SET thoi_diem_tao = ? WHERE lich_hen_id = ?',
      [gio, lichHenId],
    );
  }

  /**
   * Lịch hẹn ở ca CHIỀU: ca làm việc `CaChieu` (8 khung giờ từ 13:00) tạo một lần cho mỗi (bác sĩ, ngày). Dùng ngày KHÁC các ngày đã đặt qua `AppointmentListFixtures.book` cho cùng bác sĩ
   * (`AFTERNOON_DAY` là ngày riêng của `world()`).
   */
  async bookAfternoon(
    doctor: BacSi,
    trangThai: TrangThaiLichHen,
    input: BookInput,
  ): Promise<LichHen> {
    const { ngay, ...rest } = input;
    return this.fx.appointmentIn(trangThai, {
      doctor,
      khungGioId: await this.nextAfternoonSlot(doctor, ngay),
      ...rest,
    });
  }

  /** Tài khoản `BacSi` KHÔNG có hàng `bac_si` (chưa tạo hoặc mất hồ sơ): không thể có lịch (khoá ngoại `lich_hen.bac_si_id`) nên danh sách phải rỗng và không lỗi (DSB-05). */
  doctorAccountOnly() {
    return insertTaiKhoan(this.db, {
      daXacMinhEmail: true,
      loaiTaiKhoan: 'BacSi',
    });
  }

  /**
   * `OperationsListFixtures.world()` cộng: người khám có đủ trường (Bệnh nhân một có ngày sinh và giới tính ở tài khoản, Bệnh nhân hai để trống; người thân a2 không SĐT; người thân của hai có SĐT) và
   * hai lịch ca chiều của bác sĩ A1: c1 DaXacNhan (Bệnh nhân hai đặt cho mẹ, có lý do khám), c2 DaTiepDon (Bệnh nhân một khám cho chính mình).
   * Lịch hiển thị của A1 theo giờ TĂNG dần: a1 (10/11 08:00), a2 (10/11 08:30), a6 (14/11), c1 (16/11 13:00), c2 (16/11 13:30); a5 (DaDoiLich) bị ẩn. A2: a3, a4, a7. Bác sĩ B: b1.
   */
  async world() {
    const w = await this.ofx.world();
    await this.setAccountFields(w.oneId, ONE_ACCOUNT_FIELDS);
    await this.setRelativeFields(w.relativeId, DAUGHTER_FIELDS);
    const motherId = await this.fx.relative(w.twoId, { hoTen: MOTHER_NAME });
    await this.setRelativeFields(motherId, MOTHER_FIELDS);
    const doctor = w.doctorA1.profile;
    const afternoon = {
      c1: await this.bookAfternoon(doctor, 'DaXacNhan', {
        patientId: w.twoId,
        ngay: AFTERNOON_DAY,
        hoSoNguoiThanId: motherId,
        maLichHen: DOCTOR_CODES.c1,
        lyDoKham: 'Ho kéo dài hai tuần',
      }),
      c2: await this.bookAfternoon(doctor, 'DaTiepDon', {
        patientId: w.oneId,
        ngay: AFTERNOON_DAY,
        maLichHen: DOCTOR_CODES.c2,
      }),
    };
    return { ...w, motherId, apps: { ...w.apps, ...afternoon } };
  }

  private async nextAfternoonSlot(doctor: BacSi, ngay: string) {
    const key = `${doctor.taiKhoanId}|${ngay}`;
    let slots = this.afternoonSlots.get(key);
    if (slots === undefined) {
      slots = (
        await this.fx.doctor.shiftWithSlots(doctor, { ngay, ca: 'CaChieu' })
      ).slotIds;
      this.afternoonSlots.set(key, slots);
    }
    const next = slots.shift();
    if (next === undefined)
      throw new Error(
        `Hết khung giờ ca chiều của bác sĩ ${doctor.taiKhoanId} ngày ${ngay}: dùng ngày khác`,
      );
    return next;
  }
}
