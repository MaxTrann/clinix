import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { PATIENT_VISIBLE_STATES } from '../lists/patient-appointments.dto.js';
import type { CancelActor } from './cancel.types.js';

// Ai được THẤY lịch hẹn nào khi huỷ (sở hữu và phạm vi; PLAN booking 5.3 quy tắc 2; TRACKING 3.23 B10-D). Hàm THUẦN, kiểm HAI LẦN: ở lần đọc thường và LẠI dưới khoá (quy tắc 1, 2). Ngoài phạm vi
// là `NotFound` (404 cùng thân với "không có", H10), KHÔNG phải 403, và được hỏi TRƯỚC mọi kiểm tra trạng thái để người ngoài phạm vi không đoán được trạng thái của lịch người khác.

export interface CancelTarget {
  benhNhanId: string;
  chiNhanhId: string;
  trangThai: TrangThaiLichHen;
}

const patientCanSee = (trangThai: TrangThaiLichHen): boolean =>
  (PATIENT_VISIBLE_STATES as readonly string[]).includes(trangThai);

/**
 *  - `BenhNhan`: `lich_hen.benh_nhan_id` = tài khoản của token (kể cả lịch của hồ sơ người thân của chính mình, HL-04) VÀ lịch thuộc tập Bệnh nhân được thấy (`PATIENT_VISIBLE_STATES`: không có
 *    `DaDoiLich`, nhất quán với danh sách, chi tiết và xem trước của B1, B2; quyết định (j)).
 *  - `LeTan`: `chi_nhanh_id` của lịch = chi nhánh của Lễ tân (so chuỗi id).
 *  - `QuanTriVien`: chi nhánh của lịch nằm trong phạm vi (`BranchAccessPolicy.canAccessBranch`).
 *  - `HeThong`: không giới hạn (duyệt nghỉ phép của `doctor` tự chọn lịch qua `findAffectedByLeave`).
 */
export function isInCancelScope(
  actor: CancelActor,
  target: CancelTarget,
  policy: Pick<BranchAccessPolicy, 'canAccessBranch'>,
): boolean {
  switch (actor.kind) {
    case 'BenhNhan':
      return (
        target.benhNhanId === actor.accountId && patientCanSee(target.trangThai)
      );
    case 'LeTan':
      return target.chiNhanhId === actor.chiNhanhId;
    case 'QuanTriVien':
      return policy.canAccessBranch(actor.scope, target.chiNhanhId);
    case 'HeThong':
      return true;
  }
}
