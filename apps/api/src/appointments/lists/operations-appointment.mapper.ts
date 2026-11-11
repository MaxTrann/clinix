import { toItemCore } from './list-item.mapper.js';
import type {
  OperationsAppointmentDetail,
  OperationsAppointmentItem,
} from './operations-appointments.dto.js';
import type {
  OperationsAppointmentDetailRow,
  OperationsAppointmentRow,
} from './operations-appointments.repository.js';

// Ánh xạ hàng thô thành JSON cho nhân sự (Lễ tân B3, Quản trị viên B4; TRACKING 3.17 B3-D, 3.17.1). Chỉ liệt kê từng khoá (không trải hàng thô): cột thừa của repository, như `lichHenId`, không
// bao giờ ra ngoài (DSV-08). Người đặt là tài khoản của `benh_nhan_id`; người khám (`nguoiKham`) là hồ sơ người thân hoặc chính người đặt: hai khoá KHÔNG được lẫn (DSV-13).

export function toOperationsItem(
  row: OperationsAppointmentRow,
): OperationsAppointmentItem {
  return {
    ...toItemCore(row),
    nguoiDat: {
      hoTen: row.nguoiDatHoTen,
      soDienThoai: row.nguoiDatSoDienThoai,
    },
  };
}

/** Chi tiết dùng chung = dòng cộng `lyDoKham`, `lyDoHuy`, `hanThanhToan`. Mapper của Lễ tân thêm `chuyenDuoc`, `conPhaiThu` bên ngoài; Quản trị viên (B4) thêm phần của mình. */
export function toOperationsDetail(
  row: OperationsAppointmentDetailRow,
): OperationsAppointmentDetail {
  return {
    ...toOperationsItem(row),
    lyDoKham: row.lyDoKham,
    lyDoHuy: row.lyDoHuy,
    hanThanhToan: row.hanThanhToan?.toISOString() ?? null,
  };
}
