import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Điểm đánh giá của một bác sĩ: chuỗi 1 chữ số thập phân hoặc `null` khi chưa có lượt nào (Q16). */
export interface DoctorRating {
  diemTrungBinh: string | null;
  soDanhGia: number;
}

export const NO_RATING: DoctorRating = { diemTrungBinh: null, soDanhGia: 0 };

/**
 * Điểm trung bình và số lượt theo bác sĩ (PLAN doctor-exam 5.9, Q9): tính khi đọc, KHÔNG tính đánh giá đã ẩn (`bi_an = 0`).
 * Đánh giá không có cột bác sĩ riêng nên nhóm theo `lich_hen.bac_si_id`. Đã đo ở X1 (M5, M6) và P0 của B9: `ROUND` nửa lên đúng,
 * kế hoạch mặc định của optimizer là phương án nhanh nhất, hằng chuỗi trong `IN` được MySQL đổi thành số nên không mất chính xác ở id lớn.
 */
export const AVERAGE_RATING_SQL = `SELECT CAST(lh.bac_si_id AS CHAR) AS bacSiId, ROUND(AVG(dg.so_sao), 1) AS diem, COUNT(*) AS soDanhGia
FROM danh_gia_bac_si dg JOIN lich_hen lh ON lh.lich_hen_id = dg.lich_hen_id
WHERE dg.bi_an = 0 AND lh.bac_si_id IN (?) GROUP BY lh.bac_si_id`;

/** Một hàng của câu trên như driver trả: `COUNT(*)` về chuỗi (TypeORM đặt `bigNumberStrings`), điểm là chuỗi `"4.0"` (M5). */
interface AverageRow {
  bacSiId: string;
  diem: string;
  soDanhGia: string;
}

/** Số nguyên không dấu, không số 0 đứng đầu: dạng DUY NHẤT của id mà `CAST(... AS CHAR)` trả về, nên khoá của Map khớp từng chữ. */
const NUMERIC_ID = /^(0|[1-9]\d*)$/;

/**
 * Đọc điểm đánh giá cho một nhóm bác sĩ (PLAN search 5.4 bước 3, Q16; PLAN doctor-exam 5.9, task B9).
 * Chữ ký không đổi so với bản trả `{ null, 0 }` ở B4 nên `PublicDoctorService` không phải sửa.
 * Một câu `SELECT` ở chế độ tự cam kết có ảnh chụp riêng: lần đọc nào bắt đầu sau commit của người gửi hay người ẩn đánh giá đều thấy kết quả mới (không cache).
 */
@Injectable()
export class DoctorRatingReader {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Trả Map đủ MỌI id truyền vào theo thứ tự đầu vào (id trùng thành MỘT khoá; bác sĩ không có đánh giá vẫn có phần tử `NO_RATING`). */
  async readMany(
    doctorIds: readonly string[],
  ): Promise<Map<string, DoctorRating>> {
    const result = new Map<string, DoctorRating>(
      doctorIds.map((id) => [id, NO_RATING]),
    );
    // Id không phải số không bao giờ đến câu SQL (ngoài việc mysql2 đã thoát giá trị); danh sách rỗng ⇒ không chạy SQL.
    const ids = [...result.keys()].filter((id) => NUMERIC_ID.test(id));
    if (ids.length === 0) return result;
    const rows = await this.db.query<AverageRow[]>(AVERAGE_RATING_SQL, [ids]);
    for (const row of rows) {
      result.set(row.bacSiId, {
        diemTrungBinh: String(row.diem),
        soDanhGia: Number(row.soDanhGia),
      });
    }
    return result;
  }
}
