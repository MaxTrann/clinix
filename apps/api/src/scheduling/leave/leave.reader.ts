import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { CaLamViec } from '../../admin/entities/enums.js';
import {
  BLOCKING_LEAVE_STATES,
  leaveCoversShift,
  pickBlockingLeave,
  type BlockingLeaveRef,
  type LeaveKind,
} from './leave-overlap.rules.js';

/** Một yêu cầu nghỉ đang chặn khung giờ (ChoDuyet hoặc DaDuyet). Ngày là chuỗi 'YYYY-MM-DD'. */
export interface BlockingLeave extends BlockingLeaveRef {
  bacSiId: string;
  hinhThucNghi: LeaveKind;
  ngayBatDau: string;
  ngayKetThuc: string;
  ca: CaLamViec | null;
}

const STATES_SQL = BLOCKING_LEAVE_STATES.map((s) => `'${s}'`).join(', ');

// DATE_FORMAT để lấy chuỗi ngày, không để driver đổi cột DATE thành `Date` (lệch 1 ngày tuỳ múi giờ: H1, M4).
const SELECT_LEAVE = `
  SELECT CAST(yeu_cau_nghi_phep_id AS CHAR) AS yeuCauNghiPhepId, CAST(bac_si_id AS CHAR) AS bacSiId,
         trang_thai AS trangThai, hinh_thuc_nghi AS hinhThucNghi,
         DATE_FORMAT(ngay_bat_dau, '%Y-%m-%d') AS ngayBatDau, DATE_FORMAT(ngay_ket_thuc, '%Y-%m-%d') AS ngayKetThuc, ca
    FROM yeu_cau_nghi_phep`;

/**
 * D4 — nghỉ phép chặn khung giờ (PLAN doctor 5.10). Chỉ ĐỌC, dùng `em` của bên gọi: booking gọi trong giao dịch đang giữ khoá `bac_si`
 * (đua với duyệt nghỉ, H6/DH-06); khoá ở nơi gọi, reader không tự khoá.
 * Truy vấn chỉ lọc theo ngày bằng chỉ mục `yeu_cau_nghi_phep_index_8` (M8: range, ~3 ms/100.000 hàng); phần "ca nào" do hàm thuần
 * `leaveCoversShift` quyết định, để luật chỉ nằm ở một nơi.
 */
@Injectable()
export class LeaveReader {
  /** Yêu cầu đang chặn `(ngay, ca)` của bác sĩ, hoặc `null`. Nhiều yêu cầu thì `DaDuyet` trước, rồi mã nhỏ nhất. */
  async findBlockingLeave(
    em: EntityManager,
    input: { bacSiId: string; ngay: string; ca: CaLamViec },
  ): Promise<BlockingLeaveRef | null> {
    const candidates = await this.listBlocking(em, {
      bacSiIds: [input.bacSiId],
      tuNgay: input.ngay,
      denNgay: input.ngay,
    });
    const hit = pickBlockingLeave(
      candidates.filter((leave) =>
        leaveCoversShift(leave, { ngay: input.ngay, ca: input.ca }),
      ),
    );
    return (
      hit && {
        yeuCauNghiPhepId: hit.yeuCauNghiPhepId,
        trangThai: hit.trangThai,
      }
    );
  }

  /**
   * Mọi yêu cầu ChoDuyet/DaDuyet của các bác sĩ có khoảng nghỉ GIAO với [tuNgay, denNgay] (cho `AvailableSlotsReader`, B6).
   * Bên gọi dùng `leaveCoversShift` để biết từng ca có bị phủ không.
   */
  async listBlocking(
    em: EntityManager,
    input: { bacSiIds: readonly string[]; tuNgay: string; denNgay: string },
  ): Promise<BlockingLeave[]> {
    if (input.bacSiIds.length === 0) return [];
    const rows: BlockingLeave[] = await em.query(
      `${SELECT_LEAVE}
        WHERE bac_si_id IN (${input.bacSiIds.map(() => '?').join(', ')})
          AND trang_thai IN (${STATES_SQL})
          AND ngay_bat_dau <= ? AND ngay_ket_thuc >= ?
        ORDER BY yeu_cau_nghi_phep_id ASC`,
      [...input.bacSiIds, input.denNgay, input.tuNgay],
    );
    return rows;
  }
}
