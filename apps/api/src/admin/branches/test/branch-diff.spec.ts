import type { BranchView } from '../branch.repository.js';
import {
  diffBranch,
  isEmptyDiff,
  toRequestRow,
  touchesSchedule,
  type BranchFormValue,
} from '../impact/branch-diff.js';

// Admin B8 — CNB-02: so form sửa chi nhánh với dữ liệu hiện tại (hàm thuần, không DB).
const period = (batDau: string, ketThuc: string) => ({ batDau, ketThuc });

const current: BranchView = {
  chiNhanhId: '1',
  ten: 'Chi nhánh A',
  diaChi: '1 Lê Lợi',
  toaDoLat: '10.1000000',
  toaDoLng: '106.5000000',
  lichHoatDong: Array.from({ length: 7 }, (_, i) => ({
    thuTrongTuan: i + 1,
    hoatDong: true,
    sang: period('08:00:00', '12:00:00'),
    chieu: period('13:00:00', '17:00:00'),
  })),
  dichVuKham: [
    { dichVuKhamId: '2', ten: 'B' },
    { dichVuKhamId: '10', ten: 'A' },
  ],
  coYeuCauDangMo: false,
};

const sameForm = (): BranchFormValue => ({
  ten: 'Chi nhánh A',
  diaChi: '1 Lê Lợi',
  toaDoLat: '10.1',
  toaDoLng: '106.5',
  lichHoatDong: Array.from({ length: 7 }, (_, i) => ({
    thuTrongTuan: i + 1,
    hoatDong: true,
    sang: period('08:00', '12:00'),
    chieu: period('13:00', '17:00'),
  })),
  dichVuKhamIds: ['10', '2'],
});

describe('CNB-02 diffBranch', () => {
  it('form giống hệt (toạ độ khác chữ nhưng cùng giá trị, giờ HH:mm so với HH:mm:ss, dịch vụ khác thứ tự) ⇒ không đổi gì', () => {
    const diff = diffBranch(current, sameForm());
    expect(isEmptyDiff(diff)).toBe(true);
    expect(touchesSchedule(diff)).toBe(false);
  });

  it('thông tin chung: tên, địa chỉ, toạ độ là ba trường riêng; bỏ toạ độ cũng là đổi', () => {
    const diff = diffBranch(current, {
      ...sameForm(),
      ten: 'Chi nhánh B',
      toaDoLat: undefined,
      toaDoLng: undefined,
    });
    expect(diff.infoFields).toEqual(['ten', 'toaDo']);
    expect(touchesSchedule(diff)).toBe(false);
  });

  it('thứ đổi so CẢ dòng: chỉ thứ có khác biệt mới vào danh sách, kèm dòng cũ và mới', () => {
    const form = sameForm();
    form.lichHoatDong = form.lichHoatDong.map((row) =>
      row.thuTrongTuan === 3
        ? { thuTrongTuan: 3, hoatDong: true, sang: period('08:00', '11:00') }
        : row,
    );
    const diff = diffBranch(current, form);
    expect(diff.changedDays).toHaveLength(1);
    expect(diff.changedDays[0]?.after).toEqual({
      thuTrongTuan: 3,
      hoatDong: true,
      gioBatDauSang: '08:00:00',
      gioKetThucSang: '11:00:00',
      gioBatDauChieu: null,
      gioKetThucChieu: null,
    });
    expect(diff.changedDays[0]?.before.gioKetThucChieu).toBe('17:00:00');
  });

  it('dịch vụ: trùng id được gộp; thêm và bỏ tính đúng; danh sách đầy đủ sắp theo id số', () => {
    const diff = diffBranch(current, {
      ...sameForm(),
      dichVuKhamIds: ['10', '10', '3'],
    });
    expect(diff.addedServiceIds).toEqual(['3']);
    expect(diff.removedServiceIds).toEqual(['2']);
    expect(diff.currentServiceIds).toEqual(['2', '10']);
    expect(diff.newServiceIds).toEqual(['3', '10']);
    expect(touchesSchedule(diff)).toBe(true);
  });

  it('chi nhánh cũ chưa khai báo một thứ: dòng cũ có hoat_dong null nên luôn là thứ đổi', () => {
    const legacy = {
      ...current,
      lichHoatDong: current.lichHoatDong.slice(0, 6),
    };
    const diff = diffBranch(legacy, sameForm());
    expect(
      diff.changedDays.map((d) => [d.after.thuTrongTuan, d.before.hoatDong]),
    ).toEqual([[7, null]]);
  });

  it('toRequestRow: đủ 6 khóa snake_case, ngày nghỉ ghi null tường minh (quy tắc 43)', () => {
    const form = sameForm();
    form.lichHoatDong = form.lichHoatDong.map((row) =>
      row.thuTrongTuan === 7 ? { thuTrongTuan: 7, hoatDong: false } : row,
    );
    const row = diffBranch(current, form).changedDays[0]!.after;
    expect(toRequestRow(row)).toEqual({
      thu_trong_tuan: 7,
      hoat_dong: false,
      gio_bat_dau_sang: null,
      gio_ket_thuc_sang: null,
      gio_bat_dau_chieu: null,
      gio_ket_thuc_chieu: null,
    });
  });
});
