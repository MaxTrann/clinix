import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ScheduleRowValue } from './branch-diff.js';

// Phát hiện ảnh hưởng khi đổi lịch hoạt động hay bỏ dịch vụ của chi nhánh (admin B8; PLAN admin 5.4; quy tắc 30). CHỈ ĐỌC (trừ `lockSlotsOfDays`).
// Mỗi câu SQL là đúng một "truy vấn mẫu" cuối `docs/database/clinix_mysql.sql`, chạy cho TỪNG thứ đổi và TỪNG dịch vụ bỏ, với mốc `tuLuc`
// (lúc gửi: bây giờ; B10, B11 gọi lại với `hieu_luc_tu`). Không tự xoá, hủy hay hoàn tiền thứ gì (Q7).

export type LyDoAnhHuong = 'NgayNghi' | 'NgoaiGioHoatDong' | 'BoDichVu';

export interface AffectedAppointment {
  lichHenId: string;
  maLichHen: string;
  /** 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam */
  thoiGian: string;
  lyDoAnhHuong: LyDoAnhHuong;
}

export interface AffectedShift {
  lichLamViecId: string;
  bacSiId: string;
  /** 'YYYY-MM-DD' */
  ngay: string;
  ca: string;
}

export interface FreeSlotOutside {
  khungGioId: string;
  ngayGio: string;
  bacSiId: string;
  ca: string;
}

export interface BranchImpact {
  /** Lịch hẹn ChoThanhToan/DaXacNhan bị ảnh hưởng: một dòng mỗi lịch hẹn */
  lichHen: AffectedAppointment[];
  /** Ca tương lai không còn khoảng tương ứng: cũng là ảnh hưởng (Q7) */
  ca: AffectedShift[];
  /** Khung giờ ConTrong ngoài lịch mới: chỉ liệt kê để cảnh báo, không phải ảnh hưởng (booking chặn đặt, Q6) */
  khungGioTrong: FreeSlotOutside[];
}

export interface ImpactInput {
  chiNhanhId: string;
  tuLuc: Date;
  /** Dòng MỚI của từng thứ đổi */
  changedDays: readonly ScheduleRowValue[];
  removedServiceIds: readonly string[];
}

// Ưu tiên lý do khi một lịch hẹn có nhiều lý do (CN-37; khoá chính (yêu cầu, lịch hẹn) của bảng chụp chỉ cho một dòng)
const PRIORITY: Record<LyDoAnhHuong, number> = {
  NgayNghi: 0,
  NgoaiGioHoatDong: 1,
  BoDichVu: 2,
};

// Điều kiện "[thời điểm, thời điểm + thời lượng] nằm TRỌN trong khoảng mới của ca" (quy tắc 29, 30); tham số: bd sáng, kt sáng, bd chiều, kt chiều.
// Khoảng không còn (`NULL`) làm cả vế thành NULL, COALESCE về 0 ⇒ "không nằm trọn" ⇒ ảnh hưởng.
const insideNewPeriod = (time: string) => `COALESCE(
      (v.ca = 'CaSang' AND TIME(${time}) >= CAST(? AS TIME) AND ADDTIME(TIME(${time}), SEC_TO_TIME(d.thoi_luong * 60)) <= CAST(? AS TIME))
      OR (v.ca = 'CaChieu' AND TIME(${time}) >= CAST(? AS TIME) AND ADDTIME(TIME(${time}), SEC_TO_TIME(d.thoi_luong * 60)) <= CAST(? AS TIME)), 0)`;

export const APPOINTMENTS_BY_DAY_SQL = `SELECT CAST(lh.lich_hen_id AS CHAR) AS lichHenId, lh.ma_lich_hen AS maLichHen,
       DATE_FORMAT(lh.thoi_gian, '%Y-%m-%d %H:%i:%s') AS thoiGian, IF(? = 0, 'NgayNghi', 'NgoaiGioHoatDong') AS lyDoAnhHuong
  FROM lich_hen lh
  JOIN dich_vu_kham d ON d.dich_vu_kham_id = lh.dich_vu_kham_id
  JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id
  JOIN lich_lam_viec v ON v.lich_lam_viec_id = kg.lich_lam_viec_id
 WHERE lh.chi_nhanh_id = ? AND lh.trang_thai IN ('ChoThanhToan', 'DaXacNhan') AND lh.thoi_gian >= ?
   AND WEEKDAY(lh.thoi_gian) + 1 = ?
   AND (? = 0 OR NOT ${insideNewPeriod('lh.thoi_gian')})`;

export const SHIFTS_BY_DAY_SQL = `SELECT CAST(v.lich_lam_viec_id AS CHAR) AS lichLamViecId, CAST(v.bac_si_id AS CHAR) AS bacSiId,
       DATE_FORMAT(v.ngay, '%Y-%m-%d') AS ngay, v.ca AS ca
  FROM lich_lam_viec v
 WHERE v.chi_nhanh_id = ? AND v.ngay >= DATE(?) AND WEEKDAY(v.ngay) + 1 = ?
   AND (? = 0 OR (v.ca = 'CaSang' AND ? IS NULL) OR (v.ca = 'CaChieu' AND ? IS NULL) OR v.ca NOT IN ('CaSang', 'CaChieu'))`;

