import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import {
  BOOKING_ERROR_CODES,
  type BookingErrorCode,
} from '../appointments.constants.js';
import { evaluateBookability } from '../slots/bookability.rules.js';
import type {
  RescheduleActor,
  RescheduleSource,
  RescheduleVia,
  ReschedulabilityFacts,
  ReschedulabilityVerdict,
} from './reschedule.types.js';

// `evaluateReschedulability`: bộ luật THUẦN "lịch này đổi sang khung giờ kia được không" (reschedule B2; PLAN reschedule 5.5, 5.6). Điều kiện RIÊNG của đổi lịch đứng trước, rồi dùng lại
// đúng `evaluateBookability` (chín bước của đặt lịch, với `thayThe`) cho điều kiện CHUNG; KHÔNG viết lại luật đặt lịch. Hàm KHÔNG đọc đồng hồ (`facts.now` đã qua `toSecond`), KHÔNG đổi
// `facts`, trả LỖI ĐẦU TIÊN theo thứ tự dưới và KHÔNG ném `AppException` (người gọi đổi sang lỗi API sau commit; nếp `evaluateBookability`).

const CODES = BOOKING_ERROR_CODES;
const MINUTE_MS = 60_000;
const NOT_FOUND: ReschedulabilityVerdict = {
  ok: false,
  failure: { kind: 'NotFound' },
};

const reject = (
  code: BookingErrorCode,
  chiTiet?: unknown,
): ReschedulabilityVerdict => ({
  ok: false,
  failure: {
    kind: 'Rule',
    code,
    ...(chiTiet === undefined ? {} : { chiTiet }),
  },
});

/**
 * Lịch cũ có nằm trong phạm vi của người đổi không: `TuDoi` chỉ lịch của chính Bệnh nhân; `DoiHo` chỉ lịch của chi nhánh được gán; `DuyetYeuCau` Toàn hệ thống (`null`) mọi lịch,
 * Chi nhánh chỉ lịch của chi nhánh đó. `RescheduleReader` lọc bằng hàm này và luật kiểm LẠI (kiểm dưới khoá, `lock-order.ts` quy tắc 2).
 */
export function isInScope(
  actor: RescheduleActor,
  source: Pick<RescheduleSource, 'benhNhanId' | 'chiNhanhId'>,
): boolean {
  switch (actor.via) {
    case 'TuDoi':
      return source.benhNhanId === actor.accountId;
    case 'DoiHo':
      return source.chiNhanhId === actor.chiNhanhId;
    case 'DuyetYeuCau':
      return (
        actor.chiNhanhId === null || source.chiNhanhId === actor.chiNhanhId
      );
  }
}

/**
 * Đã quá hạn đổi chưa (Q3, nửa mở theo H8: đúng mốc là ĐÃ qua). `TuDoi`: hạn là giờ hẹn của lịch cũ. `DoiHo` và `DuyetYeuCau`: hạn là giờ hẹn cộng cửa sổ tiếp đón
 * `check_in_sau_phut` (Lễ tân vẫn đổi hộ được cho người đến muộn). So bằng `getTime()`: không so chuỗi.
 */
export function isPastRescheduleDeadline(input: {
  via: RescheduleVia;
  thoiGian: Date;
  checkInSauPhut: number;
  now: Date;
}): boolean {
  const deadline =
    input.via === 'TuDoi'
      ? input.thoiGian.getTime()
      : input.thoiGian.getTime() + input.checkInSauPhut * MINUTE_MS;
  return deadline <= input.now.getTime();
}

/**
 * Thứ tự (dừng ở lỗi đầu tiên; DTO, vai trò và `HE_THONG_CHUA_CAU_HINH` đã xảy ra TRƯỚC, ở controller và `RescheduleReader.config()`):
 *  1. không có lịch, của người khác, ngoài phạm vi ⇒ NotFound; 2. `TuDoi` mà lịch `DaDoiLich` ⇒ NotFound (cùng thân, Q31 booking); 3. trạng thái khác `DaXacNhan`;
 *  4. quá hạn đổi (Q3); 5. hồ sơ người thân đã ngừng; 6. không có khung giờ đích; 7. khung giờ đích là khung giờ cũ; 8. khác bác sĩ; 9. bác sĩ đã đổi dịch vụ;
 *  10. bác sĩ đã đổi chi nhánh; 11. chuỗi đổi lịch quá dài (R4); 12. chín bước của `evaluateBookability` (bước 1 khoá no-show KHÔNG áp dụng, Q7 (b));
 *  13. riêng `TuDoi` hết lần tự đổi: thiếu lý do ⇒ `VUOT_SO_LAN_TU_DOI`, có lý do ⇒ nhánh `Request`; 14. nhánh `Request` mà đã có yêu cầu `ChoDuyet`.
 * `DoiHo` và `DuyetYeuCau` không bị bước 13, 14 chặn: Lễ tân đổi hộ không giới hạn số lần và được phép khi lịch đang có yêu cầu chờ (KDL-19).
 */
