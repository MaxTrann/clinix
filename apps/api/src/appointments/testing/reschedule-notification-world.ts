import type { DataSource } from 'typeorm';
import {
  RESCHEDULE_NOTIFICATION_EVENTS,
  type RescheduleNotificationEvent,
} from '../appointments.constants.js';
import type { AppointmentEvent } from '../ports/appointment-notifier.port.js';

// Hạ tầng test dùng chung của thông báo đổi lịch và yêu cầu đổi lịch (reschedule B3; PLAN reschedule 5.10, 7.8, 7.10): các int-spec `reschedule-notifier` và `reschedule-mail` (và ca e2e) cùng dùng, để jscpd (vốn quét
// cả `*.int-spec.ts`) không thấy cùng một đoạn dựng ở nhiều file. KHÔNG sửa `notification-world.ts` (của booking B15). Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua (có `INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach`
// bằng SQL thẳng). Mọi giá trị là DỮ LIỆU GIẢ; hai chuỗi MARKER là "mồi" để chứng minh lý do khám và lý do yêu cầu KHÔNG lọt vào thông báo hay thư.

/** Lý do yêu cầu của bệnh nhân (`ly_do_yeu_cau`): không bao giờ được xuất hiện ở `noi_dung` hay thư. */
export const MARKER_LY_DO_YEU_CAU = 'MOI-LY-DO-YEU-CAU-4471';
/** Lý do khám (`lich_hen.ly_do_kham`): dữ liệu sức khoẻ, không bao giờ được xuất hiện ở `noi_dung` hay thư. */
export const MARKER_LY_DO_KHAM = 'MOI-LY-DO-KHAM-9023';

/** Giờ cũ và giờ mới minh hoạ (giờ Việt Nam): khung giờ số 0 và số 3 của `BookingFixtures.world()`. */
export const GIO_CU = new Date('2026-11-10T08:00:00+07:00');
export const GIO_MOI = new Date('2026-11-10T09:30:00+07:00');
/** Chữ của hai giờ trên theo `formatVnDateTime` */
export const GIO_CU_TEXT = '08:00 10/11/2026';
export const GIO_MOI_TEXT = '09:30 10/11/2026';

const { RESCHEDULED, REQUEST_PENDING, REQUEST_APPROVED, REQUEST_REJECTED } =
  RESCHEDULE_NOTIFICATION_EVENTS;

export interface RescheduleRequestInput {
  lichHenId: string;
  khungGioMongMuonId: string;
  lyDoYeuCau?: string;
  /** `ChoDuyet` (mặc định) hay đã xử lý (`DaDuyet`, `TuChoi`: cần `nguoiXuLyId`, thoả hai CHECK của bảng) */
  trangThai?: 'ChoDuyet' | 'DaDuyet' | 'TuChoi';
  nguoiXuLyId?: string;
}

/** Chèn thẳng MỘT dòng `yeu_cau_doi_lich_ngoai_chinh_sach` (dữ liệu dựng của test), trả id dạng chuỗi. Lý do mặc định là `MARKER_LY_DO_YEU_CAU`. */
export async function insertRescheduleRequest(
  db: DataSource,
  input: RescheduleRequestInput,
): Promise<string> {
  const handled =
    input.trangThai !== undefined && input.trangThai !== 'ChoDuyet';
  const result: { insertId: number | string } = await db.query(
    `INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach
       (lich_hen_id, khung_gio_mong_muon_id, ly_do_yeu_cau, trang_thai, ghi_chu_xu_ly, nguoi_xu_ly_id, thoi_diem_xu_ly, thoi_diem_tao)
     VALUES (?, ?, ?, ?, ?, ?, ?, '2026-11-02 08:00:00')`,
    [
      input.lichHenId,
      input.khungGioMongMuonId,
      input.lyDoYeuCau ?? MARKER_LY_DO_YEU_CAU,
      input.trangThai ?? 'ChoDuyet',
      handled ? 'Đã xử lý' : null,
      handled ? (input.nguoiXuLyId ?? null) : null,
      handled ? '2026-11-02 08:30:00' : null,
    ],
  );
  return String(result.insertId);
}

/** Sự kiện `LichHenDaDoiLich`: `lichHenMoiId` là lịch MỚI (người gọi truyền như B4, B7). */
export function rescheduledEvent(input: {
  lichHenMoiId: string;
  taiKhoanId: string;
  maLichHenCu: string;
  via?: 'TuDoi' | 'DoiHo';
  lyDo?: string;
}): AppointmentEvent {
  return {
    loaiSuKien: RESCHEDULED,
    lichHenId: input.lichHenMoiId,
    taiKhoanId: input.taiKhoanId,
    doiLich: {
      maLichHenCu: input.maLichHenCu,
      thoiGianCu: GIO_CU,
      thoiGianMoi: GIO_MOI,
      via: input.via ?? 'TuDoi',
      ...(input.lyDo === undefined ? {} : { lyDo: input.lyDo }),
    },
  };
}

type RequestLoai = Exclude<RescheduleNotificationEvent, typeof RESCHEDULED>;

/** Sự kiện của ba loại yêu cầu: `lichHenCuId` là lịch CŨ của yêu cầu (chỉ để đọc mã và giờ hiện tại). */
export function requestEvent(
  loai: RequestLoai,
  input: {
    lichHenCuId: string;
    taiKhoanId: string;
    yeuCauId: string;
    ghiChu?: string;
    maLichHenMoi?: string;
  },
): AppointmentEvent {
  return {
    loaiSuKien: loai,
    lichHenId: input.lichHenCuId,
    taiKhoanId: input.taiKhoanId,
    yeuCau: {
      yeuCauId: input.yeuCauId,
      thoiGianMongMuon: GIO_MOI,
      ...(input.ghiChu === undefined ? {} : { ghiChu: input.ghiChu }),
      ...(input.maLichHenMoi === undefined
        ? {}
        : { maLichHenMoi: input.maLichHenMoi, thoiGianMoi: GIO_MOI }),
    },
  };
}

/** Bộ ba loại yêu cầu theo thứ tự `[đang chờ, đã duyệt, bị từ chối]` để chạy `it.each`. */
export const REQUEST_LOAI: readonly RequestLoai[] = [
  REQUEST_PENDING,
  REQUEST_APPROVED,
  REQUEST_REJECTED,
];

export interface RescheduleNotificationRow {
  loai: string;
  taiKhoanId: string;
  lichHenId: string | null;
  yeuCauId: string | null;
  noiDung: string;
  emailTrangThai: string | null;
}

/** Mọi dòng `thong_bao` kèm cột yêu cầu đổi lịch và trạng thái dòng hộp thư đi (NULL nếu không có), theo thứ tự ghi. */
export function readRescheduleRows(
  db: DataSource,
): Promise<RescheduleNotificationRow[]> {
  return db.query(
    `SELECT t.loai_su_kien AS loai, CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId, CAST(t.lich_hen_id AS CHAR) AS lichHenId,
            CAST(t.yeu_cau_doi_lich_ngoai_chinh_sach_id AS CHAR) AS yeuCauId, t.noi_dung AS noiDung, e.trang_thai AS emailTrangThai
       FROM thong_bao t LEFT JOIN email_thong_bao e ON e.thong_bao_id = t.thong_bao_id
      ORDER BY t.thong_bao_id`,
  );
}
