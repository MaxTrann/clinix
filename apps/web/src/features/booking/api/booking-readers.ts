import {
  readCode,
  readFlag,
  readId,
  readIsoDateTime,
  readList,
  readRecord,
  readText,
} from '../appointments/common/response-readers';
import type { BookingSummary, VisitRelative } from './booking-types';

// Bộ đọc phản hồi của Bước 4 (booking F4). Mỗi hàm trả đúng kiểu hoặc ném `UnexpectedResponseError` (phản hồi 200 sai hình dạng cùng loại với HTML 502:
// vẽ dữ liệu sai là trang trắng). CHỈ đọc đúng các khoá cần: khoá thừa của API (giới tính, ngày sinh, giá, cọc…) không được chép theo, nên không bao giờ
// lọt ra màn hình hay vào bản nháp.

// Một phần tử của `GET /patient/relatives`: kiểm đủ hình dạng cho CẢ HAI trạng thái rồi mới lọc, để một dòng sai hình không bị bỏ qua âm thầm.
// `trangThaiHieuLuc` phải là boolean thật: chuỗi `"true"` hay số `1` là phản hồi hỏng, không được coi là hồ sơ còn hiệu lực (đóng khi lỗi).
function parseRelativeRow(raw: unknown): {
  relative: VisitRelative;
  active: boolean;
} {
  const row = readRecord(raw);
  return {
    active: readFlag(row.trangThaiHieuLuc),
    relative: {
      hoSoNguoiThanId: readId(row.hoSoNguoiThanId),
      hoTen: readCode(row.hoTen),
      moiQuanHe: readText(row.moiQuanHe),
    },
  };
}

// Chỉ hồ sơ ĐANG HIỆU LỰC (`trangThaiHieuLuc === true`; hồ sơ ngừng sử dụng không xoá, API trả cả hai, đang sử dụng trước). Giữ nguyên thứ tự của API.
// Lọc ở ĐÂY để giao diện không bao giờ thấy hồ sơ ngừng.
export function parseRelatives(raw: unknown): VisitRelative[] {
  return readList(readRecord(raw).items)
    .map(parseRelativeRow)
    .filter((row) => row.active)
    .map((row) => row.relative);
}

// `POST /booking/checks` (B7): chỉ phần `tomTat` mà khối "Lịch hẹn đang chọn" vẽ. `chucDanh` lạ vẫn đi qua (nhãn hiện nguyên mã).
export function parseCheckSummary(raw: unknown): BookingSummary {
  const summary = readRecord(readRecord(raw).tomTat);
  const doctor = readRecord(summary.bacSi);
  return {
    dichVu: readCode(readRecord(summary.dichVu).ten),
    bacSi: {
      hoTen: readCode(doctor.hoTen),
      chucDanh: readText(doctor.chucDanh),
    },
    thoiGian: readIsoDateTime(summary.thoiGian),
  };
}
