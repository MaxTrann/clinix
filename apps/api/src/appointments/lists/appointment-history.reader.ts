import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { StatusHistoryEntry } from './admin-appointments.dto.js';
import {
  buildStatusHistory,
  type HistoryAuditRow,
  type HistoryMilestones,
} from './appointment-history.mapper.js';

// Đọc dữ liệu cho panel "Lịch sử trạng thái" của Quản trị viên (task B4; PLAN booking Q28, L26; TRACKING 3.33 B4-E). Chỉ ĐỌC, hai câu SQL trong giao dịch của người gọi (cùng ảnh chụp với hàng chi tiết).
// ĐÂY LÀ NƠI DUY NHẤT của `appointments/` đọc bảng `nhat_ky_hanh_dong` (bảng của `audit/`, module của Trung; luật AR-08): `audit/` không có hàm đọc, chỉ có `AuditService.record`. Hình dạng dòng
// nhật ký của override là hợp đồng với B14 (`admin-override.service.ts`): `hanh_dong = 'OverrideLichHen'`, `loai_doi_tuong = 'lich_hen'`, `ma_doi_tuong` = `lich_hen_id`, `ket_qua = 'ThanhCong'`,
// `chi_tiet_thay_doi = { truoc: { trang_thai }, sau: { trang_thai }, ly_do }`. Hằng nào của hợp đồng đó đổi thì chỉ sửa ở file này. Không log: lý do là chữ tự do của nhân sự.

/** Trần số dòng nhật ký đọc cho MỘT lịch (bỏ dòng CŨ nhất): một lịch bị override hàng trăm lần là không thực tế. */
export const MAX_OVERRIDE_ENTRIES = 100;

// Khoá chính của `lich_hen`: ba mốc đã có sẵn trong bảng mà câu chi tiết dùng chung không đọc (không sửa file dùng chung của B3 để thêm cột)
const MILESTONES_SQL = `SELECT thoi_diem_tao AS thoiDiemTao, thoi_diem_huy AS thoiDiemHuy, ly_do_huy AS lyDoHuy
FROM lich_hen
WHERE lich_hen_id = ?`;

// Chỉ mục `nhat_ky_hanh_dong_index_29 (loai_doi_tuong, ma_doi_tuong, thoi_diem)`: hai điều kiện đầu dùng đủ hai cột đầu của chỉ mục, `ORDER BY` đúng thứ tự cột kế tiếp nên không filesort.
// `ket_qua = 'ThanhCong'`: lần thất bại không đổi trạng thái nên không phải một mốc của lịch. Mới nhất trước để `LIMIT` bỏ dòng cũ nhất.
const AUDIT_SQL = `SELECT nhat_ky_hanh_dong_id AS id, thoi_diem AS thoiDiem, chi_tiet_thay_doi AS changes
FROM nhat_ky_hanh_dong
WHERE loai_doi_tuong = 'lich_hen'
  AND ma_doi_tuong = ?
  AND hanh_dong = 'OverrideLichHen'
  AND ket_qua = 'ThanhCong'
ORDER BY thoi_diem DESC, nhat_ky_hanh_dong_id DESC
LIMIT ?`;

@Injectable()
export class AppointmentHistoryReader {
  /**
   * Panel của lịch `lichHenId` (BIGINT dạng chuỗi, của hàng chi tiết ĐÃ qua phạm vi: nên không lọc chi nhánh lần hai). Người gọi truyền `manager` của MỘT lần gọi `runReadOnly`; lịch phải tồn tại
   * trong ảnh chụp đó (người gọi vừa đọc hàng chi tiết của nó), nếu không đó là lỗi lập trình.
   */
  async read(
    em: EntityManager,
    lichHenId: string,
  ): Promise<StatusHistoryEntry[]> {
    const milestones = await em.query<HistoryMilestones[]>(MILESTONES_SQL, [
      lichHenId,
    ]);
    const first = milestones[0];
    if (first === undefined)
      throw new Error(
        'AppointmentHistoryReader: lịch hẹn không tồn tại (người gọi phải đọc hàng chi tiết trong cùng giao dịch trước)',
      );
    const audit = await em.query<HistoryAuditRow[]>(AUDIT_SQL, [
      lichHenId,
      MAX_OVERRIDE_ENTRIES,
    ]);
    return buildStatusHistory(first, audit);
  }
}
