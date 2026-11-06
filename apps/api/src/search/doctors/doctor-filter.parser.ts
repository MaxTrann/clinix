import { AppException } from '../../common/errors/app.exception.js';
import { toCents } from '../../pricing/money.js';
import { SEARCH_ERROR_CODES } from '../search.constants.js';
import { parseFilterId } from '../common/id-param.js';
import type { PublicDoctorQueryDto } from './public-doctor.dto.js';

/** Các kiểu sắp xếp (Q12). Tên giá trị là `[đề xuất]`: Figma/PLAN chỉ nêu nghĩa, chưa chốt chuỗi. */
export const DOCTOR_SORTS = ['kinhNghiem', 'giaTangDan', 'danhGiaCao'] as const;
export type DoctorSort = (typeof DOCTOR_SORTS)[number];
export const DEFAULT_DOCTOR_SORT: DoctorSort = 'kinhNghiem';

/** Bộ lọc đã kiểm: id là chuỗi, tiền là số đơn vị 0,01 (đồng × 100), điểm là số nguyên "phần mười" (4,5 ⇒ 45). */
export interface DoctorFilters {
  dichVuKhamId: string | null;
  chuyenKhoaId: string | null;
  chiNhanhId: string | null;
  likePattern: string | null;
  giaTuCents: bigint | null;
  giaDenCents: bigint | null;
  diemTuTenths: number | null;
  sapXep: DoctorSort;
}

type FieldError = { truong: string; ma: string };

// Giá: số nguyên đồng ≥ 0, tối đa 12 chữ số (cột decimal(12,2)); "100.5", "-5", "1e3", "abc" đều sai.
const PRICE_PATTERN = /^\d{1,12}$/;
// Điểm: một chữ số, tuỳ chọn 1 chữ số thập phân; miền 0,1–5,0.
const RATING_PATTERN = /^\d(?:\.\d)?$/;

function idOrError(
  raw: string | undefined,
  field: string,
  errors: FieldError[],
): string | null {
  try {
    return parseFilterId(raw, field);
  } catch (error) {
    if (error instanceof AppException) {
      errors.push({ truong: field, ma: SEARCH_ERROR_CODES.INVALID_FILTER_ID });
      return null;
    }
    throw error;
  }
}

function priceOrError(
  raw: string | undefined,
  field: string,
  errors: FieldError[],
): bigint | null {
  if (raw === undefined) return null;
  if (!PRICE_PATTERN.test(raw)) {
    errors.push({ truong: field, ma: SEARCH_ERROR_CODES.INVALID_PRICE });
    return null;
  }
  return toCents(raw);
}

/**
 * Kiểm MỌI tham số lọc một lượt rồi báo hết lỗi cùng lúc (400 `BO_LOC_KHONG_HOP_LE` + `loi[]`), để FE gắn lỗi đúng ô.
 * Id đúng dạng nhưng không tồn tại không phải lỗi (danh sách rỗng — Q23, TBS-15).
 */
export function parseDoctorFilters(query: PublicDoctorQueryDto): DoctorFilters {
  const errors: FieldError[] = [];
  const dichVuKhamId = idOrError(query.dichVuKhamId, 'dichVuKhamId', errors);
  const chuyenKhoaId = idOrError(query.chuyenKhoaId, 'chuyenKhoaId', errors);
  const chiNhanhId = idOrError(query.chiNhanhId, 'chiNhanhId', errors);
  const giaTuCents = priceOrError(query.giaTu, 'giaTu', errors);
  const giaDenCents = priceOrError(query.giaDen, 'giaDen', errors);
  if (giaTuCents !== null && giaDenCents !== null && giaTuCents > giaDenCents) {
    errors.push({
      truong: 'giaTu',
      ma: SEARCH_ERROR_CODES.INVALID_PRICE_RANGE,
    });
  }

  let diemTuTenths: number | null = null;
  if (query.diemTu !== undefined) {
    const tenths = RATING_PATTERN.test(query.diemTu)
      ? Math.round(Number(query.diemTu) * 10)
      : 0;
    if (tenths < 1 || tenths > 50) {
      errors.push({ truong: 'diemTu', ma: SEARCH_ERROR_CODES.INVALID_RATING });
    } else {
      diemTuTenths = tenths;
    }
  }

  let sapXep: DoctorSort = DEFAULT_DOCTOR_SORT;
  if (query.sapXep !== undefined) {
    const found = DOCTOR_SORTS.find((sort) => sort === query.sapXep);
    if (found) sapXep = found;
    else {
      errors.push({ truong: 'sapXep', ma: SEARCH_ERROR_CODES.INVALID_SORT });
    }
  }

  if (errors.length > 0) {
    throw new AppException(400, SEARCH_ERROR_CODES.INVALID_FILTER, {
      thongBao: 'Bộ lọc không hợp lệ.',
      loi: errors,
    });
  }
  return {
    dichVuKhamId,
    chuyenKhoaId,
    chiNhanhId,
    likePattern: query.likePattern,
    giaTuCents,
    giaDenCents,
    diemTuTenths,
    sapXep,
  };
}
