import type {
  TrangThaiKhungGio,
  TrangThaiLichHen,
  TrangThaiYeuCauDoiLich,
} from '../../admin/entities/enums.js';

// Kiểu của danh sách và chi tiết yêu cầu đổi lịch ngoài chính sách cho Lễ tân và Quản trị viên (reschedule B8; PLAN reschedule 5.7, 5.8). Chỉ KIỂU. Để riêng khỏi `reschedule-request.types.ts` (của B5) để B8
// chỉ THÊM file, không sửa file của B5.

/**
 * Bộ lọc của MỘT lần đọc danh sách, đã qua phạm vi và DTO. `states` không rỗng, theo thứ tự chuẩn (`statesOf`); mỗi trạng thái là một nhánh `=` của câu SQL (không `IN`, kết luận M3 của X1).
 * `chiNhanhId` là kết quả của `BranchAccessPolicy.branchFilter` (từ phạm vi đã giải ở DB, không từ query); `undefined` = Quản trị viên Toàn hệ thống không lọc chi nhánh.
 */
export interface RescheduleRequestFilter {
  states: readonly TrangThaiYeuCauDoiLich[];
  chiNhanhId: string | undefined;
  bacSiId: string | null;
  /** Mã lịch hẹn ĐÃ chuẩn hoá và đúng mẫu */
  maLichHen: string | null;
}

/** Query của service (lấy từ DTO; `offset` là getter của `PageQueryDto` nên controller lấy ra tường minh). `chiNhanhId` chỉ có ở route Quản trị viên. */
export interface RescheduleRequestListQuery {
  trangThai?: readonly TrangThaiYeuCauDoiLich[];
  bacSiId?: string;
  q?: string;
  chiNhanhId?: string;
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Hàng thô của MỘT dòng danh sách. BIGINT đã `CAST … AS CHAR` (chuỗi, có thể lớn hơn 2^53); giờ là chuỗi giờ Việt Nam `YYYY-MM-DD HH:mm:ss` nguyên văn (H13: không để driver đổi múi giờ),
 * mapper đổi sang ISO 8601 UTC. `laNguoiThan` là `0` hoặc `1` (biểu thức logic của MySQL).
 */
export interface RescheduleRequestItemRow {
  yeuCauId: string;
  trangThai: TrangThaiYeuCauDoiLich;
  thoiDiemTao: string;
  maLichHen: string;
  nguoiKhamHoTen: string;
  laNguoiThan: number | string;
  bacSiHoTen: string;
  chiNhanhId: string;
  chiNhanhTen: string;
  thoiGianCu: string;
  thoiGianMongMuon: string;
  soLanDaTuDoi: number | string;
}

/**
 * Hàng thô của câu chi tiết: thêm ba id (`lichHenId`, `khungGioMongMuonId` và `chiNhanhId` đã có ở dòng) CHỈ để dịch vụ và B9 (duyệt, từ chối) dùng, KHÔNG BAO GIỜ ra JSON (mapper ánh xạ từng
 * khoá), cộng các cột chỉ của chi tiết. `khungGioGiuChoDen` là `null` khi khung giờ không giữ chỗ.
 */
export interface RescheduleRequestDetailRow extends RescheduleRequestItemRow {
  lichHenId: string;
  khungGioMongMuonId: string;
  khungGioTrangThai: TrangThaiKhungGio;
  khungGioGiuChoDen: string | null;
  lyDoYeuCau: string;
  trangThaiLichGoc: TrangThaiLichHen;
  ghiChuXuLy: string | null;
  thoiDiemXuLy: string | null;
  nguoiXuLyHoTen: string | null;
}

/** Một dòng danh sách: ĐÚNG 10 khoá (danh sách trắng, PLAN 5.7). Không SĐT, email, `ly_do_kham`, giá, id lịch. `thoiDiemTao`, `thoiGianCu`, `thoiGianMongMuon` là ISO 8601 UTC giữ mili giây. */
export interface RescheduleRequestItem {
  yeuCauId: string;
  trangThai: TrangThaiYeuCauDoiLich;
  thoiDiemTao: string;
  maLichHen: string;
  nguoiKham: { hoTen: string; laNguoiThan: boolean };
  bacSi: { hoTen: string };
  chiNhanh: { id: string; ten: string };
  thoiGianCu: string;
  thoiGianMongMuon: string;
  soLanDaTuDoi: number;
}

/**
 * Chi tiết: ĐÚNG 19 khoá = 10 khoá của dòng cộng 9 khoá. `soLanToiDa` là `null` khi chưa có cấu hình; `lyDoKhongDuyet` là `maLoi` (PLAN 5.13) hoặc `null` khi `coTheDuyet` là `true`;
 * `khungGioMongMuon.trangThai` do `deriveSlotStatus` suy ra (hết hạn giữ chỗ là `ConTrong`, quá giờ là `HetHan`); `ghiChuXuLy`, `thoiDiemXuLy`, `nguoiXuLy` là `null` khi còn `ChoDuyet`.
 */
export interface RescheduleRequestDetail extends RescheduleRequestItem {
  soLanToiDa: number | null;
  lyDoYeuCau: string;
  trangThaiLichGoc: TrangThaiLichHen;
  coTheDuyet: boolean;
  lyDoKhongDuyet: string | null;
  khungGioMongMuon: { khungGioId: string; trangThai: TrangThaiKhungGio };
  ghiChuXuLy: string | null;
  thoiDiemXuLy: string | null;
  nguoiXuLy: { hoTen: string } | null;
}
