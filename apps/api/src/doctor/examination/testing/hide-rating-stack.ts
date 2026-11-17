import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import {
  DoctorRatingReader,
  type DoctorRating,
} from '../../../search/ratings/doctor-rating.reader.js';
import { RatingHideRepository } from '../moderation/rating-hide.repository.js';
import type { HideRatingDto } from '../moderation/rating-hide.dto.js';
import { RatingHideService } from '../moderation/rating-hide.service.js';
import { countRows } from './exam-completion-stack.js';

// Bộ dựng và đọc dùng chung của int-spec và e2e B8 (doctor-exam; `moderation/rating-hide.int-spec`, `moderation/rating-hide.concurrency.int-spec`, `test/doctor-exam-admin-hide-rating.e2e-spec`): để jscpd (quét cả
// `*.int-spec.ts` và `*.e2e-spec.ts`) không thấy cùng một đoạn dựng và đọc ở nhiều file. Nằm trong `testing/` nên PD-19, HD-08, AR-01 bỏ qua.
// KHÔNG tính lại công thức của mã đang kiểm (điểm trung bình, chuẩn hoá lý do): mọi giá trị mong đợi do test viết tay; ở đây chỉ có đường vào (service, thân), đường đọc DB bằng SQL riêng và `readAverage` (gọi `DoctorRatingReader` THẬT của `search`, B9).

/** `RatingHideService` THẬT trên MySQL thật với `AuditService` THẬT (hoặc bản truyền vào: ca "nhật ký lỗi", ca đóng băng người ghi). */
export function ratingHideService(
  db: DataSource,
  audit: Pick<AuditService, 'record'> = new AuditService(new AuditRepository()),
  repository: RatingHideRepository = new RatingHideRepository(),
): RatingHideService {
  return new RatingHideService(
    db,
    repository,
    new BranchAccessPolicy(),
    audit as AuditService,
  );
}

/** Thân của POST như một đối tượng THUẦN (không phải thể hiện của lớp DTO). Lý do hợp lệ mặc định; `overrides` ghi đè. Dữ liệu giả. */
export function hideBody(
  overrides: Partial<HideRatingDto> = {},
): HideRatingDto {
  return {
    lyDo: 'Nội dung quảng cáo, không liên quan đến buổi khám',
    ...overrides,
  };
}

/**
 * Điểm trung bình của MỘT bác sĩ như `search` thấy: `DoctorRatingReader` THẬT (B9). Ở B8 đây là bản CHÉP câu của PLAN 5.9; B9 đã thay bằng reader thật và chạy lại KDD-15, DTB-03, DHK-08.
 * Bác sĩ không còn đánh giá hiển thị nào ⇒ `{ diemTrungBinh: null, soDanhGia: 0 }`. Ném lỗi nếu Map thiếu khoá (reader quên điền `NO_RATING` cho id vắng): để lỗi đó làm đỏ cả các ca của B8.
 */
export async function readAverage(
  db: DataSource,
  bacSiId: string,
): Promise<DoctorRating> {
  const ratings = await new DoctorRatingReader(db).readMany([bacSiId]);
  const rating = ratings.get(bacSiId);
  if (rating === undefined)
    throw new Error(`DoctorRatingReader không trả điểm cho bác sĩ ${bacSiId}`);
  return rating;
}

export interface HideAuditRow {
  taiKhoanId: string;
  chiNhanhId: string | null;
  loaiDoiTuong: string;
  maDoiTuong: string;
  ketQua: string;
  /** `chi_tiet_thay_doi` đã giải JSON */
  chiTiet: unknown;
}

interface RawAuditRow extends Omit<HideAuditRow, 'chiTiet'> {
  chiTiet: unknown;
}

/** Các dòng `nhat_ky_hanh_dong` của hành động `AnDanhGia` theo thứ tự ghi (BIGINT ra chuỗi; JSON giải ra đối tượng nếu driver trả chuỗi). */
export async function hideAuditRows(db: DataSource): Promise<HideAuditRow[]> {
  const rows = await db.query<RawAuditRow[]>(
    `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, loai_doi_tuong AS loaiDoiTuong,
            CAST(ma_doi_tuong AS CHAR) AS maDoiTuong, ket_qua AS ketQua, chi_tiet_thay_doi AS chiTiet
       FROM nhat_ky_hanh_dong WHERE hanh_dong = 'AnDanhGia' ORDER BY nhat_ky_hanh_dong_id`,
  );
  return rows.map((row) => ({
    ...row,
    chiTiet:
      typeof row.chiTiet === 'string'
        ? (JSON.parse(row.chiTiet) as unknown)
        : row.chiTiet,
  }));
}

/** `ly_do` trong `chi_tiet_thay_doi` của một dòng nhật ký (`undefined` khi không có dòng hay không có khoá). */
export const auditReasonOf = (
  row: HideAuditRow | undefined,
): string | undefined =>
  (row?.chiTiet as { ly_do?: string } | undefined)?.ly_do;

/** Số dòng của bốn bảng mà ẨN KHÔNG được đụng ngoài `danh_gia_bac_si` và `nhat_ky_hanh_dong`: lịch, hồ sơ khám, thông báo, thư (PLAN 5.12: không thông báo, không email). */
export async function untouchedByHide(db: DataSource) {
  return {
    lichHen: await countRows(db, 'lich_hen'),
    hoSoKham: await countRows(db, 'ho_so_kham'),
    thongBao: await countRows(db, 'thong_bao'),
    email: await countRows(db, 'email_thong_bao'),
  };
}

/** Các câu của thân (bỏ câu đặt phiên, START TRANSACTION, COMMIT, ROLLBACK): đọc thường trước, rồi thân giao dịch. */
export const bodyOf = (seen: string[]): string[] =>
  seen.filter(
    (sql) =>
      !/^\s*(SET SESSION|SET TRANSACTION|SELECT @@session|START TRANSACTION|COMMIT|ROLLBACK)/i.test(
        sql,
      ),
  );
