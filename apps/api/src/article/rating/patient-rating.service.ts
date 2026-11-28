import { Inject, Injectable } from '@nestjs/common';
import { articleNotFound } from '../common/article-errors.js';
import { isArticleId } from '../common/article-id.js';
import type { EntityManager } from 'typeorm';
import type { LoaiDanhGiaBaiViet } from '../entities/enums.js';
import type { RatingChoice, RatingResult } from './patient-rating.dto.js';
import { PatientRatingRepository } from './patient-rating.repository.js';

// Nghiệp vụ đánh giá Thích / Không thích của Bệnh nhân (article B3; PLAN article 5.7, 5.13, T11, T12). `patientId` CHỈ lấy từ access token (controller), không từ thân hay query.
// Mọi lời gọi: id sai dạng, bài không tồn tại, `BanNhap`, `LuuTruAn` ⇒ CÙNG một 404 `KHONG_TIM_THAY` và không ghi gì (2.4.22 A1/4b). Số đếm do máy chủ tính, web không tự cộng trừ.
// `PUT` và `DELETE` đều idempotent: đặt cùng loại lần nữa hay thu hồi khi chưa có phiếu vẫn là 200 với số đếm đúng.

/** Id sai dạng (không phải BIGINT dương) cho cùng kết quả với bài không có: không phân biệt được lý do (không dò được bài chưa xuất bản). */
function requireArticleId(rawId: string): string {
  if (!isArticleId(rawId)) throw articleNotFound();
  return rawId;
}

@Injectable()
export class PatientRatingService {
  constructor(
    @Inject(PatientRatingRepository)
    private readonly repository: PatientRatingRepository,
  ) {}

  /** Phiếu của chính người gọi cho một bài đã xuất bản (`{ loai: null }` nếu chưa đánh giá). */
  async get(patientId: string, rawId: string): Promise<RatingChoice> {
    const own = await this.repository.readOwn(
      patientId,
      requireArticleId(rawId),
    );
    if (!own) throw articleNotFound();
    return { loai: own.loai };
  }

  /** Đặt hoặc đổi sang `loai`: Thích −1 và Không thích +1 (hay ngược lại) vì MỘT dòng, không cộng dồn. */
  put(
    patientId: string,
    rawId: string,
    loai: LoaiDanhGiaBaiViet,
  ): Promise<RatingResult> {
    return this.write(rawId, loai, (manager, articleId) =>
      this.repository.upsert(manager, patientId, articleId, loai),
    );
  }

  /** Thu hồi phiếu (không có thì không làm gì); trả `loai: null`. */
  remove(patientId: string, rawId: string): Promise<RatingResult> {
    return this.write(rawId, null, (manager, articleId) =>
      this.repository.remove(manager, patientId, articleId),
    );
  }

  /** Một giao dịch: khoá bài đã xuất bản (404 nếu không có, chưa ghi gì) → ghi hay xoá (`apply`) → đếm bằng chính kết nối đó. */
  private async write(
    rawId: string,
    loai: LoaiDanhGiaBaiViet | null,
    apply: (manager: EntityManager, articleId: string) => Promise<void>,
  ): Promise<RatingResult> {
    // `async`: id sai dạng thành promise bị từ chối (như `get`), không ném đồng bộ ra khỏi `put` và `remove`
    const articleId = requireArticleId(rawId);
    return this.repository.transaction(async (manager) => {
      if (!(await this.repository.lockPublished(manager, articleId)))
        throw articleNotFound();
      await apply(manager, articleId);
      const totals = await this.repository.counts(manager, articleId);
      return { loai, ...totals };
    });
  }
}
