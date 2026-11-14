import type { DataSource, EntityManager } from 'typeorm';

// Hạ tầng test dùng chung của phần khám bệnh (doctor-exam P3; PLAN 5.15: dữ liệu và bước dùng chung nằm ở `doctor/examination/testing/` vì jscpd quét cả `*.int-spec.ts`).
// Chèn thẳng bằng SQL, KHÔNG qua service (service là việc của B1 trở đi), nên test bất biến và test kiến trúc dùng được trước khi có mã nghiệp vụ. Giờ ghi bằng CHUỖI
// (doctor H1: không qua `Date`). Nằm trong `testing/` nên HD-08, AR-01 và PD-19 bỏ qua thư mục này.
// Để dành cho task sau (B1, B2…): bác sĩ và bệnh nhân thứ hai, đọc lại hồ sơ, `ExamNotifier` giả, bộ dựng yêu cầu HTTP và đăng nhập cho e2e.

/** Mốc mặc định của dữ liệu mẫu: 09:00 ngày 10/11/2026, cùng ngày với 8 khung giờ của `BookingFixtures.world()`. */
export const EXAM_AT = '2026-11-10 09:00:00';

export interface ExamRecordInput {
  trieuChung?: string | null;
  chanDoanSoBo?: string | null;
  huongXuLy?: string | null;
  ngayTaiKhamDuKien?: string | null;
  capNhatLanCuoi?: string;
}

export interface RatingInput {
  soSao?: number;
  nhanXet?: string | null;
  biAn?: boolean;
  lyDoAn?: string | null;
  thoiDiemTao?: string;
}

/** Hai hành động của nhật ký thuộc phần khám bệnh và bảng chúng tác động (ENUM đã có sẵn từ P1, MGK-09). */
const AUDIT_TARGET = {
  SuaGhiChuKham: 'ho_so_kham',
  AnDanhGia: 'danh_gia_bac_si',
} as const;

export interface AuditRowInput {
  /** Người thực hiện (tai_khoan_id) */
  taiKhoanId: string;
  hanhDong: keyof typeof AUDIT_TARGET;
  /** `ho_so_kham_id` hay `danh_gia_bac_si_id` (không có khoá ngoại: có thể trỏ bản ghi không tồn tại để gài lỗi) */
  maDoiTuong: string;
  ketQua?: 'ThanhCong' | 'ThatBai';
}

/** `undefined` ⇒ giá trị mặc định; `null` là NULL thật (khác `??`, vốn coi `null` như vắng). */
const orDefault = <T>(value: T | undefined, fallback: T): T =>
  value === undefined ? fallback : value;

export class ExamFixtures {
  constructor(private readonly db: DataSource | EntityManager) {}

  /** Một dòng `ho_so_kham` của lịch (mặc định đủ ba trường chữ, không ngày tái khám); trả `ho_so_kham_id`. */
  async record(
    lichHenId: string,
    input: ExamRecordInput = {},
  ): Promise<string> {
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO ho_so_kham (lich_hen_id, trieu_chung, chan_doan_so_bo, huong_xu_ly, ngay_tai_kham_du_kien, cap_nhat_lan_cuoi)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        lichHenId,
        orDefault(input.trieuChung, 'Ho khan, sốt nhẹ hai ngày'),
        orDefault(input.chanDoanSoBo, 'Viêm họng cấp'),
        orDefault(input.huongXuLy, 'Uống đủ nước, nghỉ ngơi'),
        orDefault(input.ngayTaiKhamDuKien, null),
        input.capNhatLanCuoi ?? EXAM_AT,
      ],
    );
    return String(result.insertId);
  }

  /** Một dòng `danh_gia_bac_si` của lịch (mặc định 5 sao, không nhận xét, chưa ẩn); trả `danh_gia_bac_si_id`. `biAn` và `lyDoAn` ghi đúng như truyền (kể cả tổ hợp CHECK đang chặn). */
  async rating(lichHenId: string, input: RatingInput = {}): Promise<string> {
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, nhan_xet, bi_an, ly_do_an, thoi_diem_tao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        lichHenId,
        input.soSao ?? 5,
        orDefault(input.nhanXet, null),
        input.biAn === true ? 1 : 0,
        orDefault(input.lyDoAn, null),
        input.thoiDiemTao ?? EXAM_AT,
      ],
    );
    return String(result.insertId);
  }

  /** Một dòng `nhat_ky_hanh_dong` của `SuaGhiChuKham` hay `AnDanhGia` (đối tượng suy ra từ hành động); trả `nhat_ky_hanh_dong_id`. */
  async audit(input: AuditRowInput): Promise<string> {
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.taiKhoanId,
        input.hanhDong,
        AUDIT_TARGET[input.hanhDong],
        input.maDoiTuong,
        EXAM_AT,
        input.ketQua ?? 'ThanhCong',
      ],
    );
    return String(result.insertId);
  }
}
