import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { ChucDanhBacSi, HocViBacSi } from '../entities/enums.js';

// Ghi hồ sơ bác sĩ (admin B13; PLAN admin 5.7). Mọi câu chạy bằng `manager` của MỘT giao dịch READ COMMITTED do service mở.
// THỨ TỰ KHOÁ (phải giữ đúng, xem `appointments/locking/lock-order.ts` tầng 4):
//   1. `bac_si` FOR UPDATE: booking (FOR SHARE), phân công/gỡ ca và nghỉ phép (FOR UPDATE) cùng xin hàng này nên chờ nhau, không lọt lịch hẹn hay ca mới (BS-36).
//   2. `chi_nhanh` đích FOR SHARE, TRƯỚC liên kết chi nhánh–dịch vụ: sửa chi nhánh (B8) giữ `chi_nhanh` FOR UPDATE rồi mới khoá liên kết; xin cùng chiều thì
//      không có chu trình (nếu khoá liên kết trước, `UPDATE bac_si` xin khoá S của khoá ngoại trên `chi_nhanh` và hai bên chờ nhau).
//   3. `chuyen_khoa` FOR SHARE (chỉ khi đổi), `chi_nhanh_dich_vu_kham` FOR SHARE: không ai ngừng chuyên khoa hay gỡ dịch vụ trước khi giao dịch này commit.

export interface LockedDoctor {
  taiKhoanId: string;
  chiNhanhId: string;
  chuyenKhoaId: string;
  dichVuKhamId: string;
  chucDanh: ChucDanhBacSi;
  hocVi: HocViBacSi;
  soNamKinhNghiem: number;
  moTaChuyenMon: string | null;
}

export interface BlockingAppointment {
  lichHenId: string;
  maLichHen: string;
  /** 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam */
  thoiGian: string;
  trangThai: 'ChoThanhToan' | 'DaXacNhan' | 'DaTiepDon';
}

export interface BlockingShift {
  lichLamViecId: string;
  /** 'YYYY-MM-DD' */
  ngay: string;
  ca: string;
}

export interface DoctorProfileValues {
  chiNhanhId: string;
  chuyenKhoaId: string;
  dichVuKhamId: string;
  chucDanh: ChucDanhBacSi;
  hocVi: HocViBacSi;
  soNamKinhNghiem: number;
  moTaChuyenMon: string | null;
}

@Injectable()
export class DoctorUpdateRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /** Bước khoá 1. `null` khi id không phải bác sĩ (kể cả Lễ tân, Quản trị viên, Bệnh nhân: BS-40). Phạm vi kiểm ở service với chi nhánh đọc DƯỚI khoá. */
  async lockDoctor(
    manager: EntityManager,
    id: string,
  ): Promise<LockedDoctor | null> {
    const rows: (Omit<LockedDoctor, 'soNamKinhNghiem'> & {
      soNamKinhNghiem: number | string;
    })[] = await manager.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId,
              CAST(chuyen_khoa_id AS CHAR) AS chuyenKhoaId, CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId,
              chuc_danh AS chucDanh, hoc_vi AS hocVi, so_nam_kinh_nghiem AS soNamKinhNghiem, mo_ta_chuyen_mon AS moTaChuyenMon
         FROM bac_si WHERE tai_khoan_id = ? FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    return row
      ? { ...row, soNamKinhNghiem: Number(row.soNamKinhNghiem) }
      : null;
  }

  /** Bước khoá 2: chi nhánh đích có tồn tại không. */
  async lockBranchShared(
    manager: EntityManager,
    branchId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      'SELECT 1 FROM chi_nhanh WHERE chi_nhanh_id = ? FOR SHARE',
      [branchId],
    );
    return rows.length > 0;
  }

  /** Bước khoá 3: chuyên khoa tồn tại VÀ đang hoạt động (Q19). */
  async lockActiveSpecialty(
    manager: EntityManager,
    specialtyId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      "SELECT 1 FROM chuyen_khoa WHERE chuyen_khoa_id = ? AND trang_thai_hoat_dong = 'DangHoatDong' FOR SHARE",
      [specialtyId],
    );
    return rows.length > 0;
  }

  /** Bước khoá 3: dịch vụ có được cung cấp ở chi nhánh không (dịch vụ không tồn tại thì cũng không có liên kết). */
  async lockServiceAtBranch(
    manager: EntityManager,
    branchId: string,
    serviceId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      'SELECT 1 FROM chi_nhanh_dich_vu_kham WHERE chi_nhanh_id = ? AND dich_vu_kham_id = ? FOR SHARE',
      [branchId, serviceId],
    );
    return rows.length > 0;
  }

  /**
   * Danh sách chặn đổi chi nhánh hay dịch vụ chính (BS A2, Q17, Q18): ở chi nhánh HIỆN TẠI của bác sĩ, lịch hẹn còn hoạt động (không xét thời điểm)
   * và ca có `ngay >= today` (ngày VN, kể cả ca hôm nay đã qua giờ). Đọc thường sau khi đã giữ `bac_si` FOR UPDATE: lịch và ca mới phải chờ khoá này.
   */
  async blockers(
    manager: EntityManager,
    doctorId: string,
    branchId: string,
    today: string,
  ): Promise<{ lichHen: BlockingAppointment[]; ca: BlockingShift[] }> {
    const lichHen: BlockingAppointment[] = await manager.query(
      `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, ma_lich_hen AS maLichHen,
              DATE_FORMAT(thoi_gian, '%Y-%m-%d %H:%i:%s') AS thoiGian, trang_thai AS trangThai
         FROM lich_hen
        WHERE bac_si_id = ? AND chi_nhanh_id = ? AND trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon')
        ORDER BY thoi_gian, lich_hen_id`,
      [doctorId, branchId],
    );
    const ca: BlockingShift[] = await manager.query(
      `SELECT CAST(lich_lam_viec_id AS CHAR) AS lichLamViecId, DATE_FORMAT(ngay, '%Y-%m-%d') AS ngay, ca
         FROM lich_lam_viec
        WHERE bac_si_id = ? AND chi_nhanh_id = ? AND ngay >= ?
        ORDER BY ngay, lich_lam_viec_id`,
      [doctorId, branchId, today],
    );
    return { lichHen, ca };
  }

  /** Ghi cả dòng hồ sơ (đã kiểm hết). Không đụng `lich_lam_viec`, `lich_hen` (BS-31, `gia_snapshot` giữ nguyên: BS-45). */
  async update(
    manager: EntityManager,
    id: string,
    values: DoctorProfileValues,
  ): Promise<void> {
    await manager.query(
      `UPDATE bac_si SET chi_nhanh_id = ?, chuyen_khoa_id = ?, dich_vu_kham_id = ?, chuc_danh = ?, hoc_vi = ?,
              so_nam_kinh_nghiem = ?, mo_ta_chuyen_mon = ?
        WHERE tai_khoan_id = ?`,
      [
        values.chiNhanhId,
        values.chuyenKhoaId,
        values.dichVuKhamId,
        values.chucDanh,
        values.hocVi,
        values.soNamKinhNghiem,
        values.moTaChuyenMon,
        id,
      ],
    );
  }
}
