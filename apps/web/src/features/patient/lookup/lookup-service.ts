import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import { isIsoDateTime } from '../relatives/appointment-labels';
import type {
  PatientDetail,
  PatientDetailRelative,
  PatientSearchPage,
  PatientSummary,
} from './lookup-types';

// Gọi và kiểm hình dạng hai API tra cứu của Lễ tân (patient F8; TRACKING F8-D). Hợp đồng: PLAN 5.7, TRACKING mục 5 dòng `patient` F8.
// Sai hình dạng nghĩa là trang trắng nếu cứ vẽ, nên coi như phản hồi không dùng được (cùng loại với HTML 502), theo mẫu `parseProfile` của F3.

const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
// Id BIGINT giữ dạng chuỗi số, KHÔNG qua `Number` (id lớn hơn 2^53 sẽ sai chữ số)
const PUBLIC_ID = /^[0-9]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isCount = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min;

function unusable(): never {
  throw new UnexpectedResponseError(200);
}

function parseSummary(raw: unknown): PatientSummary {
  if (!isRecord(raw)) return unusable();
  const { taiKhoanId, hoTen, soDienThoai, email, trangThai } = raw;
  if (
    !isText(taiKhoanId) ||
    !PUBLIC_ID.test(taiKhoanId) ||
    !isText(hoTen) ||
    !isText(soDienThoai) ||
    !isText(email) ||
    !isText(trangThai)
  ) {
    return unusable();
  }
  // Chỉ giữ năm khoá sẽ vẽ: khoá thừa (nếu API lỡ thêm) không lọt ra màn hình
  return { taiKhoanId, hoTen, soDienThoai, email, trangThai };
}

export function parsePatientSearchPage(raw: unknown): PatientSearchPage {
  if (!isRecord(raw)) return unusable();
  const { items, total, page, pageSize } = raw;
  if (
    !Array.isArray(items) ||
    !isCount(total, 0) ||
    !isCount(page, 1) ||
    !isCount(pageSize, 1)
  ) {
    return unusable();
  }
  return { items: items.map(parseSummary), total, page, pageSize };
}

function parseRelative(raw: unknown): PatientDetailRelative {
  if (!isRecord(raw)) return unusable();
  const {
    hoTen,
    moiQuanHe,
    gioiTinh,
    ngaySinh,
    soDienThoai,
    trangThaiHieuLuc,
  } = raw;
  if (
    !isText(hoTen) ||
    !isText(moiQuanHe) ||
    !isText(gioiTinh) ||
    !isText(ngaySinh) ||
    !ISO_DATE.test(ngaySinh) ||
    !isTextOrNull(soDienThoai) ||
    typeof trangThaiHieuLuc !== 'boolean'
  ) {
    return unusable();
  }
  return {
    hoTen,
    moiQuanHe,
    gioiTinh,
    ngaySinh,
    soDienThoai,
    trangThaiHieuLuc,
  };
}

export function parsePatientDetail(raw: unknown): PatientDetail {
  if (!isRecord(raw)) return unusable();
  const {
    hoTen,
    email,
    soDienThoai,
    gioiTinh,
    ngaySinh,
    diaChi,
    thoiDiemTao,
    trangThai,
    soLanVangMat,
    nguoiThan,
  } = raw;
  if (
    !isText(hoTen) ||
    !isText(email) ||
    !isText(soDienThoai) ||
    !isTextOrNull(gioiTinh) ||
    !isTextOrNull(diaChi) ||
    !(ngaySinh === null || (isText(ngaySinh) && ISO_DATE.test(ngaySinh))) ||
    !isText(thoiDiemTao) ||
    !isIsoDateTime(thoiDiemTao) ||
    !isText(trangThai) ||
    !isCount(soLanVangMat, 0) ||
    !Array.isArray(nguoiThan)
  ) {
    return unusable();
  }
  return {
    hoTen,
    email,
    soDienThoai,
    gioiTinh,
    ngaySinh,
    diaChi,
    thoiDiemTao,
    trangThai,
    soLanVangMat,
    nguoiThan: nguoiThan.map(parseRelative),
  };
}

export interface SearchParams {
  q: string;
  page: number;
  pageSize: number;
}

// CHỈ ba khoá `q`, `page`, `pageSize`: tham số lạ (như `chiNhanhId`) bị API từ chối 400 `TRUONG_KHONG_DUOC_PHEP`.
// `q` là dữ liệu cá nhân (H5): đi trong query của yêu cầu API, KHÔNG vào URL của trang, log hay kho trình duyệt.
export async function searchPatients(
  params: SearchParams,
  signal: AbortSignal,
): Promise<PatientSearchPage> {
  return parsePatientSearchPage(
    await request<unknown>('/reception/patients', {
      query: { q: params.q, page: params.page, pageSize: params.pageSize },
      signal,
    }),
  );
}

// Không gửi query nào (B7 bỏ qua query lạ). `id` lấy từ danh sách đã qua `parsePatientSearchPage` nên chỉ gồm chữ số; vẫn mã hoá để một
// chuỗi lạ không thể đổi đường dẫn.
export async function getPatientDetail(
  id: string,
  signal: AbortSignal,
): Promise<PatientDetail> {
  return parsePatientDetail(
    await request<unknown>(`/reception/patients/${encodeURIComponent(id)}`, {
      signal,
    }),
  );
}
