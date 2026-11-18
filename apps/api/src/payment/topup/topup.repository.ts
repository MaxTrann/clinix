import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TrangThaiGiaoDichThanhToan } from '../entities/payment-enums.js';
import type { TopupGateway } from '../../wallet/wallet.constants.js';

// SQL của nạp ví (payment B4; PLAN 5.4). Mọi câu nhận `em` của người gọi (đọc thường hay trong giao dịch). Không `NOW()`: giờ do service truyền (QTT-08).

/** Một dòng nạp ví (`loai = NapVi`) kèm chủ ví. Tiền là chuỗi decimal; id là chuỗi. */
export interface TopupRow {
  giaoDichId: string;
  viNoiBoId: string;
  benhNhanId: string;
  phuongThuc: TopupGateway;
  soTien: string;
  trangThai: TrangThaiGiaoDichThanhToan;
  thoiDiemTao: Date;
  /** Đã có dòng sổ cái `Nap` cho giao dịch này chưa (tiền đã vào ví). */
  daCongVi: boolean;
}

const SELECT_TOPUP = `
  SELECT CAST(g.giao_dich_thanh_toan_id AS CHAR) AS giaoDichId,
         CAST(g.vi_noi_bo_id AS CHAR) AS viNoiBoId,
         CAST(v.benh_nhan_id AS CHAR) AS benhNhanId,
         g.phuong_thuc AS phuongThuc,
         g.so_tien AS soTien,
         g.trang_thai AS trangThai,
         g.thoi_diem_tao AS thoiDiemTao,
         EXISTS (SELECT 1 FROM giao_dich_vi d WHERE d.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id AND d.loai = 'Nap') AS daCongVi
    FROM giao_dich_thanh_toan g
    JOIN vi_noi_bo v ON v.vi_noi_bo_id = g.vi_noi_bo_id
   WHERE g.giao_dich_thanh_toan_id = ? AND g.loai = 'NapVi'`;

type RawTopupRow = Omit<TopupRow, 'daCongVi'> & { daCongVi: number | string };

const toRow = (raw: RawTopupRow | undefined): TopupRow | null =>
  raw === undefined ? null : { ...raw, daCongVi: Number(raw.daCongVi) === 1 };

@Injectable()
export class TopupRepository {
  /** `vi_noi_bo_id` của Bệnh nhân (đọc thường). Không có ví ⇒ `null`. */
  async findWalletId(
    em: EntityManager,
    benhNhanId: string,
  ): Promise<string | null> {
    const rows: { id: string }[] = await em.query(
      'SELECT CAST(vi_noi_bo_id AS CHAR) AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
      [benhNhanId],
    );
    return rows[0]?.id ?? null;
  }

  /** Ghi dòng nạp mới ở `DangXuLy` (chưa có mã cổng, không cần đối soát). Trả id. */
  async insertTopup(
    em: EntityManager,
    input: {
      viNoiBoId: string;
      phuongThuc: TopupGateway;
      soTien: string;
      now: Date;
    },
  ): Promise<string> {
    const result: { insertId: number | string } = await em.query(
      `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, loai, phuong_thuc, so_tien, trang_thai, trang_thai_doi_soat, thoi_diem_tao)
       VALUES (?, 'NapVi', ?, ?, 'DangXuLy', 'KhongCan', ?)`,
      [input.viNoiBoId, input.phuongThuc, input.soTien, input.now],
    );
    return String(result.insertId);
  }

  /** Đọc thường một dòng nạp theo id. */
  async findTopup(
    em: EntityManager,
    giaoDichId: string,
  ): Promise<TopupRow | null> {
    const rows: RawTopupRow[] = await em.query(SELECT_TOPUP, [giaoDichId]);
    return toRow(rows[0]);
  }

  /** Khoá `FOR UPDATE` một dòng nạp (hạng 7a): tuần tự hoá mọi IPN của CÙNG giao dịch (số đo M5). */
  async lockTopup(
    em: EntityManager,
    giaoDichId: string,
  ): Promise<TopupRow | null> {
    const rows: RawTopupRow[] = await em.query(
      `${SELECT_TOPUP} FOR UPDATE OF g`,
      [giaoDichId],
    );
    return toRow(rows[0]);
  }

  /** Ghi kết quả của cổng lên dòng nạp. `doiSoat = ChoDoiSoat` khi cổng báo thành công nhưng chưa cộng được ví (A3). */
  async markResult(
    em: EntityManager,
    giaoDichId: string,
    input: {
      trangThai: 'ThanhCong' | 'ThatBai';
      maGiaoDichCong: string | null;
      doiSoat?: 'KhongCan' | 'ChoDoiSoat';
    },
  ): Promise<void> {
    await em.query(
      `UPDATE giao_dich_thanh_toan SET trang_thai = ?, ma_giao_dich_cong = ?, trang_thai_doi_soat = ?
        WHERE giao_dich_thanh_toan_id = ?`,
      [
        input.trangThai,
        input.maGiaoDichCong,
        input.doiSoat ?? 'KhongCan',
        giaoDichId,
      ],
    );
  }

  /** Lần thử cộng ví số 0 (lần cộng đầu lúc xác minh bị lỗi), để job đối soát (B14) biết thời điểm xác minh và đếm lần thử. */
  async insertFirstCreditFailure(
    em: EntityManager,
    input: { giaoDichId: string; lyDo: string; now: Date },
  ): Promise<void> {
    await em.query(
      `INSERT INTO lan_doi_soat_nap_vi (giao_dich_thanh_toan_id, so_lan_thu, ket_qua, nguoi_xu_ly_id, ly_do, thoi_diem)
       VALUES (?, 0, 'ThatBai', NULL, ?, ?)`,
      [input.giaoDichId, input.lyDo, input.now],
    );
  }
}
