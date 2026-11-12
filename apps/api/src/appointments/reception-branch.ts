import { AppException } from '../common/errors/app.exception.js';
import type { AdminScope } from '../rbac/admin-scope.js';
import type { ReceptionScope } from '../rbac/reception-scope.js';
import type { ReceptionScopeService } from '../rbac/reception-scope.service.js';

// Phạm vi chi nhánh của LỄ TÂN, kiểm LẠI lúc chạy: MỘT nơi định nghĩa cho route đọc (`ReceptionAppointmentsService`, B3) và route GHI (`ReceptionStatusService`, B12), để route ghi không bao giờ yếu hơn
// route đọc (TRACKING 3.26 câu (j)). Tách nguyên văn từ phương thức private của B3, hành vi giữ nguyên.

/**
 * Phạm vi chi nhánh của Lễ tân. Với `chiNhanhId = undefined` thì phần dùng chung của danh sách hiểu là "không lọc chi nhánh" (dành cho Quản trị viên Toàn hệ thống, B4): nếu một ngày
 * `ReceptionScopeService` trả nhầm `ToanHeThong` hay thiếu `chiNhanhId`, Lễ tân sẽ mở toàn hệ thống mà không ai biết (và route GHI sẽ đổi trạng thái lịch của chi nhánh khác). Nên chỉ nhận đúng
 * `ChiNhanh` có `chiNhanhId` là chuỗi, còn lại 403 `KHONG_DU_QUYEN` như chính `ReceptionScopeService` (một mã chung cho mọi nhánh từ chối, không lộ lý do). Gán vào biến kiểu `AdminScope` để kiểm
 * được kiểu lúc chạy.
 */
export async function resolveReceptionBranch(
  scopes: Pick<ReceptionScopeService, 'resolve'>,
  accountId: string,
): Promise<ReceptionScope> {
  const scope: AdminScope = await scopes.resolve(accountId);
  if (scope.kind !== 'ChiNhanh' || typeof scope.chiNhanhId !== 'string')
    throw new AppException(403, 'KHONG_DU_QUYEN');
  return scope;
}
