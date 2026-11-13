import { IsIn } from 'class-validator';
import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import type { RefundAmount } from '../cancel/cancel.types.js';
import { RequiredReason } from './required-reason.decorator.js';

// Thân và kết quả của `POST /admin/appointments/:maLichHen/override-status` (task B14; PLAN booking 5.7, 5.9, Q24, Q27; TRACKING 3.31 B14-C).

/**
 * Thân của route. `trangThai` nhận đủ BẢY giá trị của `TRANG_THAI_LICH_HEN` (không chỉ bốn đích của Q24): chọn `HoanThanh` phải ra 409 `CHI_BAC_SI_HOAN_THANH` (MT-03, kể cả Quản trị viên) và đích `ChoThanhToan`,
 * `DaDoiLich` ra 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` (CT-16), không phải 400; giá trị ngoài bảy là 400. `lyDo` BẮT BUỘC cho MỌI đích (Q24, Q27): sau `trim()` phải dài 1 đến 255 đơn vị UTF-16 và không giống bí mật
 * (cùng bộ kiểm `redactText` của audit); thiếu, rỗng, chỉ khoảng trắng, quá dài hay giống bí mật ⇒ 400 `DU_LIEU_KHONG_HOP_LE` với `loi[].ma` = `LY_DO_BAT_BUOC` (CT-15). Mọi khoá lạ (`benhNhanId`, `chiNhanhId`…) là
 * 400 `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted`): phạm vi chỉ từ `AdminScopeCtx`, người thực hiện chỉ từ access token.
 */
export class AdminOverrideDto {
  @IsIn(TRANG_THAI_LICH_HEN)
  trangThai!: TrangThaiLichHen;

  @RequiredReason({ rejectSecrets: true })
  lyDo!: string;
}

/**
 * Kết quả 200. Đích `DaHuy` có thêm `hoanCoc` (số THỰC TẾ, hoàn 100% cọc đã thu, `null` khi chưa thu đồng nào, như route huỷ của Bệnh nhân); các đích còn lại chỉ có hai khoá. Cố ý KHÔNG trả `so_lan_no_show`,
 * cờ khoá đặt lịch hay dữ liệu audit.
 */
export type AdminOverrideResult =
  | { maLichHen: string; trangThai: 'DaHuy'; hoanCoc: RefundAmount | null }
  | {
      maLichHen: string;
      trangThai: 'DaTiepDon' | 'VangMat' | 'DaXacNhan';
    };
