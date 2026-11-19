import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import {
  ACCOUNT_FROM_SQL,
  type SqlCondition,
} from '../accounts/account-visibility.js';
import type { NamedParameters } from '../accounts/account.repository.js';
import type {
  DoctorDependents,
  LockTarget,
  SystemAdminState,
} from './account-lock.types.js';

// Số mục tối đa mỗi loại trong danh sách việc phụ thuộc khi khoá Bác sĩ (PLAN 5.6: "tối đa 50 + tổng").
export const DEPENDENTS_LIMIT = 50;

// Lịch hẹn còn "đang hoạt động" của một Bác sĩ: cùng định nghĩa với B13 (PLAN 5.7 A2) để hai danh sách không lệch nhau.
const ACTIVE_APPOINTMENT_STATES = "('ChoThanhToan','DaXacNhan','DaTiepDon')";

// Chỉ các cột chính sách cần. Chi nhánh của nhân sự lấy từ hồ sơ con theo LOẠI tài khoản; Bệnh nhân, Quản trị viên không có (audit để null).
const TARGET_COLUMNS = `
  CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId,
  t.loai_tai_khoan AS loaiTaiKhoan,
  t.trang_thai AS trangThai,
  qv.pham_vi_quan_tri AS phamViQuanTri,
  CAST(CASE t.loai_tai_khoan WHEN 'BacSi' THEN bs.chi_nhanh_id WHEN 'LeTan' THEN le.chi_nhanh_id END AS CHAR) AS chiNhanhId`;

// TypeORM đổi `:tên` thành `?` vì điều kiện phạm vi của C1 dùng tham số có tên. Hàm `bind` của B17 không được export và B18
// không sửa file B17 (ủy quyền Đại 19/11/2026), nên giữ bản sao ngắn này.
function bind(
  manager: EntityManager,
  sql: string,
  parameters: NamedParameters,
): [string, unknown[]] {
  return manager.connection.driver.escapeQueryWithParameters(
    sql,
    parameters,
  ) as [string, unknown[]];
}

interface CountRow {
  tong: string | number;
}

