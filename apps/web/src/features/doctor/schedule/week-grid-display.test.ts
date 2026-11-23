import type { DoctorShift } from '../api/schedule-api';
import { hasManyBranches, sharedRowHours } from './week-grid-display';

// doctor UX8: hai hàm thuần quyết định (1) giờ ghi ở NHÃN HÀNG của lưới tuần và (2) ô có ghi tên chi nhánh hay không. DUX8-01 đến 12 [đề xuất]; phủ WL-01.
// Giờ chỉ ghi ở nhãn khi MỌI ca có giờ hợp lệ trong hàng trùng nhau: không bao giờ ghi một giờ sai.
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

describe('sharedRowHours: giờ ở nhãn hàng (WL-01)', () => {
  it('DUX8-01 mọi ca trong hàng cùng giờ thì ra giờ chung', () => {
    const shifts = [
      shift({ ngay: '2026-10-12' }),
      shift({ ngay: '2026-10-13' }),
      shift({ ngay: '2026-10-14' }),
    ];
    expect(sharedRowHours(shifts, 'CaSang')).toBe('08:00 – 12:00');
  });

  it('DUX8-02 hai ngày khác giờ (khác cả hai đầu) thì không có giờ chung', () => {
    const shifts = [
      shift({ ngay: '2026-10-12', batDau: '08:00', ketThuc: '12:00' }),
      shift({ ngay: '2026-10-13', batDau: '07:30', ketThuc: '11:30' }),
    ];
    expect(sharedRowHours(shifts, 'CaSang')).toBeNull();
  });

  it('DUX8-03 cùng giờ bắt đầu nhưng khác giờ kết thúc thì không có giờ chung (phải so cả hai đầu)', () => {
    const shifts = [
      shift({ ngay: '2026-10-12', batDau: '08:00', ketThuc: '12:00' }),
      shift({ ngay: '2026-10-13', batDau: '08:00', ketThuc: '11:30' }),
    ];
    expect(sharedRowHours(shifts, 'CaSang')).toBeNull();
  });

  it('DUX8-04 khác giờ bắt đầu nhưng cùng giờ kết thúc thì không có giờ chung', () => {
    const shifts = [
      shift({ ngay: '2026-10-12', batDau: '08:00', ketThuc: '12:00' }),
      shift({ ngay: '2026-10-13', batDau: '08:30', ketThuc: '12:00' }),
    ];
    expect(sharedRowHours(shifts, 'CaSang')).toBeNull();
  });

  it('DUX8-05 ca có giờ bắt đầu hoặc kết thúc là null bị bỏ qua; các ca còn lại cùng giờ thì vẫn ra giờ chung', () => {
    const orphans = [
      shift({ ngay: '2026-10-13', batDau: null, ketThuc: null }),
      shift({ ngay: '2026-10-14', batDau: null, ketThuc: '12:00' }),
      shift({ ngay: '2026-10-15', batDau: '08:00', ketThuc: null }),
    ];
    expect(
      sharedRowHours([shift({ ngay: '2026-10-12' }), ...orphans], 'CaSang'),
    ).toBe('08:00 – 12:00');
    // Ca null không che được sự lệch giờ của các ca còn lại
    expect(
      sharedRowHours(
        [
          shift({ ngay: '2026-10-12' }),
          shift({ ngay: '2026-10-16', ketThuc: '11:30' }),
          ...orphans,
        ],
        'CaSang',
      ),
    ).toBeNull();
  });

  it('DUX8-06 mọi ca trong hàng đều không còn giờ thì không có giờ', () => {
    const shifts = [
      shift({ ngay: '2026-10-12', batDau: null, ketThuc: null }),
      shift({ ngay: '2026-10-13', batDau: null, ketThuc: null }),
    ];
    expect(sharedRowHours(shifts, 'CaSang')).toBeNull();
  });

  it('DUX8-07 hàng không có ca: mảng rỗng, hoặc chỉ có ca của hàng kia, thì không có giờ', () => {
    expect(sharedRowHours([], 'CaSang')).toBeNull();
    expect(sharedRowHours([], 'CaChieu')).toBeNull();
    expect(sharedRowHours([shift({ ca: 'CaChieu' })], 'CaSang')).toBeNull();
  });

  it('DUX8-08 một ca duy nhất trong hàng thì giờ của nó là giờ nhãn', () => {
    expect(
      sharedRowHours(
        [shift({ ca: 'CaChieu', batDau: '13:30', ketThuc: '17:00' })],
        'CaChieu',
      ),
    ).toBe('13:30 – 17:00');
  });

  it('DUX8-09 hai chi nhánh: khác giờ thì không có giờ chung, cùng giờ thì ra giờ (giờ không phụ thuộc chi nhánh)', () => {
    expect(
      sharedRowHours(
        [
          shift({ ngay: '2026-10-12', chiNhanh: BRANCH_A }),
          shift({
            ngay: '2026-10-13',
            chiNhanh: BRANCH_B,
            batDau: '08:00',
            ketThuc: '11:30',
          }),
        ],
        'CaSang',
      ),
    ).toBeNull();
    expect(
      sharedRowHours(
        [
          shift({ ngay: '2026-10-12', chiNhanh: BRANCH_A }),
          shift({ ngay: '2026-10-13', chiNhanh: BRANCH_B }),
        ],
        'CaSang',
      ),
    ).toBe('08:00 – 12:00');
  });

  it('DUX8-10 hai hàng độc lập: giờ kết thúc của ca sáng trùng giờ bắt đầu của ca chiều không làm lẫn hai hàng', () => {
    const shifts = [
      shift({ ca: 'CaSang', batDau: '08:00', ketThuc: '12:00' }),
      shift({ ca: 'CaChieu', batDau: '12:00', ketThuc: '17:00' }),
    ];
    expect(sharedRowHours(shifts, 'CaSang')).toBe('08:00 – 12:00');
    expect(sharedRowHours(shifts, 'CaChieu')).toBe('12:00 – 17:00');
    // Hàng sáng đồng giờ không bị ca chiều làm lệch, và ngược lại
    const mixed = [
      ...shifts,
      shift({
        ca: 'CaChieu',
        ngay: '2026-10-13',
        batDau: '13:00',
        ketThuc: '17:00',
      }),
    ];
    expect(sharedRowHours(mixed, 'CaSang')).toBe('08:00 – 12:00');
    expect(sharedRowHours(mixed, 'CaChieu')).toBeNull();
  });

  it('DUX8-11 kết quả không phụ thuộc thứ tự ca và không đổi mảng đầu vào', () => {
    const shifts = Object.freeze([
      shift({ ngay: '2026-10-12', batDau: '08:00', ketThuc: '12:00' }),
      shift({ ngay: '2026-10-13', batDau: '08:00', ketThuc: '12:00' }),
      shift({ ngay: '2026-10-14', batDau: '08:00', ketThuc: '11:30' }),
    ]);
    const reversed = Object.freeze([...shifts].reverse());
    expect(sharedRowHours(shifts, 'CaSang')).toBeNull();
    expect(sharedRowHours(reversed, 'CaSang')).toBeNull();
    const uniform = Object.freeze([shifts[0], shifts[1]]);
    expect(sharedRowHours(uniform, 'CaSang')).toBe('08:00 – 12:00');
    expect(sharedRowHours([...uniform].reverse(), 'CaSang')).toBe(
      '08:00 – 12:00',
    );
  });
});

describe('hasManyBranches: ô ghi chi nhánh khi từ 2 chi nhánh (WL-01)', () => {
  it('DUX8-12 0 và 1 chi nhánh thì không, từ 2 chi nhánh trở lên thì có', () => {
    expect(hasManyBranches([])).toBe(false);
    expect(hasManyBranches([BRANCH_A])).toBe(false);
    expect(hasManyBranches([BRANCH_A, BRANCH_B])).toBe(true);
    expect(
      hasManyBranches([BRANCH_A, BRANCH_B, { chiNhanhId: '3', ten: 'C' }]),
    ).toBe(true);
  });
});
