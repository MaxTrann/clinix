import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { CaLamViec } from '../../admin/entities/enums.js';
import { toSecond, weekdayVN } from '../../common/time/time.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import type { StoredSlotStatus } from '../../scheduling/slots/slot-status.rules.js';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../../search/common/public-doctor.sql.js';
import { findActiveAppointments } from '../active-appointment.query.js';
import { findOverlappingAppointments } from '../overlapping-appointment.query.js';
import {
  DOCTOR_LEAVE_PORT,
  type DoctorLeavePort,
} from '../ports/doctor-leave.port.js';
import {
  PENDING_BRANCH_CHANGES_PORT,
  type PendingBranchChangesPort,
} from '../ports/pending-branch-changes.port.js';
import type { BookabilityFacts, SlotHolderRef } from './bookability.rules.js';
import {
  lockDoctorShared,
  lockSlot,
  parseVnDateTime,
  type LockedSlot,
  type SlotRow,
} from './slot-lock.js';

// `BookabilityReader`: lấy `facts` cho `evaluateBookability` (PLAN booking 5.4 bước 3; TRACKING 3.14 B6-C, 3.14.2) ở HAI chế độ:
//  - `none`: ĐỌC THƯỜNG, không khoá gì (`POST /booking/checks`, B7: kết quả chỉ để thông tin, quyết định thật ở bước tạo);
//  - `locked`: xin `bac_si FOR SHARE` (tầng 4) rồi `khung_gio FOR UPDATE` (tầng 5) TRƯỚC mọi câu đọc thường còn lại (B8, trong giao dịch của B8). Tầng 2, 3 (`benh_nhan`,
//    `ho_so_nguoi_than`) do B8 xin trước. Không có khoá tầng 6 (`lich_hen`) nào ở đây.
// Reader CHỈ ĐỌC (không ghi gì), nhận `em` của người gọi và KHÔNG mở giao dịch. Đọc mọi dữ kiện (khoảng 8 câu, đều rẻ) rồi để luật thuần quyết định lỗi đầu tiên.

export type BookabilityMode = 'none' | 'locked';

export interface BookabilityInput {
  khungGioId: string;
  benhNhanId: string;
  /** `null` là hồ sơ BẢN THÂN */
  hoSoNguoiThanId: string | null;
  /** Từ `readNoShowLock`: B8 đọc ở chế độ `locked` (tầng 2), B7 ở chế độ `none` */
  noShowLocked: boolean;
  /** `cau_hinh_he_thong.so_lich_hen_toi_da_moi_ho_so`, người gọi đọc bằng `SystemConfigService` */
  soLichHenToiDa: number;
  /** `toSecond(nowVN())`: MỘT mốc cho cả luồng */
  now: Date;
}

export type BookabilityRead =
  /** Không có khung giờ (người gọi đổi thành 404 `KHUNG_GIO_KHONG_TON_TAI`), hoặc khung giờ bị xoá trong lúc chờ khoá */
  | { kind: 'SlotNotFound' }
  | {
      kind: 'Read';
      facts: BookabilityFacts;
      /** Có ở chế độ `locked`: bằng chứng đã khoá khung giờ, để B6b ghi trạng thái */
      locked: LockedSlot | null;
    };

interface LocatedRow {
  bacSiId: string;
  chiNhanhCaId: string;
  ca: CaLamViec;
  ngayCa: string;
  khungGioId: string;
  lichLamViecId: string;
  ngayGio: string;
  trangThai: StoredSlotStatus;
  giuChoDen: string | null;
}

interface DoctorRow {
  chiNhanhId: string;
  dichVuKhamId: string;
  thoiLuong: number | string;
  khaDung: number | string;
}

// DATE_FORMAT: chuỗi giờ VN nguyên văn (không để driver đổi), cột `DATE` của ca cũng vậy (H13, doctor M4).
const DATE_TIME_FORMAT = "'%Y-%m-%d %H:%i:%s'";

