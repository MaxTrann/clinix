import { IsOptional, ValidateBy } from 'class-validator';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import type { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { isBigintId } from '../lists/list-query.rules.js';
import type { RefundTierView } from './refund-policy.js';

// Thân và kết quả của `POST /booking/checks` và kết quả của `GET /booking/eligibility` (task B7; PLAN booking 5.9; TRACKING 3.18.2). Hình dạng là [đề xuất] đã duyệt ngày 11/11/2026.

// Id BIGINT dạng CHUỖI (id lớn hơn 2^53 mà ép `Number` sẽ trỏ nhầm dòng khác): số JSON, chuỗi rỗng, có khoảng trắng, `0`, số 0 đứng đầu, vượt BIGINT đều bị từ chối. Tên ràng buộc
// `isBigintId` ⇒ mã lỗi trường `IS_BIGINT_ID` (đúng nếp của các danh sách ở `lists/`, `validation-exception.ts`).
const BigintId = () =>
  ValidateBy({
    name: 'isBigintId',
    validator: {
      validate: (value: unknown) => isBigintId(value),
      defaultMessage: () => 'isBigintId',
    },
  });

/**
 * Thân của `POST /booking/checks`. CHỈ hai trường: chủ sở hữu lấy từ access token (QB-03), nên `benhNhanId`, `bacSiId`, `chiNhanhId`, `dichVuKhamId`, `trangThai`, `lyDoKham` và mọi khoá lạ
 * là 400 `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted`). `lyDoKham` cố ý KHÔNG có ở đây: `checks` không nhận lý do khám (chỉ tạo lịch mới nhận, B8).
 */
export class BookingChecksDto {
  @BigintId()
  khungGioId!: string;

  /** Vắng hoặc `null` = hồ sơ BẢN THÂN; còn lại là id hồ sơ người thân (chuỗi). */
  @IsOptional()
  @BigintId()
  hoSoNguoiThanId?: string | null;
}

/** `tomTat` của Bước 5: đúng 12 khoá (11 khoá của PLAN 5.9 và `giaDichVu`, câu (d)); không có id nội bộ, email, SĐT hay lý do khám. */
export interface BookingSummary {
  dichVu: { ten: string; thoiLuongPhut: number };
  chuyenKhoa: string;
  bacSi: { hoTen: string; chucDanh: ChucDanhBacSi };
  /** Chi nhánh HIỆN TẠI của bác sĩ (D12), đúng chi nhánh B8 sẽ ghi vào `lich_hen` */
  chiNhanh: { ten: string; diaChi: string };
  /** Giờ bắt đầu khung giờ, ISO 8601 UTC */
  thoiGian: string;
  nguoiKham: { hoTen: string; laBanThan: boolean };
  /** `dich_vu_kham.gia_mac_dinh` (chuỗi decimal) */
  giaDichVu: string;
  /** Chỉ để hiển thị (Q46); `giaApDung = giaDichVu + phuPhi` */
  phuPhi: string;
  giaApDung: string;
  tienCoc: string;
  /** `null` khi cọc 0; `[]` khi cọc > 0 chưa có mốc (không hoàn); mảng giảm dần khi có mốc */
  chinhSachHoan: RefundTierView[] | null;
  /** Chỉ hỏi cổng ví khi cọc > 0; `null` khi cọc 0 hoặc chưa có ví thật. Khoá LUÔN có mặt */
  soDuVi: string | null;
}

export interface BookingCheckResult {
  tomTat: BookingSummary;
  /** `nowVN().toISOString()`, giữ mili giây (như B2) */
  thoiGianMayChu: string;
}

/** Kết quả của `GET /booking/eligibility`. HTTP 200 kể cả khi bị khoá (đây là kết quả của cổng, không phải lỗi). */
export interface EligibilityResult {
  choPhepDatLich: boolean;
  /** CHỈ có khi `choPhepDatLich = false`; cùng mã mà `checks` và tạo lịch trả 403, để FE dùng một bảng thông báo theo mã */
  lyDo?: typeof BOOKING_ERROR_CODES.BOOKING_LOCKED_NO_SHOW;
  soLichHenToiDaMoiHoSo: number;
}
