import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import { PATIENT_ERROR_CODES } from '../../patient/patient.constants.js';
import {
  BOOKING_ERROR_CODES,
  type BookingErrorCode,
} from '../appointments.constants.js';
import {
  evaluateBookability,
  type BookabilityFacts,
  type LapsedHoldRef,
} from '../slots/bookability.rules.js';
import type {
  RescheduleActor,
  RescheduleConfig,
  RescheduleFailure,
  RescheduleSource,
  RescheduleVia,
  ReschedulabilityFacts,
  ReschedulabilityVerdict,
} from './reschedule.types.js';

// `evaluateReschedulability`: bộ luật THUẦN "lịch này đổi sang khung giờ kia được không" (reschedule B2; PLAN reschedule 5.5, 5.6). Điều kiện RIÊNG của đổi lịch đứng trước, rồi dùng lại
// đúng `evaluateBookability` (chín bước của đặt lịch, với `thayThe`) cho điều kiện CHUNG; KHÔNG viết lại luật đặt lịch. Hàm KHÔNG đọc đồng hồ (`facts.now` đã qua `toSecond`), KHÔNG đổi
// `facts`, trả LỖI ĐẦU TIÊN theo thứ tự dưới và KHÔNG ném `AppException` (người gọi đổi sang lỗi API sau commit; nếp `evaluateBookability`).
//
// reschedule B5: các bước KHÔNG phụ thuộc khung giờ đích (1 đến 5, 11, 13 và 14) được tách thành hàm dùng chung (`visibleSource`, `checkSourceState`, `checkChain`, `checkQuota`) để
// `evaluateRescheduleAvailability` (lịch này có đổi được KHÔNG KÈM khung giờ đích: cờ `choPhepDoiLich` của chi tiết lịch và preview không có `khungGioId`) và `evaluateReschedulability`
// chạy CHÍNH các bước đó, một bộ luật duy nhất, không bản thứ hai. Thứ tự và kết quả của `evaluateReschedulability` không đổi.

const CODES = BOOKING_ERROR_CODES;
const MINUTE_MS = 60_000;
const NOT_FOUND: ReschedulabilityVerdict = {
  ok: false,
  failure: { kind: 'NotFound' },
};

/**
 * Kết quả của `evaluateRescheduleAvailability`: đủ để B6 trả `GET reschedule-preview` KHÔNG có `khungGioId` (PLAN 5.8; hợp đồng web F1 mục 4, 7, 8) và để chi tiết lịch tính `choPhepDoiLich`:
 *  - `choPhep` (= `choPhepDoi`), `failure` (lý do có kiểu khi không cho phép; B6 ánh xạ như `evaluateReschedulability`), `lyDoKhongDoi` (`maLoi` PLAN 5.13 của lý do đó; `null` khi cho phép hoặc `NotFound`);
 *  - `loai`: `TuDoi` còn lần tự đổi, `GuiYeuCau` đã hết lần, `null` cho đổi hộ và duyệt (không có hạn mức) hoặc khi không có lịch; `GuiYeuCau` giữ nguyên cả khi `choPhep` `false` vì đã có yêu cầu chờ;
 *  - `soLanDaDoi` (`null` khi không có lịch), `toiDa`, `coYeuCauChoDuyet` (có yêu cầu `ChoDuyet`, kể cả khi lịch đã tồn R6; `false` khi không có lịch).
 */
export interface RescheduleAvailability {
  choPhep: boolean;
  failure: RescheduleFailure | null;
  lyDoKhongDoi: string | null;
  loai: 'TuDoi' | 'GuiYeuCau' | null;
  soLanDaDoi: number | null;
  toiDa: number;
  coYeuCauChoDuyet: boolean;
}

type Rejection = Extract<ReschedulabilityVerdict, { ok: false }>;
/** Dữ kiện không cần khung giờ đích: mọi thứ của `ReschedulabilityFacts` trừ phần `bookability`. */
type FactsWithoutSlot = Omit<ReschedulabilityFacts, 'bookability'>;

