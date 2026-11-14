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
// Task B18 (TRACKING 3.40 B18-D; TECH_DEBT 120): job tự Vắng mặt của B13 cũng cần biết "lịch đã được Quản trị viên override chưa". Để AR-08 giữ nguyên chữ (không file nào khác có `FROM nhat_ky_hanh_dong`), file này XUẤT
// MỘT MẢNH SQL (`notOverriddenSql`) dựng từ CHÍNH ba hằng điều kiện dưới đây mà `AUDIT_SQL` của panel cũng dùng: đổi một hằng thì panel và job đổi theo, không thể lệch nhau.

/** Trần số dòng nhật ký đọc cho MỘT lịch (bỏ dòng CŨ nhất): một lịch bị override hàng trăm lần là không thực tế. */
export const MAX_OVERRIDE_ENTRIES = 100;

// Ba điều kiện của một dòng "override thành công của một lịch" (không gồm `ma_doi_tuong`: panel so với tham số `?`, job so với cột của lịch)
const OVERRIDE_TARGET_SQL = `loai_doi_tuong = 'lich_hen'`;
const OVERRIDE_ACTION_SQL = `hanh_dong = 'OverrideLichHen'`;
// `ket_qua = 'ThanhCong'`: lần thất bại không đổi trạng thái nên không phải một mốc của lịch (và không làm lịch được miễn khỏi job)
const OVERRIDE_RESULT_SQL = `ket_qua = 'ThanhCong'`;

/**
 * Mảnh SQL "lịch `lichHenAlias` CHƯA TỪNG được Quản trị viên override thành công" cho câu của job tự Vắng mặt (B18). Là đọc THƯỜNG (không `FOR UPDATE`, `FOR SHARE`: không xin khoá nào) và KHÔNG có dấu `?`,
 * nên nối vào mệnh đề có sẵn mà không đổi danh sách tham số. `nk.ma_doi_tuong` là BIGINT, so với `<alias>.lich_hen_id` cùng kiểu nên dùng được chỉ mục `nhat_ky_hanh_dong_index_29 (loai_doi_tuong, ma_doi_tuong,
 * thoi_diem)` (hai điều kiện đầu dùng đủ hai cột đầu): mỗi lịch duyệt tốn một lần tra anti-join. `lichHenAlias` là hằng của người gọi (tên bí danh trong câu của họ), KHÔNG bao giờ là dữ liệu người dùng.
 */
export function notOverriddenSql(lichHenAlias: string): string {
  return `NOT EXISTS (SELECT 1 FROM nhat_ky_hanh_dong nk
  WHERE nk.${OVERRIDE_TARGET_SQL}
    AND nk.ma_doi_tuong = ${lichHenAlias}.lich_hen_id
    AND nk.${OVERRIDE_ACTION_SQL}
    AND nk.${OVERRIDE_RESULT_SQL})`;
}

// Khoá chính của `lich_hen`: ba mốc đã có sẵn trong bảng mà câu chi tiết dùng chung không đọc (không sửa file dùng chung của B3 để thêm cột)
const MILESTONES_SQL = `SELECT thoi_diem_tao AS thoiDiemTao, thoi_diem_huy AS thoiDiemHuy, ly_do_huy AS lyDoHuy
FROM lich_hen
WHERE lich_hen_id = ?`;

// Chỉ mục `nhat_ky_hanh_dong_index_29 (loai_doi_tuong, ma_doi_tuong, thoi_diem)`: hai điều kiện đầu dùng đủ hai cột đầu của chỉ mục, `ORDER BY` đúng thứ tự cột kế tiếp nên không filesort.
// Mới nhất trước để `LIMIT` bỏ dòng cũ nhất. Chuỗi kết quả giống từng ký tự bản trước B18 (chỉ dựng từ ba hằng điều kiện ở đầu file).
const AUDIT_SQL = `SELECT nhat_ky_hanh_dong_id AS id, thoi_diem AS thoiDiem, chi_tiet_thay_doi AS changes
FROM nhat_ky_hanh_dong
WHERE ${OVERRIDE_TARGET_SQL}
  AND ma_doi_tuong = ?
  AND ${OVERRIDE_ACTION_SQL}
  AND ${OVERRIDE_RESULT_SQL}
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
