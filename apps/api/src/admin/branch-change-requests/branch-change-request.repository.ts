import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { Paged } from '../../common/paging/paged.js';
import type { AffectedAppointment } from '../branches/impact/branch-impact.service.js';
import type { TrangThaiYeuCauThayDoiChiNhanh } from '../entities/enums.js';
import type { BranchChangeRequestListDto } from './branch-change-request.dto.js';

// Đọc và ghi bảng `yeu_cau_thay_doi_chi_nhanh` cho trang quản trị (admin B9; PLAN admin 5.3, 5.4).
// Mọi thời điểm trả dạng 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam (session MySQL đặt +07:00, DB lưu giờ VN — Q43), như danh sách ảnh hưởng của B8.

const TS = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;

/** Cột chung của danh sách và chi tiết. `noiDungSau` là JSON (mysql2 tự đọc thành object). */
export interface RequestRow {
  yeuCauThayDoiChiNhanhId: string;
  chiNhanhId: string;
  tenChiNhanh: string;
  nguoiDeXuatId: string;
  tenNguoiDeXuat: string;
  trangThai: TrangThaiYeuCauThayDoiChiNhanh;
  thoiDiemTao: string;
  thoiDiemDuyet: string | null;
  hieuLucTu: string | null;
  apDungLuc: string | null;
  quaHanLuc: string | null;
  noiDungSau: unknown;
}

export interface RequestDetailRow extends RequestRow {
  noiDungTruoc: unknown;
  nguoiDuyetId: string | null;
  tenNguoiDuyet: string | null;
  lyDoTuChoi: string | null;
  soNgayBaoTruoc: number | null;
  nguoiHuyId: string | null;
  tenNguoiHuy: string | null;
  thoiDiemHuy: string | null;
  lyDoHuy: string | null;
  soLanDoiHieuLuc: number;
  /** `hieu_luc_tu` dạng Date, làm mốc tính lại ảnh hưởng */
  hieuLucTuDate: Date | null;
}

/** Hàng đã khoá để từ chối hay duyệt: chỉ những gì giao dịch cần. */
export interface LockedRequest {
  yeuCauThayDoiChiNhanhId: string;
  chiNhanhId: string;
  tenChiNhanh: string;
  nguoiDeXuatId: string;
  trangThai: TrangThaiYeuCauThayDoiChiNhanh;
  thoiDiemTao: string;
  /** JSON (mysql2 tự đọc thành object); duyệt cần để tính ảnh hưởng */
  noiDungTruoc: unknown;
  noiDungSau: unknown;
  soLanDoiHieuLuc: number;
}

const FROM_SQL = `FROM yeu_cau_thay_doi_chi_nhanh y
  JOIN chi_nhanh cn ON cn.chi_nhanh_id = y.chi_nhanh_id
  JOIN tai_khoan dx ON dx.tai_khoan_id = y.nguoi_de_xuat_id`;

const COLUMNS_SQL = `SELECT CAST(y.yeu_cau_thay_doi_chi_nhanh_id AS CHAR) AS yeuCauThayDoiChiNhanhId,
       CAST(y.chi_nhanh_id AS CHAR) AS chiNhanhId, cn.ten AS tenChiNhanh,
       CAST(y.nguoi_de_xuat_id AS CHAR) AS nguoiDeXuatId, dx.ho_ten AS tenNguoiDeXuat,
       y.trang_thai AS trangThai, ${TS('y.thoi_diem_tao')} AS thoiDiemTao, ${TS('y.thoi_diem_duyet')} AS thoiDiemDuyet,
       ${TS('y.hieu_luc_tu')} AS hieuLucTu, ${TS('y.ap_dung_luc')} AS apDungLuc, ${TS('y.qua_han_luc')} AS quaHanLuc,
       y.noi_dung_sau AS noiDungSau`;

const DETAIL_SQL = `${COLUMNS_SQL}, y.noi_dung_truoc AS noiDungTruoc,
       CAST(y.nguoi_duyet_id AS CHAR) AS nguoiDuyetId, nd.ho_ten AS tenNguoiDuyet, y.ly_do_tu_choi AS lyDoTuChoi,
       y.so_ngay_bao_truoc AS soNgayBaoTruoc, CAST(y.nguoi_huy_id AS CHAR) AS nguoiHuyId, nh.ho_ten AS tenNguoiHuy,
       ${TS('y.thoi_diem_huy')} AS thoiDiemHuy, y.ly_do_huy AS lyDoHuy, y.so_lan_doi_hieu_luc AS soLanDoiHieuLuc,
       y.hieu_luc_tu AS hieuLucTuDate
  ${FROM_SQL}
  LEFT JOIN tai_khoan nd ON nd.tai_khoan_id = y.nguoi_duyet_id
  LEFT JOIN tai_khoan nh ON nh.tai_khoan_id = y.nguoi_huy_id`;

