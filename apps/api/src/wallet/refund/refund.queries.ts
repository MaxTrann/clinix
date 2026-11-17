import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { RefundAttemptRow } from './refund.rules.js';

// SQL thô của hoàn cọc tự động (payment B8; PLAN 5.6.1). KHÔNG `UPDATE lich_hen` hay `khung_gio` (QTT-08), không `NOW()` (giờ do người gọi truyền). Không ghi log: mã lịch, số tiền và id ví là dữ liệu cá nhân.
// Id BIGINT ra CHUỖI (`CAST … AS CHAR`); tiền ra chuỗi decimal (`CAST … AS CHAR`), không đi qua `number`.

/** Khoản thanh toán qua ví của LỊCH GỐC: thứ được hoàn. */
export interface RefundPayment {
  giaoDichThanhToanId: string;
  viNoiBoId: string;
  /** Lịch gốc của chuỗi đổi lịch (`giao_dich_thanh_toan.lich_hen_id`) */
  lichHenId: string;
  soTien: string;
}

/** Dòng hoàn mới nhất của một khoản, để HIỂN THỊ (`findRefund`). */
export interface LatestRefundRow {
  soTien: string;
  trangThai: 'ThanhCong' | 'ThatBai';
  thoiDiem: Date;
}

/** Ứng viên thử lại: khoản có dòng tự động mới nhất `ThatBai`, chưa đủ lần, đã quá khoảng chờ. Mang đúng số và lý do ĐÃ GHI (không tính lại). */
export interface RetryCandidate {
  giaoDichThanhToanId: string;
  soTien: string;
  lyDo: string | null;
}

export interface AppointmentNotice {
  maLichHen: string;
  /** Tài khoản ĐẶT lịch = chủ ví được hoàn */
  benhNhanId: string;
}

@Injectable()
export class RefundRepository {
  /**
   * Khoản thanh toán qua ví của lịch gốc: `ThanhToanLichHen`, `Vi`, `ThanhCong`, `so_tien > 0`. ĐỌC THƯỜNG (không khoá): chỉ để biết khoá khoản nào; trạng thái thật chỉ có nghĩa dưới khoá.
   * Không có ⇒ `null` (lịch cọc 0đ, hay chỉ trả tiền mặt): hoàn "không cần".
   */
  async findWalletPaymentOfRoot(
    em: EntityManager,
    rootLichHenId: string,
  ): Promise<RefundPayment | null> {
    const rows = await em.query<RefundPayment[]>(
      `SELECT CAST(giao_dich_thanh_toan_id AS CHAR) AS giaoDichThanhToanId, CAST(vi_noi_bo_id AS CHAR) AS viNoiBoId, CAST(lich_hen_id AS CHAR) AS lichHenId, CAST(so_tien AS CHAR) AS soTien
       FROM giao_dich_thanh_toan
       WHERE lich_hen_id = ? AND loai = 'ThanhToanLichHen' AND phuong_thuc = 'Vi' AND trang_thai = 'ThanhCong' AND so_tien > 0
       ORDER BY giao_dich_thanh_toan_id LIMIT 1`,
      [rootLichHenId],
    );
    return rows[0] ?? null;
  }

  /** KHOÁ X khoản thanh toán theo khoá chính (hạng 7a): tuần tự hoá mọi việc hoàn trên cùng một khoản (hai lần thử đồng thời, hoàn tự động đua hoàn đặc biệt). */
  async lockPayment(
    em: EntityManager,
    giaoDichThanhToanId: string,
  ): Promise<RefundPayment | null> {
    const rows = await em.query<RefundPayment[]>(
      `SELECT CAST(giao_dich_thanh_toan_id AS CHAR) AS giaoDichThanhToanId, CAST(vi_noi_bo_id AS CHAR) AS viNoiBoId, CAST(lich_hen_id AS CHAR) AS lichHenId, CAST(so_tien AS CHAR) AS soTien
       FROM giao_dich_thanh_toan WHERE giao_dich_thanh_toan_id = ? FOR UPDATE`,
      [giaoDichThanhToanId],
    );
    return rows[0] ?? null;
  }

  /** Mọi dòng hoàn của khoản (tự động và đặc biệt), `so_lan_thu` tăng dần. Gọi dưới khoá 7a. */
  async listAttempts(
    em: EntityManager,
    giaoDichThanhToanId: string,
  ): Promise<RefundAttemptRow[]> {
    const rows = await em.query<
      {
        loai: 'TuDong' | 'DacBiet';
        trangThai: 'ThanhCong' | 'ThatBai';
        soTien: string;
        soLanThu: number | string;
      }[]
    >(
      `SELECT loai, trang_thai AS trangThai, CAST(so_tien AS CHAR) AS soTien, so_lan_thu AS soLanThu
       FROM lich_su_hoan_tien WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu`,
      [giaoDichThanhToanId],
    );
    return rows.map((row) => ({ ...row, soLanThu: Number(row.soLanThu) }));
  }

  /**
   * `INSERT lich_su_hoan_tien` tự động (hàng MỚI của chính giao dịch: hạng 7c). `ThanhCong` gọi SAU khi đã khoá ví (INSERT xin khoá chia sẻ trên hàng ví qua khoá ngoại: nếu rồi mới khoá X ví thì nâng khoá chéo nhau ⇒
   * 1213, H1). `ThatBai` mang `so_tien` và `ly_do` để lần thử sau KHÔNG phải tính lại (đóng một nửa lỗ hổng TECH_DEBT 106).
   */
  async insertAttempt(
    em: EntityManager,
    input: {
      giaoDichThanhToanId: string;
      viNoiBoId: string;
      soTien: string;
      lyDo: string | null;
      trangThai: 'ThanhCong' | 'ThatBai';
      soLanThu: number;
      now: Date;
    },
  ): Promise<string> {
    const result = await em.query<{ insertId: string | number }>(
      `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, ly_do, trang_thai, so_lan_thu, thoi_diem)
       VALUES (?, ?, 'TuDong', ?, ?, ?, ?, ?)`,
      [
        input.giaoDichThanhToanId,
        input.viNoiBoId,
        input.soTien,
        input.lyDo,
        input.trangThai,
        input.soLanThu,
        input.now,
      ],
    );
    return String(result.insertId);
  }

