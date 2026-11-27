import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { parseTenths } from './ranking.rules.js';

// Hai lần đọc nhỏ của API gợi ý mà search và scheduling chưa có (chatbot B4; PLAN chatbot 5.11 bước 1 và 6). Chỉ đọc, không khoá, không ghi.
// Không dùng `PublicContextRepository.findActiveSpecialties` của B2: lớp đó không `@Injectable` (B3 dựng bằng `useFactory`), nên dùng chung sẽ
// buộc hai nơi cùng đăng ký một lớp; một câu một dòng nên viết riêng, không import `context/`.

export interface ActiveSpecialty {
  chuyenKhoaId: string;
  ten: string;
}

type SpecialtyRow = { chuyenKhoaId: string | number; ten: string };
type AverageRow = { diem: string | number | null };

@Injectable()
export class SuggestionRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Chuyên khoa ĐANG HOẠT ĐỘNG (không có hay đã ngừng ⇒ `null`; service trả cùng một 404). Một câu SELECT, không cần giao dịch. */
  async findActiveSpecialty(id: string): Promise<ActiveSpecialty | null> {
    const rows = await this.db.query<SpecialtyRow[]>(
      `SELECT chuyen_khoa_id AS chuyenKhoaId, ten AS ten FROM chuyen_khoa
       WHERE chuyen_khoa_id = ? AND trang_thai_hoat_dong = 'DangHoatDong'`,
      [id],
    );
    const row = rows[0];
    return row
      ? { chuyenKhoaId: String(row.chuyenKhoaId), ten: row.ten }
      : null;
  }

  /**
   * Điểm sao trung bình TOÀN HỆ THỐNG, phần mười nguyên (4,5 ⇒ 45): trung bình mọi đánh giá CHƯA ẨN (`bi_an = 0`), mỗi đánh giá một phiếu,
   * làm tròn 1 chữ số như `DoctorRatingReader`. Hệ thống chưa có đánh giá nào ⇒ `null` (rating chuẩn hoá bằng 0 cho mọi người, MH5).
   * Chạy trong giao dịch chỉ đọc của bên gọi để cùng ảnh chụp với khung giờ và học vị.
   */
  async readSystemAverageTenths(
    manager: EntityManager,
  ): Promise<number | null> {
    const rows = await manager.query<AverageRow[]>(
      `SELECT ROUND(AVG(so_sao), 1) AS diem FROM danh_gia_bac_si WHERE bi_an = 0`,
    );
    const diem = rows[0]?.diem;
    return diem === null || diem === undefined
      ? null
      : parseTenths(String(diem));
  }
}
