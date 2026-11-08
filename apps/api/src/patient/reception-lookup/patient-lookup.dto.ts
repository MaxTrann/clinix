import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import type { TrangThaiTaiKhoan } from '../../auth/entities/enums.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type { Paged } from '../../common/paging/paged.js';
import { PATIENT_FIELD_ERROR_CODES } from '../patient.constants.js';
import type { RelativeResponse } from '../relatives/relatives.dto.js';
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

/**
 * Một người thân trong chi tiết bệnh nhân (task B7; PLAN patient Q18; TRACKING B7-B): ĐÚNG sáu khoá của `RelativeResponse` (B3) trừ `hoSoNguoiThanId`
 * (mã nội bộ: Lễ tân không có API nào nhận id người thân). `trangThaiHieuLuc` là boolean (cả hai trạng thái đều được trả); web dùng chỉ số mảng làm `key`.
 */
export type PatientDetailRelative = Omit<RelativeResponse, 'hoSoNguoiThanId'>;

/**
 * Phần hồ sơ BẢN THÂN của chi tiết bệnh nhân (kết quả của repository; chưa có người thân): ĐÚNG chín khoá này (danh sách trắng, Q18).
 *  - `soDienThoai`, `email`, `hoTen` NOT NULL ở `tai_khoan`; `gioiTinh`, `ngaySinh`, `diaChi` có thể `null`; `ngaySinh` là `YYYY-MM-DD`.
 *  - `thoiDiemTao`: chuỗi ISO 8601 UTC (`Date.toISOString()`, cùng quy ước `thoiGian` của B5); nơi hiển thị tự đổi sang NGÀY giờ Việt Nam.
 *  - `trangThai` là MÃ (`DangHoatDong`, `NgungHoatDong`); `soLanVangMat` là số (`benh_nhan.so_lan_no_show`, NOT NULL DEFAULT 0), luôn có.
 * Không có `taiKhoanId` (id đã nằm trên đường dẫn), mật khẩu băm, khoá đăng nhập, ví, ảnh, "Lịch sử lịch hẹn" (việc của `booking`).
 */
export interface PatientDetailProfile {
  hoTen: string;
  email: string;
  soDienThoai: string;
  gioiTinh: string | null;
  ngaySinh: string | null;
  diaChi: string | null;
  thoiDiemTao: string;
  trangThai: TrangThaiTaiKhoan;
  soLanVangMat: number;
}

/** Thân 200 của `GET /reception/patients/:id`: ĐÚNG mười khoá theo thứ tự của PLAN 5.7 (chín khoá bản thân rồi `nguoiThan`). */
export interface PatientDetail extends PatientDetailProfile {
  nguoiThan: PatientDetailRelative[];
}
