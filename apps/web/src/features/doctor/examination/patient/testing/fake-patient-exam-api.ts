import type {
  ExamDetailNote,
  ExamListItem,
  ExamineeOption,
} from '../../api/patient-exam-types';

// Bộ dựng giả cho test trang "Hồ sơ khám bệnh" của Bệnh nhân (doctor-exam F5). Dữ liệu giả, không phải của ai. Định tuyến `fetch` theo URL và trả ĐÚNG hợp đồng B4, B5: lọc theo `nguoiKham` (`BanThan` hay id), `nam` và `thang` THEO GIỜ VIỆT NAM,
// `demTheoThang` đủ 12 khoá (áp người khám và cả năm, KHÔNG áp `thang`), dòng sắp giờ khám giảm dần, bảy khoá mỗi dòng. Ghi lại mọi lời gọi (đường dẫn, query, `signal`) để test đếm lời gọi và kiểm huỷ yêu cầu cũ.
export interface FakeVisit extends ExamListItem {
  // id hồ sơ người thân của người khám (`null` là bản thân): chỉ để LỌC, không bao giờ vào phản hồi
  personId: string | null;
  // Chi tiết kèm theo (cho `GET /patient/exam-records/:ma`)
  chiNhanh: string;
  hoSoKham: ExamDetailNote | null;
}

export interface FakeExamData {
  visits: FakeVisit[];
  people: ExamineeOption[];
}

