import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import { readAudit } from '../../../appointments/testing/override-world.js';
import type { ExamRecordDto } from '../exam-record/exam-record.dto.js';
import { ExamRecordService } from '../exam-record/exam-record.service.js';

// Bộ dựng và đọc dùng chung của int-spec và e2e B2 (doctor-exam; `exam-record.int-spec`, `exam-record.concurrency.int-spec`, `completion/exam-completion.concurrency.int-spec`, `test/doctor-exam-record.e2e-spec`):
// để jscpd (quét cả `*.int-spec.ts` và `*.e2e-spec.ts`) không thấy cùng một đoạn dựng và đọc ở nhiều file. Nằm trong `testing/` nên PD-19, HD-08, AR-01 bỏ qua.

/** `ExamRecordService` THẬT trên MySQL thật với `AuditService` THẬT (hoặc bản truyền vào: ca "nhật ký lỗi"). */
export function recordService(
  db: DataSource,
  audit: Pick<AuditService, 'record'> = new AuditService(new AuditRepository()),
): ExamRecordService {
  return new ExamRecordService(db, audit as AuditService);
}

/** Thân của PUT như một đối tượng THUẦN (không phải thể hiện của lớp DTO) để test dùng toán tử spread `{ ...recordBody(), khoá: giá trị }` mà không mất nguyên mẫu. */
export type RecordInput = Pick<
  ExamRecordDto,
  | 'trieuChung'
  | 'chanDoanSoBo'
  | 'huongXuLy'
  | 'ngayTaiKhamDuKien'
  | 'capNhatLanCuoi'
>;

/** Thân hợp lệ mặc định (ngày tái khám vắng, token `null` = chưa thấy hồ sơ); `overrides` ghi đè từng khoá. Dữ liệu giả. */
export function recordBody(overrides: Partial<RecordInput> = {}): RecordInput {
  return {
    trieuChung: 'Ho khan, sốt nhẹ hai ngày',
    chanDoanSoBo: 'Viêm họng cấp',
    huongXuLy: 'Uống đủ nước, nghỉ ngơi',
    ngayTaiKhamDuKien: null,
    capNhatLanCuoi: null,
    ...overrides,
  };
}

export interface RecordRow {
  hoSoKhamId: string;
  lichHenId: string;
  trieuChung: string | null;
  chanDoanSoBo: string | null;
  huongXuLy: string | null;
  ngayTaiKhamDuKien: string | null;
  /** 'YYYY-MM-DD HH:mm:ss' như đã lưu (giờ VN) */
  capNhatLanCuoi: string;
}

/** Các dòng `ho_so_kham` như ĐÃ LƯU (cột `DATE` bằng `DATE_FORMAT`, X1 M11); `lichHenId` lọc theo một lịch. */
export function recordRows(
  db: DataSource,
  lichHenId?: string,
): Promise<RecordRow[]> {
  return db.query(
    `SELECT CAST(ho_so_kham_id AS CHAR) AS hoSoKhamId, CAST(lich_hen_id AS CHAR) AS lichHenId, trieu_chung AS trieuChung, chan_doan_so_bo AS chanDoanSoBo, huong_xu_ly AS huongXuLy,
            DATE_FORMAT(ngay_tai_kham_du_kien, '%Y-%m-%d') AS ngayTaiKhamDuKien, DATE_FORMAT(cap_nhat_lan_cuoi, '%Y-%m-%d %H:%i:%s') AS capNhatLanCuoi
       FROM ho_so_kham ${lichHenId === undefined ? '' : 'WHERE lich_hen_id = ?'} ORDER BY ho_so_kham_id`,
    lichHenId === undefined ? [] : [lichHenId],
  );
}

export interface EditAuditRow {
  taiKhoanId: string;
  chiNhanhId: string | null;
  loaiDoiTuong: string;
  maDoiTuong: string;
  ketQua: string;
  chiTiet: unknown;
}

/** Các dòng nhật ký `SuaGhiChuKham` theo thứ tự ghi (chi tiết đã parse). */
export async function editAuditRows(db: DataSource): Promise<EditAuditRow[]> {
  return (await readAudit(db))
    .filter((row) => row.hanhDong === 'SuaGhiChuKham')
    .map((row) => ({
      taiKhoanId: row.taiKhoanId,
      chiNhanhId: row.chiNhanhId,
      loaiDoiTuong: row.loaiDoiTuong,
      maDoiTuong: row.maDoiTuong,
      ketQua: row.ketQua,
      chiTiet: row.chiTietThayDoi,
    }));
}

/** Số dòng của các bảng mà ghi hồ sơ KHÔNG được đụng ngoài `ho_so_kham` và (khi sửa sau Hoàn thành) `nhat_ky_hanh_dong`: thông báo, email, đánh giá. */
export async function untouchedByRecord(db: DataSource) {
  const count = async (table: string) => {
    const rows = await db.query<{ n: string | number }[]>(
      `SELECT COUNT(*) AS n FROM ${table}`,
    );
    return Number(rows[0]?.n);
  };
  return {
    thongBao: await count('thong_bao'),
    email: await count('email_thong_bao'),
    danhGia: await count('danh_gia_bac_si'),
  };
}
