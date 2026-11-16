import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../../admin/entities/enums.js';
import { resetOverrideRound } from '../../../appointments/testing/override-world.js';
import type { RatingDto } from '../rating/rating.dto.js';
import { RatingService } from '../rating/rating.service.js';
import { countRows } from './exam-completion-stack.js';

// Bộ dựng và đọc dùng chung của int-spec và e2e B6 (doctor-exam; `rating/rating.int-spec`, `rating/rating.concurrency.int-spec`, `exam-record/exam-record.concurrency.int-spec` (DHK-11), `test/doctor-exam-rating.e2e-spec`):
// để jscpd (quét cả `*.int-spec.ts` và `*.e2e-spec.ts`) không thấy cùng một đoạn dựng và đọc ở nhiều file. Nằm trong `testing/` nên PD-19, HD-08, AR-01 bỏ qua.
// KHÔNG tính lại công thức của mã đang kiểm (giờ ISO, chuẩn hoá chữ): mọi giá trị mong đợi do test viết tay; ở đây chỉ có đường vào (service, thân) và đường đọc DB bằng SQL riêng.

/** `RatingService` THẬT trên MySQL thật (với `withBookingTransaction` thật). */
export function ratingService(db: DataSource): RatingService {
  return new RatingService(db);
}

/** Thân của POST như một đối tượng THUẦN (không phải thể hiện của lớp DTO) để test dùng toán tử spread mà không mất nguyên mẫu. */
export type RatingInput = Pick<RatingDto, 'soSao' | 'nhanXet'>;

/** Thân hợp lệ mặc định (5 sao kèm nhận xét); `overrides` ghi đè từng khoá. Dữ liệu giả. */
export function ratingBody(overrides: Partial<RatingInput> = {}): RatingInput {
  return {
    soSao: 5,
    nhanXet: 'Bác sĩ tận tình, giải thích rõ ràng',
    ...overrides,
  };
}

/** Sáu trạng thái KHÁC `HoanThanh` (PLAN 7.4 DGB-04 liệt kê bốn; thêm `ChoThanhToan`, `DaDoiLich`): lịch ở đó chưa đánh giá được. Viết tay, độc lập với `canRate`. */
export const NOT_COMPLETED_STATES: readonly TrangThaiLichHen[] = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'DaHuy',
  'VangMat',
  'DaDoiLich',
];

export interface RatingRow {
  danhGiaId: string;
  lichHenId: string;
  soSao: number;
  nhanXet: string | null;
  biAn: number;
  lyDoAn: string | null;
  /** 'YYYY-MM-DD HH:mm:ss' như đã lưu (giờ VN) */
  thoiDiemTao: string;
}

interface RawRatingRow extends Omit<RatingRow, 'soSao' | 'biAn'> {
  soSao: number | string;
  biAn: number | string;
}

/** Các dòng `danh_gia_bac_si` như ĐÃ LƯU (giờ bằng `DATE_FORMAT`, X1 M11); `lichHenId` lọc theo một lịch. */
export async function ratingRows(
  db: DataSource,
  lichHenId?: string,
): Promise<RatingRow[]> {
  const rows = await db.query<RawRatingRow[]>(
    `SELECT CAST(danh_gia_bac_si_id AS CHAR) AS danhGiaId, CAST(lich_hen_id AS CHAR) AS lichHenId, so_sao AS soSao, nhan_xet AS nhanXet,
            CAST(bi_an AS UNSIGNED) AS biAn, ly_do_an AS lyDoAn, DATE_FORMAT(thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS thoiDiemTao
       FROM danh_gia_bac_si ${lichHenId === undefined ? '' : 'WHERE lich_hen_id = ?'} ORDER BY danh_gia_bac_si_id`,
    lichHenId === undefined ? [] : [lichHenId],
  );
  return rows.map((row) => ({
    ...row,
    soSao: Number(row.soSao),
    biAn: Number(row.biAn),
  }));
}

/** Số dòng của bốn bảng mà gửi đánh giá KHÔNG được đụng (PLAN 5.7: không nhật ký, không thông báo; không email, không hồ sơ khám). */
export async function untouchedByRating(db: DataSource) {
  return {
    nhatKy: await countRows(db, 'nhat_ky_hanh_dong'),
    thongBao: await countRows(db, 'thong_bao'),
    email: await countRows(db, 'email_thong_bao'),
    hoSoKham: await countRows(db, 'ho_so_kham'),
  };
}

/**
 * Gom mọi thứ ghi ra stdout, stderr và console vào một mảng (để quét log không chứa nhận xét, mã lịch: BDK-01). Dùng `vi.spyOn`, nên `vi.restoreAllMocks()` của test gỡ sau mỗi ca.
 * Gọi MỘT lần mỗi test.
 */
export function captureProcessLogs(): string[] {
  const captured: string[] = [];
  const text = (chunk: unknown) =>
    typeof chunk === 'string'
      ? chunk
      : Buffer.from(chunk as Uint8Array).toString('utf8');
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    captured.push(text(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    captured.push(text(chunk));
    return true;
  });
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    });
  return captured;
}

/** Câu giữ khoá X của một hàng `lich_hen` theo khoá chính (cho `holdRowLock`/`withRowLock`): bên "PUT đang ghi" giả ở các ca chờ khoá (DHK-11 (C), DGB-18). */
export const LOCK_LICH_HEN_SQL =
  'SELECT lich_hen_id FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE';

export interface WaitingLock {
  tableName: string;
  indexName: string;
  lockMode: string;
}

/** Các khoá ĐANG CHỜ của DB hiện tại (`performance_schema.data_lock_waits` nối `data_locks`; X1 M3): mỗi giao dịch chờ một khoá cho ra một dòng. */
export function waitingLocks(db: DataSource): Promise<WaitingLock[]> {
  return db.query(
    `SELECT l.OBJECT_NAME AS tableName, l.INDEX_NAME AS indexName, l.LOCK_MODE AS lockMode
       FROM performance_schema.data_lock_waits w
       JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
      WHERE l.OBJECT_SCHEMA = DATABASE()`,
  );
}

/** Dọn giữa các vòng đua: đánh giá và hồ sơ khám (khoá ngoại tới lịch) trước, rồi như `resetBookingRound` + nhật ký (qua `resetOverrideRound`). */
export async function resetRatingRound(db: DataSource): Promise<void> {
  await db.query('DELETE FROM danh_gia_bac_si');
  await db.query('DELETE FROM ho_so_kham');
  await resetOverrideRound(db);
}
