import { fireEvent, render, screen } from '@testing-library/react';
import type { ReceptionDoctorRow, ReceptionShift } from '../api/reception-api';
import { sharedRowHours } from '../schedule/week-grid-display';
import { ReceptionGrid, type ReceptionGridProps } from './reception-grid';

// doctor UX9: nhãn giờ của hàng Sáng/Chiều trong lưới tuần của Lễ tân và Admin tính THEO TỪNG bác sĩ bằng `sharedRowHours` của UX8. Giờ chỉ ghi ở nhãn khi mọi ca có giờ
// hợp lệ của bác sĩ đó trong hàng trùng nhau (ô không ghi giờ); lệch thì nhãn chỉ ghi chữ ca và MỌI ô có ca ghi giờ riêng của nó. Hàng không có ca của bác sĩ chỉ ghi chữ
// ca (không mượn giờ của bác sĩ khác). Tên truy cập thêm giờ vào CUỐI khi ô hiện giờ. DUX9-01, 10 đến 22 [đề xuất]; phủ WL-08 và WL-01 (quy tắc giờ dùng chung với UX8).
// Chỉ dữ liệu GIẢ. Tuần 12/10/2026 (T2) đến 18/10/2026 (CN); hôm nay = thứ Tư 14/10/2026.
const MON = '2026-10-12';
const TUE = '2026-10-13';
const WED = '2026-10-14';
const SAT = '2026-10-17';
const DAY_INDEX: Record<string, number> = {
  [MON]: 0,
  [TUE]: 1,
  [WED]: 2,
  [SAT]: 5,
};

const BRANCH_1 = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Mẫu 1' };
const BRANCH_2 = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Mẫu 2' };
const MORNING = { batDau: '08:00', ketThuc: '12:00' } as const;
const AFTERNOON = { ca: 'CaChieu', batDau: '13:30', ketThuc: '17:00' } as const;
const HOURS_MORNING = '08:00 – 12:00';
const HOURS_AFTERNOON = '13:30 – 17:00';

