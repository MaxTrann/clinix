import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { VISIT_PROFILE_SELF } from '../../../appointments/lists/list-query.rules.js';
import type {
  ExamRecordRow,
  ExamineeRow,
  MonthCountsRow,
} from './patient-exam-records.mapper.js';
import {
  monthPeriods,
  yearPeriod,
  type Period,
} from './patient-exam-records.rules.js';

// SQL thô của danh sách hồ sơ khám của Bệnh nhân (doctor-exam B4; PLAN 5.6; XHS-01…XHS-05, XHS-08, XHS-15, XHS-16). Chỉ ĐỌC, không khoá. Mọi giá trị người dùng đi qua tham số `?`.
// Không ghi log: mã lịch, tên người khám, tên bác sĩ là dữ liệu cá nhân. Người gọi truyền `manager` của MỘT lần gọi `runReadOnly` nên cả bốn câu cùng ảnh chụp (XHS-17).

// Điều kiện CHỦ SỞ HỮU `lh.benh_nhan_id = ?` luôn ĐẦU TIÊN trong MỌI câu (từ access token): lịch của người khác không bao giờ được đọc, dù biết id hồ sơ người thân.
// Chỉ lịch `HoanThanh` (Q6: không cần có hồ sơ khám; lịch đã hoàn thành luôn nằm trong danh sách).
const COMPLETED = `lh.trang_thai = 'HoanThanh'`;

interface Where {
  sql: string;
  params: unknown[];
}

/** `examinee`: `null` = mọi người khám, `BanThan` hoặc id hồ sơ người thân (id không thuộc mình ⇒ không dòng nào, không lỗi). `period`: khoảng nửa mở trên `thoi_gian` (AR-05). */
function whereOf(
  patientId: string,
  examinee: string | null,
  period: Period | null,
): Where {
  const where = ['lh.benh_nhan_id = ?', COMPLETED];
  const params: unknown[] = [patientId];
  if (examinee === VISIT_PROFILE_SELF) {
    where.push('lh.ho_so_nguoi_than_id IS NULL');
  } else if (examinee !== null) {
    where.push('lh.ho_so_nguoi_than_id = ?');
    params.push(examinee);
  }
  if (period !== null) {
    where.push('lh.thoi_gian >= ?', 'lh.thoi_gian < ?');
    params.push(period.from, period.to);
  }
  return { sql: `WHERE ${where.join('\n  AND ')}`, params };
}

/**
 * Chuỗi nối `FROM lich_hen lh …` của MỘT lịch hẹn với bác sĩ, chuyên khoa, người khám, hồ sơ khám và đánh giá; DÙNG CHUNG với chi tiết của B5 (`patient-exam-detail.repository.ts`) để không có hai bản chép (jscpd).
 * Chuyên khoa theo `bac_si.chuyen_khoa_id` HIỆN TẠI (như booking L14); hai LEFT JOIN `ho_so_kham`, `danh_gia_bac_si` đều UNIQUE theo `lich_hen_id` nên không nhân dòng.
 * Người khám: bản thân là họ tên tài khoản (`tbn`), người thân là họ tên hồ sơ (`hs`, kể cả hồ sơ đã ngừng dùng: Q18). Chữ SQL KHÔNG đổi khi tách (B5 chứng minh bằng so chuỗi tuyệt đối, TRACKING 18.8).
 */
export const EXAM_VISIT_JOINS = `FROM lich_hen lh
INNER JOIN bac_si bs ON bs.tai_khoan_id = lh.bac_si_id
INNER JOIN tai_khoan tbs ON tbs.tai_khoan_id = lh.bac_si_id
INNER JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id
INNER JOIN tai_khoan tbn ON tbn.tai_khoan_id = lh.benh_nhan_id
LEFT JOIN ho_so_nguoi_than hs ON hs.ho_so_nguoi_than_id = lh.ho_so_nguoi_than_id
LEFT JOIN ho_so_kham hsk ON hsk.lich_hen_id = lh.lich_hen_id
LEFT JOIN danh_gia_bac_si dg ON dg.lich_hen_id = lh.lich_hen_id`;

