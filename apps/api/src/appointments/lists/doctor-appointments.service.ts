import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { toDoctorDetail, toDoctorItem } from './doctor-appointment.mapper.js';
import {
  DOCTOR_VISIBLE_STATES,
  SAP_XEP_ORDER,
  type DoctorAppointmentDetail,
  type DoctorAppointmentsPage,
  type DoctorAppointmentsQuery,
  type DoctorStatusCounts,
} from './doctor-appointments.dto.js';
import {
  DoctorAppointmentsRepository,
  type DoctorAppointmentFilter,
} from './doctor-appointments.repository.js';
import { dayBounds, intersectStates } from './list-query.rules.js';

// Đủ sáu khoá, trạng thái không có dòng nào là 0 (khung hình cố định cho thẻ lọc của giao diện)
function toCounts(
  rows: readonly { trangThai: keyof DoctorStatusCounts; soLuong: number }[],
): DoctorStatusCounts {
  const counts = Object.fromEntries(
    DOCTOR_VISIBLE_STATES.map((state) => [state, 0]),
  ) as DoctorStatusCounts;
  for (const row of rows) counts[row.trangThai] = row.soLuong;
  return counts;
}

/**
 * Danh sách và chi tiết lịch hẹn của chính Bác sĩ (task B5, use case XDSPC; PLAN booking 5.8, 5.9, Q33; TRACKING 3.20). Chỉ đọc, không khoá, không log (mã lịch, tên, SĐT, ngày sinh, lý do khám là dữ
 * liệu cá nhân và y tế). `doctorId` chỉ từ access token (`@CurrentUser()`) và đi vào SQL của MỌI câu; không đọc bảng `bac_si` để "xin phép": tài khoản `BacSi` không có hàng `bac_si` không thể có lịch
 * (khoá ngoại `lich_hen.bac_si_id`) nên ra danh sách rỗng, và SQL đã tự đóng cửa. Tài khoản khoá hay đổi vai trò giữa hai request bị `JwtAuthGuard` (401) và `RolesGuard` (403) chặn trước khi tới đây.
 */
@Injectable()
export class DoctorAppointmentsService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(DoctorAppointmentsRepository)
    private readonly appointments: DoctorAppointmentsRepository,
  ) {}

  /**
   * Ba câu trong MỘT lần gọi `runReadOnly` (một ảnh chụp): `total`, số đếm và trang khớp nhau dù có ghi đồng thời. `demTheoTrangThai`: mọi bộ lọc TRỪ `trangThai[]`; danh sách: thêm `trangThai[]`
   * (giao nhau), như B1.
   */
  async list(
    doctorId: string,
    query: DoctorAppointmentsQuery,
  ): Promise<DoctorAppointmentsPage> {
    const { from, to } = dayBounds(query.tuNgay, query.denNgay);
    const countFilter: DoctorAppointmentFilter = {
      states: DOCTOR_VISIBLE_STATES,
      ca: query.ca ?? null,
      from,
      to,
      keyword: query.q ?? null,
    };
    const listFilter: DoctorAppointmentFilter = {
      ...countFilter,
      states: intersectStates(DOCTOR_VISIBLE_STATES, query.trangThai),
    };
    const order = SAP_XEP_ORDER[query.sapXep ?? 'MoiNhat'];

    return runReadOnly(this.dataSource, async (manager) => {
      const total = await this.appointments.count(
        manager,
        doctorId,
        listFilter,
      );
      const counts = await this.appointments.countByStatus(
        manager,
        doctorId,
        countFilter,
      );
      // Chỉ lấy trang khi `offset < total`: `page` rất lớn (DTO không chặn trên) không bao giờ gửi `OFFSET` khổng lồ cho MySQL, nơi nó báo lỗi 1064 ra 500
      const rows =
        query.offset < total
          ? await this.appointments.findPage(
              manager,
              doctorId,
              listFilter,
              order,
              query.pageSize,
              query.offset,
            )
          : [];
      return {
        items: rows.map(toDoctorItem),
        total,
        page: query.page,
        pageSize: query.pageSize,
        demTheoTrangThai: toCounts(counts),
      };
    });
  }

  /**
   * Chi tiết MỘT lịch của chính bác sĩ. Lịch của bác sĩ khác, lịch không tồn tại và lịch `DaDoiLich` ra CÙNG một kết quả `null` từ MỘT câu SQL, rồi CÙNG một 404 `KHONG_TIM_THAY` ném ở MỘT chỗ,
   * SAU khi giao dịch đã đóng (H10, DSB-07, QB-06). `maLichHen` đã được `ParseAppointmentCodePipe` chuẩn hoá.
   */
  async detail(
    doctorId: string,
    maLichHen: string,
  ): Promise<DoctorAppointmentDetail> {
    const row = await runReadOnly(this.dataSource, (manager) =>
      this.appointments.findDetail(manager, doctorId, maLichHen),
    );
    if (row === null) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return toDoctorDetail(row);
  }
}
