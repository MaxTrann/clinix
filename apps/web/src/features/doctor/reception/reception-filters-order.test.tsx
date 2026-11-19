import { render, screen, within } from '@testing-library/react';
import type { ReceptionDoctor } from '../api/reception-api';
import {
  ALL,
  ReceptionToolbar,
  type ReceptionFilters,
} from './reception-filters';
import { RECEPTION_STATUS_ORDER } from './reception-labels';

// UX1-63 đến UX1-70 (doctor UX1, G12): các bộ lọc có danh sách lấy từ API (chi nhánh, chuyên khoa, bác sĩ) sắp theo bảng chữ cái tiếng Việt, số tự nhiên,
// "Tất cả" ở đầu; các lựa chọn CỐ ĐỊNH có thứ tự nghiệp vụ (ca Sáng trước Chiều, trạng thái) giữ nguyên.

const FILTERS: ReceptionFilters = {
  chiNhanhId: ALL,
  chuyenKhoaId: ALL,
  bacSiId: ALL,
  ca: ALL,
  status: ALL,
};

function doctor(
  bacSiId: string,
  hoTen: string,
  chiNhanh: string,
  chuyenKhoa: string,
): ReceptionDoctor {
  return {
    bacSiId,
    hoTen,
    ngungHoatDong: false,
    chiNhanh: { chiNhanhId: `cn-${chiNhanh}`, ten: chiNhanh },
    chuyenKhoa: { chuyenKhoaId: `ck-${chuyenKhoa}`, ten: chuyenKhoa },
  };
}

// Thứ tự dữ liệu API trả về: CLINIX Mẫu 1, 4, 3, 2 (ảnh góp ý ngày 19/11/2026)
const DOCTORS = [
  doctor('1', 'Trần Thị Bình', 'CLINIX Mẫu 1', 'Tim mạch'),
  doctor('2', 'Ân Văn Nam', 'CLINIX Mẫu 4', 'Răng hàm mặt'),
  doctor('3', 'Đỗ Quang Huy', 'CLINIX Mẫu 3', 'Da liễu'),
  doctor('4', 'Anh Thư Lê', 'CLINIX Mẫu 2', 'Nhi khoa'),
  doctor('5', 'Ăn Minh Khoa', 'CLINIX Mẫu 10', 'Ăn uống'),
];
const BRANCHES = [
  { chiNhanhId: 'cn-1', ten: 'CLINIX Mẫu 1' },
  { chiNhanhId: 'cn-4', ten: 'CLINIX Mẫu 4' },
  { chiNhanhId: 'cn-3', ten: 'CLINIX Mẫu 3' },
  { chiNhanhId: 'cn-2', ten: 'CLINIX Mẫu 2' },
  { chiNhanhId: 'cn-10', ten: 'CLINIX Mẫu 10' },
];

function renderToolbar(
  doctors: readonly ReceptionDoctor[] = DOCTORS,
  filters: ReceptionFilters = FILTERS,
) {
  return render(
    <ReceptionToolbar
      filters={filters}
      onChange={() => undefined}
      doctors={doctors}
      branches={BRANCHES}
      weekLabel="16/11 – 22/11/2026"
      onPreviousWeek={() => undefined}
      onNextWeek={() => undefined}
      onToday={() => undefined}
    />,
  );
}

