import { normalizeText, textLength } from '../exam-record-form';
import {
  RATING_MAX_STARS,
  RATING_MIN_STARS,
  type RatingBody,
} from '../api/patient-exam-types';

// Quy tắc đánh giá bác sĩ phía web, HÀM THUẦN (doctor-exam F6; PLAN 5.2, 5.7; Q7; WDG-10, WDG-13). Bản TS riêng của `rating.rules.ts` ở api (`features/` không import mã `apps/api`): hai bản giữ khớp bằng cùng bộ vector ở `rating-rules.test.ts`.
// Ở web chỉ chặn sớm các lỗi hiển nhiên; máy chủ là nơi quyết định cuối. Chuẩn hoá và đếm dùng CHUNG `normalizeText`, `textLength` của hộp ghi hồ sơ (F3), không chép bản thứ hai. Không đọc đồng hồ, không đụng DOM, không storage, URL hay log.

// Nhận xét tối đa 1.000 đơn vị UTF-16 SAU chuẩn hoá (Q7; B6 `RATING_COMMENT_MAX_LENGTH`; khớp bộ đếm của Figma)
export const RATING_COMMENT_MAX = 1000;

// Mã lỗi cùng tên với `loi[].ma` của B6 để lỗi ở máy và lỗi máy chủ đi chung một bảng câu chữ
export interface RatingFieldErrors {
  soSao?: 'SO_SAO_BAT_BUOC' | 'SO_SAO_KHONG_HOP_LE';
  nhanXet?: 'QUA_DAI';
}

export type RatingCheck =
  { ok: true; body: RatingBody } | { ok: false; errors: RatingFieldErrors };

// Số đơn vị mà máy chủ sẽ đếm cho nhận xét (SAU chuẩn hoá): số của bộ đếm `n/1.000`
export const commentCount = (comment: string): number => textLength(comment);

function checkStars(stars: number | null): RatingFieldErrors['soSao'] {
  if (stars === null) return 'SO_SAO_BAT_BUOC';
  const valid =
    Number.isInteger(stars) &&
    stars >= RATING_MIN_STARS &&
    stars <= RATING_MAX_STARS;
  return valid ? undefined : 'SO_SAO_KHONG_HOP_LE';
}

// Kiểm cả hai trường và gom MỌI lỗi (mỗi trường tối đa một lỗi). Hợp lệ ⇒ thân của POST: nhận xét ĐÃ chuẩn hoá; rỗng hay chỉ khoảng trắng ⇒ BỎ khoá `nhanXet` (máy chủ lưu NULL).
// `3.5` PHẢI chặn ở đây vì `so_sao` là `tinyint` và MySQL làm tròn thành 4 (cũng là lý do máy chủ chặn trước DB).
export function checkRating(
  stars: number | null,
  comment: string,
): RatingCheck {
  const soSao = checkStars(stars);
  const normalized = normalizeText(comment);
  const tooLong = normalized.length > RATING_COMMENT_MAX;
  if (soSao === undefined && !tooLong && stars !== null) {
    return {
      ok: true,
      body:
        normalized === ''
          ? { soSao: stars }
          : { soSao: stars, nhanXet: normalized },
    };
  }
  const errors: RatingFieldErrors = {};
  if (soSao !== undefined) errors.soSao = soSao;
  if (tooLong) errors.nhanXet = 'QUA_DAI';
  return { ok: false, errors };
}
