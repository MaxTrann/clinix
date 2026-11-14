import { IsIn, ValidateIf } from 'class-validator';
import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import type { RefundAmount } from '../cancel/cancel.types.js';
import { RequiredReason } from './required-reason.decorator.js';

// Thân và kết quả của `POST /reception/appointments/:maLichHen/status` (task B12; PLAN booking 5.7, 5.9, Q27; TRACKING 3.26 B12-E, đã duyệt 12/11/2026).

/**
 * Thân của route. `trangThai` nhận đủ BẢY giá trị của `TRANG_THAI_LICH_HEN` (không chỉ ba đích Lễ tân làm được): chọn `HoanThanh` phải ra 409 `CHI_BAC_SI_HOAN_THANH` (MT-03) và đích khác ra 409
 * `CHUYEN_TRANG_THAI_KHONG_HOP_LE` (CT-08), không phải 400; giá trị ngoài bảy là 400. `lyDo` BẮT BUỘC (1 đến 255 ký tự sau khi cắt khoảng trắng) CHỈ khi `trangThai = DaHuy`: thiếu, rỗng, chỉ khoảng
 * trắng hay quá dài ⇒ 400 `DU_LIEU_KHONG_HOP_LE` với `loi[].ma` = `LY_DO_BAT_BUOC` (CT-02; `message` của ràng buộc là mã trường, như `lyDoKham` ở B8). Với đích khác `DaHuy`, `lyDo` bị BỎ QUA
 * và không ghi đi đâu (Q27: Vắng mặt và tiếp đón không có lý do; không có cột để lưu). Mọi khoá lạ (`benhNhanId`, `chiNhanhId`…) là 400 `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted`):
 * chi nhánh chỉ từ `ReceptionScopeService`, không từ người dùng.
 */
export class ReceptionStatusDto {
  @IsIn(TRANG_THAI_LICH_HEN)
  trangThai!: TrangThaiLichHen;

  // Bộ kiểm `lyDo` dùng chung với `AdminOverrideDto` (`required-reason.decorator.ts`, B14): cùng cắt khoảng trắng, 1 đến 255, mã `LY_DO_BAT_BUOC`; Lễ tân KHÔNG bật `rejectSecrets` (không ghi audit), hành vi không đổi
  @ValidateIf((dto: ReceptionStatusDto) => dto.trangThai === 'DaHuy')
  @RequiredReason()
  lyDo?: string;
}

/**
 * Kết quả 200. Đích `DaHuy` có thêm `hoanCoc` (số THỰC TẾ, `null` khi chưa thu đồng nào, như route huỷ của Bệnh nhân); `DaTiepDon` và `VangMat` chỉ có hai khoá. Cố ý KHÔNG trả `so_lan_no_show` hay
 * cờ khoá đặt lịch (không có trong Figma 489:2 `[cần điền]`: F9 nói nếu cần).
 */
export type ReceptionStatusResult =
  | { maLichHen: string; trangThai: 'DaHuy'; hoanCoc: RefundAmount | null }
  | { maLichHen: string; trangThai: 'DaTiepDon' | 'VangMat' };
