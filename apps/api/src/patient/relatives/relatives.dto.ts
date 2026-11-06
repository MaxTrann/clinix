import type { MoiQuanHeNguoiThan } from '../../admin/entities/enums.js';
import { IsAccountFullName } from '../../auth/dto/account-field.decorators.js';
import {
  IsBirthDate,
  IsGender,
  IsOptionalPhone,
  IsRelationship,
} from '../validation/patient-field.decorators.js';

/**
 * Một hồ sơ người thân trong phản hồi (task B3; PLAN patient 5.7; TRACKING B3-C): ĐÚNG bảy khoá này (danh sách trắng).
 * Không có `benhNhanId` (chủ sở hữu) và không có `diaChi` (Q8: người thân không nhập, không hiện địa chỉ).
 * `hoSoNguoiThanId` là chuỗi vì cột BIGINT có thể vượt Number.MAX_SAFE_INTEGER; `ngaySinh` là `YYYY-MM-DD`.
 * B7 (tra cứu bệnh nhân) dùng lại đúng kiểu này cho danh sách người thân.
 */
export interface RelativeResponse {
  hoSoNguoiThanId: string;
  hoTen: string;
  moiQuanHe: MoiQuanHeNguoiThan;
  gioiTinh: string;
  ngaySinh: string;
  soDienThoai: string | null;
  trangThaiHieuLuc: boolean;
}

/** Thân phản hồi `GET /patient/relatives`: không phân trang (Q14), cả hai trạng thái, đang sử dụng trước. */
export interface RelativesListResponse {
  items: RelativeResponse[];
}

/**
 * Thân của `POST /patient/relatives` (task B3; PLAN patient 5.7, 5.8; TRACKING B3-B): CHỈ năm trường theo thứ tự thân của PLAN.
 * `benhNhanId`, `trangThaiHieuLuc`, `hoSoNguoiThanId`, `diaChi` và mọi trường lạ bị `whitelist` + `forbidNonWhitelisted` của configureApp
 * từ chối (TRUONG_KHONG_DUOC_PHEP); chủ sở hữu lấy từ access token, không bao giờ từ thân.
 * Chuẩn hoá (NFC, cắt khoảng trắng, SĐT 10 số liền, SĐT rỗng ⇒ null) do decorator làm lúc chuyển thân thành DTO; service và repository không chuẩn hoá lại.
 * Hai kiểu trường (TRACKING P1-D): bốn trường đầu bắt buộc, không null; `soDienThoai` tuỳ chọn (thiếu khoá để lại `undefined`, controller đổi thành null).
 */
export class CreateRelativeDto {
  @IsAccountFullName()
  hoTen!: string;

  @IsRelationship()
  moiQuanHe!: MoiQuanHeNguoiThan;

  @IsGender({ nullable: false })
  gioiTinh!: string;

  @IsBirthDate({ nullable: false })
  ngaySinh!: string;

  @IsOptionalPhone()
  soDienThoai?: string | null;
}

/**
 * Thân của `PUT /patient/relatives/:id` (task B4; PLAN patient 5.7 "Body như POST"; TRACKING B4-C): cùng năm trường, cùng luật với `CreateRelativeDto`
 * (lớp con rỗng nên chỉ có MỘT nơi định nghĩa, tạo và sửa không thể lệch luật). `benhNhanId`, `trangThaiHieuLuc`, `hoSoNguoiThanId`, `diaChi`
 * và mọi trường lạ vẫn bị `forbidNonWhitelisted` từ chối. `PUT` thay cả bộ trường: bốn trường đầu bắt buộc; `soDienThoai` thiếu khoá nghĩa là XOÁ SĐT
 * (controller đổi `undefined` thành `null`, như `null`, chuỗi rỗng và chỉ khoảng trắng).
 */
export class UpdateRelativeDto extends CreateRelativeDto {}
