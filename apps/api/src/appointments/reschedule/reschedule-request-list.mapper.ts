import { deriveSlotStatus } from '../../scheduling/slots/slot-status.rules.js';
import { parseVnDateTime } from '../slots/slot-lock.js';
import type { RequestApproval } from './reschedule-request-list.rules.js';
import type {
  RescheduleRequestDetail,
  RescheduleRequestDetailRow,
  RescheduleRequestItem,
  RescheduleRequestItemRow,
} from './reschedule-request-list.types.js';

// Ánh xạ hàng thô sang JSON của danh sách và chi tiết yêu cầu đổi lịch (reschedule B8; PLAN reschedule 5.7). Hàm THUẦN, MỘT nơi định nghĩa danh sách trắng khoá: từng khoá được gán tường minh (không trải
// đối tượng `...row`), nên cột thừa của SQL (`lichHenId`, `khungGioMongMuonId`, `khungGioTrangThai`…) không bao giờ ra JSON. Giờ: chuỗi giờ Việt Nam của DB sang ISO 8601 UTC giữ mili giây (H13).

const iso = (vnDateTime: string): string =>
  parseVnDateTime(vnDateTime).toISOString();

export function toRequestItem(
  row: RescheduleRequestItemRow,
): RescheduleRequestItem {
  return {
    yeuCauId: row.yeuCauId,
    trangThai: row.trangThai,
    thoiDiemTao: iso(row.thoiDiemTao),
    maLichHen: row.maLichHen,
    nguoiKham: {
      hoTen: row.nguoiKhamHoTen,
      laNguoiThan: Number(row.laNguoiThan) !== 0,
    },
    bacSi: { hoTen: row.bacSiHoTen },
    chiNhanh: { id: row.chiNhanhId, ten: row.chiNhanhTen },
    thoiGianCu: iso(row.thoiGianCu),
    thoiGianMongMuon: iso(row.thoiGianMongMuon),
    soLanDaTuDoi: Number(row.soLanDaTuDoi),
  };
}

/**
 * Chi tiết: 10 khoá của dòng cộng 9 khoá. `now` (đã `toSecond`) để `deriveSlotStatus` xét hết hạn giữ chỗ và quá giờ của khung giờ mong muốn; `soLanToiDa` là `null` khi chưa có cấu hình.
 * Ba khoá xử lý là `null` cả ba khi yêu cầu còn `ChoDuyet` (CHECK của DB bắt cặp), nên chỉ cần kiểm `thoiDiemXuLy` để biết có người xử lý.
 */
export function toRequestDetail(
  row: RescheduleRequestDetailRow,
  extra: {
    soLanToiDa: number | null;
    approval: RequestApproval;
    now: Date;
  },
): RescheduleRequestDetail {
  return {
    ...toRequestItem(row),
    soLanToiDa: extra.soLanToiDa,
    lyDoYeuCau: row.lyDoYeuCau,
    trangThaiLichGoc: row.trangThaiLichGoc,
    coTheDuyet: extra.approval.coTheDuyet,
    lyDoKhongDuyet: extra.approval.lyDoKhongDuyet,
    khungGioMongMuon: {
      khungGioId: row.khungGioMongMuonId,
      trangThai: deriveSlotStatus({
        ngayGio: parseVnDateTime(row.thoiGianMongMuon),
        trangThai: row.khungGioTrangThai,
        giuChoDen:
          row.khungGioGiuChoDen === null
            ? null
            : parseVnDateTime(row.khungGioGiuChoDen),
        now: extra.now,
      }),
    },
    ghiChuXuLy: row.ghiChuXuLy,
    thoiDiemXuLy: row.thoiDiemXuLy === null ? null : iso(row.thoiDiemXuLy),
    nguoiXuLy:
      row.nguoiXuLyHoTen === null ? null : { hoTen: row.nguoiXuLyHoTen },
  };
}
