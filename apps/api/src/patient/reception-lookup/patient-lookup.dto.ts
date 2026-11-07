import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import type { TrangThaiTaiKhoan } from '../../auth/entities/enums.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type { Paged } from '../../common/paging/paged.js';
import { PATIENT_FIELD_ERROR_CODES } from '../patient.constants.js';
import {
  isValidKeyword,
  normalizeKeyword,
} from '../validation/keyword-policy.js';

/**
 * Query của GET /reception/patients (task B6; PLAN patient 5.7, 5.8; TRACKING B6-B). Kế thừa phân trang của `PageQueryDto`
 * (`page` từ 1, `pageSize` mặc định 20, tối đa 100). Chỉ ba tham số này; tham số lạ (`benhNhanId`, `chiNhanhId`…) là 400 `TRUONG_KHONG_DUOC_PHEP`.
 */
export class SearchPatientsQueryDto extends PageQueryDto {
  // Chuẩn hoá chạy lúc chuyển query thành DTO, trước bước kiểm. Giá trị không phải chuỗi (mảng khi `?q=a&q=b`, thiếu khoá) giữ nguyên để bước kiểm báo đúng mã.
  // MỘT ràng buộc có `message` = mã: mọi lỗi của `q` ra đúng một `{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }`, không thêm IS_STRING hay LENGTH.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeKeyword(value) : value,
  )
  @ValidateBy({
    name: 'isLookupKeyword',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isValidKeyword(value),
      defaultMessage: () => PATIENT_FIELD_ERROR_CODES.INVALID_KEYWORD,
    },
  })
  q!: string;
}

/** Đầu vào của service: các giá trị lấy từ DTO (getter `offset` mất khi chuyển đối tượng thường nên controller lấy ra). */
export interface PatientLookupQuery {
  q: string;
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Một dòng danh sách: ĐÚNG năm khoá (danh sách trắng, Q18). `taiKhoanId` là chuỗi (BIGINT có thể lớn hơn 2^53). Cả `soDienThoai` lẫn `email` đều
 * NOT NULL ở `tai_khoan` nên không bao giờ `null`. `trangThai` là MÃ (`DangHoatDong`, `NgungHoatDong`); giao diện tự ánh xạ nhãn.
 */
export interface PatientLookupItem {
  taiKhoanId: string;
  hoTen: string;
  soDienThoai: string;
  email: string;
  trangThai: TrangThaiTaiKhoan;
}

export type PatientLookupPage = Paged<PatientLookupItem>;
