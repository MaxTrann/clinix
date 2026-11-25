import type { EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { requestNotFoundException } from './reschedule-request-failure.js';
import type { RescheduleRequestHandlingRow } from './reschedule-request-handle.types.js';
import {
  approverActor,
  parseRescheduleRequestId,
} from './reschedule-request-list.rules.js';
import type { RescheduleRequestRepository } from './reschedule-request.repository.js';
import type { RescheduleActor } from './reschedule.types.js';

// Phạm vi của người xử lý và việc nạp yêu cầu đích, DÙNG CHUNG cho duyệt và từ chối (reschedule B9; TRACKING reschedule 1.13): hai dịch vụ cùng một thứ tự "phạm vi TRƯỚC, rồi id, rồi đọc có phạm vi" nên MỘT chỗ ở đây.

/** `actor` của lõi đổi lịch cho người duyệt (`ChiNhanh` ⇒ chi nhánh được gán, `ToanHeThong` ⇒ `null`). */
export type HandlerActor = Extract<RescheduleActor, { via: 'DuyetYeuCau' }>;

/**
 * Phạm vi do guard hay `ReceptionScopeService` giải từ DB ở MỖI request, nhưng `approverActor` hiểu mọi thứ KHÁC `ChiNhanh` là "Toàn hệ thống" (`chiNhanhId: null`, không lọc chi nhánh): một phạm vi hỏng (kind lạ, hay
 * `ChiNhanh` thiếu `chiNhanhId` chuỗi) sẽ mở toàn hệ thống mà không ai biết. Nên kiểm LẠI hình dạng lúc chạy, 403 `KHONG_DU_QUYEN` như guard (cùng luật `assertScopeShape` của `RescheduleRequestListService`, B8,
 * hàm đó không `export` và thuộc file B8 nên không sửa), RỒI mới đổi sang `actor`. Gán vào biến có kiểu rộng để kiểm được kiểu lúc chạy.
 */
export function handlerActorOf(scope: AdminScope): HandlerActor {
  const shape: { kind?: unknown; chiNhanhId?: unknown } = scope;
  const valid =
    shape.kind === 'ToanHeThong' ||
    (shape.kind === 'ChiNhanh' && typeof shape.chiNhanhId === 'string');
  if (!valid) throw new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);
  return approverActor(scope);
}

/**
 * Nạp yêu cầu đích với phạm vi TRONG SQL. Id sai dạng, không tồn tại và ngoài phạm vi cùng ném MỘT 404 `YEU_CAU_DOI_LICH_KHONG_TON_TAI` (phạm vi đã giải TRƯỚC khi vào đây, nên Lễ tân bị khoá nhận 403, không 404;
 * và yêu cầu ĐÃ XỬ LÝ ở chi nhánh khác vẫn là 404, không 409). Đọc thường, không khoá, ngoài giao dịch ghi.
 */
export async function loadHandlingRow(
  requests: RescheduleRequestRepository,
  em: EntityManager,
  actor: HandlerActor,
  rawYeuCauId: unknown,
): Promise<RescheduleRequestHandlingRow> {
  const yeuCauId = parseRescheduleRequestId(rawYeuCauId);
  if (yeuCauId === null) throw requestNotFoundException();
  const row = await requests.findForHandling(
    em,
    actor.chiNhanhId ?? undefined,
    yeuCauId,
  );
  if (row === null) throw requestNotFoundException();
  return row;
}
