import type { BranchScheduleDto } from '../branch.dto.js';
import type { BranchScheduleView, BranchView } from '../branch.repository.js';

// So form sửa chi nhánh với dữ liệu hiện tại (admin B8; PLAN admin 5.4). HÀM THUẦN, không đọc DB.
// Form luôn đầy đủ (như Figma) nên server tự tìm phần thật sự đổi: thông tin chung, các thứ đổi, dịch vụ thêm và bỏ.

/** Một dòng lịch của một thứ, đúng 6 cột của `chi_nhanh_lich_hoat_dong`; giờ dạng 'HH:mm:ss', khoảng không có thì `null`. */
export interface ScheduleRowValue {
  thuTrongTuan: number;
  /** `null` chỉ khi chi nhánh cũ chưa khai báo thứ này (không có dòng) */
  hoatDong: boolean | null;
  gioBatDauSang: string | null;
  gioKetThucSang: string | null;
  gioBatDauChieu: string | null;
  gioKetThucChieu: string | null;
}

export type InfoField = 'ten' | 'diaChi' | 'toaDo';

export interface BranchFormValue {
  ten: string;
  diaChi: string;
  toaDoLat?: string;
  toaDoLng?: string;
  lichHoatDong: readonly BranchScheduleDto[];
  /** Đã bỏ trùng */
  dichVuKhamIds: readonly string[];
}

export interface BranchDiff {
  /** Trường thông tin chung đổi; áp dụng ngay (Q2) */
  infoFields: InfoField[];
  /** Các thứ đổi: dòng hiện tại và dòng mới, sắp theo thứ */
  changedDays: { before: ScheduleRowValue; after: ScheduleRowValue }[];
  addedServiceIds: string[];
  removedServiceIds: string[];
  /** Danh sách dịch vụ hiện tại và mới (đầy đủ, sắp theo id) để ghi `dich_vu_kham_ids` của yêu cầu */
  currentServiceIds: string[];
  newServiceIds: string[];
}

// Form gửi giờ 'HH:mm' (validator); DB trả 'HH:mm:ss'. Đưa về cùng dạng 'HH:mm:ss' trước khi so.
const toSeconds = (time: string | undefined): string | null =>
  time === undefined ? null : time.length === 5 ? `${time}:00` : time;

export function scheduleRowFromForm(row: BranchScheduleDto): ScheduleRowValue {
  return {
    thuTrongTuan: Number(row.thuTrongTuan),
    hoatDong: row.hoatDong === true,
    gioBatDauSang: toSeconds(row.sang?.batDau),
    gioKetThucSang: toSeconds(row.sang?.ketThuc),
    gioBatDauChieu: toSeconds(row.chieu?.batDau),
    gioKetThucChieu: toSeconds(row.chieu?.ketThuc),
  };
}

export function scheduleRowFromView(row: BranchScheduleView): ScheduleRowValue {
  return {
    thuTrongTuan: row.thuTrongTuan,
    hoatDong: row.hoatDong,
    gioBatDauSang: row.sang?.batDau ?? null,
    gioKetThucSang: row.sang?.ketThuc ?? null,
    gioBatDauChieu: row.chieu?.batDau ?? null,
    gioKetThucChieu: row.chieu?.ketThuc ?? null,
  };
}

const sameRow = (a: ScheduleRowValue, b: ScheduleRowValue): boolean =>
  a.hoatDong === b.hoatDong &&
  a.gioBatDauSang === b.gioBatDauSang &&
  a.gioKetThucSang === b.gioKetThucSang &&
  a.gioBatDauChieu === b.gioBatDauChieu &&
  a.gioKetThucChieu === b.gioKetThucChieu;

// Toạ độ so theo GIÁ TRỊ: '10.1' và '10.1000000' (DB lưu decimal(10,7)) là cùng một điểm
const sameCoordinate = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : Number(a) === Number(b);

const byId = (a: string, b: string): number =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

export function diffBranch(
  current: BranchView,
  form: BranchFormValue,
): BranchDiff {
  const infoFields: InfoField[] = [];
  if (current.ten !== form.ten) infoFields.push('ten');
  if (current.diaChi !== form.diaChi) infoFields.push('diaChi');
  if (
    !sameCoordinate(current.toaDoLat, form.toaDoLat ?? null) ||
    !sameCoordinate(current.toaDoLng, form.toaDoLng ?? null)
  )
    infoFields.push('toaDo');

  const currentByDay = new Map(
    current.lichHoatDong.map((row) => [
      row.thuTrongTuan,
      scheduleRowFromView(row),
    ]),
  );
  const changedDays = form.lichHoatDong
    .map(scheduleRowFromForm)
    .sort((a, b) => a.thuTrongTuan - b.thuTrongTuan)
    .flatMap((after) => {
      const before = currentByDay.get(after.thuTrongTuan) ?? {
        thuTrongTuan: after.thuTrongTuan,
        hoatDong: null,
        gioBatDauSang: null,
        gioKetThucSang: null,
        gioBatDauChieu: null,
        gioKetThucChieu: null,
      };
      return sameRow(before, after) ? [] : [{ before, after }];
    });

  const currentServiceIds = current.dichVuKham
    .map((s) => s.dichVuKhamId)
    .sort(byId);
  const newServiceIds = [...new Set(form.dichVuKhamIds)].sort(byId);
  const currentSet = new Set(currentServiceIds);
  const newSet = new Set(newServiceIds);
  return {
    infoFields,
    changedDays,
    addedServiceIds: newServiceIds.filter((id) => !currentSet.has(id)),
    removedServiceIds: currentServiceIds.filter((id) => !newSet.has(id)),
    currentServiceIds,
    newServiceIds,
  };
}

/** Có thay đổi lịch hoặc dịch vụ (phần có thể ảnh hưởng lịch hẹn và bị Q3 chặn khi có yêu cầu đang mở). */
export function touchesSchedule(diff: BranchDiff): boolean {
  return (
    diff.changedDays.length > 0 ||
    diff.addedServiceIds.length > 0 ||
    diff.removedServiceIds.length > 0
  );
}

export function isEmptyDiff(diff: BranchDiff): boolean {
  return diff.infoFields.length === 0 && !touchesSchedule(diff);
}

/** Một dòng lịch dạng JSON của yêu cầu (quy tắc 43): đủ 6 khóa snake_case, khoảng không có ghi `null` tường minh. */
export function toRequestRow(row: ScheduleRowValue) {
  return {
    thu_trong_tuan: row.thuTrongTuan,
    hoat_dong: row.hoatDong,
    gio_bat_dau_sang: row.gioBatDauSang,
    gio_ket_thuc_sang: row.gioKetThucSang,
    gio_bat_dau_chieu: row.gioBatDauChieu,
    gio_ket_thuc_chieu: row.gioKetThucChieu,
  };
}
