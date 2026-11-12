import type { DataSource } from 'typeorm';
import type { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { KhungGio } from '../../admin/entities/khung-gio.entity.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { T0 } from '../../auth/testing/otp-int-helpers.js';
import { DoctorFixtures } from '../../doctor/testing/doctor-fixtures.js';
import { insertRelativeRow } from '../../patient/testing/relatives-helpers.js';

// Hạ tầng test dùng chung của module booking (PLAN booking 5.15; TRACKING 3.6 P2-F). BỌC `DoctorFixtures` (chính nó bọc `AdminFixtures`), KHÔNG chép: chi nhánh, bác sĩ,
// ca, khung giờ, Bệnh nhân đều do hai lớp đó dựng. Ghi thật vào DB test (`lich_hen`, `khung_gio` bằng SQL/entity trong `testing/`: AR-01 bỏ qua thư mục này).
// Mọi số tiền, ngày, giá trị cấu hình trong file này là MINH HOẠ cho test, không phải quyết định của nhóm.

/** Đồng hồ ứng dụng giả của `useIntegrationHooks` (08:00 giờ Việt Nam, 02/11/2026); cùng giá trị với T0 của doctor. */
export const BOOKING_T0 = T0;
/** Ngày có khung giờ đặt được (sau `BOOKING_T0`; đủ 7 thứ đều có lịch hoạt động nên thứ nào cũng đặt được). */
export const BOOKABLE_DAY = '2026-11-10';
/** Thời hạn giữ chỗ mặc định của lịch `ChoThanhToan` trong fixture, khớp `thoiGianGiuCho` của `systemConfig`. */
export const HOLD_MINUTES = 15;

const SLOT_BOOKED_STATES: readonly TrangThaiLichHen[] = [
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'VangMat',
];

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let codeCounter = 0;

/**
 * Mã lịch hẹn ĐÚNG dạng Q13 (`CLX-20261110-` + năm ký tự Crockford), duy nhất trong một tiến trình (bộ đếm, không ngẫu nhiên nên không có xác suất trùng làm test chập chờn).
 * Mặc định cũ của `AdminFixtures.appointment` là 20 ký tự hex chữ thường: `ParseAppointmentCodePipe` (B2) sẽ 404 với mã đó, nên mọi lịch dựng qua `appointmentIn`
 * mặc định dùng mã này để route `:maLichHen` của B2, B3, B4, B5, B10 gọi được bằng mã của fixture.
 */
export function nextAppointmentCode(): string {
  codeCounter += 1;
  let rest = codeCounter;
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    suffix = `${CROCKFORD.charAt(rest % 32)}${suffix}`;
    rest = Math.floor(rest / 32);
  }
  return `CLX-20261110-${suffix}`;
}

export interface AppointmentInput {
  /** Bác sĩ phụ trách (chi nhánh, dịch vụ của lịch lấy từ đây) */
  doctor: BacSi;
  khungGioId: string;
  patientId: string;
  hoSoNguoiThanId?: string | null;
  /** Chỉ dùng khi `ChoThanhToan`; mặc định `BOOKING_T0 + HOLD_MINUTES` */
  hanThanhToan?: Date;
  giaSnapshot?: string;
  tienCocSnapshot?: string;
  chinhSachHoanSnapshot?: Record<string, unknown> | null;
  /** Mặc định `nextAppointmentCode()` */
  maLichHen?: string;
  /** Mặc định `NULL` (lý do khám là tuỳ chọn, Q9) */
  lyDoKham?: string | null;
}

export interface SlotState {
  trangThai: string;
  /** 'YYYY-MM-DD HH:MM:SS' (DATE_FORMAT, không lệch múi giờ) hoặc null */
  giuChoDen: string | null;
}

export class BookingFixtures {
  readonly doctor: DoctorFixtures;
  readonly admin: AdminFixtures;

  constructor(private readonly db: DataSource) {
    this.doctor = new DoctorFixtures(db);
    this.admin = this.doctor.admin;
  }

  /** Dòng `cau_hinh_he_thong` duy nhất (id = 1); gọi lại thì CẬP NHẬT (không thêm dòng). Giá trị minh hoạ. */
  async systemConfig(overrides: Partial<CauHinhHeThong> = {}) {
    const repo = this.db.getRepository(CauHinhHeThong);
    return repo.save(
      repo.create({
        id: 1,
        thoiGianGiuCho: HOLD_MINUTES,
        soLichHenToiDaMoiHoSo: 3,
        soLanTuDoiLichToiDa: 0,
        checkInTruocPhut: 30,
        checkInSauPhut: 15,
        nguongNoShow: 3,
        soNgayBaoTruocDoiGioLam: 3,
        trongSoW1: '0.60',
        trongSoW2: '0.40',
        ...overrides,
      }),
    );
  }

  /** `count` Bệnh nhân (mỗi người có `benh_nhan` và `vi_noi_bo`), dựng tuần tự để tên và email không đụng nhau. */
  async patients(count: number) {
    const created = [];
    for (let i = 0; i < count; i += 1) created.push(await this.admin.patient());
    return created;
  }

  /** Hồ sơ người thân của một Bệnh nhân (chèn thẳng, kể cả đã ngừng). Trả `ho_so_nguoi_than_id` dạng chuỗi. */
  relative(
    patientId: string,
    input: { active?: boolean; hoTen?: string } = {},
  ): Promise<string> {
    return insertRelativeRow(this.db, patientId, {
      hoTen: input.hoTen ?? 'Người thân mẫu',
      active: input.active ?? true,
    });
  }

