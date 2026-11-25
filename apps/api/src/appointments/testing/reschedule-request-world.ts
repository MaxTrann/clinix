import type { DataSource } from 'typeorm';
import type { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { BookingNotifier } from '../notifications/booking-notifier.js';
import type { AppointmentNotifier } from '../ports/appointment-notifier.port.js';
import { RescheduleRequestRepository } from '../reschedule/reschedule-request.repository.js';
import { RescheduleRequestService } from '../reschedule/reschedule-request.service.js';
import type { BookingFixtures } from './booking-fixtures.js';
import type {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
} from './fake-ports.js';
import { realRescheduleReader } from './reschedule-detail-world.js';

// Hạ tầng test dùng chung của TẠO yêu cầu đổi lịch trên MySQL THẬT (reschedule B5; PLAN reschedule 5.7, 7.2, 7.4): các int-spec `reschedule-request.service`, `reschedule-request.concurrency` và
// `patient-appointment-detail` cùng dựng một thế giới nên MỘT chỗ ở đây, để jscpd (vốn quét cả `*.int-spec.ts`) không thấy cùng một khối ở nhiều file. Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua
// (có `UPDATE lich_hen` và `UPDATE yeu_cau…` bằng SQL thẳng để dựng dữ liệu). Mọi giá trị là DỮ LIỆU GIẢ.

/** Lý do yêu cầu mặc định (hợp lệ: 5 đến 500 điểm mã). */
export const DEFAULT_REASON = 'Tôi có việc đột xuất vào đúng giờ đã đặt';

export interface RequestWorldOptions {
  config?: Partial<CauHinhHeThong>;
  /** `lich_hen.so_lan_tu_doi_lich` của lịch cũ; mặc định 2 = ĐÃ HẾT lần tự đổi (tối đa 2) nên đi nhánh yêu cầu */
  soLanTuDoiLich?: number;
  /** Mặc định `BookingNotifier` THẬT (ghi `thong_bao` và `email_thong_bao` bằng `em` của giao dịch) */
  notifier?: AppointmentNotifier;
  /** Trạng thái của lịch cũ; mặc định `DaXacNhan` */
  oldState?: TrangThaiLichHen;
  /** Chỉ số ô (0 đến 7) của lịch cũ và của khung giờ mong muốn; mặc định 0 (08:00) và 2 (09:00) */
  oldSlot?: number;
  targetSlot?: number;
  /** Lịch cũ của hồ sơ người thân đang dùng (`active`) hay đã ngừng (`stopped`); mặc định bản thân */
  relative?: 'active' | 'stopped';
  /** Hai cổng giả của reader để chặn nghỉ phép và vùng bị loại khi test cần */
  ports?: {
    leave?: FakeDoctorLeavePort;
    pending?: FakePendingBranchChangesPort;
  };
}

/**
 * Thế giới đặt được (`BookingFixtures.world`) + một lịch CŨ `DaXacNhan` của Bệnh nhân ở ô 0 (08:00 ngày 10/11/2026) + cấu hình `so_lan_tu_doi_lich_toi_da = 2` + dịch vụ `RescheduleRequestService` THẬT.
 * Khung giờ mong muốn mặc định là ô 2 (09:00) của CÙNG bác sĩ, `ConTrong`. Đồng hồ giả của `useIntegrationHooks` là 02/11/2026 08:00 giờ Việt Nam.
 */
export async function requestWorld(
  db: DataSource,
  fx: BookingFixtures,
  options: RequestWorldOptions = {},
) {
  const w = await fx.world();
  await fx.systemConfig({ soLanTuDoiLichToiDa: 2, ...options.config });
  const patientId = w.patient.account.taiKhoanId;
  const doctor = w.doctor.profile;
  const old = await fx.appointmentIn(options.oldState ?? 'DaXacNhan', {
    doctor,
    khungGioId: w.slotIds[options.oldSlot ?? 0]!,
    patientId,
    ...(options.relative === undefined
      ? {}
      : {
          hoSoNguoiThanId:
            options.relative === 'active' ? w.relativeId : w.stoppedRelativeId,
        }),
  });
  await setSelfRescheduleCount(db, old.lichHenId, options.soLanTuDoiLich ?? 2);
  const notifier = options.notifier ?? new BookingNotifier();
  const service = new RescheduleRequestService(
    db,
    realRescheduleReader(db, options.ports),
    new RescheduleRequestRepository(),
    notifier,
  );
  const target = w.slotIds[options.targetSlot ?? 2]!;
  const request = (
    extra: Partial<{
      maLichHen: string;
      khungGioMongMuonId: string;
      lyDoYeuCau: string;
      accountId: string;
    }> = {},
  ) =>
    service.create({
      maLichHen: old.maLichHen,
      khungGioMongMuonId: target,
      lyDoYeuCau: DEFAULT_REASON,
      accountId: patientId,
      ...extra,
    });
  return { ...w, patientId, doctor, old, service, notifier, target, request };
}

export type RequestWorld = Awaited<ReturnType<typeof requestWorld>>;

/** Đặt `lich_hen.so_lan_tu_doi_lich` của một lịch (dữ liệu dựng của test). */
export function setSelfRescheduleCount(
  db: DataSource,
  lichHenId: string,
  soLan: number,
): Promise<unknown> {
  return db.query(
    'UPDATE lich_hen SET so_lan_tu_doi_lich = ? WHERE lich_hen_id = ?',
    [soLan, lichHenId],
  );
}

export interface RequestRow {
  id: string;
  lichHenId: string;
  khungGioMongMuonId: string;
  lyDoYeuCau: string;
  trangThai: string;
  ghiChuXuLy: string | null;
  nguoiXuLyId: string | null;
  thoiDiemXuLy: string | null;
  thoiDiemTao: string;
}

const TS = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;

/** Mọi hàng `yeu_cau_doi_lich_ngoai_chinh_sach` theo id tăng dần (id là chuỗi, giờ là chuỗi giờ Việt Nam). */
export function requestRows(db: DataSource): Promise<RequestRow[]> {
  return db.query(
    `SELECT CAST(yeu_cau_doi_lich_ngoai_chinh_sach_id AS CHAR) AS id, CAST(lich_hen_id AS CHAR) AS lichHenId,
            CAST(khung_gio_mong_muon_id AS CHAR) AS khungGioMongMuonId, ly_do_yeu_cau AS lyDoYeuCau, trang_thai AS trangThai,
            ghi_chu_xu_ly AS ghiChuXuLy, CAST(nguoi_xu_ly_id AS CHAR) AS nguoiXuLyId, ${TS('thoi_diem_xu_ly')} AS thoiDiemXuLy,
            ${TS('thoi_diem_tao')} AS thoiDiemTao
       FROM yeu_cau_doi_lich_ngoai_chinh_sach ORDER BY yeu_cau_doi_lich_ngoai_chinh_sach_id`,
  );
}

/**
 * Chèn thẳng MỘT yêu cầu với `thoi_diem_tao` do test chọn (để dựng "nhiều yêu cầu theo thời gian" và ca hoà thời điểm); `DaDuyet` và `TuChoi` kèm ghi chú, người và thời điểm xử lý (thoả hai CHECK).
 * Trả id dạng chuỗi.
 */
export async function insertRequestAt(
  db: DataSource,
  input: {
    lichHenId: string;
    khungGioMongMuonId: string;
    thoiDiemTao: string;
    trangThai?: 'ChoDuyet' | 'DaDuyet' | 'TuChoi';
    nguoiXuLyId?: string;
    ghiChu?: string;
    lyDoYeuCau?: string;
  },
): Promise<string> {
  const trangThai = input.trangThai ?? 'ChoDuyet';
  const handled = trangThai !== 'ChoDuyet';
  const result: { insertId: number | string } = await db.query(
    `INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach
       (lich_hen_id, khung_gio_mong_muon_id, ly_do_yeu_cau, trang_thai, ghi_chu_xu_ly, nguoi_xu_ly_id, thoi_diem_xu_ly, thoi_diem_tao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.lichHenId,
      input.khungGioMongMuonId,
      input.lyDoYeuCau ?? DEFAULT_REASON,
      trangThai,
      handled ? (input.ghiChu ?? 'Đã xử lý') : null,
      handled ? (input.nguoiXuLyId ?? null) : null,
      handled ? input.thoiDiemTao : null,
      input.thoiDiemTao,
    ],
  );
  return String(result.insertId);
}

/** Nhân sự từ chối yêu cầu (dữ liệu dựng của test; thoả hai CHECK của bảng): `TuChoi` kèm ghi chú, người và thời điểm xử lý. */
export function markRequestRejected(
  db: DataSource,
  yeuCauId: string,
  input: { nguoiXuLyId: string; ghiChu?: string; luc?: string },
): Promise<unknown> {
  return db.query(
    `UPDATE yeu_cau_doi_lich_ngoai_chinh_sach
        SET trang_thai = 'TuChoi', ghi_chu_xu_ly = ?, nguoi_xu_ly_id = ?, thoi_diem_xu_ly = ?
      WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = ?`,
    [
      input.ghiChu ?? 'Bác sĩ không nhận thêm lịch giờ đó',
      input.nguoiXuLyId,
      input.luc ?? '2026-11-02 09:00:00',
      yeuCauId,
    ],
  );
}

/**
 * Ảnh chụp mọi thứ tạo yêu cầu KHÔNG ĐƯỢC đụng: lịch (mọi cột), khung giờ (trạng thái và hạn giữ), bộ đếm no-show. Bị từ chối hay hoàn tác thì ảnh sau BẰNG ảnh trước; thành công cũng bằng
 * (nhánh yêu cầu không ghi lịch hay khung giờ nào, Q7 (f)). Không gồm `yeu_cau`, `thong_bao`, `email_thong_bao` (đếm riêng bằng `requestRows`, `readThongBao`, `readEmails`).
 */
export async function untouchedState(db: DataSource) {
  return {
    lich: await db.query('SELECT * FROM lich_hen ORDER BY lich_hen_id'),
    khungGio: await db.query(
      `SELECT khung_gio_id, trang_thai, ${TS('giu_cho_den')} AS giu_cho_den FROM khung_gio ORDER BY khung_gio_id`,
    ),
    benhNhan: await db.query(
      'SELECT tai_khoan_id, so_lan_no_show, khoa_dat_lich_do_no_show FROM benh_nhan ORDER BY tai_khoan_id',
    ),
  };
}

/**
 * Dọn giữa các vòng đua (dùng lại MỘT thế giới): xoá hộp thư đi, thông báo, yêu cầu (khoá ngoại: hộp thư đi TRƯỚC) và mọi lịch KHÔNG nằm trong `keepLichHenIds` (lịch do vòng vừa đặt), rồi
 * đưa các khung giờ `resetSlotIds` về `ConTrong`.
 */
export async function resetRequestRound(
  db: DataSource,
  keepLichHenIds: readonly string[],
  resetSlotIds: readonly string[],
): Promise<void> {
  await db.query('DELETE FROM email_thong_bao');
  await db.query('DELETE FROM thong_bao');
  await db.query('DELETE FROM yeu_cau_doi_lich_ngoai_chinh_sach');
  const keep = keepLichHenIds.map(() => '?').join(', ');
  await db.query(`DELETE FROM lich_hen WHERE lich_hen_id NOT IN (${keep})`, [
    ...keepLichHenIds,
  ]);
  if (resetSlotIds.length > 0)
    await db.query(
      `UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL WHERE khung_gio_id IN (${resetSlotIds.map(() => '?').join(', ')})`,
      [...resetSlotIds],
    );
}

/** Số hàng của ba bảng ghi: yêu cầu, thông báo, hộp thư đi (để chứng minh "không ghi gì"). */
export async function writeCounts(db: DataSource) {
  const [row] = await db.query<
    { yeuCau: string; thongBao: string; email: string }[]
  >(
    `SELECT (SELECT COUNT(*) FROM yeu_cau_doi_lich_ngoai_chinh_sach) AS yeuCau,
            (SELECT COUNT(*) FROM thong_bao) AS thongBao,
            (SELECT COUNT(*) FROM email_thong_bao) AS email`,
  );
  return {
    yeuCau: Number(row?.yeuCau),
    thongBao: Number(row?.thongBao),
    email: Number(row?.email),
  };
}
