import type { DataSource } from 'typeorm';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import {
  AppointmentReminderService,
  emptyReminderSummary,
  type ReminderSummary,
} from '../reminders/appointment-reminder.service.js';

// Hạ tầng test dùng chung của nhắc lịch (notification B3): int-spec chính, int-spec đồng thời và int-spec thông lượng cùng dựng MỘT kiểu service và đọc bảng bằng MỘT hàm, để jscpd (quét cả `*.int-spec.ts`)
// không thấy cùng một đoạn ở nhiều file. Nằm trong `testing/` nên các bài quét kiến trúc bỏ qua (có SQL ghi thẳng `nhac_lich_hen` và `cau_hinh_he_thong` để dựng dữ liệu).

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;

export const shift = (at: Date, ms: number): Date =>
  new Date(at.getTime() + ms);

/** Một "tiến trình" nhắc lịch: service THẬT trên DB test với `FakeMailService` riêng (không bao giờ gửi thư thật) và `SystemConfigService` thật. */
export function createReminderService(
  db: DataSource,
  mail: FakeMailService = new FakeMailService(),
) {
  const configs = new SystemConfigService(new SystemConfigRepository(db));
  return {
    mail,
    service: new AppointmentReminderService(db, mail, configs),
  };
}

export async function sweepAt(
  service: AppointmentReminderService,
  now: Date,
): Promise<ReminderSummary> {
  const summary = emptyReminderSummary();
  await service.sweep(now, summary);
  return summary;
}

/** Đặt mảng mốc nhắc của dòng cấu hình (giá trị minh hoạ cho test). */
export async function setReminderOffsets(
  db: DataSource,
  offsets: readonly number[],
): Promise<void> {
  await db.query(
    'UPDATE cau_hinh_he_thong SET thoi_diem_nhac_lich = ? WHERE id = 1',
    [JSON.stringify(offsets)],
  );
}

export interface ReminderRow {
  lichHenId: string;
  soGioTruoc: number;
  trangThai: string;
  soLanThu: number;
  /** 'YYYY-MM-DD HH:mm:ss' như đã lưu (giờ Việt Nam) hoặc null */
  lanThuCuoiLuc: string | null;
  daGuiLuc: string | null;
  loiCuoi: string | null;
}

/** Mọi dòng `nhac_lich_hen` (của một lịch nếu truyền `lichHenId`), theo khoá chính. */
export async function readReminders(
  db: DataSource,
  lichHenId?: string,
): Promise<ReminderRow[]> {
  const rows: (Omit<ReminderRow, 'soGioTruoc' | 'soLanThu'> & {
    soGioTruoc: number | string;
    soLanThu: number | string;
  })[] = await db.query(
    `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, so_gio_truoc AS soGioTruoc, trang_thai AS trangThai, so_lan_thu AS soLanThu,
            DATE_FORMAT(lan_thu_cuoi_luc, '%Y-%m-%d %H:%i:%s') AS lanThuCuoiLuc, DATE_FORMAT(da_gui_luc, '%Y-%m-%d %H:%i:%s') AS daGuiLuc, loi_cuoi AS loiCuoi
       FROM nhac_lich_hen WHERE (? IS NULL OR lich_hen_id = ?) ORDER BY lich_hen_id, so_gio_truoc`,
    [lichHenId ?? null, lichHenId ?? null],
  );
  return rows.map((row) => ({
    ...row,
    soGioTruoc: Number(row.soGioTruoc),
    soLanThu: Number(row.soLanThu),
  }));
}

/** Chèn thẳng một dòng nhắc ở trạng thái bất kỳ (dựng tình huống thử lại, mồ côi). */
export async function insertReminderRow(
  db: DataSource,
  row: {
    lichHenId: string;
    soGioTruoc: number;
    trangThai?: 'ChoGui' | 'DaGui' | 'ThatBai';
    soLanThu?: number;
    lanThuCuoiLuc?: string | null;
    loiCuoi?: string | null;
  },
): Promise<void> {
  await db.query(
    'INSERT INTO nhac_lich_hen (lich_hen_id, so_gio_truoc, trang_thai, so_lan_thu, lan_thu_cuoi_luc, loi_cuoi, thoi_diem_tao) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      row.lichHenId,
      row.soGioTruoc,
      row.trangThai ?? 'ChoGui',
      row.soLanThu ?? 0,
      row.lanThuCuoiLuc ?? null,
      row.loiCuoi ?? null,
      '2026-11-01 00:00:00',
    ],
  );
}

/** Đổi trạng thái một lịch bằng SQL thẳng (dựng tình huống huỷ hay đổi lịch giữa hai mốc; không đi qua lõi chuyển trạng thái của booking). */
export async function setAppointmentState(
  db: DataSource,
  lichHenId: string,
  trangThai: 'DaHuy' | 'DaDoiLich',
): Promise<void> {
  await db.query(
    'UPDATE lich_hen SET trang_thai = ?, thoi_diem_huy = ? WHERE lich_hen_id = ?',
    [
      trangThai,
      trangThai === 'DaHuy' ? '2026-11-02 08:00:00' : null,
      lichHenId,
    ],
  );
}

export async function emailOf(
  db: DataSource,
  taiKhoanId: string,
): Promise<string> {
  const rows: { email: string }[] = await db.query(
    'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
    [taiKhoanId],
  );
  const email = rows[0]?.email;
  if (email === undefined) throw new Error(`không có tài khoản ${taiKhoanId}`);
  return email;
}