  /**
   * Thế giới đặt được: một chi nhánh đủ 7 thứ, bác sĩ đủ điều kiện công khai, Lễ tân, hai Quản trị viên (`DoctorFixtures.world`), một dòng cấu hình, một Bệnh nhân
   * kèm ví, hồ sơ người thân đang hiệu lực và một đã ngừng, và một ca ở `BOOKABLE_DAY` với đủ khung giờ `ConTrong` (`slotIds`, 8 ô 30 phút nếu ca sáng).
   */
  async world(input: { ngay?: string; ca?: 'CaSang' | 'CaChieu' } = {}) {
    const base = await this.doctor.world();
    const config = await this.systemConfig();
    const patient = await this.admin.patient();
    const patientId = patient.account.taiKhoanId;
    const relativeId = await this.relative(patientId);
    const stoppedRelativeId = await this.relative(patientId, {
      active: false,
      hoTen: 'Người thân đã ngừng',
    });
    const { shift, slotIds } = await this.doctor.shiftWithSlots(
      base.doctor.profile,
      { ngay: input.ngay ?? BOOKABLE_DAY, ca: input.ca ?? 'CaSang' },
    );
    return {
      ...base,
      config,
      patient,
      relativeId,
      stoppedRelativeId,
      shift,
      slotIds,
    };
  }

  /**
   * Lịch hẹn ở trạng thái `trangThai` KÈM khung giờ ở trạng thái nhất quán (INV-2, INV-3 của PLAN 5.2):
   * `ChoThanhToan` ⇒ khung giờ `DangGiuCho` và `giu_cho_den` = `han_thanh_toan`; `DaXacNhan`, `DaTiepDon`, `HoanThanh`, `VangMat` ⇒ `DaDat`, `giu_cho_den` NULL;
   * `DaHuy`, `DaDoiLich` ⇒ `ConTrong`, `giu_cho_den` NULL (lịch huỷ vẫn giữ `khung_gio_id` nhưng không giữ khung giờ).
   */
  async appointmentIn(
    trangThai: TrangThaiLichHen,
    input: AppointmentInput,
  ): Promise<LichHen> {
    const slot = await this.db
      .getRepository(KhungGio)
      .findOneByOrFail({ khungGioId: input.khungGioId });
    const pending = trangThai === 'ChoThanhToan';
    const han = pending
      ? (input.hanThanhToan ??
        new Date(BOOKING_T0.getTime() + HOLD_MINUTES * 60 * 1000))
      : null;
    const appointment = await this.admin.appointment(
      input.doctor,
      slot,
      input.patientId,
      {
        trangThai,
        hoSoNguoiThanId: input.hoSoNguoiThanId ?? null,
        hanThanhToan: han,
        ...(trangThai === 'DaHuy'
          ? { thoiDiemHuy: BOOKING_T0, lyDoHuy: 'Fixture huỷ lịch' }
          : {}),
        ...(input.giaSnapshot ? { giaSnapshot: input.giaSnapshot } : {}),
        ...(input.tienCocSnapshot
          ? { tienCocSnapshot: input.tienCocSnapshot }
          : {}),
        ...(input.chinhSachHoanSnapshot !== undefined
          ? { chinhSachHoanSnapshot: input.chinhSachHoanSnapshot }
          : {}),
        maLichHen: input.maLichHen ? input.maLichHen : nextAppointmentCode(),
        ...(input.lyDoKham === undefined ? {} : { lyDoKham: input.lyDoKham }),
      },
    );
    const slotStatus = pending
      ? 'DangGiuCho'
      : SLOT_BOOKED_STATES.includes(trangThai)
        ? 'DaDat'
        : 'ConTrong';
    await this.db.query(
      'UPDATE khung_gio SET trang_thai = ?, giu_cho_den = ? WHERE khung_gio_id = ?',
      [slotStatus, han, input.khungGioId],
    );
    return appointment;
  }

  /**
   * Đặt cọc của một dịch vụ khám (chuỗi decimal, ví dụ `'50000.00'`) và, nếu có, các mốc hoàn `[số giờ trước tối thiểu, tỉ lệ hoàn %]` của nó (task B8, TRACKING 3.21 câu (h)): dựng dữ liệu cọc > 0
   * cho test mà không đụng seed `booking-demo` (P2b). Gọi lại sẽ THAY cả bộ mốc của dịch vụ đó.
   */
  async depositService(
    dichVuKhamId: string,
    tienCoc: string,
    tiers: readonly (readonly [number, number])[] = [],
  ): Promise<void> {
    await this.db.query(
      'UPDATE dich_vu_kham SET muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
      [tienCoc, dichVuKhamId],
    );
    await this.db.query('DELETE FROM moc_hoan_tien WHERE dich_vu_kham_id = ?', [
      dichVuKhamId,
    ]);
    for (const [soGio, tyLe] of tiers)
      await this.db.query(
        'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, ?, ?)',
        [dichVuKhamId, soGio, tyLe],
      );
  }

  /** Trạng thái hiện tại của một khung giờ (cho test kiểm trước và sau). */
  async slotState(khungGioId: string): Promise<SlotState> {
    const rows: { trangThai: string; giuChoDen: string | null }[] =
      await this.db.query(
        `SELECT trang_thai AS trangThai, DATE_FORMAT(giu_cho_den, '%Y-%m-%d %H:%i:%s') AS giuChoDen
           FROM khung_gio WHERE khung_gio_id = ?`,
        [khungGioId],
      );
    const row = rows[0];
    if (!row) throw new Error(`Không có khung giờ ${khungGioId}`);
    return row;
  }
}