@Injectable()
export class AccountLockRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  // READ COMMITTED (như B5, B14): mỗi câu thấy dữ liệu đã commit mới nhất, và không có khoá khoảng trống.
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /**
   * Bước (1) và (2) của PLAN 5.6: đọc THƯỜNG, NGOÀI giao dịch, có điều kiện phạm vi ngay trong WHERE. Không có hàng ⇒ null:
   * id không tồn tại và id ngoài tầm nhìn đi CÙNG một đường mã (Q40). Kết quả chỉ để chọn tập khoá; quyết định thật đọc lại dưới khoá.
   */
  preRead(visibility: SqlCondition, id: string): Promise<LockTarget | null> {
    return this.selectTarget(this.db.manager, visibility, id, false);
  }

  /** Mã của mọi Quản trị viên Toàn hệ thống (đọc thường, NGOÀI giao dịch), để khoá cả tập theo thứ tự id. */
  async listSystemAdminIds(): Promise<string[]> {
    const rows: { taiKhoanId: string }[] = await this.db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId FROM quan_tri_vien
       WHERE pham_vi_quan_tri = 'ToanHeThong' ORDER BY tai_khoan_id`,
    );
    return rows.map((row) => row.taiKhoanId);
  }

  /**
   * Khoá hàng `tai_khoan` của một tập id theo `tai_khoan_id` TĂNG DẦN (một bảng, quét khoảng theo khoá chính nên thứ tự khoá
   * là thứ tự tăng dần, không phụ thuộc kế hoạch nối bảng). Trả trạng thái ĐỌC DƯỚI KHOÁ của từng hàng. Hai giao dịch cùng tập
   * xếp hàng ở hàng nhỏ nhất, không bao giờ chờ chéo nhau (H3).
   */
  async lockAccounts(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<SystemAdminState[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    return manager.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, trang_thai AS trangThai
       FROM tai_khoan WHERE tai_khoan_id IN (${placeholders})
       ORDER BY tai_khoan_id ASC FOR UPDATE`,
      [...ids],
    );
  }

  /**
   * Đọc lại đích TRONG giao dịch, cùng điều kiện phạm vi. `lock = true`: khoá đúng MỘT hàng `tai_khoan` (`FOR UPDATE OF t`:
   * không khoá hàng `bac_si`, `le_tan`, `quan_tri_vien`, `benh_nhan`, `chi_nhanh` của các bảng nối; `EXISTS lich_hen` của C1 cũng
   * không bị khoá vì mệnh đề chỉ áp cho khối ngoài cùng). `lock = false`: hàng đã được khoá ở bước trước (cả tập Toàn hệ thống).
   */
  readTarget(
    manager: EntityManager,
    visibility: SqlCondition,
    id: string,
    lock: boolean,
  ): Promise<LockTarget | null> {
    return this.selectTarget(manager, visibility, id, lock);
  }

  private async selectTarget(
    manager: EntityManager,
    visibility: SqlCondition,
    id: string,
    lock: boolean,
  ): Promise<LockTarget | null> {
    const [sql, values] = bind(
      manager,
      `SELECT ${TARGET_COLUMNS} FROM ${ACCOUNT_FROM_SQL}
       WHERE t.tai_khoan_id = :id AND ${visibility.sql}${lock ? ' FOR UPDATE OF t' : ''}`,
      { ...visibility.parameters, id },
    );
    const rows: LockTarget[] = await manager.query(sql, values);
    return rows[0] ?? null;
  }

  /** Khoá: chỉ chuyển được từ `DangHoatDong`. Trả false nếu không có hàng nào đổi (không thể xảy ra khi đã khoá hàng). */
  async setLocked(manager: EntityManager, id: string): Promise<boolean> {
    const result = await manager.update(
      TaiKhoan,
      { taiKhoanId: id, trangThai: 'DangHoatDong' },
      { trangThai: 'NgungHoatDong' },
    );
    return result.affected === 1;
  }

  /** Mở khoá: chỉ từ `NgungHoatDong`; xoá bộ đếm sai và khoá tạm để đăng nhập lại được ngay (Q28). */
  async setUnlocked(manager: EntityManager, id: string): Promise<boolean> {
    const result = await manager.update(
      TaiKhoan,
      { taiKhoanId: id, trangThai: 'NgungHoatDong' },
      { trangThai: 'DangHoatDong', soLanDangNhapSai: 0, khoaDangNhapDen: null },
    );
    return result.affected === 1;
  }

  /**
   * Việc phụ thuộc vào Bác sĩ (Q28): lịch hẹn đang hoạt động và ca từ `today` trở đi, mỗi loại tối đa DEPENDENTS_LIMIT mục cộng
   * tổng thật. Chỉ ĐỌC (không khoá), cùng giao dịch với lần khoá; không cột nào của bệnh nhân (không tên, SĐT, email).
   */
  async readDependents(
    manager: EntityManager,
    doctorId: string,
    today: string,
  ): Promise<DoctorDependents> {
    const appointments: DoctorDependents['lichHen']['muc'] =
      await manager.query(
        `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, ma_lich_hen AS maLichHen,
                DATE_FORMAT(thoi_gian, '%Y-%m-%d %H:%i:%s') AS thoiGian, trang_thai AS trangThai
         FROM lich_hen WHERE bac_si_id = ? AND trang_thai IN ${ACTIVE_APPOINTMENT_STATES}
         ORDER BY thoi_gian ASC, lich_hen_id ASC LIMIT ${DEPENDENTS_LIMIT}`,
        [doctorId],
      );
    const appointmentCount: CountRow[] = await manager.query(
      `SELECT COUNT(*) AS tong FROM lich_hen
       WHERE bac_si_id = ? AND trang_thai IN ${ACTIVE_APPOINTMENT_STATES}`,
      [doctorId],
    );
    const shifts: DoctorDependents['caLamViec']['muc'] = await manager.query(
      `SELECT CAST(lich_lam_viec_id AS CHAR) AS lichLamViecId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId,
              DATE_FORMAT(ngay, '%Y-%m-%d') AS ngay, ca
       FROM lich_lam_viec WHERE bac_si_id = ? AND ngay >= ?
       ORDER BY ngay ASC, ca ASC, lich_lam_viec_id ASC LIMIT ${DEPENDENTS_LIMIT}`,
      [doctorId, today],
    );
    const shiftCount: CountRow[] = await manager.query(
      `SELECT COUNT(*) AS tong FROM lich_lam_viec WHERE bac_si_id = ? AND ngay >= ?`,
      [doctorId, today],
    );
    return {
      lichHen: {
        tong: Number(appointmentCount[0]!.tong),
        muc: appointments,
      },
      caLamViec: { tong: Number(shiftCount[0]!.tong), muc: shifts },
    };
  }
}
