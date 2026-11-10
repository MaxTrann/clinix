import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { dayBounds, intersectStates } from './list-query.rules.js';
import { toItem } from './patient-appointment.mapper.js';
import {
  NHOM_STATES,
  PATIENT_VISIBLE_STATES,
  type PatientAppointmentsPage,
  type PatientAppointmentsQuery,
  type StatusCounts,
} from './patient-appointments.dto.js';
import {
  PatientAppointmentsRepository,
  type PatientAppointmentFilter,
} from './patient-appointments.repository.js';

// Đủ sáu khoá, trạng thái không có dòng nào là 0 (khung hình cố định cho thẻ lọc của giao diện)
function toCounts(
  rows: readonly { trangThai: keyof StatusCounts; soLuong: number }[],
): StatusCounts {
  const counts = Object.fromEntries(
    PATIENT_VISIBLE_STATES.map((state) => [state, 0]),
  ) as StatusCounts;
  for (const row of rows) counts[row.trangThai] = row.soLuong;
  return counts;
}

/**
 * Danh sách và lịch sử lịch hẹn của Bệnh nhân (task B1; PLAN booking 5.8, Q31; TRACKING 3.13 B1-C). Chỉ đọc, không khoá, không log (mã lịch, tên là dữ liệu cá nhân).
 * `patientId` chỉ từ access token và đi vào SQL của cả ba câu. Ba câu chạy trong MỘT lần gọi `runReadOnly` (một ảnh chụp) nên `total`, số đếm và trang khớp nhau dù có ghi đồng thời.
 */
@Injectable()
export class PatientAppointmentsService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(PatientAppointmentsRepository)
    private readonly appointments: PatientAppointmentsRepository,
  ) {}

  async list(
    patientId: string,
    query: PatientAppointmentsQuery,
  ): Promise<PatientAppointmentsPage> {
    const { from, to } = dayBounds(query.tuNgay, query.denNgay);
    // `demTheoTrangThai`: mọi bộ lọc TRỪ `trangThai[]` (kể cả `nhom`); danh sách: thêm `trangThai[]`, giao nhau (3.13.3 câu (c))
    const countFilter: PatientAppointmentFilter = {
      states: intersectStates(
        PATIENT_VISIBLE_STATES,
        query.nhom === undefined ? undefined : NHOM_STATES[query.nhom],
      ),
      hoSoNguoiThanId: query.hoSoNguoiThanId ?? null,
      bacSiId: query.bacSiId ?? null,
      chuyenKhoaId: query.chuyenKhoaId ?? null,
      from,
      to,
      keyword: query.q ?? null,
    };
    const listFilter: PatientAppointmentFilter = {
      ...countFilter,
      states: intersectStates(countFilter.states, query.trangThai),
    };
    // "Sắp tới" tăng dần theo giờ hẹn; "Lịch sử" và "Tất cả" giảm dần
    const order = query.nhom === 'SapToi' ? 'ASC' : 'DESC';

    return runReadOnly(this.dataSource, async (manager) => {
      const total = await this.appointments.count(
        manager,
        patientId,
        listFilter,
      );
      const counts = await this.appointments.countByStatus(
        manager,
        patientId,
        countFilter,
      );
      // Chỉ lấy trang khi `offset < total`: `page` rất lớn (DTO không chặn trên) không bao giờ gửi `OFFSET` khổng lồ cho MySQL, nơi nó báo lỗi 1064 ra 500
      const rows =
        query.offset < total
          ? await this.appointments.findPage(
              manager,
              patientId,
              listFilter,
              order,
              query.pageSize,
              query.offset,
            )
          : [];
      return {
        items: rows.map(toItem),
        total,
        page: query.page,
        pageSize: query.pageSize,
        demTheoTrangThai: toCounts(counts),
      };
    });
  }
}
