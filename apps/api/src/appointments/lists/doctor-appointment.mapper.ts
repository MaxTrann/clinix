import type {
  DoctorAppointmentDetail,
  DoctorAppointmentItem,
} from './doctor-appointments.dto.js';
import type {
  DoctorAppointmentDetailRow,
  DoctorAppointmentRow,
} from './doctor-appointments.repository.js';
import { VISIT_PROFILE_SELF } from './list-query.rules.js';

// Ánh xạ hàng thô của Bác sĩ sang JSON (task B5; TRACKING 3.20 B5-F). Chỉ liệt kê từng khoá (không trải hàng thô): cột thừa của repository không bao giờ ra ngoài (DSB-06). Cố ý KHÔNG dùng
// `toItemCore` của `list-item.mapper.ts`: hàm đó mang giá, cọc, hạn thanh toán, tên bác sĩ, người đặt (H10).

/** Một dòng danh sách: ĐÚNG tám khoá cấp một. */
export function toDoctorItem(row: DoctorAppointmentRow): DoctorAppointmentItem {
  return {
    maLichHen: row.maLichHen,
    thoiGian: row.thoiGian.toISOString(),
    ca: row.ca,
    trangThai: row.trangThai,
    nguoiKham: {
      hoTen: row.nguoiKhamHoTen,
      // `moi_quan_he` NULL ⇔ không có hồ sơ người thân ⇔ khám cho chính mình
      quanHe: row.quanHe ?? VISIT_PROFILE_SELF,
      gioiTinh: row.gioiTinh,
      ngaySinh: row.ngaySinh,
      soDienThoai: row.soDienThoai,
    },
    dichVu: row.dichVu,
    chuyenKhoa: row.chuyenKhoa,
    lyDoKham: row.lyDoKham,
  };
}

/**
 * Chi tiết: ĐÚNG mười một khoá cấp một = tám khoá của dòng cộng `ghiChuKham`, `chiNhanh`, `ngayDat`. `ghiChuKham` LUÔN `null`: bảng `ho_so_kham` chưa có migration (TRACKING 3.20 B5-B); khi module
 * `doctor` thêm, thay đúng dòng này bằng giá trị đọc ở câu chi tiết. Không `lyDoHuy`.
 */
export function toDoctorDetail(
  row: DoctorAppointmentDetailRow,
): DoctorAppointmentDetail {
  return {
    ...toDoctorItem(row),
    ghiChuKham: null,
    chiNhanh: row.chiNhanh,
    ngayDat: row.ngayDat.toISOString(),
  };
}
