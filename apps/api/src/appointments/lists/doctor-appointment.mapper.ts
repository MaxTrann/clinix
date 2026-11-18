import type {
  DoctorAppointmentCore,
  DoctorAppointmentDetail,
  DoctorAppointmentItem,
  DoctorExamRecord,
} from './doctor-appointments.dto.js';
import type {
  DoctorAppointmentDetailRow,
  DoctorAppointmentPageRow,
  DoctorAppointmentRow,
} from './doctor-appointments.repository.js';
import { VISIT_PROFILE_SELF } from './list-query.rules.js';
import { toMilestones } from './status-milestones.mapper.js';

// Ánh xạ hàng thô của Bác sĩ sang JSON (task B5; TRACKING 3.20 B5-F). Chỉ liệt kê từng khoá (không trải hàng thô): cột thừa của repository không bao giờ ra ngoài (DSB-06). Cố ý KHÔNG dùng
// `toItemCore` của `list-item.mapper.ts`: hàm đó mang giá, cọc, hạn thanh toán, tên bác sĩ, người đặt (H10).

// Cờ logic của MySQL ra số 0/1, chuỗi "0"/"1" hoặc boolean tuỳ driver (như `laBanThan` ở `list-item.mapper.ts`): chỉ 1 là đúng
const isSet = (value: number | string | boolean): boolean =>
  Number(value) === 1;

/** Tám khoá LÕI của một lịch, dùng chung cho dòng danh sách và chi tiết (chi tiết KHÔNG có `coHoSoKham`: PLAN 5.10 E2 giữ chi tiết ở mười một khoá). */
function toDoctorCore(row: DoctorAppointmentRow): DoctorAppointmentCore {
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

/** Một dòng danh sách: ĐÚNG chín khoá = tám khoá lõi cộng `coHoSoKham` (cờ đã tính ở SQL: có dòng `ho_so_kham` VÀ lịch ở `DaTiepDon`/`HoanThanh`; KHÔNG nội dung hồ sơ). */
export function toDoctorItem(
  row: DoctorAppointmentPageRow,
): DoctorAppointmentItem {
  return { ...toDoctorCore(row), coHoSoKham: isSet(row.coHoSoKham) };
}

/**
 * Hồ sơ khám của chi tiết (doctor-exam B3; HDK-01, HDK-15, XHS-14). `null` khi không có dòng hoặc lịch ngoài `DaTiepDon`/`HoanThanh`: SQL đã lọc trong `ON` (mọi cột `hk.*` là NULL, cờ 0), mapper chỉ tin cờ.
 * Ba trường chữ đi NGUYÊN VĂN (không `trim`, không đổi xuống dòng: B2 chuẩn hoá lúc ghi); cột chữ NULL (dữ liệu từ nguồn khác) thành chuỗi rỗng vì bộ đọc web chỉ nhận chuỗi. `capNhatLanCuoi` là `toISOString()` của `Date`
 * đọc từ cột DATETIME: CÙNG phép với `tokenMatches` của B2, để F3 gửi lại làm token cho `PUT .../exam-record`.
 */
function toExamRecord(
  row: DoctorAppointmentDetailRow,
): DoctorExamRecord | null {
  // `cap_nhat_lan_cuoi` là NOT NULL ở DB nên khi cờ đúng nó luôn có; kiểm `null` chỉ để thu hẹp kiểu
  if (!isSet(row.coHoSo) || row.capNhatLanCuoi === null) return null;
  return {
    trieuChung: row.trieuChung ?? '',
    chanDoanSoBo: row.chanDoanSoBo ?? '',
    huongXuLy: row.huongXuLy ?? '',
    ngayTaiKhamDuKien: row.ngayTaiKhamDuKien,
    capNhatLanCuoi: row.capNhatLanCuoi.toISOString(),
  };
}

/** Chi tiết: ĐÚNG mười hai khoá cấp một = tám khoá lõi cộng `ghiChuKham` (`null` hoặc đối tượng năm khoá), `chiNhanh`, `ngayDat`, `moc` (booking B19). KHÔNG `coHoSoKham`, KHÔNG `lyDoHuy`. */
export function toDoctorDetail(
  row: DoctorAppointmentDetailRow,
): DoctorAppointmentDetail {
  return {
    ...toDoctorCore(row),
    ghiChuKham: toExamRecord(row),
    chiNhanh: row.chiNhanh,
    ngayDat: row.ngayDat.toISOString(),
    moc: toMilestones(row),
  };
}