// Đọc thường: khung giờ ⋈ ca. Ca không đổi sau khi tạo (bác sĩ, chi nhánh, ngày, buổi) nên đọc thường là đủ để biết khoá `bac_si` nào cần xin; ở chế độ `locked`
// trạng thái khung giờ được đọc LẠI dưới khoá bằng `lockSlot`.
const LOCATE_SLOT_SQL = `SELECT CAST(llv.bac_si_id AS CHAR) AS bacSiId, CAST(llv.chi_nhanh_id AS CHAR) AS chiNhanhCaId, llv.ca AS ca,
  DATE_FORMAT(llv.ngay, '%Y-%m-%d') AS ngayCa, CAST(kg.khung_gio_id AS CHAR) AS khungGioId, CAST(kg.lich_lam_viec_id AS CHAR) AS lichLamViecId,
  DATE_FORMAT(kg.ngay_gio, ${DATE_TIME_FORMAT}) AS ngayGio, kg.trang_thai AS trangThai, DATE_FORMAT(kg.giu_cho_den, ${DATE_TIME_FORMAT}) AS giuChoDen
FROM khung_gio kg
JOIN lich_lam_viec llv ON llv.lich_lam_viec_id = kg.lich_lam_viec_id
WHERE kg.khung_gio_id = ?`;

// "Bác sĩ khả dụng" dùng đúng MỘT định nghĩa của search (`PUBLIC_DOCTOR_CONDITION`, quy ước alias b, t, ck). Hằng không có tham số `?` nên nối thẳng là an toàn.
const READ_DOCTOR_SQL = `SELECT CAST(b.chi_nhanh_id AS CHAR) AS chiNhanhId, CAST(b.dich_vu_kham_id AS CHAR) AS dichVuKhamId, d.thoi_luong AS thoiLuong,
  CASE WHEN ${PUBLIC_DOCTOR_CONDITION} THEN 1 ELSE 0 END AS khaDung
FROM ${PUBLIC_DOCTOR_FROM}
JOIN dich_vu_kham d ON d.dich_vu_kham_id = b.dich_vu_kham_id
WHERE b.tai_khoan_id = ?`;

// Lịch ĐANG giữ khung giờ, đọc THƯỜNG (không `FOR UPDATE`): khoá `lich_hen` chỉ theo khoá chính hoặc `ma_lich_hen` (PLAN 5.3 quy tắc 7, AR-05). Dưới khoá khung giờ nên
// không ai đổi người giữ trong lúc ta đọc (mọi luồng đổi lịch giữ đều xin `khung_gio` trước).
const READ_SLOT_HOLDER_SQL = `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, ma_lich_hen AS maLichHen
FROM lich_hen WHERE khung_gio_dang_giu = ?`;

const READ_NO_SHOW_SQL =
  'SELECT khoa_dat_lich_do_no_show AS khoa FROM benh_nhan WHERE tai_khoan_id = ?';
const READ_NO_SHOW_LOCKED_SQL = `${READ_NO_SHOW_SQL} FOR UPDATE`;

@Injectable()
export class BookabilityReader {
  constructor(
    @Inject(BranchHoursReader) private readonly branchHours: BranchHoursReader,
    @Inject(DOCTOR_LEAVE_PORT) private readonly leave: DoctorLeavePort,
    @Inject(PENDING_BRANCH_CHANGES_PORT)
    private readonly pendingChanges: PendingBranchChangesPort,
  ) {}

  /**
   * Cờ khoá đặt lịch do no-show của tài khoản đặt. `locked` là `FOR UPDATE` trên `benh_nhan` (TẦNG 2: B8 gọi đầu tiên trong giao dịch, trước `lockVisitProfile`); `none`
   * đọc thường (B7). `null` nếu không có hàng `benh_nhan` (B8 đổi thành 403).
   */
  async readNoShowLock(
    em: EntityManager,
    taiKhoanId: string,
    mode: BookabilityMode,
  ): Promise<boolean | null> {
    const rows = await em.query<{ khoa: number | string }[]>(
      mode === 'locked' ? READ_NO_SHOW_LOCKED_SQL : READ_NO_SHOW_SQL,
      [taiKhoanId],
    );
    const row = rows[0];
    // `boolean` của MySQL là tinyint: ra số 1 hoặc 0
    return row === undefined ? null : Number(row.khoa) === 1;
  }

