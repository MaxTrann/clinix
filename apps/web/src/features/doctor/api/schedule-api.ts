import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type {
  LeaveStateCode,
  ShiftCode,
} from '../../../shared/schedule/shift-labels';

// Hợp đồng `GET /doctor/schedule` (PLAN doctor B7). `soLichHen` do booking B17 (D14, Q18) thêm từ 12/11/2026 và CHỈ đếm lịch chưa khám xong (`ChoThanhToan`, `DaXacNhan`,
// `DaTiepDon`); khai tuỳ chọn để bản API cũ không có trường thì giao diện không hiện số (không bao giờ hiện "0" giả). Doctor UX6 hiện nó ở ô tuần là "N chưa khám".
export interface DoctorShift {
  lichLamViecId: string;
  ngay: string;
  ca: ShiftCode;
  chiNhanh: { chiNhanhId: string; ten: string };
  // Giờ theo lịch hoạt động hiện hành của chi nhánh; `null` khi ca không còn khớp giờ hoạt động (`gioCaKhongCon`)
  batDau: string | null;
  ketThuc: string | null;
  gioCaKhongCon: boolean;
  nghiPhep: LeaveStateCode | null;
  soLichHen?: number;
}

export interface DoctorSchedule {
  tuNgay: string;
  denNgay: string;
  ca: DoctorShift[];
  chiNhanhLoc: { chiNhanhId: string; ten: string }[];
}

export async function getDoctorSchedule(
  range: { tuNgay: string; denNgay: string },
  signal?: AbortSignal,
): Promise<DoctorSchedule> {
  const data = await request<DoctorSchedule>('/doctor/schedule', {
    query: { tuNgay: range.tuNgay, denNgay: range.denNgay },
    signal,
  });
  // Phản hồi 2xx nhưng không đúng hình dạng (proxy lạ, bản API cũ): báo lỗi chứ không để giao diện vỡ giữa chừng
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray(data.ca) ||
    !Array.isArray(data.chiNhanhLoc)
  )
    throw new UnexpectedResponseError(200);
  return data;
}
