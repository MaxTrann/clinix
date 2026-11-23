import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReceptionDoctor } from '../api/reception-api';
import {
  ALL,
  ReceptionToolbar,
  type ReceptionFilters,
} from './reception-filters';
import {
  RECEPTION_STATUS_LABELS,
  RECEPTION_STATUS_ORDER,
} from './reception-labels';

// DUX3-40 đến DUX3-43 (doctor UX3, G10; WL-08): mục mặc định của hai ô lọc "trạng thái" và "ca" của Lễ tân nói rõ ô lọc theo gì:
// "Trạng thái ca: Tất cả" và "Buổi: Tất cả" (chữ của file góp ý G10, Trung đã đồng ý; Đại chọn 23/11/2026). `aria-label` của hai ô giữ nguyên.
// Trang Admin "Lịch làm việc bác sĩ" dùng chung bộ lọc này nên đổi theo; ô lọc của lịch Bác sĩ KHÔNG đổi (G10 chỉ nêu Lễ tân).

const FILTERS: ReceptionFilters = {
  chiNhanhId: ALL,
  chuyenKhoaId: ALL,
  bacSiId: ALL,
  ca: ALL,
  status: ALL,
};

const DOCTORS: ReceptionDoctor[] = [
  {
    bacSiId: '1',
    hoTen: 'Trần Thị Bình',
    ngungHoatDong: false,
    chiNhanh: { chiNhanhId: 'cn-1', ten: 'CLINIX Mẫu 1' },
    chuyenKhoa: { chuyenKhoaId: 'ck-1', ten: 'Tim mạch' },
  },
];
const BRANCHES = [{ chiNhanhId: 'cn-1', ten: 'CLINIX Mẫu 1' }];

function renderToolbar(
  filters: ReceptionFilters = FILTERS,
  onChange: (filters: ReceptionFilters) => void = () => undefined,
) {
  return render(
    <ReceptionToolbar
      filters={filters}
      onChange={onChange}
      doctors={DOCTORS}
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

describe('DUX3-40 đến DUX3-43 nhãn ô lọc của Lễ tân (G10)', () => {
  it('DUX3-40 WL-08 mục đầu ô trạng thái là "Trạng thái ca: Tất cả", mục đầu ô ca là "Buổi: Tất cả"; `aria-label` giữ nguyên', () => {
    renderToolbar();

    expect(optionsOf('Lọc theo trạng thái')[0]).toBe('Trạng thái ca: Tất cả');
    expect(optionsOf('Lọc theo ca')[0]).toBe('Buổi: Tất cả');
    // Chữ cũ không còn ở hai ô này
    expect(screen.queryByText('Tất cả trạng thái')).toBeNull();
    expect(screen.queryByText('Tất cả ca')).toBeNull();
  });

  it('DUX3-41 WL-08 các mục còn lại và thứ tự nghiệp vụ giữ nguyên ("Làm việc", "Nghỉ phép", "Chờ duyệt"; "Ca sáng", "Ca chiều")', () => {
    renderToolbar();

    expect(optionsOf('Lọc theo trạng thái').slice(1)).toEqual(
      RECEPTION_STATUS_ORDER.map((status) => RECEPTION_STATUS_LABELS[status]),
    );
    expect(optionsOf('Lọc theo trạng thái').slice(1)).toEqual([
      'Làm việc',
      'Nghỉ phép',
      'Chờ duyệt',
    ]);
    expect(optionsOf('Lọc theo ca').slice(1)).toEqual(['Ca sáng', 'Ca chiều']);
  });

  it('DUX3-42 WL-08 ba ô còn lại giữ chữ cũ: "Tất cả chi nhánh", "Tất cả chuyên khoa", "Tất cả bác sĩ"', () => {
    renderToolbar();

    expect(optionsOf('Lọc theo chi nhánh')[0]).toBe('Tất cả chi nhánh');
    expect(optionsOf('Lọc theo chuyên khoa')[0]).toBe('Tất cả chuyên khoa');
    expect(optionsOf('Lọc theo bác sĩ')[0]).toBe('Tất cả bác sĩ');
  });

  it('DUX3-43 WL-08 mục đầu vẫn mang giá trị `all` ("Tất cả" không gửi bộ lọc): chọn lại nó trả đúng `all` cho trạng thái và ca', () => {
    const onChange = vi.fn<(filters: ReceptionFilters) => void>();
    renderToolbar({ ...FILTERS, status: 'DaDuyet', ca: 'CaChieu' }, onChange);

    expect(screen.getByLabelText('Lọc theo trạng thái')).toHaveValue('DaDuyet');
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: ALL },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: ALL, ca: 'CaChieu' }),
    );

    fireEvent.change(screen.getByLabelText('Lọc theo ca'), {
      target: { value: ALL },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ca: ALL, status: 'DaDuyet' }),
    );
  });
});
