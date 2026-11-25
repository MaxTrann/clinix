import { request } from '../../../../../shared/api/client';
import {
  parseRescheduleCandidate,
  parseRescheduleCurrent,
  readOptionalText,
} from '../../common/reschedule-payload';
import {
  readCount,
  readFlag,
  readIsoDateTime,
  readRecord,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { appointmentApiPath } from '../api/patient-appointment-detail-api';
import {
  RESCHEDULE_KINDS,
  type RescheduleKind,
  type ReschedulePreview,
} from './reschedule-types';

// Gọi và kiểm hình dạng `GET /patient/appointments/:maLichHen/reschedule-preview?khungGioId=` (reschedule F1; PLAN reschedule 5.8). Route của Bệnh nhân nên GẮN access token (mặc định
// của `request()`); chủ sở hữu do backend lấy từ token. Bộ đọc NGHIÊM: thiếu khoá hay sai kiểu ⇒ `UnexpectedResponseError`, khoá thừa không bao giờ lọt ra màn hình.

function readKind(value: unknown): RescheduleKind {
  const text = readText(value);
  return RESCHEDULE_KINDS.find((kind) => kind === text) ?? unusableResponse();
}

export function parseReschedulePreview(raw: unknown): ReschedulePreview {
  const body = readRecord(raw);
  const reason = readOptionalText(body.lyDoKhongDoi);
  return {
    choPhepDoi: readFlag(body.choPhepDoi),
    ...(reason === undefined ? {} : { lyDoKhongDoi: reason }),
    loai: readKind(body.loai),
    soLanDaDoi: readCount(body.soLanDaDoi),
    soLanToiDa: readCount(body.soLanToiDa),
    coYeuCauChoDuyet: readFlag(body.coYeuCauChoDuyet),
    lichCu: parseRescheduleCurrent(body.lichCu),
    lichMoi: parseRescheduleCandidate(body.lichMoi),
    thoiGianMayChu: readIsoDateTime(body.thoiGianMayChu),
  };
}

// `khungGioId = null` ⇒ không gửi query: máy chủ chỉ trả điều kiện đổi (PLAN 5.8). Có ⇒ id đi nguyên chuỗi (`request()` mã hoá query).
export async function getReschedulePreview(
  maLichHen: string,
  khungGioId: string | null,
  signal?: AbortSignal,
): Promise<ReschedulePreview> {
  return parseReschedulePreview(
    await request<unknown>(
      `${appointmentApiPath(maLichHen)}/reschedule-preview`,
      {
        query: khungGioId === null ? undefined : { khungGioId },
        signal,
      },
    ),
  );
}
