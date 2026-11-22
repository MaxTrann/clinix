import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { TrangThaiYeuCauThayDoiChiNhanh } from '../../entities/enums.js';

// Câu SQL của job áp dụng thay đổi chi nhánh (admin B11; PLAN admin 5.4 "Áp dụng"). Thời điểm đọc ra dạng 'YYYY-MM-DD HH:mm:ss' giờ VN (session +07:00).

const TS = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;

/** Điều kiện ứng viên: đã duyệt, chưa áp dụng, CHƯA từng quá hạn (quá hạn thì không bao giờ tự áp dụng muộn, Q48), đã tới hiệu lực. */
const DUE_SQL = `y.trang_thai = 'DaDuyet' AND y.ap_dung_luc IS NULL AND y.qua_han_luc IS NULL AND y.hieu_luc_tu <= ?`;

export interface DueCursor {
  hieuLucTu: string;
  id: string;
}

export interface LockedForApply {
  yeuCauThayDoiChiNhanhId: string;
  chiNhanhId: string;
  tenChiNhanh: string;
  nguoiDeXuatId: string;
  trangThai: TrangThaiYeuCauThayDoiChiNhanh;
  /** 'YYYY-MM-DD HH:mm:ss'; `null` chỉ khi chưa duyệt */
  hieuLucTu: string | null;
  hieuLucTuDate: Date | null;
  apDungLuc: string | null;
  quaHanLuc: string | null;
  soLanDoiHieuLuc: number;
  noiDungTruoc: unknown;
  noiDungSau: unknown;
}

@Injectable()
export class BranchChangeApplyRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  writeTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /** Một lô ứng viên theo (hieu_luc_tu, id), sau con trỏ `after`. Chỉ là DANH SÁCH: điều kiện được kiểm lại dưới khoá. */
  findDue(input: {
    now: Date;
    after: DueCursor | null;
    limit: number;
  }): Promise<DueCursor[]> {
    const cursor =
      input.after === null
        ? ''
        : ' AND (y.hieu_luc_tu > ? OR (y.hieu_luc_tu = ? AND y.yeu_cau_thay_doi_chi_nhanh_id > ?))';
    const parameters: unknown[] = [input.now];
    if (input.after !== null)
      parameters.push(
        input.after.hieuLucTu,
        input.after.hieuLucTu,
        input.after.id,
      );
    return this.db.query(
      `SELECT ${TS('y.hieu_luc_tu')} AS hieuLucTu, CAST(y.yeu_cau_thay_doi_chi_nhanh_id AS CHAR) AS id
         FROM yeu_cau_thay_doi_chi_nhanh y
        WHERE ${DUE_SQL}${cursor}
        ORDER BY y.hieu_luc_tu, y.yeu_cau_thay_doi_chi_nhanh_id
        LIMIT ?`,
      [...parameters, input.limit],
    );
  }

  /** Khoá dòng yêu cầu `FOR UPDATE OF y` (cùng hàng mà duyệt, hủy, dời khoá: ai giữ trước thì bên kia chờ rồi thấy kết quả đã commit). */
  async lockForApply(
    manager: EntityManager,
    id: string,
  ): Promise<LockedForApply | null> {
    const rows: (LockedForApply & { soLanDoiHieuLuc: number | string })[] =
      await manager.query(
        `SELECT CAST(y.yeu_cau_thay_doi_chi_nhanh_id AS CHAR) AS yeuCauThayDoiChiNhanhId, CAST(y.chi_nhanh_id AS CHAR) AS chiNhanhId,
                cn.ten AS tenChiNhanh, CAST(y.nguoi_de_xuat_id AS CHAR) AS nguoiDeXuatId, y.trang_thai AS trangThai,
                ${TS('y.hieu_luc_tu')} AS hieuLucTu, y.hieu_luc_tu AS hieuLucTuDate, ${TS('y.ap_dung_luc')} AS apDungLuc,
                ${TS('y.qua_han_luc')} AS quaHanLuc, y.so_lan_doi_hieu_luc AS soLanDoiHieuLuc,
                y.noi_dung_truoc AS noiDungTruoc, y.noi_dung_sau AS noiDungSau
           FROM yeu_cau_thay_doi_chi_nhanh y
           JOIN chi_nhanh cn ON cn.chi_nhanh_id = y.chi_nhanh_id
          WHERE y.yeu_cau_thay_doi_chi_nhanh_id = ?
          FOR UPDATE OF y`,
        [id],
      );
    const row = rows[0];
    return row === undefined
      ? null
      : { ...row, soLanDoiHieuLuc: Number(row.soLanDoiHieuLuc) };
  }

  /**
   * Đặt `ap_dung_luc` (hoặc `qua_han_luc`) CÓ ĐIỀU KIỆN như câu chọn ứng viên: trả số dòng đổi (0 = đã có bên khác xử lý).
   * Đặt `ap_dung_luc` làm cột sinh `dang_mo_chi_nhanh` về NULL: chi nhánh gửi được yêu cầu mới sau khi áp dụng (Q3).
   */
  async mark(
    manager: EntityManager,
    input: { id: string; column: 'ap_dung_luc' | 'qua_han_luc'; now: Date },
  ): Promise<number> {
    const result: { affectedRows?: number } = await manager.query(
      `UPDATE yeu_cau_thay_doi_chi_nhanh y SET y.${input.column} = ?
        WHERE y.yeu_cau_thay_doi_chi_nhanh_id = ? AND ${DUE_SQL}`,
      [input.now, input.id, input.now],
    );
    return result.affectedRows ?? 0;
  }

  /** Quản trị viên Toàn hệ thống đang hoạt động (nhận cảnh báo quá hạn, CN-109), theo id. */
  activeSystemAdmins(
    manager: EntityManager,
  ): Promise<{ taiKhoanId: string }[]> {
    return manager.query(
      `SELECT CAST(q.tai_khoan_id AS CHAR) AS taiKhoanId
         FROM quan_tri_vien q JOIN tai_khoan t ON t.tai_khoan_id = q.tai_khoan_id
        WHERE q.pham_vi_quan_tri = 'ToanHeThong' AND t.trang_thai = 'DangHoatDong'
        ORDER BY q.tai_khoan_id`,
    );
  }
}
