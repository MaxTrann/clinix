import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';

// SQL thông báo tin nhắn mới (chat B6; PLAN chat 5.4 tầng 7c, 5.10). NƠI DUY NHẤT của chat ghi `thong_bao` (HCH-03: chỉ ở `chat/notifications/`).
// Mọi câu chạy bằng `em` của giao dịch người gọi (gửi: dưới khoá `hoi_thoai` FOR UPDATE; đánh dấu đọc: dưới FOR SHARE).
//
// GỘP (Q11): chỉ chèn khi người nhận CHƯA có dòng chưa đọc cùng `loai_su_kien` (`TinNhanMoi:{hoiThoaiId}`). Kiểm và chèn trong MỘT câu `INSERT … SELECT … NOT EXISTS`.
// Không cần khoá riêng: mọi lần gửi vào cùng hội thoại đã tuần tự nhờ khoá `hoi_thoai` (5.4 quy tắc 3), hội thoại vừa tạo thì chưa ai khác thấy.
// Ở READ COMMITTED, phần SELECT là đọc nhất quán (không khoá `tai_khoan`, `le_tan`, `thong_bao`); Trung tâm thông báo "đánh dấu tất cả" chạy song song
// thì dòng cũ thành đã đọc và lần gửi sau chèn dòng mới (TBC-10), đúng ý.
//
// Người nhận không `DangHoatDong` thì không ghi (TBC-06). Chỉ mục `thong_bao_index_25 (tai_khoan_id, trang_thai_doc, thoi_diem_tao)` cho phần NOT EXISTS và UPDATE.

const NOT_YET_NOTIFIED = `NOT EXISTS (SELECT 1 FROM thong_bao t
  WHERE t.tai_khoan_id = tk.tai_khoan_id AND t.trang_thai_doc = 0 AND t.loai_su_kien = ?)`;

// Một người nhận (Bác sĩ của hội thoại, hay Bệnh nhân chủ). Thứ tự `?`: nội dung, mã, thời điểm, người nhận, mã (NOT EXISTS).
const INSERT_ONE_SQL = `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao)
SELECT tk.tai_khoan_id, ?, ?, 0, ? FROM tai_khoan tk
WHERE tk.tai_khoan_id = ? AND tk.trang_thai = 'DangHoatDong' AND ${NOT_YET_NOTIFIED}`;

// Mọi Lễ tân đang hoạt động của chi nhánh (hộp thư chung; đọc TỪ DB lúc gửi như việc đẩy của B5). Thứ tự `?`: nội dung, mã, thời điểm, chi nhánh, mã.
const INSERT_RECEPTIONISTS_SQL = `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao)
SELECT tk.tai_khoan_id, ?, ?, 0, ? FROM le_tan lt
JOIN tai_khoan tk ON tk.tai_khoan_id = lt.tai_khoan_id
WHERE lt.chi_nhanh_id = ? AND tk.trang_thai = 'DangHoatDong' AND ${NOT_YET_NOTIFIED}`;

// Đọc hết tin của hội thoại ⇒ thông báo của hội thoại đó (chỉ của người đọc) thành đã đọc. Thông báo khác của người đó không đổi.
const MARK_READ_SQL =
  'UPDATE thong_bao SET trang_thai_doc = 1 WHERE tai_khoan_id = ? AND trang_thai_doc = 0 AND loai_su_kien = ?';

// Tên để dựng câu (không đọc nội dung tin, SĐT, email). `chi_nhanh`, `tai_khoan` của bác sĩ theo khoá chính; id NULL thì cột ra NULL.
const TEXT_PARTS_SQL = `SELECT p.ho_ten AS benhNhanHoTen, cn.ten AS tenChiNhanh, d.ho_ten AS bacSiHoTen, bs.chuc_danh AS bacSiChucDanh
FROM tai_khoan p
LEFT JOIN chi_nhanh cn ON cn.chi_nhanh_id = ?
LEFT JOIN tai_khoan d ON d.tai_khoan_id = ?
LEFT JOIN bac_si bs ON bs.tai_khoan_id = d.tai_khoan_id
WHERE p.tai_khoan_id = ?`;

export interface TextParts {
  benhNhanHoTen: string;
  tenChiNhanh: string | null;
  bacSiHoTen: string | null;
  bacSiChucDanh: ChucDanhBacSi | null;
}

export interface NewNotification {
  noiDung: string;
  loaiSuKien: string;
  thoiDiemTao: Date;
}

// Bốn cột đều là chữ (varchar, ENUM): driver trả chuỗi, NULL khi LEFT JOIN không khớp
const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

@Injectable()
export class ChatNotificationRepository {
  async textParts(
    em: EntityManager,
    ids: {
      benhNhanId: string;
      chiNhanhId: string | null;
      bacSiId: string | null;
    },
  ): Promise<TextParts | null> {
    const rows = await em.query<Record<string, unknown>[]>(TEXT_PARTS_SQL, [
      ids.chiNhanhId,
      ids.bacSiId,
      ids.benhNhanId,
    ]);
    const benhNhanHoTen = textOrNull(rows[0]?.benhNhanHoTen);
    const row = rows[0];
    if (!row || benhNhanHoTen === null) return null;
    return {
      benhNhanHoTen,
      tenChiNhanh: textOrNull(row.tenChiNhanh),
      bacSiHoTen: textOrNull(row.bacSiHoTen),
      bacSiChucDanh: textOrNull(row.bacSiChucDanh) as ChucDanhBacSi | null,
    };
  }

  /** Số dòng vừa chèn (0 khi người nhận đã có thông báo chưa đọc của hội thoại, hay không hoạt động). */
  async notifyOne(
    em: EntityManager,
    taiKhoanId: string,
    n: NewNotification,
  ): Promise<number> {
    return affected(
      await em.query(INSERT_ONE_SQL, [
        n.noiDung,
        n.loaiSuKien,
        n.thoiDiemTao,
        taiKhoanId,
        n.loaiSuKien,
      ]),
    );
  }

  async notifyReceptionists(
    em: EntityManager,
    chiNhanhId: string,
    n: NewNotification,
  ): Promise<number> {
    return affected(
      await em.query(INSERT_RECEPTIONISTS_SQL, [
        n.noiDung,
        n.loaiSuKien,
        n.thoiDiemTao,
        chiNhanhId,
        n.loaiSuKien,
      ]),
    );
  }

  async markRead(
    em: EntityManager,
    taiKhoanId: string,
    loaiSuKien: string,
  ): Promise<number> {
    return affected(await em.query(MARK_READ_SQL, [taiKhoanId, loaiSuKien]));
  }
}

const affected = (result: unknown): number =>
  Number((result as { affectedRows?: number }).affectedRows ?? 0);
