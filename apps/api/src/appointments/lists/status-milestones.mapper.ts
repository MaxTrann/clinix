// Mốc thời gian từng bước của lịch hẹn trong chi tiết của MỌI vai (booking B19, issue #551; TRACKING 3.46 B19-E): MỘT đối tượng `moc` thay ba khoá riêng, nên mỗi vai chỉ thêm ĐÚNG MỘT khoá cấp một.
// MỘT chỗ chung cho cả ba mapper (Bệnh nhân, Bác sĩ, nhân sự) và cho đoạn SQL chọn ba cột: không ai tự viết lại (jscpd). Chỉ liệt kê từng khoá, không trải hàng thô (LSH-14, DSV-08, DSB-06).

/**
 * Ba mốc theo MÃ BƯỚC của thanh trạng thái (`xacNhan` ⇒ bước `DaXacNhan`, `tiepDon` ⇒ `DaTiepDon`, `hoanThanh` ⇒ `HoanThanh`): ISO 8601 UTC, hoặc `null` khi bước chưa tới, đã bị xoá khi lùi trạng thái (Quản trị viên
 * đưa về `DaXacNhan` hoặc sang `VangMat`), hoặc lịch tạo trước B19 (KHÔNG điền giả).
 */
export interface StatusMilestones {
  xacNhan: string | null;
  tiepDon: string | null;
  hoanThanh: string | null;
}

/** Ba cột của hàng thô (DATETIME ra `Date` nhờ cấu hình driver, giống `thoi_diem_huy` và `thoi_diem_tao`). */
export interface MilestoneColumns {
  thoiDiemXacNhan: Date | null;
  thoiDiemTiepDon: Date | null;
  thoiDiemHoanThanh: Date | null;
}

/** Đoạn SQL chọn ba cột (alias trùng `MilestoneColumns`); chỉ nối vào câu CHI TIẾT, không vào câu danh sách. */
export const MILESTONE_COLUMNS = `lh.thoi_diem_xac_nhan AS thoiDiemXacNhan, lh.thoi_diem_tiep_don AS thoiDiemTiepDon, lh.thoi_diem_hoan_thanh AS thoiDiemHoanThanh`;

/** `Date` của hàng thô ⇒ ISO UTC; cột NULL ⇒ `null` (không bao giờ `Invalid Date` hay chuỗi rỗng). */
export function toMilestones(row: MilestoneColumns): StatusMilestones {
  return {
    xacNhan: row.thoiDiemXacNhan?.toISOString() ?? null,
    tiepDon: row.thoiDiemTiepDon?.toISOString() ?? null,
    hoanThanh: row.thoiDiemHoanThanh?.toISOString() ?? null,
  };
}