export interface RecordedCall {
  path: string;
  params: Record<string, string>;
  signal: AbortSignal | null | undefined;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export const NOTE: ExamDetailNote = {
  trieuChung: 'Bệnh nhân mô tả đau ngực, khó thở khi gắng sức.',
  chanDoanSoBo: 'Ghi nhận ban đầu; cần theo dõi thêm.',
  huongXuLy: 'Hạn chế hoạt động thể lực nặng. Tái khám khi cần.',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
  capNhatBoi: 'Nguyễn Minh Anh',
};

export const SELF: ExamineeOption = {
  id: null,
  hoTen: 'Nguyễn Văn A',
  quanHe: null,
};
export const CHILD: ExamineeOption = {
  id: '501',
  hoTen: 'Bùi Minh Khoa',
  quanHe: 'Con',
};

let sequence = 0;

// Một ca `Hoàn thành` giả: mặc định khám bản thân, bác sĩ "Lê Thảo Vy" (BS), chưa có hồ sơ, chưa đánh giá
export function visit(
  iso: string,
  overrides: Partial<FakeVisit> = {},
): FakeVisit {
  sequence += 1;
  return {
    maLichHen: `CLX-20261018-${String(sequence).padStart(3, '0')}`,
    thoiGian: iso,
    chuyenKhoa: 'Nhi khoa',
    bacSi: { hoTen: 'Lê Thảo Vy', chucDanh: 'BS' },
    nguoiKham: { hoTen: SELF.hoTen, quanHe: null },
    coHoSoKham: false,
    daDanhGia: false,
    personId: null,
    chiNhanh: 'CLINIX Chi nhánh Quận 3',
    hoSoKham: null,
    ...overrides,
  };
}

// Năm và tháng THEO GIỜ VIỆT NAM của một thời điểm ISO UTC
function vietnamYearMonth(iso: string): { year: number; month: number } {
  const vn = new Date(Date.parse(iso) + VN_OFFSET_MS);
  return { year: vn.getUTCFullYear(), month: vn.getUTCMonth() + 1 };
}

function matchesPerson(row: FakeVisit, nguoiKham: string | undefined): boolean {
  if (nguoiKham === undefined) return true;
  if (nguoiKham === 'BanThan') return row.personId === null;
  return row.personId === nguoiKham;
}

// Bảy khoá của một dòng danh sách (KHÔNG `personId`, `chiNhanh`, `hoSoKham`)
function toListItem(row: FakeVisit): ExamListItem {
  return {
    maLichHen: row.maLichHen,
    thoiGian: row.thoiGian,
    chuyenKhoa: row.chuyenKhoa,
    bacSi: row.bacSi,
    nguoiKham: row.nguoiKham,
    coHoSoKham: row.coHoSoKham,
    daDanhGia: row.daDanhGia,
  };
}

export function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 404 `KHONG_TIM_THAY` (B5: cùng một thân cho mọi lỗi "không thấy")
export function notFoundResponse(): Response {
  return jsonOk({ maLoi: 'KHONG_TIM_THAY', thongBao: 'Không tìm thấy.' }, 404);
}

export function listBody(
  data: FakeExamData,
  params: Record<string, string>,
): unknown {
  const year = Number(params.nam);
  const month = params.thang === undefined ? null : Number(params.thang);
  const pageSize = Number(params.pageSize ?? 20);
  const ofPerson = data.visits.filter(
    (row) =>
      matchesPerson(row, params.nguoiKham) &&
      vietnamYearMonth(row.thoiGian).year === year,
  );
  const counts: Record<string, number> = {};
  for (let m = 1; m <= 12; m += 1) {
    counts[String(m)] = ofPerson.filter(
      (row) => vietnamYearMonth(row.thoiGian).month === m,
    ).length;
  }
  const inMonth = ofPerson
    .filter(
      (row) => month === null || vietnamYearMonth(row.thoiGian).month === month,
    )
    .sort((a, b) => Date.parse(b.thoiGian) - Date.parse(a.thoiGian));
  return {
    items: inMonth.slice(0, pageSize).map(toListItem),
    total: inMonth.length,
    page: 1,
    pageSize,
    demTheoThang: counts,
    nguoiKham: data.people,
  };
}

export function detailBody(row: FakeVisit): unknown {
  return {
    maLichHen: row.maLichHen,
    thoiGian: row.thoiGian,
    chuyenKhoa: row.chuyenKhoa,
    chiNhanh: row.chiNhanh,
    bacSi: row.bacSi,
    nguoiKham: row.nguoiKham,
    hoSoKham: row.hoSoKham,
    // Hai khoá của B5 mà F5 không đọc: phải bị bỏ
    danhGia: null,
    coTheDanhGia: true,
  };
}

// Trả lời MỘT lời gọi theo URL (hàm thuần; test cần trễ hay lỗi thì bọc hàm này)
export function routeExamRequest(url: URL, data: FakeExamData): Response {
  const path = url.pathname.replace(/^\/api/, '');
  const params = Object.fromEntries(url.searchParams.entries());
  if (path === '/patient/exam-records') {
    return jsonOk(listBody(data, params));
  }
  const prefix = '/patient/exam-records/';
  if (path.startsWith(prefix)) {
    const code = decodeURIComponent(path.slice(prefix.length));
    const row = data.visits.find((candidate) => candidate.maLichHen === code);
    return row === undefined ? notFoundResponse() : jsonOk(detailBody(row));
  }
  return notFoundResponse();
}

// `respond` (tuỳ chọn) chen vào SAU khi ghi lại lời gọi: trả `Response` (hay lời hứa) để thay câu trả lời mặc định (lỗi, trễ, phản hồi sai hình dạng); trả `undefined` thì dùng câu trả lời theo hợp đồng
export type ExamResponder = (
  url: URL,
  call: RecordedCall,
) => Response | Promise<Response> | undefined;

export function createFakePatientExamApi(
  data: FakeExamData,
  respond?: ExamResponder,
) {
  const calls: RecordedCall[] = [];
  const fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input), 'http://web.invalid');
    const call: RecordedCall = {
      path: url.pathname.replace(/^\/api/, ''),
      params: Object.fromEntries(url.searchParams.entries()),
      signal: init?.signal,
    };
    calls.push(call);
    const custom = respond?.(url, call);
    return custom === undefined
      ? Promise.resolve(routeExamRequest(url, data))
      : Promise.resolve(custom);
  };
  return {
    fetch,
    calls,
    listCalls: () =>
      calls.filter((call) => call.path === '/patient/exam-records'),
    detailCalls: () =>
      calls.filter((call) => call.path.startsWith('/patient/exam-records/')),
  };
}
