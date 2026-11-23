import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DoctorShift } from '../api/schedule-api';
import { WeekGrid } from './week-grid';

// doctor UX8: ô lịch tuần gọn hơn. Giờ chuẩn ghi ở NHÃN HÀNG khi mọi ca có giờ trong hàng trùng giờ (ô không ghi giờ); tuần lệch giờ thì nhãn chỉ ghi "Sáng"/"Chiều"
// và MỌI ô ghi giờ riêng. Tên chi nhánh chỉ ở ô khi `chiNhanhLoc` có từ 2 chi nhánh. DUX8-20 đến 28 [đề xuất]; phủ WL-01, WL-10. Tên truy cập thêm VÀO CUỐI phần
// đang hiện ở ô (giờ rồi chi nhánh); ô không ghi gì thêm thì tên y như cũ. Ca "mồ côi" (giờ null) bị bỏ qua khi xét đồng giờ (hành vi có sẵn từ trước UX8).
const BRANCH_A = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Mẫu 1' };
const BRANCH_B = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Mẫu 2' };

let counter = 0;
function shift(overrides: Partial<DoctorShift>): DoctorShift {
  counter += 1;
  return {
    lichLamViecId: String(counter),
    ngay: '2026-10-12',
    ca: 'CaSang',
    chiNhanh: BRANCH_A,
    batDau: '08:00',
    ketThuc: '12:00',
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

function gridElement(
  shifts: DoctorShift[],
  branches: { chiNhanhId: string }[],
  onSelect = vi.fn(),
) {
  return (
    <WeekGrid
      weekStart="2026-10-12"
      today="2026-10-14"
      shifts={shifts}
      branches={branches}
      triggerRef={{ current: null }}
      onSelect={onSelect}
    />
  );
}

function renderGrid(
  shifts: DoctorShift[],
  branches: { chiNhanhId: string }[] = [BRANCH_A],
  onSelect = vi.fn(),
) {
  const view = render(gridElement(shifts, branches, onSelect));
  return { onSelect, ...view };
}

const HOURS = /\d{2}:\d{2}/;
const cellOf = (name: RegExp) => screen.getByRole('button', { name });
const allCells = () => screen.getAllByRole('button');
const rowHeader = (name: RegExp) => screen.getByRole('rowheader', { name });

// Ba ngày đầu tuần: T2 12/10, T3 13/10, T4 14/10
const MON = '2026-10-12';
const TUE = '2026-10-13';
const WED = '2026-10-14';

describe('Ô lịch tuần gọn: giờ ở nhãn hàng, chi nhánh khi cần (UX8)', () => {
  it('DUX8-20 WL-01 tuần đồng giờ, một chi nhánh: giờ ở nhãn hàng; ô không ghi giờ và không ghi chi nhánh, vẫn có trạng thái và "N chưa khám"', () => {
    renderGrid([
      shift({ ngay: MON, soLichHen: 2 }),
      shift({ ngay: TUE, soLichHen: 0 }),
      shift({
        ngay: MON,
        ca: 'CaChieu',
        batDau: '13:00',
        ketThuc: '17:00',
        soLichHen: 1,
      }),
    ]);
    expect(rowHeader(/^Sáng\s*08:00 – 12:00$/)).toBeVisible();
    expect(rowHeader(/^Chiều\s*13:00 – 17:00$/)).toBeVisible();
    const cells = allCells();
    expect(cells).toHaveLength(3);
    for (const cell of cells) {
      expect(cell.textContent).not.toMatch(HOURS);
      expect(cell.textContent).not.toMatch(/CLINIX/);
      expect(within(cell).getByText('Làm việc')).toBeVisible();
    }
    expect(within(cells[0]).getByText('2 chưa khám')).toBeVisible();
    expect(within(cells[1]).getByText('0 chưa khám')).toBeVisible();
    expect(within(cells[2]).getByText('1 chưa khám')).toBeVisible();
    // Ô không có ca không đổi: 14 ô, trừ 3 ô có ca
    expect(screen.getAllByText('Không có ca')).toHaveLength(11);
  });

  it('DUX8-21 WL-01 tuần lệch giờ ở hàng Sáng: nhãn Sáng chỉ chữ, MỌI ô Sáng ghi giờ riêng; hàng Chiều đồng giờ vẫn giờ ở nhãn, ô Chiều không giờ', () => {
    renderGrid([
      shift({ ngay: MON, batDau: '08:00', ketThuc: '12:00' }),
      shift({ ngay: TUE, batDau: '08:00', ketThuc: '11:30' }),
      shift({ ngay: MON, ca: 'CaChieu', batDau: '13:00', ketThuc: '17:00' }),
      shift({ ngay: TUE, ca: 'CaChieu', batDau: '13:00', ketThuc: '17:00' }),
    ]);
    const morning = rowHeader(/^Sáng$/);
    expect(morning.textContent).not.toMatch(HOURS);
    expect(rowHeader(/^Chiều\s*13:00 – 17:00$/)).toBeVisible();
    expect(
      within(cellOf(/^Ca sáng, Thứ 2/)).getByText('08:00 – 12:00'),
    ).toBeVisible();
    expect(
      within(cellOf(/^Ca sáng, Thứ 3/)).getByText('08:00 – 11:30'),
    ).toBeVisible();
    expect(cellOf(/^Ca chiều, Thứ 2/).textContent).not.toMatch(HOURS);
    expect(cellOf(/^Ca chiều, Thứ 3/).textContent).not.toMatch(HOURS);
  });

  it('DUX8-22 WL-01 một ca duy nhất trong hàng: giờ của nó ở nhãn, ô không ghi giờ', () => {
    renderGrid([shift({ ngay: WED, batDau: '08:30', ketThuc: '11:30' })]);
    expect(rowHeader(/^Sáng\s*08:30 – 11:30$/)).toBeVisible();
    expect(rowHeader(/^Chiều$/)).toBeVisible();
    expect(cellOf(/^Ca sáng, Thứ 4/).textContent).not.toMatch(HOURS);
  });

  it('DUX8-23 WL-01 hàng đồng giờ có một ca "mồ côi" (giờ null): nhãn vẫn ghi giờ chung, ô mồ côi không có giờ nào, ô còn lại không ghi giờ', () => {
    renderGrid([
      shift({ ngay: MON }),
      shift({ ngay: TUE }),
      shift({
        ngay: WED,
        batDau: null,
        ketThuc: null,
        gioCaKhongCon: true,
      }),
    ]);
    expect(rowHeader(/^Sáng\s*08:00 – 12:00$/)).toBeVisible();
    for (const name of [
      /^Ca sáng, Thứ 2/,
      /^Ca sáng, Thứ 3/,
      /^Ca sáng, Thứ 4/,
    ])
      expect(cellOf(name).textContent).not.toMatch(HOURS);
  });

  it('DUX8-24 WL-01 hai chi nhánh: mọi ô ghi đúng tên chi nhánh CỦA CHÍNH ca đó, kể cả khi mọi ca trong tuần cùng một chi nhánh', () => {
    const both = [BRANCH_A, BRANCH_B];
    const view = renderGrid(
      [
        shift({ ngay: MON, chiNhanh: BRANCH_A }),
        shift({ ngay: TUE, chiNhanh: BRANCH_B }),
      ],
      both,
    );
    const monday = cellOf(/^Ca sáng, Thứ 2/);
    const tuesday = cellOf(/^Ca sáng, Thứ 3/);
    expect(within(monday).getByText(BRANCH_A.ten)).toBeVisible();
    expect(monday.textContent).not.toContain(BRANCH_B.ten);
    expect(within(tuesday).getByText(BRANCH_B.ten)).toBeVisible();
    expect(tuesday.textContent).not.toContain(BRANCH_A.ten);

    // Tuần mà mọi ca cùng một chi nhánh nhưng bác sĩ vẫn có hai chi nhánh: vẫn ghi
    view.rerender(
      gridElement(
        [
          shift({ ngay: MON, chiNhanh: BRANCH_A }),
          shift({ ngay: TUE, chiNhanh: BRANCH_A }),
        ],
        both,
      ),
    );
    expect(
      within(cellOf(/^Ca sáng, Thứ 3/)).getByText(BRANCH_A.ten),
    ).toBeVisible();
  });

  it('DUX8-25 WL-01 một chi nhánh: ô nghỉ đã duyệt, chờ duyệt, bị từ chối cũng không ghi chi nhánh', () => {
    renderGrid([
      shift({ ngay: MON, nghiPhep: 'DaDuyet' }),
      shift({ ngay: TUE, nghiPhep: 'ChoDuyet' }),
      shift({ ngay: WED, nghiPhep: 'TuChoi' }),
    ]);
    expect(
      within(cellOf(/^Ca sáng, Thứ 2/)).getByText('Nghỉ đã duyệt'),
    ).toBeVisible();
    expect(
      within(cellOf(/^Ca sáng, Thứ 3/)).getByText('Chờ duyệt'),
    ).toBeVisible();
    expect(
      within(cellOf(/^Ca sáng, Thứ 4/)).getByText('Yêu cầu bị từ chối'),
    ).toBeVisible();
    for (const cell of allCells())
      expect(cell.textContent).not.toMatch(/CLINIX/);
  });

  // Bốn tổ hợp: đồng giờ hay lệch giờ, một hay hai chi nhánh. Ô T2 có `soLichHen` 3, ô T3 không có trường (API cũ).
  const COMBOS = [
    {
      label: 'đồng giờ, một chi nhánh',
      tuesdayEnd: '12:00',
      branches: [BRANCH_A],
      monday: 'Ca sáng, Thứ 2, 12/10/2026, Làm việc, 3 chưa khám',
      tuesday: 'Ca sáng, Thứ 3, 13/10/2026, Làm việc',
    },
    {
      label: 'lệch giờ, một chi nhánh',
      tuesdayEnd: '11:30',
      branches: [BRANCH_A],
      monday:
        'Ca sáng, Thứ 2, 12/10/2026, Làm việc, 3 chưa khám, 08:00 – 12:00',
      tuesday: 'Ca sáng, Thứ 3, 13/10/2026, Làm việc, 08:00 – 11:30',
    },
    {
      label: 'đồng giờ, hai chi nhánh',
      tuesdayEnd: '12:00',
      branches: [BRANCH_A, BRANCH_B],
      monday: `Ca sáng, Thứ 2, 12/10/2026, Làm việc, 3 chưa khám, ${BRANCH_A.ten}`,
      tuesday: `Ca sáng, Thứ 3, 13/10/2026, Làm việc, ${BRANCH_B.ten}`,
    },
    {
      label: 'lệch giờ, hai chi nhánh',
      tuesdayEnd: '11:30',
      branches: [BRANCH_A, BRANCH_B],
      monday: `Ca sáng, Thứ 2, 12/10/2026, Làm việc, 3 chưa khám, 08:00 – 12:00, ${BRANCH_A.ten}`,
      tuesday: `Ca sáng, Thứ 3, 13/10/2026, Làm việc, 08:00 – 11:30, ${BRANCH_B.ten}`,
    },
  ];

  it.each(COMBOS)(
    'DUX8-26 WL-01 tên truy cập ($label): phần đầu như cũ, thêm CUỐI chỉ phần đang hiện ở ô (giờ rồi chi nhánh)',
    ({ branches, tuesdayEnd, monday, tuesday }) => {
      renderGrid(
        [
          shift({ ngay: MON, chiNhanh: BRANCH_A, soLichHen: 3 }),
          shift({
            ngay: TUE,
            chiNhanh: branches.length > 1 ? BRANCH_B : BRANCH_A,
            ketThuc: tuesdayEnd,
          }),
        ],
        branches,
      );
      expect(screen.getByRole('button', { name: monday })).toBeVisible();
      expect(screen.getByRole('button', { name: tuesday })).toBeVisible();
    },
  );

  it.each(COMBOS)(
    'DUX8-27 WL-01 ($label) ô vẫn có nhãn trạng thái và "N chưa khám"; bấm ô gọi onSelect đúng ca',
    ({ branches, tuesdayEnd }) => {
      const monday = shift({ ngay: MON, soLichHen: 3 });
      const tuesday = shift({
        ngay: TUE,
        chiNhanh: branches.length > 1 ? BRANCH_B : BRANCH_A,
        ketThuc: tuesdayEnd,
        nghiPhep: 'ChoDuyet',
        soLichHen: 0,
      });
      const { onSelect } = renderGrid([monday, tuesday], branches);
      const mondayCell = cellOf(/^Ca sáng, Thứ 2/);
      const tuesdayCell = cellOf(/^Ca sáng, Thứ 3/);
      expect(within(mondayCell).getByText('Làm việc')).toBeVisible();
      expect(within(mondayCell).getByText('3 chưa khám')).toBeVisible();
      expect(within(tuesdayCell).getByText('Chờ duyệt')).toBeVisible();
      expect(within(tuesdayCell).getByText('0 chưa khám')).toBeVisible();
      fireEvent.click(tuesdayCell);
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(tuesday);
    },
  );

  it('DUX8-28 WL-01 hàng không có ca: nhãn chỉ có chữ ca, không phần tử con thừa; 14 ô "Không có ca"', () => {
    const view = renderGrid([], []);
    const morning = rowHeader(/^Sáng$/);
    const afternoon = rowHeader(/^Chiều$/);
    expect(morning.children).toHaveLength(0);
    expect(afternoon.children).toHaveLength(0);
    expect(screen.getAllByText('Không có ca')).toHaveLength(14);

    // Chỉ hàng Sáng có ca: hàng Chiều vẫn không có phần tử con
    view.rerender(gridElement([shift({ ngay: MON })], [BRANCH_A]));
    expect(rowHeader(/^Sáng\s*08:00 – 12:00$/).children).toHaveLength(1);
    expect(rowHeader(/^Chiều$/).children).toHaveLength(0);
  });
});