const optionsOf = (label: string) =>
  within(screen.getByLabelText(label))
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('bộ lọc Lễ tân: sắp xếp lựa chọn từ API (G12)', () => {
  it('UX1-63 chi nhánh "Mẫu 1, 4, 3, 2, 10" ⇒ 1, 2, 3, 4, 10 (số tự nhiên: 10 sau 4, không đứng sau 1); "Tất cả chi nhánh" ở ĐẦU', () => {
    renderToolbar();

    expect(optionsOf('Lọc theo chi nhánh')).toEqual([
      'Tất cả chi nhánh',
      'CLINIX Mẫu 1',
      'CLINIX Mẫu 2',
      'CLINIX Mẫu 3',
      'CLINIX Mẫu 4',
      'CLINIX Mẫu 10',
    ]);
  });

  it('UX1-64 chuyên khoa theo bảng chữ cái tiếng Việt (Ă đứng sau A, trước Da); "Tất cả chuyên khoa" ở đầu', () => {
    renderToolbar();

    expect(optionsOf('Lọc theo chuyên khoa')).toEqual([
      'Tất cả chuyên khoa',
      'Ăn uống',
      'Da liễu',
      'Nhi khoa',
      'Răng hàm mặt',
      'Tim mạch',
    ]);
  });

  it('UX1-65 bác sĩ theo họ tên (Anh, Ăn, Ân, Đỗ, Trần); "Tất cả bác sĩ" ở đầu; giá trị (id) vẫn khớp đúng bác sĩ', () => {
    renderToolbar();

    expect(optionsOf('Lọc theo bác sĩ')).toEqual([
      'Tất cả bác sĩ',
      'Anh Thư Lê',
      'Ăn Minh Khoa',
      'Ân Văn Nam',
      'Đỗ Quang Huy',
      'Trần Thị Bình',
    ]);
    const byName = within(screen.getByLabelText('Lọc theo bác sĩ')).getByRole(
      'option',
      { name: 'Đỗ Quang Huy' },
    ) as HTMLOptionElement;
    expect(byName.value).toBe('3');
  });

  it('UX1-66 chọn chuyên khoa thì danh sách bác sĩ chỉ còn bác sĩ của chuyên khoa đó, vẫn đã sắp', () => {
    const many = [
      doctor('1', 'Vũ Thị Hoa', 'A', 'Tim mạch'),
      doctor('2', 'Lê Văn An', 'A', 'Tim mạch'),
      doctor('3', 'Nguyễn Văn Bình', 'A', 'Nhi khoa'),
      doctor('4', 'Đặng Minh Châu', 'A', 'Tim mạch'),
    ];
    renderToolbar(many, { ...FILTERS, chuyenKhoaId: 'ck-Tim mạch' });

    expect(optionsOf('Lọc theo bác sĩ')).toEqual([
      'Tất cả bác sĩ',
      'Đặng Minh Châu',
      'Lê Văn An',
      'Vũ Thị Hoa',
    ]);
  });

  it('UX1-67 ca CỐ ĐỊNH giữ thứ tự nghiệp vụ Sáng rồi Chiều (xếp theo chữ cái sẽ ra "Ca chiều" trước "Ca sáng")', () => {
    renderToolbar();

    expect(optionsOf('Lọc theo ca')).toEqual([
      'Tất cả ca',
      'Ca sáng',
      'Ca chiều',
    ]);
  });

  it('UX1-68 trạng thái CỐ ĐỊNH giữ đúng `RECEPTION_STATUS_ORDER`, không sắp theo chữ cái', () => {
    renderToolbar();

    const labels = optionsOf('Lọc theo trạng thái');
    expect(labels[0]).toBe('Tất cả trạng thái');
    expect(labels).toHaveLength(1 + RECEPTION_STATUS_ORDER.length);
    expect(labels.slice(1)).not.toEqual([...labels.slice(1)].sort());
  });

  it('UX1-69 id bác sĩ lạ từ URL vẫn hiện ở CUỐI danh sách (lưới gọi API và nhận 403 như A2), không bị trộn vào giữa', () => {
    renderToolbar(DOCTORS, { ...FILTERS, bacSiId: '999' });

    const labels = optionsOf('Lọc theo bác sĩ');
    expect(labels[0]).toBe('Tất cả bác sĩ');
    expect(labels[labels.length - 1]).toBe('Bác sĩ #999');
  });

  it('UX1-70 không đổi mảng dữ liệu đưa vào (thứ tự API giữ nguyên cho nơi khác dùng)', () => {
    const before = DOCTORS.map((item) => item.bacSiId);
    renderToolbar();

    expect(DOCTORS.map((item) => item.bacSiId)).toEqual(before);
    expect(BRANCHES.map((item) => item.chiNhanhId)).toEqual([
      'cn-1',
      'cn-4',
      'cn-3',
      'cn-2',
      'cn-10',
    ]);
  });
});