const reject = (code: BookingErrorCode, chiTiet?: unknown): Rejection => ({
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

/** `TuDoi` đã hết lần tự đổi (`so_lan_tu_doi_lich >= toiDa`); đổi hộ và duyệt không bị hạn mức. Một chỗ định nghĩa cho bước 13 và cho `loai` của preview. */
function isOverQuota(
  actor: RescheduleActor,
  source: Pick<RescheduleSource, 'soLanTuDoiLich'>,
  config: Pick<RescheduleConfig, 'soLanTuDoiLichToiDa'>,
): boolean {
  return (
    actor.via === 'TuDoi' && source.soLanTuDoiLich >= config.soLanTuDoiLichToiDa
  );
}

// Bước 1, 2. Không phân biệt "không có" với "của người khác" (QB-01, H10). `null` = NotFound.
function visibleSource(facts: FactsWithoutSlot): RescheduleSource | null {
  const { actor, source } = facts;
  if (source === null || !isInScope(actor, source)) return null;
  if (actor.via === 'TuDoi' && source.trangThai === 'DaDoiLich') return null;
  return source;
}

// Bước 3 đến 5: trạng thái, hạn đổi, hồ sơ người thân.
function checkSourceState(
  facts: FactsWithoutSlot,
  source: RescheduleSource,
): Rejection | null {
  const { actor, now, config } = facts;
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
  return null;
}

// Bước 11. Chuỗi dài tối đa `MAX_CHAIN_DEPTH - 1` lịch (quy tắc DB 64): đổi thêm một lần mà chạm trần thì từ chối TRƯỚC, vì `PaymentChain` ném lỗi khi quá độ sâu.
function checkChain(facts: FactsWithoutSlot): Rejection | null {
  return facts.chainLength >= MAX_CHAIN_DEPTH - 1
    ? reject(CODES.RESCHEDULE_CHAIN_TOO_LONG)
    : null;
}

// Bước 13, 14. Hạn mức tự đổi chỉ áp cho `TuDoi`.
function checkQuota(
  facts: FactsWithoutSlot,
  source: RescheduleSource,
  lapsedHold: LapsedHoldRef | null,
): ReschedulabilityVerdict {
  if (!isOverQuota(facts.actor, source, facts.config))
    return { ok: true, branch: 'Reschedule', lapsedHold };
  if (!facts.requestReasonGiven)
    return reject(CODES.OVER_SELF_RESCHEDULE_LIMIT, {
      soLanDaDoi: source.soLanTuDoiLich,
      toiDa: facts.config.soLanTuDoiLichToiDa,
    });
  if (facts.pendingRequest) return reject(CODES.RESCHEDULE_REQUEST_PENDING);
  return { ok: true, branch: 'Request', lapsedHold };
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
  // 1, 2
  const source = visibleSource(facts);
  if (source === null) return NOT_FOUND;

  // 3 đến 5
  const early = checkSourceState(facts, source);
  if (early !== null) return early;

  // 6 đến 10. Khung giờ đích phải của đúng bác sĩ, dịch vụ, chi nhánh của lịch cũ (Q7 (c)); khác khung giờ cũ
  const { bookability } = facts;
  if (bookability === null)
    return { ok: false, failure: { kind: 'SlotNotFound' } };
  const slotRejection = checkTargetSlot(source, bookability);
  if (slotRejection !== null) return slotRejection;

  // 11
  const tooLong = checkChain(facts);
  if (tooLong !== null) return tooLong;

  // 12. Điều kiện chung với đặt lịch. Khoá no-show không chặn đổi lịch (Q7 (b)): ÉP `false` bất kể người gọi truyền gì.
  const verdict = evaluateBookability({ ...bookability, noShowLocked: false });
  if (!verdict.ok) return reject(verdict.code, verdict.chiTiet);

  // 13, 14
  return checkQuota(facts, source, verdict.lapsedHold);
}

// Bước 7 đến 10: khung giờ đích so với lịch cũ.
function checkTargetSlot(
  source: RescheduleSource,
  bookability: BookabilityFacts,
): Rejection | null {
  if (bookability.slot.khungGioId === source.khungGioId)
    return reject(CODES.SAME_AS_CURRENT_SLOT);
  if (bookability.doctor.bacSiId !== source.bacSiId)
    return reject(CODES.OTHER_DOCTOR_SLOT);
  if (bookability.doctor.dichVuKhamId !== source.dichVuKhamId)
    return reject(CODES.SERVICE_CHANGED);
  if (bookability.doctor.chiNhanhId !== source.chiNhanhId)
    return reject(CODES.BRANCH_CHANGED);
  return null;
}

/** `maLoi` (PLAN 5.13) của một lý do từ chối có kiểu, hoặc `null` khi không có mã riêng (`NotFound` ra 404 `KHONG_TIM_THAY` ở người gọi). */
export function failureCode(failure: RescheduleFailure): string | null {
  switch (failure.kind) {
    case 'Rule':
      return failure.code;
    case 'ProfileInactive':
      return PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED;
    case 'SlotNotFound':
      return CODES.SLOT_NOT_FOUND;
    case 'NotFound':
      return null;
  }
}

/**
 * Lịch này có đổi được KHÔNG KÈM khung giờ đích (reschedule B5): chạy đúng các bước 1 đến 5, 11, 13 và 14 của `evaluateReschedulability` (cùng hàm, cùng thứ tự), bỏ các bước 6 đến 10 và 12 vì
 * chúng cần khung giờ đích. Dùng cho `choPhepDoiLich` của chi tiết lịch (Bệnh nhân với `via` `TuDoi`, Lễ tân với `DoiHo`) và cho `GET reschedule-preview` KHÔNG có `khungGioId` (B6), nên chi tiết
 * lịch và preview không bao giờ lệch nhau về điều kiện không phụ thuộc khung giờ.
 *
 * `requestReasonGiven` ĐƯỢC ÉP `true`: câu hỏi là "Bệnh nhân hết lần tự đổi vẫn gửi được yêu cầu nếu có lý do không", không phải "đã nhập lý do chưa". Vì thế `TuDoi` hết lần vẫn `choPhep` (nhánh
 * `Request`, `loai` `GuiYeuCau`) trừ khi đã có yêu cầu chờ (`DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET`). Không có lịch hay ngoài phạm vi: `choPhep` `false`, `failure` `NotFound` và KHÔNG lộ số lần hay
 * yêu cầu chờ (`loai` `null`, `soLanDaDoi` `null`, `coYeuCauChoDuyet` `false`).
 */
export function evaluateRescheduleAvailability(
  facts: Omit<FactsWithoutSlot, 'requestReasonGiven'>,
): RescheduleAvailability {
  const forced: FactsWithoutSlot = { ...facts, requestReasonGiven: true };
  const source = visibleSource(forced);
  const toiDa = facts.config.soLanTuDoiLichToiDa;
  if (source === null)
    return {
      choPhep: false,
      failure: { kind: 'NotFound' },
      lyDoKhongDoi: null,
      loai: null,
      soLanDaDoi: null,
      toiDa,
      coYeuCauChoDuyet: false,
    };

  const verdict: ReschedulabilityVerdict =
    checkSourceState(forced, source) ??
    checkChain(forced) ??
    checkQuota(forced, source, null);
  const failure = verdict.ok ? null : verdict.failure;
  return {
    choPhep: verdict.ok,
    failure,
    lyDoKhongDoi: failure === null ? null : failureCode(failure),
    loai:
      facts.actor.via === 'TuDoi'
        ? isOverQuota(facts.actor, source, facts.config)
          ? 'GuiYeuCau'
          : 'TuDoi'
        : null,
    soLanDaDoi: source.soLanTuDoiLich,
    toiDa,
    coYeuCauChoDuyet: facts.pendingRequest,
  };
}
