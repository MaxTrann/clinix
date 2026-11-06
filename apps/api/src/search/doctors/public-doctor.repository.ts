import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import type { SurchargeRule } from '../../pricing/surcharge.calculator.js';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../common/public-doctor.sql.js';
import { runReadOnly } from '../common/read-only-tx.js';
import type { ScheduleRow } from '../common/weekly-schedule.view.js';
import { ExamPriceReader } from '../pricing/exam-price.reader.js';
import type { DoctorFilters } from './doctor-filter.parser.js';

/** Ứng viên thô từ SQL — chỉ các cột trong danh sách trắng (Q14), chưa có giá áp dụng và điểm. */
export interface DoctorCandidate {
  bacSiId: string;
  hoTen: string;
  chucDanh: ChucDanhBacSi;
  soNamKinhNghiem: number;
  chuyenKhoaId: string;
  chuyenKhoaTen: string;
  chiNhanhId: string;
  chiNhanhTen: string;
  chiNhanhDiaChi: string;
  dichVuKhamId: string;
  dichVuTen: string;
  thoiLuong: number;
  giaMacDinh: string;
  mucDatCoc: string;
}

/** Ứng viên + mô tả chuyên môn (chỉ dùng ở trang chi tiết, TCBS b9). */
export interface DoctorDetailRow extends DoctorCandidate {
  moTaChuyenMon: string | null;
}

// Cột danh sách trắng (Q14) và phần FROM/JOIN dùng chung cho danh sách (B5) và chi tiết (B6) để hai nơi không lệch nhau.
const CANDIDATE_COLUMNS = `b.tai_khoan_id AS bacSiId, t.ho_ten AS hoTen, b.chuc_danh AS chucDanh,
  b.so_nam_kinh_nghiem AS soNamKinhNghiem,
  ck.chuyen_khoa_id AS chuyenKhoaId, ck.ten AS chuyenKhoaTen,
  cn.chi_nhanh_id AS chiNhanhId, cn.ten AS chiNhanhTen, cn.dia_chi AS chiNhanhDiaChi,
  dv.dich_vu_kham_id AS dichVuKhamId, dv.ten AS dichVuTen, dv.thoi_luong AS thoiLuong,
  dv.gia_mac_dinh AS giaMacDinh, dv.muc_dat_coc AS mucDatCoc`;
const CANDIDATE_FROM = `${PUBLIC_DOCTOR_FROM}
  JOIN chi_nhanh cn ON cn.chi_nhanh_id = b.chi_nhanh_id
  JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = b.dich_vu_kham_id`;

@Injectable()
export class PublicDoctorRepository {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    private readonly prices: ExamPriceReader,
  ) {}

  /**
   * Ứng viên + toàn bộ quy tắc phụ phí trong MỘT giao dịch chỉ đọc (cùng ảnh chụp dữ liệu, H6).
   * Điều kiện "bác sĩ công khai" là hằng chung `PUBLIC_DOCTOR_CONDITION` (H5); mọi giá trị người dùng đi qua tham số `?`.
   * Giá/điểm KHÔNG tính ở SQL (H3): lọc giá, điểm làm trong bộ nhớ sau khi gọi hàm giá chung.
   */
  findCandidates(
    filters: Pick<
      DoctorFilters,
      'dichVuKhamId' | 'chuyenKhoaId' | 'chiNhanhId' | 'likePattern'
    >,
  ): Promise<{ candidates: DoctorCandidate[]; rules: SurchargeRule[] }> {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filters.dichVuKhamId) {
      conditions.push('b.dich_vu_kham_id = ?');
      params.push(filters.dichVuKhamId);
    }
    if (filters.chuyenKhoaId) {
      conditions.push('b.chuyen_khoa_id = ?');
      params.push(filters.chuyenKhoaId);
    }
    if (filters.chiNhanhId) {
      conditions.push('b.chi_nhanh_id = ?');
      params.push(filters.chiNhanhId);
    }
    if (filters.likePattern) {
      // Khớp họ tên hoặc tên chuyên khoa (Q23); collation của schema không phân biệt hoa/thường và dấu.
      conditions.push(
        `(t.ho_ten LIKE ? ESCAPE '!' OR ck.ten LIKE ? ESCAPE '!')`,
      );
      params.push(filters.likePattern, filters.likePattern);
    }
    const extra = conditions.map((c) => `AND ${c}`).join(' ');
    return runReadOnly(this.db, async (manager) => {
      const candidates = await manager.query<DoctorCandidate[]>(
        `SELECT ${CANDIDATE_COLUMNS}
         FROM ${CANDIDATE_FROM}
         WHERE ${PUBLIC_DOCTOR_CONDITION} ${extra}`,
        params,
      );
      const rules = await this.prices.loadRules(manager);
      return { candidates, rules };
    });
  }

  /**
   * Một bác sĩ công khai + quy tắc phụ phí + lịch giờ nhận khám của chi nhánh bác sĩ, cùng một ảnh chụp dữ liệu.
   * Dùng đúng `PUBLIC_DOCTOR_CONDITION` như danh sách (H5): không công khai ⇒ `null` (404 ở service, cùng thân với "không có").
   */
  findDetail(id: string): Promise<{
    doctor: DoctorDetailRow;
    rules: SurchargeRule[];
    schedule: ScheduleRow[];
  } | null> {
    return runReadOnly(this.db, async (manager) => {
      const rows = await manager.query<DoctorDetailRow[]>(
        `SELECT ${CANDIDATE_COLUMNS}, b.mo_ta_chuyen_mon AS moTaChuyenMon
         FROM ${CANDIDATE_FROM}
         WHERE ${PUBLIC_DOCTOR_CONDITION} AND b.tai_khoan_id = ?`,
        [id],
      );
      const doctor = rows[0];
      if (!doctor) return null;
      // Chỉ lịch ĐANG ÁP DỤNG của chi nhánh, không đụng yêu cầu thay đổi đang chờ (H2).
      const schedule = await manager.query<ScheduleRow[]>(
        `SELECT thu_trong_tuan AS thuTrongTuan, hoat_dong AS hoatDong,
                gio_bat_dau_sang AS gioBatDauSang, gio_ket_thuc_sang AS gioKetThucSang,
                gio_bat_dau_chieu AS gioBatDauChieu, gio_ket_thuc_chieu AS gioKetThucChieu
         FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ?`,
        [doctor.chiNhanhId],
      );
      const rules = await this.prices.loadRules(manager);
      return {
        doctor,
        rules,
        // mysql2 trả TINYINT(1) là 0/1: đổi sang boolean cho view.
        schedule: schedule.map((row) => ({
          ...row,
          hoatDong: Boolean(row.hoatDong),
        })),
      };
    });
  }
}
