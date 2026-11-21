import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import type { Paged } from '../../common/paging/paged.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import type { SurchargeRule } from '../../pricing/surcharge.calculator.js';
import type { ChucDanhBacSi, HocViBacSi } from '../entities/enums.js';
import type { DoctorListDto } from './doctor.dto.js';

// Đọc hồ sơ bác sĩ cho trang quản trị (admin B12; PLAN admin 5.3, 5.7, Q21). CHỈ ĐỌC.
// Phụ phí và giá khám KHÔNG tính ở đây: gọi `ExamPriceReader` của `pricing/` (hàm chung với search và booking, quy tắc 11, Q21), để admin hiển thị đúng giá bệnh nhân sẽ thấy.
// Cố ý không chọn `mat_khau_bam`, mã xác thực, khoá đăng nhập hay dữ liệu lịch hẹn.

export type TrangThaiTaiKhoan =
  'ChoKichHoat' | 'DangHoatDong' | 'NgungHoatDong';

/** Một dòng danh sách bác sĩ. Tiền là chuỗi decimal như DB ("350000.00"). */
export interface DoctorListItem {
  taiKhoanId: string;
  hoTen: string;
  email: string;
  trangThaiTaiKhoan: TrangThaiTaiKhoan;
  chucDanh: ChucDanhBacSi;
  hocVi: HocViBacSi;
  soNamKinhNghiem: number;
  chuyenKhoa: { chuyenKhoaId: string; ten: string };
  chiNhanh: { chiNhanhId: string; ten: string };
  dichVuKham: { dichVuKhamId: string; ten: string };
  /** Giá mặc định của dịch vụ khám chính */
  giaMacDinh: string;
  /** Phụ phí hiện hành theo chức danh và kinh nghiệm */
  phuPhi: string;
  /** Giá dịch vụ = giá mặc định + phụ phí (Q15, Q21) */
  giaKham: string;
}

/** Chi tiết: thêm các trường chỉ cần ở màn hồ sơ và cho B13 (trạng thái chuyên khoa, Q19). */
export interface DoctorDetail extends Omit<DoctorListItem, 'chuyenKhoa'> {
  soDienThoai: string;
  moTaChuyenMon: string | null;
  chuyenKhoa: {
    chuyenKhoaId: string;
    ten: string;
    trangThaiHoatDong: 'DangHoatDong' | 'NgungHoatDong';
  };
}

interface DoctorRow {
  taiKhoanId: string;
  hoTen: string;
  email: string;
  soDienThoai: string;
  trangThaiTaiKhoan: TrangThaiTaiKhoan;
  chucDanh: ChucDanhBacSi;
  hocVi: HocViBacSi;
  soNamKinhNghiem: number | string;
  moTaChuyenMon: string | null;
  chuyenKhoaId: string;
  tenChuyenKhoa: string;
  trangThaiChuyenKhoa: 'DangHoatDong' | 'NgungHoatDong';
  chiNhanhId: string;
  tenChiNhanh: string;
  dichVuKhamId: string;
  tenDichVu: string;
  giaMacDinh: string;
}

const FROM_SQL = `FROM bac_si bs
  JOIN tai_khoan tk ON tk.tai_khoan_id = bs.tai_khoan_id
  JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id
  JOIN chi_nhanh cn ON cn.chi_nhanh_id = bs.chi_nhanh_id
  JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = bs.dich_vu_kham_id`;

export const DOCTOR_COLUMNS_SQL = `SELECT CAST(bs.tai_khoan_id AS CHAR) AS taiKhoanId, tk.ho_ten AS hoTen, tk.email AS email, tk.so_dien_thoai AS soDienThoai,
       tk.trang_thai AS trangThaiTaiKhoan, bs.chuc_danh AS chucDanh, bs.hoc_vi AS hocVi, bs.so_nam_kinh_nghiem AS soNamKinhNghiem,
       bs.mo_ta_chuyen_mon AS moTaChuyenMon,
       CAST(ck.chuyen_khoa_id AS CHAR) AS chuyenKhoaId, ck.ten AS tenChuyenKhoa, ck.trang_thai_hoat_dong AS trangThaiChuyenKhoa,
       CAST(cn.chi_nhanh_id AS CHAR) AS chiNhanhId, cn.ten AS tenChiNhanh,
       CAST(dv.dich_vu_kham_id AS CHAR) AS dichVuKhamId, dv.ten AS tenDichVu, dv.gia_mac_dinh AS giaMacDinh
  ${FROM_SQL}`;