// Trang: bảy cột (danh sách trắng); `daDanhGia` tính cả đánh giá đã ẩn (Q19). Phần nối ở `EXAM_VISIT_JOINS`.
const PAGE_SELECT = `SELECT lh.ma_lich_hen AS maLichHen, lh.thoi_gian AS thoiGian, ck.ten AS chuyenKhoa,
  tbs.ho_ten AS bacSiHoTen, bs.chuc_danh AS chucDanh,
  COALESCE(hs.ho_ten, tbn.ho_ten) AS nguoiKhamHoTen, hs.moi_quan_he AS quanHe,
  (hsk.ho_so_kham_id IS NOT NULL) AS coHoSoKham, (dg.danh_gia_bac_si_id IS NOT NULL) AS daDanhGia
${EXAM_VISIT_JOINS}`;

// Lựa chọn người khám: mọi lịch `HoanThanh` của Bệnh nhân (mọi năm, không áp bộ lọc nào), bản thân đứng đầu rồi theo họ tên và id
const EXAMINEE_SQL = `SELECT lh.ho_so_nguoi_than_id AS id, COALESCE(hs.ho_ten, tbn.ho_ten) AS hoTen, hs.moi_quan_he AS quanHe
FROM lich_hen lh
INNER JOIN tai_khoan tbn ON tbn.tai_khoan_id = lh.benh_nhan_id
LEFT JOIN ho_so_nguoi_than hs ON hs.ho_so_nguoi_than_id = lh.ho_so_nguoi_than_id
WHERE lh.benh_nhan_id = ?
  AND ${COMPLETED}
GROUP BY lh.ho_so_nguoi_than_id, hs.ho_ten, hs.moi_quan_he, tbn.ho_ten
ORDER BY (lh.ho_so_nguoi_than_id IS NULL) DESC, hs.ho_ten ASC, lh.ho_so_nguoi_than_id ASC`;

@Injectable()
export class PatientExamRecordsRepository {
  /** Số lịch khớp bộ lọc (`COUNT(*)` là BIGINT nên ra chuỗi hay số tuỳ driver). */
  async count(
    em: EntityManager,
    patientId: string,
    examinee: string | null,
    period: Period,
  ): Promise<number> {
    const { sql, params } = whereOf(patientId, examinee, period);
    const rows = await em.query<{ total: string | number }[]>(
      `SELECT COUNT(*) AS total FROM lich_hen lh\n${sql}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Số lịch của từng tháng trong năm, MỘT câu: mười hai tổng có điều kiện trên khoảng nửa mở (không `GROUP BY MONTH()`, AR-05). Áp `examinee` và cả năm, KHÔNG áp tháng đang lọc.
   * Tham số theo thứ tự `?`: mười hai cặp cận của các cột `m1` đến `m12`, rồi chủ sở hữu, người khám, cận cả năm.
   */
  async countByMonth(
    em: EntityManager,
    patientId: string,
    examinee: string | null,
    nam: number,
  ): Promise<MonthCountsRow | undefined> {
    const periods = monthPeriods(nam);
    const sums = periods
      .map(
        (_, index) =>
          `COALESCE(SUM(lh.thoi_gian >= ? AND lh.thoi_gian < ?), 0) AS m${index + 1}`,
      )
      .join(', ');
    const { sql, params } = whereOf(patientId, examinee, yearPeriod(nam));
    const rows = await em.query<MonthCountsRow[]>(
      `SELECT ${sums} FROM lich_hen lh\n${sql}`,
      [...periods.flatMap((period) => [period.from, period.to]), ...params],
    );
    return rows[0];
  }

  async findExaminees(
    em: EntityManager,
    patientId: string,
  ): Promise<ExamineeRow[]> {
    return em.query<ExamineeRow[]>(EXAMINEE_SQL, [patientId]);
  }

  /** Một trang. `limit` và `offset` đã kiểm (DTO) và `offset < total` (service: không gửi `OFFSET` khổng lồ cho MySQL, nơi nó báo 1064 ra 500). */
  async findPage(
    em: EntityManager,
    patientId: string,
    examinee: string | null,
    period: Period,
    limit: number,
    offset: number,
  ): Promise<ExamRecordRow[]> {
    const { sql, params } = whereOf(patientId, examinee, period);
    return em.query<ExamRecordRow[]>(
      `${PAGE_SELECT}\n${sql}\nORDER BY lh.thoi_gian DESC, lh.lich_hen_id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
  }
}
