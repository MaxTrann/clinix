import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DoctorShift } from '../api/schedule-api';
import { WeekGrid } from './week-grid';

// doctor UX6 (G1b): ô lịch tuần hiện giờ ca và "N chưa khám" từ `soLichHen` CÓ SẴN của `GET /doctor/schedule` (booking B17; 0 lời gọi thêm). DUX6-35 đến
// DUX6-39 [đề xuất]; phủ WL-10 (nay: số lịch ở ô) và WL-13 [đề xuất]. `soLichHen` chỉ đếm lịch CHƯA khám xong (Chờ thanh toán, Đã xác nhận, Đã tiếp đón), nên
// nhãn là "chưa khám", không phải "lịch hẹn" (Đại chọn 23/11/2026).
const BRANCH = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
const fetchMock = vi.fn<typeof fetch>();

function shift(overrides: Partial<DoctorShift>): DoctorShift {
  return {
    lichLamViecId: '1',
    ngay: '2026-10-12',
    ca: 'CaSang',
    chiNhanh: BRANCH,
    batDau: '08:30',
    ketThuc: '11:30',
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

function renderGrid(shifts: DoctorShift[], onSelect = vi.fn()) {
  render(
    <WeekGrid
      weekStart="2026-10-12"
      today="2026-10-14"
      shifts={shifts}
      triggerRef={{ current: null }}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

const cellOf = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ô lịch tuần: giờ ca và số lịch chưa khám (G1b)', () => {
  it('DUX6-35 ô có "N chưa khám" từ `soLichHen`, KHÔNG gọi API nào thêm; bấm ô vẫn chọn đúng ca', () => {
    const onSelect = renderGrid([shift({ soLichHen: 2 })]);
    const cell = cellOf(/^Ca sáng, Thứ 2, 12\/10\/2026/);
    expect(within(cell).getByText('2 chưa khám')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ soLichHen: 2 }),
    );
  });

  it('DUX6-36 API cũ không có `soLichHen`: KHÔNG hiện số nào ("0 chưa khám" cũng không)', () => {
    renderGrid([shift({})]);
    const cell = cellOf(/^Ca sáng, Thứ 2, 12\/10\/2026/);
    expect(cell.textContent).not.toMatch(/chưa khám/);
    expect(cell.textContent).not.toMatch(/\d+ lịch/);
  });

  it('DUX6-37 `soLichHen = 0` hiện đúng "0 chưa khám" (ca đã khám xong hoặc chưa ai đặt)', () => {
    renderGrid([shift({ soLichHen: 0 })]);
    expect(
      within(cellOf(/^Ca sáng, Thứ 2/)).getByText('0 chưa khám'),
    ).toBeVisible();
  });

  it('DUX6-38 giờ ca hiện ở ô; giờ không còn hiệu lực (null) thì bỏ dòng giờ', () => {
    renderGrid([
      shift({ soLichHen: 1 }),
      shift({
        lichLamViecId: '2',
        ngay: '2026-10-13',
        batDau: null,
        ketThuc: null,
        gioCaKhongCon: true,
        soLichHen: 1,
      }),
    ]);
    expect(
      within(cellOf(/^Ca sáng, Thứ 2, 12\/10\/2026/)).getByText(
        '08:30 – 11:30',
      ),
    ).toBeVisible();
    const noHours = cellOf(/^Ca sáng, Thứ 3, 13\/10\/2026/);
    expect(noHours.textContent).not.toMatch(/\d{2}:\d{2}/);
  });

  it('DUX6-39 `aria-label` của nút ô có thêm số lịch chưa khám; không có trường thì giữ nguyên nhãn cũ', () => {
    renderGrid([
      shift({ soLichHen: 3 }),
      shift({ lichLamViecId: '2', ngay: '2026-10-13' }),
    ]);
    expect(
      screen.getByRole('button', {
        name: 'Ca sáng, Thứ 2, 12/10/2026, Làm việc, 3 chưa khám',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Ca sáng, Thứ 3, 13/10/2026, Làm việc',
      }),
    ).toBeVisible();
  });
});
