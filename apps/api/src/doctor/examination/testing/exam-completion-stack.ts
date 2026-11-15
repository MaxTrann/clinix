import type { DataSource } from 'typeorm';
import { expect } from 'vitest';
import { createStatusStack } from '../../../appointments/testing/status-world.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { ExamCompletionService } from '../completion/exam-completion.service.js';
import { ExamNotifier } from '../notifications/exam-notifier.js';

// Bộ dựng và đọc dùng chung của int-spec B1 (doctor-exam; `exam-completion.int-spec`, `exam-notifier.int-spec`, `exam-completion.concurrency.int-spec`): để jscpd (quét cả `*.int-spec.ts`) không thấy cùng một
// đoạn dựng và đọc ở nhiều file. Nằm trong `testing/` nên PD-19, HD-08, AR-01 bỏ qua (có nhắc `ExamCompletionService`, vốn nhắc dịch vụ chuyển trạng thái của booking: chỉ ở file mã thật, không ở đây).

/**
 * `ExamCompletionService` THẬT trên MySQL thật: dịch vụ chuyển trạng thái THẬT của booking (`createStatusStack` mới, hoặc `stack` có sẵn để ca đua dùng CHUNG một bộ với bên override) và `ExamNotifier` THẬT,
 * hoặc bản truyền vào (ca "ghi thông báo lỗi").
 */
export function examCompletionStack(
  db: DataSource,
  options: {
    notifier?: ExamNotifier;
    stack?: Pick<ReturnType<typeof createStatusStack>, 'transition'>;
  } = {},
) {
  const stack = options.stack ?? createStatusStack(db);
  const notifier = options.notifier ?? new ExamNotifier();
  return {
    stack,
    notifier,
    service: new ExamCompletionService(db, stack.transition, notifier),
  };
}

/** `AppException` mà lời hứa ném ra (không ném hay lỗi khác thì làm test đỏ). */
export async function appException(
  work: Promise<unknown>,
): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'phải bị từ chối bằng AppException').toBeInstanceOf(
    AppException,
  );
  return error as AppException;
}

/** Số dòng của một bảng (COUNT(*) về chuỗi do `bigNumberStrings`, X1 M5). */
export async function countRows(
  db: DataSource,
  table: string,
): Promise<number> {
  const rows = await db.query<{ n: string | number }[]>(
    `SELECT COUNT(*) AS n FROM ${table}`,
  );
  return Number(rows[0]?.n);
}

/** Số dòng của bốn bảng mà hoàn thành ca khám KHÔNG được đổi (HTK-12), cộng nội dung mọi khung giờ (HTK-12: không đụng `khung_gio`). */
export async function untouchedByCompletion(db: DataSource) {
  return {
    nhatKy: await countRows(db, 'nhat_ky_hanh_dong'),
    email: await countRows(db, 'email_thong_bao'),
    hoSo: await countRows(db, 'ho_so_kham'),
    khungGio: await db.query(
      'SELECT khung_gio_id, trang_thai, giu_cho_den FROM khung_gio ORDER BY khung_gio_id',
    ),
  };
}

export interface ThongBaoRow {
  taiKhoanId: string;
  lichHenId: string;
  loai: string;
  daDoc: number;
  noiDung: string;
  /** 'YYYY-MM-DD HH:mm:ss' như đã lưu (giờ VN) */
  thoiDiemTao: string;
}

/** Các dòng `thong_bao` theo thứ tự ghi; `loai` lọc theo loại sự kiện (bỏ trống: mọi loại). */
export function thongBaoRows(
  db: DataSource,
  loai?: string,
): Promise<ThongBaoRow[]> {
  return db.query(
    `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, CAST(lich_hen_id AS CHAR) AS lichHenId, loai_su_kien AS loai,
            trang_thai_doc AS daDoc, noi_dung AS noiDung, DATE_FORMAT(thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS thoiDiemTao
       FROM thong_bao ${loai === undefined ? '' : 'WHERE loai_su_kien = ?'} ORDER BY thong_bao_id`,
    loai === undefined ? [] : [loai],
  );
}
