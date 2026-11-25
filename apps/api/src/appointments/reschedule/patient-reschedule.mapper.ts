import { failureCode } from './reschedulability.rules.js';
import type { RescheduleAvailability } from './reschedulability.rules.js';
import type {
  RequestSentResult,
  RescheduledResult,
  ReschedulePreviewCandidate,
  ReschedulePreviewResult,
} from './patient-reschedule.dto.js';
import type {
  ReschedulabilityVerdict,
  RescheduleOutcome,
  RescheduleSource,
} from './reschedule.types.js';

// Dựng JSON phản hồi của hai route đổi lịch Bệnh nhân (reschedule B6; PLAN reschedule 5.8; hợp đồng web F1). Hàm THUẦN: MỘT chỗ liệt kê khoá (danh sách trắng: BDL-02), nên test và đột biến chỉ cần nhìn một file.
// Không có `lich_hen_id`, `yeuCauId`, tên, SĐT, email, lý do. Khoá tuỳ chọn thì VẮNG chứ không `null` (web từ chối `null`).

/** 201 `DaDoi`: mã lịch (không id nội bộ), giờ của lịch mới, `thoiGianMayChu` lấy SAU commit (người gọi truyền). */
export function toRescheduledResult(
  outcome: Extract<RescheduleOutcome, { kind: 'Rescheduled' }>,
  serverTime: Date,
): RescheduledResult {
  return {
    ketQua: 'DaDoi',
    lichHenMoi: {
      maLichHen: outcome.maLichHenMoi,
      thoiGian: outcome.thoiGianMoi.toISOString(),
      // B4 chèn lịch mới thẳng `DaXacNhan` (cọc đã thu nên không có hạn thanh toán); không có trường trạng thái ở kết quả của B4
      trangThai: 'DaXacNhan',
    },
    lichHenCu: { maLichHen: outcome.maLichHenCu },
    thoiGianMayChu: serverTime.toISOString(),
  };
}

/** 201 `DaGuiYeuCau`: chỉ trạng thái và giờ mong muốn; KHÔNG id yêu cầu. */
export function toRequestSentResult(
  thoiGianMongMuon: Date,
  serverTime: Date,
): RequestSentResult {
  return {
    ketQua: 'DaGuiYeuCau',
    yeuCau: {
      trangThai: 'ChoDuyet',
      thoiGianMongMuon: thoiGianMongMuon.toISOString(),
    },
    thoiGianMayChu: serverTime.toISOString(),
  };
}

/**
 * Khung giờ mới của preview từ phán quyết của CHÍNH bộ luật đầy đủ (`evaluateReschedulability`): hợp lệ ⇒ `hopLe: true`; không ⇒ `hopLe: false` kèm `maLoi`. Phán quyết `NotFound` không thể tới đây
 * (người gọi đã trả 404 trước) nên thiếu mã là lỗi lập trình: ném, không im lặng trả `hopLe: false` không lý do.
 */
export function toPreviewCandidate(
  slot: { khungGioId: string; ngayGio: Date },
  verdict: ReschedulabilityVerdict,
): ReschedulePreviewCandidate {
  const base = {
    khungGioId: slot.khungGioId,
    thoiGian: slot.ngayGio.toISOString(),
  };
  if (verdict.ok) return { ...base, hopLe: true };
  const code = failureCode(verdict.failure);
  if (code === null)
    throw new Error('khung giờ không hợp lệ nhưng không có mã lý do');
  return { ...base, hopLe: false, lyDoKhongHopLe: code };
}

/**
 * 200 của `GET …/reschedule-preview`. `availability` từ `evaluateRescheduleAvailability` với `actor` `TuDoi` và lịch nhìn thấy được, nên `loai` và `soLanDaDoi` luôn có (chỉ `null` khi không có lịch,
 * lúc đó người gọi đã trả 404): thiếu là lỗi lập trình, ném.
 */
export function toPreviewResult(input: {
  availability: RescheduleAvailability;
  source: Pick<RescheduleSource, 'thoiGian' | 'bacSiId'>;
  candidate: ReschedulePreviewCandidate | null;
  serverTime: Date;
}): ReschedulePreviewResult {
  const { availability, source, candidate, serverTime } = input;
  if (availability.loai === null || availability.soLanDaDoi === null)
    throw new Error('preview của Bệnh nhân thiếu loai hoặc soLanDaDoi');
  return {
    choPhepDoi: availability.choPhep,
    ...(availability.lyDoKhongDoi === null
      ? {}
      : { lyDoKhongDoi: availability.lyDoKhongDoi }),
    loai: availability.loai,
    soLanDaDoi: availability.soLanDaDoi,
    soLanToiDa: availability.toiDa,
    coYeuCauChoDuyet: availability.coYeuCauChoDuyet,
    lichCu: {
      thoiGian: source.thoiGian.toISOString(),
      bacSiId: source.bacSiId,
    },
    lichMoi: candidate,
    thoiGianMayChu: serverTime.toISOString(),
  };
}
