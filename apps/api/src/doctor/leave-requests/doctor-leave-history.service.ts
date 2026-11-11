import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { Paged } from '../../common/paging/paged.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import {
  DoctorLeaveHistoryRepository,
  type LeaveRequestRow,
} from './doctor-leave-history.repository.js';
import type {
  LeaveHistoryQueryDto,
  LeaveRequestView,
} from './leave-history.dto.js';

/** Lịch sử và chi tiết yêu cầu nghỉ của Bác sĩ (B12; PLAN doctor 5.7). Chỉ đọc; `bacSiId` luôn lấy từ token. */
@Injectable()
export class DoctorLeaveHistoryService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(DoctorLeaveHistoryRepository)
    private readonly repository: DoctorLeaveHistoryRepository,
  ) {}

  async list(
    bacSiId: string,
    query: LeaveHistoryQueryDto,
  ): Promise<Paged<LeaveRequestView>> {
    const status = query.trangThai ?? null;
    // Một ảnh chụp cho cả hai câu để `total` khớp `items`.
    const { rows, total } = await runReadOnly(this.db, async (em) => ({
      rows: await this.repository.findPage(
        em,
        bacSiId,
        status,
        query.pageSize,
        query.offset,
      ),
      total: await this.repository.count(em, bacSiId, status),
    }));
    return {
      items: rows.map(toView),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(bacSiId: string, id: string): Promise<LeaveRequestView> {
    const row = await runReadOnly(this.db, (em) =>
      this.repository.findOne(em, bacSiId, id),
    );
    // Không có và của người khác: cùng 404, cùng thân.
    if (row === null) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return toView(row);
  }
}

function toView(row: LeaveRequestRow): LeaveRequestView {
  return {
    yeuCauNghiPhepId: row.yeuCauNghiPhepId,
    trangThai: row.trangThai,
    hinhThuc: row.hinhThuc,
    tuNgay: row.tuNgay,
    denNgay: row.denNgay,
    ca: row.ca,
    lyDo: row.lyDo,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
    thoiDiemXuLy: row.thoiDiemXuLy?.toISOString() ?? null,
  };
}
