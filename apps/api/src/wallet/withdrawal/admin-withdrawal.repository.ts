import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TrangThaiYeuCauRutTien } from '../entities/wallet-enums.js';
import { WITHDRAWAL_RECENT_LEDGER_ROWS } from '../wallet.constants.js';

// SQL của Quản trị viên về yêu cầu rút tiền (payment B12; PLAN 5.8, 5.3). Hàm đọc chạy ngoài giao dịch (không khoá); `lockRequest` và `markHandled` chạy TRONG giao dịch của service. Không `NOW()`: giờ do service truyền.

export interface RequestRow {
  maYeuCau: string;
  viNoiBoId: string;
  benhNhanId: string;
  hoTen: string;
  soTien: string;
  trangThai: TrangThaiYeuCauRutTien;
  thoiDiemYeuCau: Date;
  thoiDiemXuLy: Date | null;
}

export interface LockedRequest {
  viNoiBoId: string;
  benhNhanId: string;
  soTien: string;
  trangThai: TrangThaiYeuCauRutTien;
}

const SELECT_REQUEST = `
  SELECT CAST(y.yeu_cau_rut_tien_id AS CHAR) AS maYeuCau, CAST(y.vi_noi_bo_id AS CHAR) AS viNoiBoId,
         CAST(v.benh_nhan_id AS CHAR) AS benhNhanId, t.ho_ten AS hoTen, y.so_tien AS soTien,
         y.trang_thai AS trangThai, y.thoi_diem_yeu_cau AS thoiDiemYeuCau, y.thoi_diem_xu_ly AS thoiDiemXuLy
    FROM yeu_cau_rut_tien y
    JOIN vi_noi_bo v ON v.vi_noi_bo_id = y.vi_noi_bo_id
    JOIN tai_khoan t ON t.tai_khoan_id = v.benh_nhan_id`;

@Injectable()
export class AdminWithdrawalRepository {
  /** Một trang yêu cầu, mới nhất trước (id giảm dần phá hoà). `trangThai` bỏ trống = tất cả. */
  async list(
    em: EntityManager,
    input: {
      trangThai?: TrangThaiYeuCauRutTien;
      limit: number;
      offset: number;
    },
  ): Promise<{ rows: RequestRow[]; total: number }> {
    const where = input.trangThai === undefined ? '' : 'WHERE y.trang_thai = ?';
    const filter = input.trangThai === undefined ? [] : [input.trangThai];
    const rows: RequestRow[] = await em.query(
      `${SELECT_REQUEST} ${where} ORDER BY y.thoi_diem_yeu_cau DESC, y.yeu_cau_rut_tien_id DESC LIMIT ? OFFSET ?`,
      [...filter, input.limit, input.offset],
    );
    const counted: { n: string }[] = await em.query(
      `SELECT COUNT(*) AS n FROM yeu_cau_rut_tien y ${where}`,
      filter,
    );
    return { rows, total: Number(counted[0]?.n ?? 0) };
  }

  /** Số yêu cầu theo từng trạng thái (cho các tab của màn hình). */
  async countByStatus(
    em: EntityManager,
  ): Promise<Record<TrangThaiYeuCauRutTien, number>> {
    const rows: { trangThai: TrangThaiYeuCauRutTien; n: string }[] =
      await em.query(
        'SELECT trang_thai AS trangThai, COUNT(*) AS n FROM yeu_cau_rut_tien GROUP BY trang_thai',
      );
    const counts = { ChoDuyet: 0, DaDuyet: 0, TuChoi: 0 };
    for (const row of rows) counts[row.trangThai] = Number(row.n);
    return counts;
  }

  async findOne(
    em: EntityManager,
    maYeuCau: string,
  ): Promise<RequestRow | null> {
    const rows: RequestRow[] = await em.query(
      `${SELECT_REQUEST} WHERE y.yeu_cau_rut_tien_id = ?`,
      [maYeuCau],
    );
    return rows[0] ?? null;
  }

  /** Số dư và số đang giữ hiện tại của ví (đọc thường, chỉ để hiện). */
  async readWalletBalance(
    em: EntityManager,
    viNoiBoId: string,
  ): Promise<{ soDu: string; soTienDangGiu: string }> {
    const rows: { soDu: string; soTienDangGiu: string }[] = await em.query(
      'SELECT so_du AS soDu, so_tien_dang_giu AS soTienDangGiu FROM vi_noi_bo WHERE vi_noi_bo_id = ?',
      [viNoiBoId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('Yêu cầu rút trỏ tới ví không có');
    return row;
  }

  /** Các dòng sổ cái gần nhất của ví (mới trước). */
  recentLedger(
    em: EntityManager,
    viNoiBoId: string,
  ): Promise<{ thoiDiem: Date; loai: string; soTien: string }[]> {
    return em.query(
      `SELECT thoi_diem AS thoiDiem, loai, so_tien AS soTien FROM giao_dich_vi
        WHERE vi_noi_bo_id = ? ORDER BY thoi_diem DESC, giao_dich_vi_id DESC LIMIT ?`,
      [viNoiBoId, WITHDRAWAL_RECENT_LEDGER_ROWS],
    );
  }

  /** Khoá yêu cầu `FOR UPDATE` (hạng 7a, TRƯỚC ví 7b): hai Quản trị viên cùng lúc xếp hàng ở đây, bên sau thấy trạng thái bên trước đã đặt. Không có ⇒ `null`. */
  async lockRequest(
    em: EntityManager,
    maYeuCau: string,
  ): Promise<LockedRequest | null> {
    const rows: LockedRequest[] = await em.query(
      `SELECT CAST(y.vi_noi_bo_id AS CHAR) AS viNoiBoId, CAST(v.benh_nhan_id AS CHAR) AS benhNhanId,
              y.so_tien AS soTien, y.trang_thai AS trangThai
         FROM yeu_cau_rut_tien y JOIN vi_noi_bo v ON v.vi_noi_bo_id = y.vi_noi_bo_id
        WHERE y.yeu_cau_rut_tien_id = ? FOR UPDATE`,
      [maYeuCau],
    );
    return rows[0] ?? null;
  }

  /** Đặt kết quả xử lý (`chk_rut_tien_xu_ly`: có cả người và thời điểm). Điều kiện `ChoDuyet` là chốt thứ hai sau khoá. */
  async markHandled(
    em: EntityManager,
    input: {
      maYeuCau: string;
      trangThai: 'DaDuyet' | 'TuChoi';
      nguoiXuLyId: string;
      now: Date;
    },
  ): Promise<void> {
    const result: { affectedRows: number } = await em.query(
      `UPDATE yeu_cau_rut_tien SET trang_thai = ?, nguoi_xu_ly_id = ?, thoi_diem_xu_ly = ?
        WHERE yeu_cau_rut_tien_id = ? AND trang_thai = 'ChoDuyet'`,
      [input.trangThai, input.nguoiXuLyId, input.now, input.maYeuCau],
    );
    if (result.affectedRows !== 1)
      throw new Error('Yêu cầu rút không còn ở ChoDuyet dưới khoá');
  }
}