  /** Dòng hoàn MỚI NHẤT (`so_lan_thu` lớn nhất, mọi loại) của khoản, để hiển thị: không lộ số lần thử hay ví (HDT-05). */
  async latestAttempt(
    em: EntityManager,
    giaoDichThanhToanId: string,
  ): Promise<LatestRefundRow | null> {
    const rows = await em.query<LatestRefundRow[]>(
      `SELECT CAST(so_tien AS CHAR) AS soTien, trang_thai AS trangThai, thoi_diem AS thoiDiem
       FROM lich_su_hoan_tien WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu DESC LIMIT 1`,
      [giaoDichThanhToanId],
    );
    return rows[0] ?? null;
  }

  /** Mã lịch và chủ lịch để viết thông báo. ĐỌC THƯỜNG, không khoá `lich_hen`. */
  async findAppointmentNotice(
    em: EntityManager,
    lichHenId: string,
  ): Promise<AppointmentNotice | null> {
    const rows = await em.query<AppointmentNotice[]>(
      `SELECT ma_lich_hen AS maLichHen, CAST(benh_nhan_id AS CHAR) AS benhNhanId FROM lich_hen WHERE lich_hen_id = ?`,
      [lichHenId],
    );
    return rows[0] ?? null;
  }

  /**
   * Lịch CUỐI của chuỗi đổi lịch bắt đầu từ lịch gốc (đi xuôi theo `lich_hen_truoc_id`): lịch bị huỷ cuối cùng, nơi thông báo hoàn cọc gắn vào (4.7 #8). Chuỗi thường chỉ có một lịch (kết quả là chính nó).
   * Giới hạn độ sâu như `PaymentChain` (`MAX_CHAIN_DEPTH` = 20) để dữ liệu hỏng (vòng) không chạy vô hạn. Chỉ ĐỌC.
   */
  async leafOf(em: EntityManager, rootLichHenId: string): Promise<string> {
    const rows = await em.query<{ lichHenId: string }[]>(
      `WITH RECURSIVE xuoi (lich_hen_id, buoc) AS (
         SELECT lich_hen_id, 1 FROM lich_hen WHERE lich_hen_id = ?
         UNION ALL
         SELECT l.lich_hen_id, x.buoc + 1 FROM lich_hen l INNER JOIN xuoi x ON l.lich_hen_truoc_id = x.lich_hen_id WHERE x.buoc < 20
       )
       SELECT CAST(lich_hen_id AS CHAR) AS lichHenId FROM xuoi ORDER BY buoc DESC LIMIT 1`,
      [rootLichHenId],
    );
    return rows[0]?.lichHenId ?? rootLichHenId;
  }

  /** Quản trị viên `ToanHeThong` đang hoạt động: người nhận `HoanCocCanXuLy` (PLAN 5.12). */
  async findSystemAdmins(em: EntityManager): Promise<string[]> {
    const rows = await em.query<{ id: string }[]>(
      `SELECT CAST(q.tai_khoan_id AS CHAR) AS id
       FROM quan_tri_vien q INNER JOIN tai_khoan t ON t.tai_khoan_id = q.tai_khoan_id
       WHERE t.trang_thai = 'DangHoatDong' AND q.pham_vi_quan_tri = 'ToanHeThong'
       ORDER BY q.tai_khoan_id`,
    );
    return rows.map((row) => row.id);
  }

  /**
   * Khoản có dòng TỰ ĐỘNG mới nhất là `ThatBai`, chưa đủ `maxAttempts` lần thất bại, và dòng đó đã quá khoảng chờ (`thoi_diem <= before`: đúng bằng mốc thì ĐƯỢC thử, M14).
   * Con trỏ theo `giao_dich_thanh_toan_id` tăng dần để một khoản lỗi mãi không chặn các khoản sau nó. Chỉ là DANH SÁCH ứng viên: service khoá và kiểm lại dưới khoá.
   */
  async findRetryCandidates(
    em: EntityManager,
    input: {
      before: Date;
      maxAttempts: number;
      afterPaymentId: string;
      limit: number;
    },
  ): Promise<RetryCandidate[]> {
    return em.query<RetryCandidate[]>(
      `SELECT CAST(r.giao_dich_thanh_toan_id AS CHAR) AS giaoDichThanhToanId, CAST(r.so_tien AS CHAR) AS soTien, r.ly_do AS lyDo
       FROM lich_su_hoan_tien r
       WHERE r.loai = 'TuDong' AND r.trang_thai = 'ThatBai' AND r.thoi_diem <= ? AND r.giao_dich_thanh_toan_id > ?
         AND r.so_lan_thu = (SELECT MAX(m.so_lan_thu) FROM lich_su_hoan_tien m WHERE m.giao_dich_thanh_toan_id = r.giao_dich_thanh_toan_id AND m.loai = 'TuDong')
         AND (SELECT COUNT(*) FROM lich_su_hoan_tien f WHERE f.giao_dich_thanh_toan_id = r.giao_dich_thanh_toan_id AND f.loai = 'TuDong' AND f.trang_thai = 'ThatBai') < ?
       ORDER BY r.giao_dich_thanh_toan_id LIMIT ?`,
      [input.before, input.afterPaymentId, input.maxAttempts, input.limit],
    );
  }
}
