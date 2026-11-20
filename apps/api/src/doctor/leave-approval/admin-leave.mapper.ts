import type { AdminLeaveItem } from './admin-leave.dto.js';
import type { AdminLeaveRow } from './admin-leave.repository.js';

/**
 * Hàng thô (JOIN yêu cầu, bác sĩ, chuyên khoa, chi nhánh) ⇒ một dòng danh sách/chi tiết. DANH SÁCH TRẮNG: liệt kê từng khoá, không `...row`,
 * nên cột mới của truy vấn không tự lộ ra ngoài. `soLichHenBiAnhHuong` do service thêm sau (cần hỏi `booking`).
 */
export function toItem(
  row: AdminLeaveRow,
): Omit<AdminLeaveItem, 'soLichHenBiAnhHuong'> {
  return {
    yeuCauNghiPhepId: row.yeuCauNghiPhepId,
    trangThai: row.trangThai,
    hinhThuc: row.hinhThuc,
    tuNgay: row.tuNgay,
    denNgay: row.denNgay,
    ca: row.ca,
    // Trả ĐỦ chữ của Bác sĩ, không cắt, không chuẩn hoá lại (đã NFC lúc tạo, Q25): web lo việc cắt khi hiển thị
    lyDo: row.lyDo,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
    thoiDiemXuLy: row.thoiDiemXuLy?.toISOString() ?? null,
    bacSi: { bacSiId: row.bacSiId, hoTen: row.bacSiHoTen },
    chuyenKhoa: { ten: row.chuyenKhoaTen },
    chiNhanh: { chiNhanhId: row.chiNhanhId, ten: row.chiNhanhTen },
  };
}
