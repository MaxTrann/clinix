import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../common/public-doctor.sql.js';
import { publicServiceCondition } from '../common/public-service.sql.js';
import { runReadOnly } from '../common/read-only-tx.js';
import { SUGGESTIONS_PER_GROUP } from '../search.constants.js';
import type { PublicSuggestions } from './public-suggestion.dto.js';

/**
 * Ba truy vấn nhỏ trong MỘT giao dịch chỉ đọc. Mỗi nhóm nhúng đúng hằng điều kiện công khai của danh sách tương ứng (H5):
 * chuyên khoa đang hoạt động, dịch vụ đang cung cấp, bác sĩ công khai. Từ khoá luôn đi qua tham số `?` (BMS-03).
 */
@Injectable()
export class PublicSuggestionRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  find(likePattern: string): Promise<PublicSuggestions> {
    return runReadOnly(this.db, async (manager) => ({
      chuyenKhoa: await manager.query<PublicSuggestions['chuyenKhoa']>(
        `SELECT c.chuyen_khoa_id AS chuyenKhoaId, c.ten AS ten
         FROM chuyen_khoa c
         WHERE c.trang_thai_hoat_dong = 'DangHoatDong' AND c.ten LIKE ? ESCAPE '!'
         ORDER BY c.ten ASC, c.chuyen_khoa_id ASC LIMIT ?`,
        [likePattern, SUGGESTIONS_PER_GROUP],
      ),
      dichVu: await manager.query<PublicSuggestions['dichVu']>(
        `SELECT d.dich_vu_kham_id AS dichVuKhamId, d.ten AS ten
         FROM dich_vu_kham d
         WHERE ${publicServiceCondition(false)} AND d.ten LIKE ? ESCAPE '!'
         ORDER BY d.ten ASC, d.dich_vu_kham_id ASC LIMIT ?`,
        [likePattern, SUGGESTIONS_PER_GROUP],
      ),
      bacSi: await manager.query<PublicSuggestions['bacSi']>(
        `SELECT b.tai_khoan_id AS bacSiId, t.ho_ten AS hoTen, b.chuc_danh AS chucDanh
         FROM ${PUBLIC_DOCTOR_FROM}
         WHERE ${PUBLIC_DOCTOR_CONDITION} AND t.ho_ten LIKE ? ESCAPE '!'
         ORDER BY b.so_nam_kinh_nghiem DESC, t.ho_ten ASC, b.tai_khoan_id ASC LIMIT ?`,
        [likePattern, SUGGESTIONS_PER_GROUP],
      ),
    }));
  }
}
