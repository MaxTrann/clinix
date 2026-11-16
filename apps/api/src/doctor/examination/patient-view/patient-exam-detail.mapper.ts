import type {
  ExamDetailRating,
  ExamDetailRecord,
  PatientExamDetail,
} from './patient-exam-detail.dto.js';

// Hàng thô của câu chi tiết ⇒ hình dạng trả về (doctor-exam B5; PLAN 5.6; XHS-06, XHS-10, XHS-14, XHS-20). Hàm THUẦN, không DB. Danh sách trắng: từng khoá được gán tường minh, không `...row`.

/**
 * Hàng thô: MỘT hàng của câu nối. `thoiGian` và các thời điểm là `Date` (driver `+07:00`); biểu thức logic ra `0/1` hay chuỗi tuỳ driver nên đọc bằng `Number(...)`.
 * Cột của hồ sơ và đánh giá là NULL khi LEFT JOIN không có dòng. `ngayTaiKham` đã `DATE_FORMAT` ở SQL (`YYYY-MM-DD`). KHÔNG có `bi_an`, `ly_do_an` (SQL không lấy).
 */
export interface ExamDetailRow {
  maLichHen: string;
  thoiGian: Date;
  chuyenKhoa: string;
  chiNhanh: string;
  bacSiHoTen: string;
  chucDanh: string;
  nguoiKhamHoTen: string;
  /** NULL khi người khám là bản thân (LEFT JOIN hồ sơ người thân) */
  quanHe: string | null;
  coHoSoKham: number | string;
  trieuChung: string | null;
  chanDoanSoBo: string | null;
  huongXuLy: string | null;
  ngayTaiKham: string | null;
  capNhatLanCuoi: Date | null;
  coDanhGia: number | string;
  soSao: number | string | null;
  nhanXet: string | null;
  thoiDiemTaoDanhGia: Date | null;
}

const asFlag = (value: number | string): boolean => Number(value) === 1;

// `capNhatLanCuoi` là NOT NULL trong DB: phép so với null chỉ để thu hẹp kiểu khi có hồ sơ
function toRecord(row: ExamDetailRow): ExamDetailRecord | null {
  if (!asFlag(row.coHoSoKham) || row.capNhatLanCuoi === null) return null;
  return {
    // NULL ⇒ chuỗi rỗng (XHS-14); nội dung NGUYÊN VĂN, không cắt, không escape (XHS-20)
    trieuChung: row.trieuChung ?? '',
    chanDoanSoBo: row.chanDoanSoBo ?? '',
    huongXuLy: row.huongXuLy ?? '',
    ngayTaiKhamDuKien: row.ngayTaiKham,
    capNhatLanCuoi: row.capNhatLanCuoi.toISOString(),
    // SUY RA: họ tên bác sĩ của lịch (không cột nào lưu người sửa)
    capNhatBoi: row.bacSiHoTen,
  };
}

// `so_sao` và `thoi_diem_tao` NOT NULL trong DB: các phép so với null chỉ để thu hẹp kiểu. Đánh giá bị ẩn vẫn đi qua đây nguyên vẹn (Q19): hàng không có cột ẩn nào.
function toRating(row: ExamDetailRow): ExamDetailRating | null {
  if (
    !asFlag(row.coDanhGia) ||
    row.soSao === null ||
    row.thoiDiemTaoDanhGia === null
  )
    return null;
  return {
    soSao: Number(row.soSao),
    nhanXet: row.nhanXet,
    thoiDiemTao: row.thoiDiemTaoDanhGia.toISOString(),
  };
}

export function toDetail(row: ExamDetailRow): PatientExamDetail {
  const danhGia = toRating(row);
  return {
    maLichHen: row.maLichHen,
    thoiGian: row.thoiGian.toISOString(),
    chuyenKhoa: row.chuyenKhoa,
    chiNhanh: row.chiNhanh,
    bacSi: { hoTen: row.bacSiHoTen, chucDanh: row.chucDanh },
    nguoiKham: { hoTen: row.nguoiKhamHoTen, quanHe: row.quanHe },
    hoSoKham: toRecord(row),
    danhGia,
    coTheDanhGia: danhGia === null,
  };
}
