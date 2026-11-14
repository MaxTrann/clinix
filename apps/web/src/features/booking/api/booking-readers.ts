import {
  readAmount,
  readCode,
  readCount,
  readFlag,
  readId,
  readIsoDateTime,
  readList,
  readRecord,
  readText,
  unusableResponse,
} from '../appointments/common/response-readers';
import { APPOINTMENT_CODE } from './booking-errors';
import type {
  BookingConfirmation,
  BookingSummary,
  CreatedAppointment,
  RefundTier,
  VisitRelative,
} from './booking-types';

// Bộ đọc phản hồi của Bước 4 (booking F4; F5 thêm `parseCheckConfirmation` và `parseCreatedAppointment` ở cuối file). Mỗi hàm trả đúng kiểu hoặc ném `UnexpectedResponseError` (phản hồi 200 sai hình dạng cùng loại với HTML 502:
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

// Chính sách hoàn của `tomTat` (booking F5): `null` (cọc 0), `[]` (cọc > 0 chưa có mốc) hay mảng mốc. Mốc phải là số nguyên (`tyLeHoan` 0 đến 100) và mảng phải GIẢM DẦN CHẶT
// theo số giờ (backend sắp như vậy, UNIQUE theo dịch vụ và số giờ): dữ liệu hỏng thì ném thay vì vẽ một chính sách hoàn sai.
function readRefundPolicy(value: unknown): RefundTier[] | null {
  if (value === null) return null;
  const tiers = readList(value).map((raw): RefundTier => {
    const row = readRecord(raw);
    const tyLeHoan = readCount(row.tyLeHoan);
    if (tyLeHoan > 100) return unusableResponse();
    return { soGioTruocToiThieu: readCount(row.soGioTruocToiThieu), tyLeHoan };
  });
  tiers.forEach((tier, index) => {
    if (
      index > 0 &&
      tier.soGioTruocToiThieu >= tiers[index - 1].soGioTruocToiThieu
    ) {
      unusableResponse();
    }
  });
  return tiers;
}

// `POST /booking/checks` cho Bước 5 (booking F5): ĐỦ 12 khoá của `tomTat`, xếp lớp lên `parseCheckSummary` (Bước 4 không đổi). Mọi số tiền là chuỗi decimal ĐÚNG DẠNG
// (`readAmount`), giữ nguyên chuỗi. `soDuVi` LUÔN có mặt: vắng khoá là phản hồi hỏng (không được coi là `null`), còn `null` thì giữ `null`.
export function parseCheckConfirmation(raw: unknown): BookingConfirmation {
  const summary = readRecord(readRecord(raw).tomTat);
  const branch = readRecord(summary.chiNhanh);
  const patient = readRecord(summary.nguoiKham);
  return {
    ...parseCheckSummary(raw),
    chuyenKhoa: readCode(summary.chuyenKhoa),
    chiNhanh: { ten: readCode(branch.ten), diaChi: readText(branch.diaChi) },
    nguoiKham: {
      hoTen: readCode(patient.hoTen),
      laBanThan: readFlag(patient.laBanThan),
    },
    giaDichVu: readAmount(summary.giaDichVu),
    phuPhi: readAmount(summary.phuPhi),
    giaApDung: readAmount(summary.giaApDung),
    tienCoc: readAmount(summary.tienCoc),
    chinhSachHoan: readRefundPolicy(summary.chinhSachHoan),
    soDuVi: summary.soDuVi === null ? null : readAmount(summary.soDuVi),
  };
}

// 201 của `POST /booking/appointments` (B8): đúng 7 khoá. Phản hồi sai hình dạng KHÔNG được coi là thất bại chắc chắn: lịch có thể đã được tạo, nên nơi gọi xử lý nó là
// "chưa rõ" (như mạng đứt). `canThanhToan` phải khớp `trangThai` (`true` ⇔ `ChoThanhToan`) vì nó quyết định đích điều hướng; mã lịch phải đúng dạng vì nó đi vào URL.
export function parseCreatedAppointment(raw: unknown): CreatedAppointment {
  const row = readRecord(raw);
  const trangThai = readText(row.trangThai);
  if (trangThai !== 'ChoThanhToan' && trangThai !== 'DaXacNhan') {
    return unusableResponse();
  }
  const canThanhToan = readFlag(row.canThanhToan);
  if (canThanhToan !== (trangThai === 'ChoThanhToan')) {
    return unusableResponse();
  }
  const maLichHen = readText(row.maLichHen);
  if (!APPOINTMENT_CODE.test(maLichHen)) return unusableResponse();
  return {
    maLichHen,
    trangThai,
    hanThanhToan:
      row.hanThanhToan === null ? null : readIsoDateTime(row.hanThanhToan),
    giaApDung: readAmount(row.giaApDung),
    tienCoc: readAmount(row.tienCoc),
    canThanhToan,
    thoiGianMayChu: readIsoDateTime(row.thoiGianMayChu),
  };
}
