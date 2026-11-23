import type { DataSource, EntityManager } from 'typeorm';
import {
  toRequestRow,
  type ScheduleRowValue,
} from '../../admin/branches/impact/branch-diff.js';

// Hạ tầng test của B16b (TRACKING booking 3.50.3): chèn THẳNG một dòng `yeu_cau_thay_doi_chi_nhanh` ở trạng thái bất kỳ, như `DoctorFixtures.leaveRequest` chèn yêu cầu nghỉ phép. Nội dung JSON dựng bằng
// `toRequestRow` của admin (một định nghĩa dạng JSON, quy tắc 43), nên admin đổi dạng thì test này đỏ ngay. Mỗi trạng thái thoả `chk_yc_chi_nhanh_xu_ly` (DDL dòng 1030): `DaDuyet` và `DaHuy` có `hieu_luc_tu >= thoi_diem_duyet + so_ngay_bao_truoc ngày`,
// `ap_dung_luc` và `qua_han_luc` (nếu có) `>= hieu_luc_tu`. Dữ liệu giả; mọi ngày giờ là MINH HOẠ cho test.

export type ChangeRequestStatus =
  'ChoDuyet' | 'DaDuyet' | 'TuChoi' | 'DaRut' | 'DaHuy';

export interface PendingChangeInput {
  chiNhanhId: string;
  /** `nguoi_de_xuat_id` (tài khoản có thật) */
  proposerId: string;
  /** Người duyệt, từ chối, hoặc huỷ (tài khoản có thật) */
  approverId: string;
  /** Mặc định `DaDuyet` (yêu cầu đã duyệt chưa áp dụng: đúng thứ cổng cần thấy) */
  trangThai?: ChangeRequestStatus;
  /** 'YYYY-MM-DD HH:mm:ss' giờ VN; mặc định Thứ Hai 09/11/2026 07:00 (trước `BOOKABLE_DAY`) */
  hieuLucTu?: string;
  /** Dòng MỚI của từng thứ đổi (`noi_dung_sau.lich_hoat_dong`); không đưa thì yêu cầu không đổi lịch */
  lichHoatDong?: readonly ScheduleRowValue[];
  /** `dich_vu_kham_ids` trước và sau (dịch vụ bỏ = có ở trước mà không có ở sau); không đưa thì không đổi dịch vụ */
  dichVuTruoc?: readonly string[];
  dichVuSau?: readonly string[];
  /** Chỉ với `DaDuyet`: đánh dấu quá hạn / đã áp dụng ('YYYY-MM-DD HH:mm:ss', phải `>= hieuLucTu`) */
  quaHanLuc?: string;
  apDungLuc?: string;
}

export const APPROVED_AT = '2026-11-01 09:00:00';
export const NOTICE_DAYS = 3;
export const DEFAULT_EFFECTIVE_FROM = '2026-11-09 07:00:00';

/** Lịch hiện hành mặc định của thế giới test (`AdminFixtures.weeklySchedule`): sáng 08:00 đến 12:00, chiều 13:00 đến 17:00. */
export const CURRENT_DAY = {
  hoatDong: true,
  gioBatDauSang: '08:00:00',
  gioKetThucSang: '12:00:00',
  gioBatDauChieu: '13:00:00',
  gioKetThucChieu: '17:00:00',
} as const;

/** Dòng MỚI của một thứ: đổi một phần so với lịch hiện hành mặc định. */
export const scheduleRow = (
  thuTrongTuan: number,
  over: Partial<Omit<ScheduleRowValue, 'thuTrongTuan'>> = {},
): ScheduleRowValue => ({ thuTrongTuan, ...CURRENT_DAY, ...over });

/** Dòng MỚI "ngày đóng" của một thứ (khoảng không có ghi `null`, như B8 ghi). */
export const closedRow = (thuTrongTuan: number): ScheduleRowValue => ({
  thuTrongTuan,
  hoatDong: false,
  gioBatDauSang: null,
  gioKetThucSang: null,
  gioBatDauChieu: null,
  gioKetThucChieu: null,
});

export class PendingChangeFixtures {
  /** `DataSource` hay `EntityManager` của một giao dịch đang mở (ca đồng thời chèn yêu cầu CHƯA COMMIT). */
  constructor(private readonly db: Pick<DataSource | EntityManager, 'query'>) {}

  /** Chèn một yêu cầu; trả `yeu_cau_thay_doi_chi_nhanh_id` dạng chuỗi. */
  async insert(input: PendingChangeInput): Promise<string> {
    const trangThai = input.trangThai ?? 'DaDuyet';
    const handled = trangThai !== 'ChoDuyet' && trangThai !== 'DaRut';
    const withEffect = trangThai === 'DaDuyet' || trangThai === 'DaHuy';
    const rows = input.lichHoatDong ?? [];
    const truoc: Record<string, unknown> = {};
    const sau: Record<string, unknown> = {};
    if (input.lichHoatDong !== undefined) {
      // phía trước: lịch hiện hành mặc định của đúng các thứ đổi
      truoc.lich_hoat_dong = rows.map((row) =>
        toRequestRow(scheduleRow(row.thuTrongTuan)),
      );
      sau.lich_hoat_dong = rows.map(toRequestRow);
    }
    if (input.dichVuTruoc !== undefined)
      truoc.dich_vu_kham_ids = input.dichVuTruoc;
    if (input.dichVuSau !== undefined) sau.dich_vu_kham_ids = input.dichVuSau;
    // CHECK: hai nội dung phải là object KHÔNG rỗng
    if (Object.keys(truoc).length === 0) truoc.lich_hoat_dong = [];
    if (Object.keys(sau).length === 0) sau.lich_hoat_dong = [];

    const result: { insertId: string } = await this.db.query(
      `INSERT INTO yeu_cau_thay_doi_chi_nhanh
         (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau, trang_thai, nguoi_duyet_id, thoi_diem_duyet, ly_do_tu_choi,
          so_ngay_bao_truoc, hieu_luc_tu, ap_dung_luc, nguoi_huy_id, thoi_diem_huy, ly_do_huy, qua_han_luc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.chiNhanhId,
        input.proposerId,
        JSON.stringify(truoc),
        JSON.stringify(sau),
        trangThai,
        handled ? input.approverId : null,
        handled ? APPROVED_AT : null,
        trangThai === 'TuChoi' ? 'Chưa phù hợp' : null,
        withEffect ? NOTICE_DAYS : null,
        withEffect ? (input.hieuLucTu ?? DEFAULT_EFFECTIVE_FROM) : null,
        trangThai === 'DaDuyet' ? (input.apDungLuc ?? null) : null,
        trangThai === 'DaHuy' ? input.approverId : null,
        trangThai === 'DaHuy' ? '2026-11-02 09:00:00' : null,
        trangThai === 'DaHuy' ? 'Huỷ thử' : null,
        withEffect ? (input.quaHanLuc ?? null) : null,
      ],
    );
    return String(result.insertId);
  }
}
