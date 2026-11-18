import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PageQueryDto } from '../../common/paging/page-query.dto.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { HistoryRow } from './system-config-history.mapper.js';

// Đọc lịch sử thay đổi cấu hình hệ thống (admin B6; PLAN admin Q37). Chỉ ĐỌC. `audit/` không có hàm đọc (chỉ `AuditService.record`) và luật AR-08 chỉ ràng buộc
// `appointments/`, nên truy vấn nằm ở đây, cùng cụm với B5 (tiền lệ: `appointments/lists/appointment-history.reader.ts` cho `OverrideLichHen`).
// Điều kiện của MỘT dòng "lần lưu cấu hình đã xảy ra" (dùng chung cho câu đếm và câu danh sách nên hai câu không thể lệch nhau):
// loại và mã đối tượng là hai cột đầu của chỉ mục `nhat_ky_hanh_dong_index_29 (loai_doi_tuong, ma_doi_tuong, thoi_diem)`; CHECK `chk_nhat_ky_cap_nhat_cau_hinh`
// đã buộc mọi dòng `CapNhatCauHinh` có hai giá trị đó, nên hai dòng này không đổi kết quả mà giữ cho truy vấn đi theo chỉ mục.
// `ket_qua = 'ThanhCong'`: một lần ghi thất bại không phải thay đổi đã xảy ra (Đại chốt 18/11/2026; B5 vốn không ghi dòng thất bại).
const WHERE_SQL = `WHERE n.hanh_dong = 'CapNhatCauHinh'
  AND n.loai_doi_tuong = 'cau_hinh_he_thong'
  AND n.ma_doi_tuong = 1
  AND n.ket_qua = 'ThanhCong'`;

const COUNT_SQL = `SELECT COUNT(*) AS total
FROM nhat_ky_hanh_dong n
${WHERE_SQL}`;

// Mới nhất trước; khoá phụ `nhat_ky_hanh_dong_id` làm thứ tự ổn định khi nhiều dòng cùng giây (DATETIME chỉ có độ chính xác giây).
// `tai_khoan_id` có khoá ngoại NOT NULL nên JOIN không làm rụng dòng; chỉ lấy họ tên, KHÔNG lấy email, SĐT hay băm mật khẩu.
const LIST_SQL = `SELECT n.nhat_ky_hanh_dong_id AS id, n.thoi_diem AS thoiDiem, t.ho_ten AS hoTen, n.chi_tiet_thay_doi AS changes
FROM nhat_ky_hanh_dong n
JOIN tai_khoan t ON t.tai_khoan_id = n.tai_khoan_id
${WHERE_SQL}
ORDER BY n.thoi_diem DESC, n.nhat_ky_hanh_dong_id DESC
LIMIT ? OFFSET ?`;

@Injectable()
export class SystemConfigHistoryRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /**
   * Một trang lịch sử và tổng số dòng. Hai câu chạy trong MỘT giao dịch chỉ đọc (REPEATABLE READ) nên `rows` và `total` cùng một ảnh chụp:
   * câu đếm chạy trước để ảnh chụp được lập ngay từ đó.
   */
  list(
    page: Pick<PageQueryDto, 'offset' | 'pageSize'>,
  ): Promise<{ rows: HistoryRow[]; total: number }> {
    return runReadOnly(this.db, async (manager) => {
      const counts: { total: string | number }[] =
        await manager.query(COUNT_SQL);
      const rows: HistoryRow[] = await manager.query(LIST_SQL, [
        page.pageSize,
        page.offset,
      ]);
      return { rows, total: Number(counts[0]?.total ?? 0) };
    });
  }
}
