import type { RescheduleAvailability } from './reschedulability.rules.js';
import type { ReschedulePreviewCandidate } from './patient-reschedule.dto.js';
import type { ReceptionReschedulePreviewResult } from './reception-reschedule.dto.js';
import type { RescheduleSource } from './reschedule.types.js';

// Dựng JSON preview của Lễ tân đổi hộ (reschedule B7; PLAN reschedule 5.8; TRACKING reschedule 1.11). Hàm THUẦN: MỘT chỗ liệt kê khoá (danh sách trắng: BDL-07), nên test và đột biến chỉ cần nhìn một file.
// 201 `DaDoi` của POST và khung giờ mới của preview dùng lại `toRescheduledResult` và `toPreviewCandidate` của B6 (patient-reschedule.mapper.ts). Không có `lich_hen_id`, `yeuCauId`, tên, SĐT, email, lý do;
// không có `loai`, `soLanDaDoi`, `soLanToiDa` (đổi hộ không có hạn mức). Khoá tuỳ chọn thì VẮNG chứ không `null`.

/**
 * 200 của `GET …/reschedule-preview` cho Lễ tân. `availability` từ `evaluateRescheduleAvailability` với `actor` `DoiHo` và lịch nhìn thấy được. `lyDoKhongDoi` là chuỗi `maLoi`, `null` khi cho phép (hoặc khi
 * không có lịch, lúc đó người gọi đã trả 404): VẮNG chứ không `null`.
 */
export function toReceptionPreviewResult(input: {
  availability: RescheduleAvailability;
  source: Pick<RescheduleSource, 'thoiGian' | 'bacSiId'>;
  candidate: ReschedulePreviewCandidate | null;
  serverTime: Date;
}): ReceptionReschedulePreviewResult {
  const { availability, source, candidate, serverTime } = input;
  return {
    choPhepDoi: availability.choPhep,
    ...(availability.lyDoKhongDoi === null
      ? {}
      : { lyDoKhongDoi: availability.lyDoKhongDoi }),
    coYeuCauChoDuyet: availability.coYeuCauChoDuyet,
    lichCu: {
      thoiGian: source.thoiGian.toISOString(),
      bacSiId: source.bacSiId,
    },
    lichMoi: candidate,
    thoiGianMayChu: serverTime.toISOString(),
  };
}