  async read(
    em: EntityManager,
    input: BookabilityInput,
    mode: BookabilityMode,
  ): Promise<BookabilityRead> {
    const now = toSecond(input.now);

    // 1. Đọc thường để biết khoá `bac_si` nào cần xin (ngoài `locked` thì cũng là nguồn của khung giờ và ca)
    const located = (
      await em.query<LocatedRow[]>(LOCATE_SLOT_SQL, [input.khungGioId])
    )[0];
    if (located === undefined) return { kind: 'SlotNotFound' };

    // 2. Chế độ `locked`: tầng 4 rồi tầng 5, TRƯỚC mọi câu đọc thường còn lại; trạng thái khung giờ lấy LẠI dưới khoá
    let slot: SlotRow = {
      khungGioId: located.khungGioId,
      lichLamViecId: located.lichLamViecId,
      ngayGio: parseVnDateTime(located.ngayGio),
      trangThai: located.trangThai,
      giuChoDen:
        located.giuChoDen === null ? null : parseVnDateTime(located.giuChoDen),
    };
    let locked: LockedSlot | null = null;
    if (mode === 'locked') {
      if ((await lockDoctorShared(em, located.bacSiId)) === null)
        return { kind: 'SlotNotFound' };
      locked = await lockSlot(em, input.khungGioId);
      // Gỡ ca (doctor) có thể xoá khung giờ trong lúc ta chờ khoá `bac_si`: coi như không còn
      if (locked === null) return { kind: 'SlotNotFound' };
      slot = locked;
    }

    // 3. Các câu đọc thường còn lại (ở `locked` đều chạy DƯỚI khoá `bac_si` và `khung_gio`, nên nghỉ phép và đổi chi nhánh được kiểm trong lúc duyệt nghỉ bị chặn: H5)
    const doctorRow = (
      await em.query<DoctorRow[]>(READ_DOCTOR_SQL, [located.bacSiId])
    )[0];
    if (doctorRow === undefined) return { kind: 'SlotNotFound' };
    const thoiLuongPhut = Number(doctorRow.thoiLuong);

    const ngayHoatDong = await this.branchHours.load(
      em,
      located.chiNhanhCaId,
      weekdayVN(slot.ngayGio),
    );
    const blockingLeave = await this.leave.findBlockingLeave(em, {
      bacSiId: located.bacSiId,
      ngay: located.ngayCa,
      ca: located.ca,
    });
    const pendingBranchChange = await this.pendingChanges.findBlocking(em, {
      chiNhanhId: doctorRow.chiNhanhId,
      ngayGio: slot.ngayGio,
      thoiLuongPhut,
      dichVuKhamId: doctorRow.dichVuKhamId,
    });
    const slotHolder =
      slot.trangThai === 'DangGiuCho'
        ? ((
            await em.query<SlotHolderRef[]>(READ_SLOT_HOLDER_SQL, [
              slot.khungGioId,
            ])
          )[0] ?? null)
        : null;
    const activeAppointments = await findActiveAppointments(
      em,
      input.benhNhanId,
      input.hoSoNguoiThanId,
    );
    const overlaps = await findOverlappingAppointments(em, {
      benhNhanId: input.benhNhanId,
      hoSoNguoiThanId: input.hoSoNguoiThanId,
      batDau: slot.ngayGio,
      thoiLuongPhut,
    });

    return {
      kind: 'Read',
      locked,
      facts: {
        now,
        noShowLocked: input.noShowLocked,
        slot: {
          khungGioId: slot.khungGioId,
          ngayGio: slot.ngayGio,
          trangThai: slot.trangThai,
          giuChoDen: slot.giuChoDen,
        },
        slotHolder,
        doctor: {
          bacSiId: located.bacSiId,
          khaDung: Number(doctorRow.khaDung) === 1,
          chiNhanhId: doctorRow.chiNhanhId,
          dichVuKhamId: doctorRow.dichVuKhamId,
        },
        shift: { chiNhanhId: located.chiNhanhCaId, ca: located.ca },
        thoiLuongPhut,
        ngayHoatDong,
        blockingLeave,
        pendingBranchChange,
        activeAppointments,
        soLichHenToiDa: input.soLichHenToiDa,
        overlaps,
      },
    };
  }
}
