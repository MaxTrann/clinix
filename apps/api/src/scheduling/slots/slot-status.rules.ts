// Luật thuần của D3 (PLAN doctor 5.5): trạng thái từng khung giờ và trạng thái cả ngày. Không đụng DB, không đọc đồng hồ (`now` truyền vào).

export type StoredSlotStatus = 'ConTrong' | 'DaDat' | 'DangGiuCho' | 'HetHan';
export type DayStatus = 'CoLich' | 'KhongCoLich' | 'ChiNhanhNghi' | 'NghiPhep';

/**
 * Trạng thái hiển thị của một ô, suy ra khi đọc (booking Q3: booking không ghi `HetHan`).
 * Quá giờ được xét TRƯỚC nên ô `DaDat` đã qua giờ vẫn là `HetHan` (AV-14).
 * `DangGiuCho` hết hạn hoặc thiếu `giu_cho_den` coi như trống, vì sweeper có thể chưa kịp dọn.
 */
export function deriveSlotStatus(input: {
  ngayGio: Date;
  trangThai: StoredSlotStatus;
  giuChoDen: Date | null;
  now: Date;
}): StoredSlotStatus {
  const { ngayGio, trangThai, giuChoDen, now } = input;
  if (ngayGio.getTime() <= now.getTime() || trangThai === 'HetHan')
    return 'HetHan';
  if (trangThai === 'DaDat') return 'DaDat';
  if (trangThai === 'DangGiuCho')
    return giuChoDen !== null && giuChoDen.getTime() > now.getTime()
      ? 'DangGiuCho'
      : 'ConTrong';
  return 'ConTrong';
}

/**
 * Trạng thái cả ngày của một bác sĩ.
 * - Có ca, còn ít nhất một ca không bị nghỉ phép phủ ⇒ `CoLich`; mọi ca đều bị phủ ⇒ `NghiPhep`.
 * - Không có ca: chi nhánh HIỆN TẠI của bác sĩ nghỉ hoặc chưa khai báo thứ đó ⇒ `ChiNhanhNghi`, còn lại `KhongCoLich`.
 */
export function deriveDayStatus(input: {
  soCa: number;
  soCaBiNghiPhep: number;
  chiNhanhHienTaiNhanKham: boolean;
}): DayStatus {
  if (input.soCa > 0)
    return input.soCaBiNghiPhep >= input.soCa ? 'NghiPhep' : 'CoLich';
  return input.chiNhanhHienTaiNhanKham ? 'KhongCoLich' : 'ChiNhanhNghi';
}