export function evaluateReschedulability(
  facts: ReschedulabilityFacts,
): ReschedulabilityVerdict {
  const { actor, now, config, source } = facts;

  // 1, 2. Không phân biệt "không có" với "của người khác" (QB-01, H10)
  if (source === null || !isInScope(actor, source)) return NOT_FOUND;
  if (actor.via === 'TuDoi' && source.trangThai === 'DaDoiLich')
    return NOT_FOUND;

  // 3. Chỉ lịch đã xác nhận đổi được (Q7 (a)); `ChoThanhToan` phải trả tiền hoặc huỷ
  if (source.trangThai !== 'DaXacNhan')
    return reject(CODES.NOT_RESCHEDULABLE, { trangThai: source.trangThai });

  // 4. Hạn đổi (Q3)
  if (
    isPastRescheduleDeadline({
      via: actor.via,
      thoiGian: source.thoiGian,
      checkInSauPhut: config.checkInSauPhut,
      now,
    })
  )
    return reject(CODES.RESCHEDULE_TOO_LATE);

  // 5. Hồ sơ người thân đã ngừng (Q7 (e)), như đặt lịch
  if (!facts.profileActive)
    return { ok: false, failure: { kind: 'ProfileInactive' } };

  // 6 đến 10. Khung giờ đích phải của đúng bác sĩ, dịch vụ, chi nhánh của lịch cũ (Q7 (c)); khác khung giờ cũ
  const { bookability } = facts;
  if (bookability === null)
    return { ok: false, failure: { kind: 'SlotNotFound' } };
  if (bookability.slot.khungGioId === source.khungGioId)
    return reject(CODES.SAME_AS_CURRENT_SLOT);
  if (bookability.doctor.bacSiId !== source.bacSiId)
    return reject(CODES.OTHER_DOCTOR_SLOT);
  if (bookability.doctor.dichVuKhamId !== source.dichVuKhamId)
    return reject(CODES.SERVICE_CHANGED);
  if (bookability.doctor.chiNhanhId !== source.chiNhanhId)
    return reject(CODES.BRANCH_CHANGED);

  // 11. Chuỗi dài tối đa `MAX_CHAIN_DEPTH - 1` lịch (quy tắc DB 64): đổi thêm một lần mà chạm trần thì từ chối TRƯỚC, vì `PaymentChain` ném lỗi khi quá độ sâu
  if (facts.chainLength >= MAX_CHAIN_DEPTH - 1)
    return reject(CODES.RESCHEDULE_CHAIN_TOO_LONG);

  // 12. Điều kiện chung với đặt lịch. Khoá no-show không chặn đổi lịch (Q7 (b)): ÉP `false` bất kể người gọi truyền gì.
  const verdict = evaluateBookability({ ...bookability, noShowLocked: false });
  if (!verdict.ok) return reject(verdict.code, verdict.chiTiet);

  // 13, 14. Hạn mức tự đổi chỉ áp cho `TuDoi`
  if (
    actor.via !== 'TuDoi' ||
    source.soLanTuDoiLich < config.soLanTuDoiLichToiDa
  )
    return { ok: true, branch: 'Reschedule', lapsedHold: verdict.lapsedHold };
  if (!facts.requestReasonGiven)
    return reject(CODES.OVER_SELF_RESCHEDULE_LIMIT, {
      soLanDaDoi: source.soLanTuDoiLich,
      toiDa: config.soLanTuDoiLichToiDa,
    });
  if (facts.pendingRequest) return reject(CODES.RESCHEDULE_REQUEST_PENDING);
  return { ok: true, branch: 'Request', lapsedHold: verdict.lapsedHold };
}