@Injectable()
export class BranchChangeRequestRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Giao dịch đọc nhất quán (một mốc cho dòng yêu cầu, tên dịch vụ, ảnh hưởng và trạng thái thư). */
  readTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('REPEATABLE READ', work);
  }

  writeTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /** `branchId`: bộ lọc phạm vi đã quyết ở service. SELECT và COUNT cùng điều kiện, trong một giao dịch. */
  async list(
    input: BranchChangeRequestListDto,
    branchId: string | undefined,
  ): Promise<Paged<RequestRow>> {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    if (branchId !== undefined) {
      conditions.push('y.chi_nhanh_id = ?');
      parameters.push(branchId);
    }
    if (input.trangThai !== undefined) {
      conditions.push('y.trang_thai = ?');
      parameters.push(input.trangThai);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    return this.readTransaction(async (manager) => {
      // Mới nhất trước; id phá hoà khi cùng giây để phân trang không lặp hay sót dòng
      const rows: RequestRow[] = await manager.query(
        `${COLUMNS_SQL} ${FROM_SQL}${where} ORDER BY y.thoi_diem_tao DESC, y.yeu_cau_thay_doi_chi_nhanh_id DESC LIMIT ? OFFSET ?`,
        [...parameters, input.pageSize, input.offset],
      );
      const counts: { total: string | number }[] = await manager.query(
        `SELECT COUNT(*) AS total ${FROM_SQL}${where}`,
        parameters,
      );
      return {
        items: rows,
        total: Number(counts[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  /** `null` khi không có hay ngoài phạm vi `branchId`. */
  async get(
    manager: EntityManager,
    id: string,
    branchId: string | undefined,
  ): Promise<RequestDetailRow | null> {
    const scope = branchId === undefined ? '' : ' AND y.chi_nhanh_id = ?';
    const rows: (RequestDetailRow & {
      soNgayBaoTruoc: number | string | null;
      soLanDoiHieuLuc: number | string;
    })[] = await manager.query(
      `${DETAIL_SQL} WHERE y.yeu_cau_thay_doi_chi_nhanh_id = ?${scope}`,
      branchId === undefined ? [id] : [id, branchId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      ...row,
      soNgayBaoTruoc:
        row.soNgayBaoTruoc === null ? null : Number(row.soNgayBaoTruoc),
      soLanDoiHieuLuc: Number(row.soLanDoiHieuLuc),
    };
  }

  /** Tên dịch vụ theo id (dịch vụ đã bị xoá thì không có trong kết quả). */
  async serviceNames(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows: { id: string; ten: string }[] = await manager.query(
      `SELECT CAST(dich_vu_kham_id AS CHAR) AS id, ten FROM dich_vu_kham WHERE dich_vu_kham_id IN (${ids.map(() => '?').join(', ')})`,
      [...ids],
    );
    return new Map(rows.map((row) => [row.id, row.ten]));
  }

  /** Bản chụp lịch hẹn ảnh hưởng ghi lúc duyệt (B10; Q46), sắp theo thời gian. */
  snapshot(manager: EntityManager, id: string): Promise<AffectedAppointment[]> {
    return manager.query(
      `SELECT CAST(s.lich_hen_id AS CHAR) AS lichHenId, lh.ma_lich_hen AS maLichHen, ${TS('lh.thoi_gian')} AS thoiGian,
              s.ly_do_anh_huong AS lyDoAnhHuong
         FROM yeu_cau_thay_doi_chi_nhanh_lich_hen s
         JOIN lich_hen lh ON lh.lich_hen_id = s.lich_hen_id
        WHERE s.yeu_cau_thay_doi_chi_nhanh_id = ?
        ORDER BY lh.thoi_gian, s.lich_hen_id`,
      [id],
    );
  }

  /** Khoá dòng yêu cầu `FOR UPDATE` (chỉ `y`, không khoá chi nhánh hay tài khoản). Không lọc phạm vi: từ chối chỉ dành cho Toàn hệ thống. */
  async lockForUpdate(
    manager: EntityManager,
    id: string,
  ): Promise<LockedRequest | null> {
    const rows: (LockedRequest & { soLanDoiHieuLuc: number | string })[] =
      await manager.query(
        `SELECT CAST(y.yeu_cau_thay_doi_chi_nhanh_id AS CHAR) AS yeuCauThayDoiChiNhanhId, CAST(y.chi_nhanh_id AS CHAR) AS chiNhanhId,
              cn.ten AS tenChiNhanh, CAST(y.nguoi_de_xuat_id AS CHAR) AS nguoiDeXuatId, y.trang_thai AS trangThai,
              ${TS('y.thoi_diem_tao')} AS thoiDiemTao, y.noi_dung_truoc AS noiDungTruoc, y.noi_dung_sau AS noiDungSau,
              y.so_lan_doi_hieu_luc AS soLanDoiHieuLuc
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
   * `ChoDuyet` → `DaDuyet`, có điều kiện trạng thái (H11), như `markRejected`. CHECK `chk_yc_chi_nhanh_xu_ly` đòi
   * `hieu_luc_tu >= thoi_diem_duyet + so_ngay_bao_truoc` ngày: service đã kiểm trước, CHECK là lớp chặn cuối.
   * Cột sinh `dang_mo_chi_nhanh` vẫn giữ chi nhánh (DaDuyet chưa áp dụng vẫn là "yêu cầu đang mở", Q3).
   */
  async markApproved(
    manager: EntityManager,
    input: {
      id: string;
      nguoiDuyetId: string;
      now: Date;
      soNgayBaoTruoc: number;
      hieuLucTu: Date;
    },
  ): Promise<number> {
    const result: { affectedRows?: number } = await manager.query(
      `UPDATE yeu_cau_thay_doi_chi_nhanh
          SET trang_thai = 'DaDuyet', nguoi_duyet_id = ?, thoi_diem_duyet = ?, so_ngay_bao_truoc = ?, hieu_luc_tu = ?
        WHERE yeu_cau_thay_doi_chi_nhanh_id = ? AND trang_thai = 'ChoDuyet'`,
      [
        input.nguoiDuyetId,
        input.now,
        input.soNgayBaoTruoc,
        input.hieuLucTu,
        input.id,
      ],
    );
    return result.affectedRows ?? 0;
  }

  /** Bản chụp lịch hẹn ảnh hưởng lúc duyệt (Q46): một dòng mỗi lịch hẹn (khoá chính (yêu cầu, lịch hẹn)), một câu INSERT. */
  async insertSnapshot(
    manager: EntityManager,
    id: string,
    rows: readonly AffectedAppointment[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await manager.query(
      `INSERT INTO yeu_cau_thay_doi_chi_nhanh_lich_hen (yeu_cau_thay_doi_chi_nhanh_id, lich_hen_id, ly_do_anh_huong)
       VALUES ${rows.map(() => '(?, ?, ?)').join(', ')}`,
      rows.flatMap((row) => [id, row.lichHenId, row.lyDoAnhHuong]),
    );
  }

  /** `lich_hen_id` ⇒ `benh_nhan_id` (người đặt; lịch của hồ sơ người thân cũng thuộc chủ tài khoản này). */
  async patientsOf(
    manager: EntityManager,
    lichHenIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (lichHenIds.length === 0) return new Map();
    const rows: { lichHenId: string; benhNhanId: string }[] =
      await manager.query(
        `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, CAST(benh_nhan_id AS CHAR) AS benhNhanId
           FROM lich_hen WHERE lich_hen_id IN (${lichHenIds.map(() => '?').join(', ')})`,
        [...lichHenIds],
      );
    return new Map(rows.map((row) => [row.lichHenId, row.benhNhanId]));
  }

  /**
   * `ChoDuyet` → `TuChoi`, có điều kiện trạng thái (H11): trả số dòng đổi (0 = đã có người xử lý trước).
   * Cột sinh `dang_mo_chi_nhanh` về NULL theo trạng thái mới, nên chi nhánh hết "yêu cầu đang mở" ngay khi commit (Q3).
   */
  async markRejected(
    manager: EntityManager,
    input: { id: string; nguoiDuyetId: string; lyDo: string; now: Date },
  ): Promise<number> {
    const result: { affectedRows?: number } = await manager.query(
      `UPDATE yeu_cau_thay_doi_chi_nhanh
          SET trang_thai = 'TuChoi', nguoi_duyet_id = ?, thoi_diem_duyet = ?, ly_do_tu_choi = ?
        WHERE yeu_cau_thay_doi_chi_nhanh_id = ? AND trang_thai = 'ChoDuyet'`,
      [input.nguoiDuyetId, input.now, input.lyDo, input.id],
    );
    return result.affectedRows ?? 0;
  }
}
