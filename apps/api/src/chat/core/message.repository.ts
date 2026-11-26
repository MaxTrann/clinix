import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { LoaiHoiThoai } from '../entities/enums.js';
import { CHAT_RATE_LIMIT_MESSAGES } from '../chat.constants.js';

// Đọc và ghi tin của lõi gửi (chat B1; PLAN chat 5.4 quy tắc 3, 4; 5.5). Mọi câu tham số hoá, liệt kê cột (HCH-02).

/** Tầng C1: khoá hội thoại theo khoá chính TRƯỚC mọi thứ, nên tin của một hội thoại được cấp id và commit tuần tự (id = thứ tự hiện; LOI-17). */
const LOCK_CONVERSATION_SQL = `SELECT hoi_thoai_id AS hoiThoaiId, loai, chi_nhanh_id AS chiNhanhId, nguoi_tao_id AS nguoiTaoId
  FROM hoi_thoai WHERE hoi_thoai_id = ? FOR UPDATE`;
const IS_MEMBER_SQL =
  'SELECT tai_khoan_id FROM tai_khoan_hoi_thoai WHERE tai_khoan_id = ? AND hoi_thoai_id = ?';
// Hội thoại bác sĩ có đúng hai thành viên: Bệnh nhân chủ và một bác sĩ
const DOCTOR_MEMBER_SQL = `SELECT m.tai_khoan_id AS taiKhoanId
  FROM tai_khoan_hoi_thoai m
 WHERE m.hoi_thoai_id = ? AND m.tai_khoan_id <> ?
 LIMIT 1`;
const ACCOUNT_STATUS_SQL =
  'SELECT trang_thai AS trangThai FROM tai_khoan WHERE tai_khoan_id = ?';
// UNIQUE (nguoi_gui_id, ma_gui)
const FIND_BY_SEND_ID_SQL = `SELECT tin_nhan_id AS tinNhanId, hoi_thoai_id AS hoiThoaiId, noi_dung AS noiDung, thoi_diem_gui AS thoiDiemGui
  FROM tin_nhan WHERE nguoi_gui_id = ? AND ma_gui = ?`;
// Đúng câu PLAN 5.5: đếm tối đa 20 tin trong cửa sổ, dùng chỉ mục tin_nhan_index_nguoi_gui_thoi_diem (chat P2; X1 M4 đo lại p95 1,5 ms)
const COUNT_RECENT_SQL =
  'SELECT COUNT(*) AS n FROM (SELECT 1 FROM tin_nhan WHERE nguoi_gui_id = ? AND thoi_diem_gui > ? LIMIT ?) t';
const INSERT_MESSAGE_SQL =
  'INSERT INTO tin_nhan (hoi_thoai_id, nguoi_gui_id, ma_gui, noi_dung, thoi_diem_gui) VALUES (?, ?, ?, ?, ?)';
// Lễ tân trả lời lần đầu thì có dòng thành viên riêng (mốc NULL); đã có thì KHÔNG đổi gì, mốc đã đọc giữ nguyên (X1 M7)
const ENSURE_MEMBER_SQL =
  'INSERT INTO tai_khoan_hoi_thoai (tai_khoan_id, hoi_thoai_id, tin_nhan_cuoi_da_doc_id) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE tai_khoan_id = tai_khoan_id';

export interface LockedConversation {
  hoiThoaiId: string;
  loai: LoaiHoiThoai;
  chiNhanhId: string | null;
  nguoiTaoId: string;
}

export interface StoredMessage {
  tinNhanId: string;
  hoiThoaiId: string;
  noiDung: string;
  thoiDiemGui: Date;
}

@Injectable()
export class MessageRepository {
  async lockConversation(
    em: EntityManager,
    hoiThoaiId: string,
  ): Promise<LockedConversation | null> {
    const rows = await em.query<LockedConversation[]>(LOCK_CONVERSATION_SQL, [
      hoiThoaiId,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      hoiThoaiId: String(row.hoiThoaiId),
      loai: row.loai,
      chiNhanhId: row.chiNhanhId === null ? null : String(row.chiNhanhId),
      nguoiTaoId: String(row.nguoiTaoId),
    };
  }

  async isMember(
    em: EntityManager,
    taiKhoanId: string,
    hoiThoaiId: string,
  ): Promise<boolean> {
    const rows = await em.query<unknown[]>(IS_MEMBER_SQL, [
      taiKhoanId,
      hoiThoaiId,
    ]);
    return rows.length > 0;
  }

  async doctorOf(
    em: EntityManager,
    conversation: LockedConversation,
  ): Promise<string | null> {
    if (conversation.loai !== 'BenhNhan_BacSi') return null;
    const rows = await em.query<{ taiKhoanId: string }[]>(DOCTOR_MEMBER_SQL, [
      conversation.hoiThoaiId,
      conversation.nguoiTaoId,
    ]);
    return rows[0] ? String(rows[0].taiKhoanId) : null;
  }

  async accountStatus(
    em: EntityManager,
    taiKhoanId: string,
  ): Promise<string | null> {
    const rows = await em.query<{ trangThai: string }[]>(ACCOUNT_STATUS_SQL, [
      taiKhoanId,
    ]);
    return rows[0]?.trangThai ?? null;
  }

  async findBySendId(
    em: EntityManager,
    nguoiGuiId: string,
    maGui: string,
  ): Promise<StoredMessage | null> {
    const rows = await em.query<StoredMessage[]>(FIND_BY_SEND_ID_SQL, [
      nguoiGuiId,
      maGui,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      tinNhanId: String(row.tinNhanId),
      hoiThoaiId: String(row.hoiThoaiId),
      noiDung: row.noiDung,
      thoiDiemGui: row.thoiDiemGui,
    };
  }

  /** Số tin của người gửi có `thoi_diem_gui` SAU `since` (cửa sổ nửa mở), tối đa `CHAT_RATE_LIMIT_MESSAGES`. */
  async countRecent(
    em: EntityManager,
    nguoiGuiId: string,
    since: Date,
  ): Promise<number> {
    const rows = await em.query<{ n: string | number }[]>(COUNT_RECENT_SQL, [
      nguoiGuiId,
      since,
      CHAT_RATE_LIMIT_MESSAGES,
    ]);
    return Number(rows[0]?.n ?? 0);
  }

  async insert(
    em: EntityManager,
    message: {
      hoiThoaiId: string;
      nguoiGuiId: string;
      maGui: string;
      noiDung: string;
      thoiDiemGui: Date;
    },
  ): Promise<string> {
    const result = await em.query<{ insertId: number | string }>(
      INSERT_MESSAGE_SQL,
      [
        message.hoiThoaiId,
        message.nguoiGuiId,
        message.maGui,
        message.noiDung,
        message.thoiDiemGui,
      ],
    );
    return String(result.insertId);
  }

  async ensureMember(
    em: EntityManager,
    taiKhoanId: string,
    hoiThoaiId: string,
  ): Promise<void> {
    await em.query(ENSURE_MEMBER_SQL, [taiKhoanId, hoiThoaiId]);
  }
}
