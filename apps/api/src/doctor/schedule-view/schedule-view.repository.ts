import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { BlockingLeave } from '../../scheduling/leave/leave.reader.js';

/** Truy vấn riêng của xem lịch Bác sĩ (phần nghỉ phép `TuChoi`; `ChoDuyet`/`DaDuyet` lấy từ `LeaveReader`). */
@Injectable()
export class ScheduleViewRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  get manager(): EntityManager {
    return this.db.manager;
  }

  /** Yêu cầu bị từ chối giao với [tuNgay, denNgay]; chỉ để Bác sĩ thấy "Yêu cầu bị từ chối" (Q16). Dùng chỉ mục `yeu_cau_nghi_phep_index_8`. */
  async listRefusedLeaves(
    em: EntityManager,
    input: { bacSiId: string; tuNgay: string; denNgay: string },
  ): Promise<BlockingLeave[]> {
    return em.query(
      `SELECT CAST(yeu_cau_nghi_phep_id AS CHAR) AS yeuCauNghiPhepId, CAST(bac_si_id AS CHAR) AS bacSiId,
              trang_thai AS trangThai, hinh_thuc_nghi AS hinhThucNghi,
              DATE_FORMAT(ngay_bat_dau, '%Y-%m-%d') AS ngayBatDau, DATE_FORMAT(ngay_ket_thuc, '%Y-%m-%d') AS ngayKetThuc, ca
         FROM yeu_cau_nghi_phep
        WHERE bac_si_id = ? AND trang_thai = 'TuChoi' AND ngay_bat_dau <= ? AND ngay_ket_thuc >= ?
        ORDER BY yeu_cau_nghi_phep_id ASC`,
      [input.bacSiId, input.denNgay, input.tuNgay],
    );
  }
}