let counter = 0;
function shift(overrides: Partial<ReceptionShift>): ReceptionShift {
  counter += 1;
  return {
    lichLamViecId: String(counter),
    ngay: MON,
    ca: 'CaSang',
    ...MORNING,
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

function doctor(
  id: string,
  hoTen: string,
  ca: ReceptionShift[],
  chiNhanh = BRANCH_1,
): ReceptionDoctorRow {
  return {
    bacSiId: id,
    hoTen,
    ngungHoatDong: false,
    chiNhanh,
    chuyenKhoa: { chuyenKhoaId: '5', ten: 'Khoa Mẫu' },
    ca,
  };
}

const NAME_A = 'ThS.BS. Nguyễn Minh Anh';
const NAME_B = 'BS.CKII Trần Quốc Huy';
const NAME_C = 'BS. Lê Thị Mai';

function renderGrid(
  rows: ReceptionDoctorRow[],
  extra: Partial<ReceptionGridProps> = {},
) {
  return render(
    <ReceptionGrid
      weekStart={MON}
      today={WED}
      rows={rows}
      triggerRef={{ current: null }}
      onSelectShift={vi.fn()}
      onSelectDay={vi.fn()}
      {...extra}
    />,
  );
}

interface RowLabel {
  ca: string;
  hours: string | null;
}

// Nhãn của mọi hàng ca theo thứ tự tài liệu: [bác sĩ 1 Sáng, bác sĩ 1 Chiều, bác sĩ 2 Sáng, …]. Giờ là chữ NHÌN THẤY được (span rỗng tính là không có).
function rowLabels(container: HTMLElement): RowLabel[] {
  return [...container.querySelectorAll('th[scope="row"]')].map((th) => {
    const text = th.querySelector('span')?.textContent ?? '';
    return {
      ca: th.firstChild?.textContent ?? '',
      hours: text === '' ? null : text,
    };
  });
}

// Hàng ca (`tr`) của bác sĩ thứ `index`: mỗi bác sĩ một hàng tiêu đề khối rồi hàng Sáng và hàng Chiều.
function blockRows(container: HTMLElement, index: number) {
  const trs = container.querySelectorAll('tbody tr');
  return { morning: trs[index * 3 + 1], afternoon: trs[index * 3 + 2] };
}

function cellButton(tr: Element, day: string): HTMLButtonElement {
  const td = tr.querySelectorAll('td')[DAY_INDEX[day]];
  const button = td.querySelector('button');
  if (button === null) throw new Error(`Ô ${day} không có nút`);
  return button;
}

const HOURS_PATTERN = /\d{2}:\d{2} – \d{2}:\d{2}/;
const hoursOf = (button: Element) =>
  HOURS_PATTERN.exec(button.textContent ?? '')?.[0] ?? null;
const linesOf = (button: Element) =>
  [...button.children].map((child) => child.textContent);
const nameOf = (button: Element) => button.getAttribute('aria-label');

describe('sharedRowHours với ca kiểu Lễ tân (WL-08; cùng quy tắc DUX8-01 đến 09)', () => {
  it('DUX9-01 đồng giờ ra giờ chung; lệch một đầu thì null; giờ null bị bỏ qua; hàng trống thì null; một ca thì giờ của nó; hai chi nhánh khác giờ thì null', () => {
    const same = [shift({ ngay: MON }), shift({ ngay: TUE })];
    expect(sharedRowHours(same, 'CaSang')).toBe(HOURS_MORNING);
    expect(
      sharedRowHours(
        [...same, shift({ ngay: SAT, ketThuc: '11:30' })],
        'CaSang',
      ),
    ).toBeNull();
    expect(
      sharedRowHours(
        [...same, shift({ ngay: SAT, batDau: '08:30' })],
        'CaSang',
      ),
    ).toBeNull();
    const orphans = [
      shift({ ngay: SAT, batDau: null, ketThuc: null }),
      shift({ ngay: WED, batDau: null }),
    ];
    expect(sharedRowHours([...same, ...orphans], 'CaSang')).toBe(HOURS_MORNING);
    expect(sharedRowHours(orphans, 'CaSang')).toBeNull();
    expect(sharedRowHours([], 'CaSang')).toBeNull();
    expect(sharedRowHours(same, 'CaChieu')).toBeNull();
    expect(sharedRowHours([shift({ ...AFTERNOON })], 'CaChieu')).toBe(
      HOURS_AFTERNOON,
    );
    const twoBranches = [
      shift({ ngay: MON, chiNhanh: BRANCH_1 }),
      shift({
        ngay: TUE,
        chiNhanh: BRANCH_2,
        batDau: '07:30',
        ketThuc: '11:30',
      }),
    ];
    expect(sharedRowHours(twoBranches, 'CaSang')).toBeNull();
  });
});

describe('nhãn giờ hàng của lưới Lễ tân và Admin (doctor UX9)', () => {
  it('DUX9-10 tuần đồng giờ: giờ ở nhãn, mọi ô KHÔNG ghi giờ, tên truy cập y như cũ', () => {
    const { container } = renderGrid([
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({ ngay: TUE }),
        shift({ ngay: WED }),
        shift({ ngay: MON, ...AFTERNOON }),
        shift({ ngay: TUE, ...AFTERNOON }),
      ]),
    ]);
    expect(rowLabels(container)).toEqual([
      { ca: 'Sáng', hours: HOURS_MORNING },
      { ca: 'Chiều', hours: HOURS_AFTERNOON },
    ]);
    const { morning, afternoon } = blockRows(container, 0);
    for (const [tr, days] of [
      [morning, [MON, TUE, WED]],
      [afternoon, [MON, TUE]],
    ] as const) {
      for (const day of days) {
        const button = cellButton(tr, day);
        expect(button.textContent).toBe('Làm việc');
        expect(hoursOf(button)).toBeNull();
      }
    }
    expect(nameOf(cellButton(morning, MON))).toBe(
      `${NAME_A}, Ca sáng, Thứ 2, 12/10/2026, Làm việc`,
    );
    expect(nameOf(cellButton(afternoon, TUE))).toBe(
      `${NAME_A}, Ca chiều, Thứ 3, 13/10/2026, Làm việc`,
    );
  });

  it('DUX9-11 hàng Sáng lệch giờ (T7 kết thúc 11:30): nhãn Sáng chỉ chữ, MỌI ô Sáng ghi giờ riêng; hàng Chiều đồng giờ vẫn giờ ở nhãn', () => {
    const { container } = renderGrid([
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({ ngay: TUE }),
        shift({ ngay: SAT, ketThuc: '11:30' }),
        shift({ ngay: MON, ...AFTERNOON }),
        shift({ ngay: TUE, ...AFTERNOON }),
      ]),
    ]);
    expect(rowLabels(container)).toEqual([
      { ca: 'Sáng', hours: null },
      { ca: 'Chiều', hours: HOURS_AFTERNOON },
    ]);
    // Nhãn Sáng không có chữ số nào: không bao giờ ghi một giờ sai
    expect(container.querySelectorAll('th[scope="row"]')[0].textContent).toBe(
      'Sáng',
    );
    const { morning, afternoon } = blockRows(container, 0);
    expect(hoursOf(cellButton(morning, MON))).toBe('08:00 – 12:00');
    expect(hoursOf(cellButton(morning, TUE))).toBe('08:00 – 12:00');
    expect(hoursOf(cellButton(morning, SAT))).toBe('08:00 – 11:30');
    expect(hoursOf(cellButton(afternoon, MON))).toBeNull();
    expect(hoursOf(cellButton(afternoon, TUE))).toBeNull();
  });

  it('DUX9-12 hai hàng độc lập: hàng Sáng đồng giờ không bị hàng Chiều lệch làm lẫn', () => {
    const { container } = renderGrid([
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({ ngay: TUE }),
        shift({ ngay: MON, ...AFTERNOON }),
        shift({ ngay: TUE, ...AFTERNOON, batDau: '13:00' }),
      ]),
    ]);
    expect(rowLabels(container)).toEqual([
      { ca: 'Sáng', hours: HOURS_MORNING },
      { ca: 'Chiều', hours: null },
    ]);
    const { morning, afternoon } = blockRows(container, 0);
    expect(hoursOf(cellButton(morning, MON))).toBeNull();
    expect(hoursOf(cellButton(morning, TUE))).toBeNull();
    expect(hoursOf(cellButton(afternoon, MON))).toBe(HOURS_AFTERNOON);
    expect(hoursOf(cellButton(afternoon, TUE))).toBe('13:00 – 17:00');
  });

  it('DUX9-13 hai bác sĩ khác giờ trong cùng tuần: nhãn mỗi bác sĩ là giờ của CHÍNH họ; đảo thứ tự bác sĩ không đổi nhãn nào', () => {
    const doctorA = doctor('11', NAME_A, [shift({ ngay: MON })], BRANCH_1);
    const doctorB = doctor(
      '12',
      NAME_B,
      [shift({ ngay: MON, batDau: '07:30', ketThuc: '11:30' })],
      BRANCH_2,
    );
    const first = renderGrid([doctorA, doctorB]);
    expect(rowLabels(first.container)).toEqual([
      { ca: 'Sáng', hours: '08:00 – 12:00' },
      { ca: 'Chiều', hours: null },
      { ca: 'Sáng', hours: '07:30 – 11:30' },
      { ca: 'Chiều', hours: null },
    ]);
    first.unmount();
    const reversed = renderGrid([doctorB, doctorA]);
    expect(rowLabels(reversed.container)).toEqual([
      { ca: 'Sáng', hours: '07:30 – 11:30' },
      { ca: 'Chiều', hours: null },
      { ca: 'Sáng', hours: '08:00 – 12:00' },
      { ca: 'Chiều', hours: null },
    ]);
  });

  it('DUX9-14 hàng không có ca của bác sĩ chỉ ghi chữ ca, không mượn giờ của bác sĩ khác (dù bác sĩ khác đồng giờ); đảo thứ tự không đổi', () => {
    const doctorA = doctor('11', NAME_A, [
      shift({ ngay: MON }),
      shift({ ngay: TUE }),
      shift({ ngay: MON, ...AFTERNOON }),
    ]);
    const doctorB = doctor('12', NAME_B, [shift({ ngay: MON })]);
    const first = renderGrid([doctorA, doctorB]);
    // BS-B không có ca Chiều: nhãn Chiều của BS-B không mượn giờ Chiều của BS-A
    expect(rowLabels(first.container)).toEqual([
      { ca: 'Sáng', hours: HOURS_MORNING },
      { ca: 'Chiều', hours: HOURS_AFTERNOON },
      { ca: 'Sáng', hours: HOURS_MORNING },
      { ca: 'Chiều', hours: null },
    ]);
    first.unmount();
    const reversed = renderGrid([doctorB, doctorA]);
    expect(rowLabels(reversed.container)).toEqual([
      { ca: 'Sáng', hours: HOURS_MORNING },
      { ca: 'Chiều', hours: null },
      { ca: 'Sáng', hours: HOURS_MORNING },
      { ca: 'Chiều', hours: HOURS_AFTERNOON },
    ]);
  });

  it('DUX9-15 bác sĩ không có ca nào: hai nhãn chỉ chữ ca và không ô nào có chữ', () => {
    const { container } = renderGrid([
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({ ngay: MON, ...AFTERNOON }),
      ]),
      doctor('13', NAME_C, []),
    ]);
    expect(rowLabels(container).slice(2)).toEqual([
      { ca: 'Sáng', hours: null },
      { ca: 'Chiều', hours: null },
    ]);
    const { morning, afternoon } = blockRows(container, 1);
    for (const tr of [morning, afternoon]) {
      for (const td of tr.querySelectorAll('td')) {
        expect(td.textContent).toBe('');
      }
    }
  });

  it('DUX9-16 một ca duy nhất trong hàng: giờ của nó ở nhãn, ô không ghi giờ', () => {
    const { container } = renderGrid([
      doctor('11', NAME_A, [shift({ ngay: WED, ...AFTERNOON })]),
    ]);
    expect(rowLabels(container)).toEqual([
      { ca: 'Sáng', hours: null },
      { ca: 'Chiều', hours: HOURS_AFTERNOON },
    ]);
    expect(
      hoursOf(cellButton(blockRows(container, 0).afternoon, WED)),
    ).toBeNull();
  });

  it('DUX9-17 ca "mồ côi" (giờ null): (a) chỉ có ca mồ côi thì nhãn và ô không giờ; (b) cộng ca đồng giờ thì nhãn có giờ, ô mồ côi không; (c) cộng hai ca lệch thì nhãn không giờ, hai ca ghi giờ, ô mồ côi không', () => {
    const orphan = (ngay: string) =>
      shift({ ngay, batDau: null, ketThuc: null, gioCaKhongCon: true });
    const a = renderGrid([doctor('11', NAME_A, [orphan(MON)])]);
    expect(rowLabels(a.container)[0]).toEqual({ ca: 'Sáng', hours: null });
    expect(cellButton(blockRows(a.container, 0).morning, MON).textContent).toBe(
      'Làm việc',
    );
    a.unmount();

    const b = renderGrid([
      doctor('11', NAME_A, [
        orphan(MON),
        shift({ ngay: TUE }),
        shift({ ngay: WED }),
        shift({ ngay: SAT, batDau: null }),
      ]),
    ]);
    expect(rowLabels(b.container)[0]).toEqual({
      ca: 'Sáng',
      hours: HOURS_MORNING,
    });
    const rowB = blockRows(b.container, 0).morning;
    for (const day of [MON, TUE, WED, SAT]) {
      expect(hoursOf(cellButton(rowB, day))).toBeNull();
    }
    b.unmount();

    const c = renderGrid([
      doctor('11', NAME_A, [
        orphan(MON),
        shift({ ngay: TUE }),
        shift({ ngay: WED, ketThuc: '11:30' }),
      ]),
    ]);
    expect(rowLabels(c.container)[0]).toEqual({ ca: 'Sáng', hours: null });
    const rowC = blockRows(c.container, 0).morning;
    expect(hoursOf(cellButton(rowC, MON))).toBeNull();
    expect(hoursOf(cellButton(rowC, TUE))).toBe('08:00 – 12:00');
    expect(hoursOf(cellButton(rowC, WED))).toBe('08:00 – 11:30');
  });

  it('DUX9-18 nhãn trạng thái giữ: dòng 1 là "Làm việc", "Nghỉ phép" hay "Chờ duyệt"; dòng 2 là giờ chỉ ở hàng lệch giờ', () => {
    const { container } = renderGrid([
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({
          ngay: TUE,
          nghiPhep: 'DaDuyet',
          batDau: '07:30',
          ketThuc: '11:30',
        }),
        shift({ ngay: WED, nghiPhep: 'ChoDuyet' }),
        shift({ ngay: MON, ...AFTERNOON }),
        shift({ ngay: TUE, ...AFTERNOON, nghiPhep: 'DaDuyet' }),
        shift({ ngay: WED, ...AFTERNOON, nghiPhep: 'ChoDuyet' }),
      ]),
    ]);
    const { morning, afternoon } = blockRows(container, 0);
    expect(linesOf(cellButton(morning, MON))).toEqual([
      'Làm việc',
      '08:00 – 12:00',
    ]);
    expect(linesOf(cellButton(morning, TUE))).toEqual([
      'Nghỉ phép',
      '07:30 – 11:30',
    ]);
    expect(linesOf(cellButton(morning, WED))).toEqual([
      'Chờ duyệt',
      '08:00 – 12:00',
    ]);
    expect(linesOf(cellButton(afternoon, MON))).toEqual(['Làm việc']);
    expect(linesOf(cellButton(afternoon, TUE))).toEqual(['Nghỉ phép']);
    expect(linesOf(cellButton(afternoon, WED))).toEqual(['Chờ duyệt']);
  });

  it('DUX9-19 tên truy cập: ô ghi giờ thì tên KẾT THÚC bằng đúng chữ giờ hiển thị; ô không ghi giờ thì nguyên văn cũ', () => {
    const { container } = renderGrid([
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({
          ngay: TUE,
          nghiPhep: 'DaDuyet',
          batDau: '07:30',
          ketThuc: '11:30',
        }),
        shift({ ngay: SAT, ketThuc: '11:30' }),
        shift({ ngay: MON, ...AFTERNOON }),
      ]),
    ]);
    const { morning, afternoon } = blockRows(container, 0);
    expect(nameOf(cellButton(morning, MON))).toBe(
      `${NAME_A}, Ca sáng, Thứ 2, 12/10/2026, Làm việc, 08:00 – 12:00`,
    );
    expect(nameOf(cellButton(morning, TUE))).toBe(
      `${NAME_A}, Ca sáng, Thứ 3, 13/10/2026, Nghỉ phép, 07:30 – 11:30`,
    );
    expect(nameOf(cellButton(morning, SAT))).toBe(
      `${NAME_A}, Ca sáng, Thứ 7, 17/10/2026, Làm việc, 08:00 – 11:30`,
    );
    // Chữ nhìn thấy nằm trong tên (WCAG 2.5.3) và là phần CUỐI của tên
    for (const day of [MON, TUE, SAT]) {
      const button = cellButton(morning, day);
      const visible = hoursOf(button);
      expect(visible).not.toBeNull();
      expect(nameOf(button)?.endsWith(`, ${visible}`)).toBe(true);
    }
    // Hàng Chiều đồng giờ: ô không ghi giờ nên tên không có giờ
    expect(nameOf(cellButton(afternoon, MON))).toBe(
      `${NAME_A}, Ca chiều, Thứ 2, 12/10/2026, Làm việc`,
    );
  });

  it('DUX9-20 Admin: ô trống vẫn có nút "+" (kể cả ở hàng nhãn không giờ) và gọi onAssignCell đúng đối số; không truyền thì ô trống không có nút', () => {
    const rows = [
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({ ngay: TUE, ketThuc: '11:30' }),
      ]),
    ];
    const onAssignCell = vi.fn();
    const { container, unmount } = renderGrid(rows, { onAssignCell });
    // 7 ngày × 2 hàng − 2 ca = 12 ô trống; hàng Sáng lệch giờ (nhãn không giờ) vẫn có "+"
    expect(container.querySelectorAll('td button')).toHaveLength(14);
    const plus = screen.getByRole('button', {
      name: `Phân công ca: ${NAME_A}, Ca sáng, Thứ 4, 14/10/2026`,
    });
    expect(plus).toHaveTextContent('+');
    fireEvent.click(plus);
    expect(onAssignCell).toHaveBeenCalledTimes(1);
    expect(onAssignCell).toHaveBeenCalledWith(
      { bacSiId: '11', ngay: WED, ca: 'CaSang' },
      plus,
    );
    expect(rowLabels(container)[0].hours).toBeNull();
    unmount();

    const readOnly = renderGrid(rows);
    expect(
      screen.queryAllByRole('button', { name: /^Phân công ca:/ }),
    ).toHaveLength(0);
    // Lễ tân: chỉ còn 2 nút ca (7 nút "Chi tiết ngày" nằm ở tiêu đề cột)
    expect(readOnly.container.querySelectorAll('td button')).toHaveLength(2);
  });

  it('DUX9-21 showBranch: tên chi nhánh của bác sĩ ở tiêu đề khối khi bật, không khi tắt; không phụ thuộc giờ nhãn', () => {
    const rows = [
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({ ngay: TUE, ketThuc: '11:30' }),
      ]),
    ];
    const on = renderGrid(rows, { showBranch: true });
    expect(screen.getByText(BRANCH_1.ten)).toBeInTheDocument();
    expect(rowLabels(on.container)[0].hours).toBeNull();
    on.unmount();
    renderGrid(rows);
    expect(screen.queryByText(BRANCH_1.ten)).toBeNull();
  });

  it('DUX9-22 bất biến quét mọi hàng: nhãn có giờ thì không ô nào ghi giờ; nhãn không giờ thì số ô ghi giờ bằng số ca có giờ hợp lệ của hàng', () => {
    const rows = [
      doctor('11', NAME_A, [
        shift({ ngay: MON }),
        shift({ ngay: TUE }),
        shift({ ngay: MON, ...AFTERNOON }),
        shift({ ngay: TUE, ...AFTERNOON, ketThuc: '16:30' }),
        shift({ ngay: WED, ...AFTERNOON, batDau: null, ketThuc: null }),
      ]),
      doctor('12', NAME_B, [
        shift({ ngay: MON, batDau: '07:30', ketThuc: '11:30' }),
        shift({ ngay: SAT, batDau: '07:30', ketThuc: '11:00' }),
        shift({ ngay: SAT, ...AFTERNOON }),
      ]),
      doctor('13', NAME_C, []),
    ];
    const { container } = renderGrid(rows);
    const labels = rowLabels(container);
    rows.forEach((row, index) => {
      const { morning, afternoon } = blockRows(container, index);
      (
        [
          [morning, 'CaSang', labels[index * 2]],
          [afternoon, 'CaChieu', labels[index * 2 + 1]],
        ] as const
      ).forEach(([tr, ca, label]) => {
        const shown = [...tr.querySelectorAll('td button')].filter(
          (button) => hoursOf(button) !== null,
        ).length;
        const valid = row.ca.filter(
          (s) => s.ca === ca && s.batDau !== null && s.ketThuc !== null,
        );
        // Bộ kiểm ĐỘC LẬP với `sharedRowHours`: nhãn có giờ khi và chỉ khi có đúng MỘT giờ riêng biệt trong hàng
        const distinct = new Set(
          valid.map((s) => `${s.batDau} – ${s.ketThuc}`),
        );
        expect(label.hours).toBe(distinct.size === 1 ? [...distinct][0] : null);
        expect(shown).toBe(label.hours === null ? valid.length : 0);
      });
    });
  });
});