@Injectable()
export class DoctorRepository {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ExamPriceReader) private readonly prices: ExamPriceReader,
  ) {}

  /**
   * Danh sách có phân trang. `branchId` là bộ lọc phạm vi đã quyết ở service (Chi nhánh: luôn là chi nhánh của mình).
   * SELECT, COUNT và bảng phụ phí đọc trong MỘT giao dịch REPEATABLE READ để tổng số, trang và giá khớp cùng một thời điểm.
   */
  async list(
    input: DoctorListDto,
    branchId: string | undefined,
  ): Promise<Paged<DoctorListItem>> {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    if (branchId !== undefined) {
      conditions.push('bs.chi_nhanh_id = ?');
      parameters.push(branchId);
    }
    if (input.chuyenKhoaId !== undefined) {
      conditions.push('bs.chuyen_khoa_id = ?');
      parameters.push(input.chuyenKhoaId);
    }
    if (input.q !== undefined) {
      const pattern = `%${escapeLikePattern(input.q)}%`;
      conditions.push(
        "(tk.ho_ten LIKE ? ESCAPE '!' OR tk.email LIKE ? ESCAPE '!')",
      );
      parameters.push(pattern, pattern);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

    return this.db.transaction('REPEATABLE READ', async (manager) => {
      // Sắp theo họ tên rồi id để thứ tự ổn định khi trùng tên (phân trang không lặp hay sót dòng)
      const rows: DoctorRow[] = await manager.query(
        `${DOCTOR_COLUMNS_SQL}${where} ORDER BY tk.ho_ten ASC, bs.tai_khoan_id ASC LIMIT ? OFFSET ?`,
        [...parameters, input.pageSize, input.offset],
      );
      const counts: { total: string | number }[] = await manager.query(
        `SELECT COUNT(*) AS total ${FROM_SQL}${where}`,
        parameters,
      );
      const rules = await this.prices.loadRules(manager);
      return {
        items: rows.map((row) => this.toListItem(row, rules)),
        total: Number(counts[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  /** Chi tiết một bác sĩ trong phạm vi `branchId` (nếu có); `null` khi không có hay ngoài phạm vi. */
  async get(
    id: string,
    branchId: string | undefined,
  ): Promise<DoctorDetail | null> {
    const scope = branchId === undefined ? '' : ' AND bs.chi_nhanh_id = ?';
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const rows: DoctorRow[] = await manager.query(
        `${DOCTOR_COLUMNS_SQL} WHERE bs.tai_khoan_id = ?${scope}`,
        branchId === undefined ? [id] : [id, branchId],
      );
      const row = rows[0];
      if (row === undefined) return null;
      const rules = await this.prices.loadRules(manager);
      const item = this.toListItem(row, rules);
      return {
        ...item,
        soDienThoai: row.soDienThoai,
        moTaChuyenMon: row.moTaChuyenMon,
        chuyenKhoa: {
          ...item.chuyenKhoa,
          trangThaiHoatDong: row.trangThaiChuyenKhoa,
        },
      };
    });
  }

  private toListItem(
    row: DoctorRow,
    rules: readonly SurchargeRule[],
  ): DoctorListItem {
    const soNamKinhNghiem = Number(row.soNamKinhNghiem);
    const giaMacDinh = String(row.giaMacDinh);
    const price = this.prices.priceFor(giaMacDinh, rules, {
      chucDanh: row.chucDanh,
      soNamKinhNghiem,
    });
    return {
      taiKhoanId: row.taiKhoanId,
      hoTen: row.hoTen,
      email: row.email,
      trangThaiTaiKhoan: row.trangThaiTaiKhoan,
      chucDanh: row.chucDanh,
      hocVi: row.hocVi,
      soNamKinhNghiem,
      chuyenKhoa: { chuyenKhoaId: row.chuyenKhoaId, ten: row.tenChuyenKhoa },
      chiNhanh: { chiNhanhId: row.chiNhanhId, ten: row.tenChiNhanh },
      dichVuKham: { dichVuKhamId: row.dichVuKhamId, ten: row.tenDichVu },
      giaMacDinh,
      phuPhi: price.phuPhi,
      giaKham: price.giaKham,
    };
  }
}