export const FREE_SLOTS_BY_DAY_SQL = `SELECT CAST(kg.khung_gio_id AS CHAR) AS khungGioId, DATE_FORMAT(kg.ngay_gio, '%Y-%m-%d %H:%i:%s') AS ngayGio,
       CAST(v.bac_si_id AS CHAR) AS bacSiId, v.ca AS ca
  FROM khung_gio kg
  JOIN lich_lam_viec v ON v.lich_lam_viec_id = kg.lich_lam_viec_id
  JOIN bac_si b ON b.tai_khoan_id = v.bac_si_id
  JOIN dich_vu_kham d ON d.dich_vu_kham_id = b.dich_vu_kham_id
 WHERE v.chi_nhanh_id = ? AND kg.trang_thai = 'ConTrong' AND kg.ngay_gio >= ? AND WEEKDAY(kg.ngay_gio) + 1 = ?
   AND (? = 0 OR NOT ${insideNewPeriod('kg.ngay_gio')})`;

export const APPOINTMENTS_BY_REMOVED_SERVICE_SQL = `SELECT CAST(lh.lich_hen_id AS CHAR) AS lichHenId, lh.ma_lich_hen AS maLichHen,
       DATE_FORMAT(lh.thoi_gian, '%Y-%m-%d %H:%i:%s') AS thoiGian, 'BoDichVu' AS lyDoAnhHuong
  FROM lich_hen lh
 WHERE lh.chi_nhanh_id = ? AND lh.dich_vu_kham_id = ? AND lh.trang_thai IN ('ChoThanhToan', 'DaXacNhan') AND lh.thoi_gian >= ?`;

@Injectable()
export class BranchImpactService {
  /**
   * Khoá `FOR UPDATE` mọi khung giờ tương lai của chi nhánh ở các thứ đổi, TRƯỚC khi đọc lịch hẹn (chống chạy đua với booking, TRACKING 9B.3).
   * Booking tạo lịch hẹn khoá `khung_gio` rồi mới đọc lịch chi nhánh: ai giữ khung giờ trước thì bên kia chờ, rồi thấy kết quả đã commit của bên trước.
   * `FOR UPDATE OF kg`: chỉ khoá `khung_gio`, không khoá `lich_lam_viec` (tránh chu trình với luồng gỡ ca của doctor). Sắp theo khoá chính để thứ tự khoá cố định.
   */
  async lockSlotsOfDays(
    em: EntityManager,
    chiNhanhId: string,
    tuLuc: Date,
    days: readonly number[],
  ): Promise<void> {
    if (days.length === 0) return;
    await em.query(
      `SELECT kg.khung_gio_id
         FROM khung_gio kg
         JOIN lich_lam_viec v ON v.lich_lam_viec_id = kg.lich_lam_viec_id
        WHERE v.chi_nhanh_id = ? AND kg.ngay_gio >= ? AND WEEKDAY(kg.ngay_gio) + 1 IN (${days.map(() => '?').join(', ')})
        ORDER BY kg.khung_gio_id
        FOR UPDATE OF kg`,
      [chiNhanhId, tuLuc, ...days],
    );
  }

  async compute(em: EntityManager, input: ImpactInput): Promise<BranchImpact> {
    const appointments = new Map<string, AffectedAppointment>();
    const keep = (row: AffectedAppointment) => {
      const existing = appointments.get(row.lichHenId);
      if (
        !existing ||
        PRIORITY[row.lyDoAnhHuong] < PRIORITY[existing.lyDoAnhHuong]
      )
        appointments.set(row.lichHenId, row);
    };
    const shifts: AffectedShift[] = [];
    const freeSlots: FreeSlotOutside[] = [];

    for (const day of input.changedDays) {
      const active = day.hoatDong === true ? 1 : 0;
      const periods = [
        day.gioBatDauSang,
        day.gioKetThucSang,
        day.gioBatDauChieu,
        day.gioKetThucChieu,
      ];
      const rows: AffectedAppointment[] = await em.query(
        APPOINTMENTS_BY_DAY_SQL,
        [
          active,
          input.chiNhanhId,
          input.tuLuc,
          day.thuTrongTuan,
          active,
          ...periods,
        ],
      );
      rows.forEach(keep);
      shifts.push(
        ...((await em.query(SHIFTS_BY_DAY_SQL, [
          input.chiNhanhId,
          input.tuLuc,
          day.thuTrongTuan,
          active,
          day.gioBatDauSang,
          day.gioBatDauChieu,
        ])) as AffectedShift[]),
      );
      freeSlots.push(
        ...((await em.query(FREE_SLOTS_BY_DAY_SQL, [
          input.chiNhanhId,
          input.tuLuc,
          day.thuTrongTuan,
          active,
          ...periods,
        ])) as FreeSlotOutside[]),
      );
    }
    for (const serviceId of input.removedServiceIds) {
      const rows: AffectedAppointment[] = await em.query(
        APPOINTMENTS_BY_REMOVED_SERVICE_SQL,
        [input.chiNhanhId, serviceId, input.tuLuc],
      );
      rows.forEach(keep);
    }

    const byTimeThenId = <T extends { id: string; at: string }>(a: T, b: T) =>
      a.at.localeCompare(b.at) ||
      a.id.length - b.id.length ||
      a.id.localeCompare(b.id);
    return {
      lichHen: [...appointments.values()].sort((a, b) =>
        byTimeThenId(
          { id: a.lichHenId, at: a.thoiGian },
          { id: b.lichHenId, at: b.thoiGian },
        ),
      ),
      ca: shifts.sort((a, b) =>
        byTimeThenId(
          { id: a.lichLamViecId, at: a.ngay },
          { id: b.lichLamViecId, at: b.ngay },
        ),
      ),
      khungGioTrong: freeSlots.sort((a, b) =>
        byTimeThenId(
          { id: a.khungGioId, at: a.ngayGio },
          { id: b.khungGioId, at: b.ngayGio },
        ),
      ),
    };
  }
}
