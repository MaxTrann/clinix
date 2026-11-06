import { Injectable } from '@nestjs/common';

/** Điểm đánh giá của một bác sĩ: chuỗi 1 chữ số thập phân hoặc `null` khi chưa có lượt nào (Q16). */
export interface DoctorRating {
  diemTrungBinh: string | null;
  soDanhGia: number;
}

export const NO_RATING: DoctorRating = { diemTrungBinh: null, soDanhGia: 0 };

/**
 * Đọc điểm đánh giá cho một nhóm bác sĩ (PLAN search 5.4 bước 3, Q16).
 * Bảng `danh_gia_bac_si` CHƯA có migration/entity nên hiện mọi bác sĩ là `{ null, 0 }`.
 * Task K5 sẽ đổi thân hàm sang một câu `GROUP BY` (chỉ `bi_an = false`) mà không đổi chữ ký, nên chỗ gọi (B5, B6) không phải sửa.
 */
@Injectable()
export class DoctorRatingReader {
  /** Trả Map đủ MỌI id truyền vào (bác sĩ không có đánh giá vẫn có phần tử `NO_RATING`). */
  readMany(doctorIds: readonly string[]): Promise<Map<string, DoctorRating>> {
    return Promise.resolve(new Map(doctorIds.map((id) => [id, NO_RATING])));
  }
}
