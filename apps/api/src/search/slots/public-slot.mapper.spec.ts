import type {
  AvailableSlot,
  DoctorDaySlots,
} from '../../scheduling/slots/available-slots.reader.js';
import type { DayStatus } from '../../scheduling/slots/slot-status.rules.js';
import {
  assembleItems,
  toPublicDay,
  unavailableDoctor,
} from './public-slot.mapper.js';

// Search Slots PR-C1 — KGC-08 đến KGC-10: mapper thuần reader ⇒ dạng công khai (PLAN search 5.6).
const NGAY = '2026-11-19';
const slot = (
  id: string,
  trangThai: AvailableSlot['trangThai'] = 'ConTrong',
): AvailableSlot => ({
  khungGioId: id,
  batDau: '2026-11-19T01:00:00.000Z',
  ketThuc: '2026-11-19T01:30:00.000Z',
  ca: 'CaSang',
  trangThai,
});
const day = (
  bacSiId: string,
  trangThaiNgay: DayStatus = 'CoLich',
  extra: Partial<DoctorDaySlots> = {},
): DoctorDaySlots => ({
  bacSiId,
  ngay: NGAY,
  trangThaiNgay,
  khungGio: [slot(`${bacSiId}01`)],
  ...extra,
});

describe('KGC-08 mapper chọn TỪNG TRƯỜNG (danh sách trắng)', () => {
  it('trường lạ của reader (giuChoDen, lichHenId, lyDo, email…) không ra công khai', () => {
    const dirty = {
      ...day('7'),
      giuChoDen: '2026-11-18 07:15:00',
      lichHenId: '99',
      lyDo: 'khám sức khoẻ',
      email: 'bs@example.com',
      khungGio: [
        {
          ...slot('701', 'DangGiuCho'),
          giuChoDen: '2026-11-18 07:15:00',
          lichHenId: '99',
          nguoiDatId: '5',
        },
      ],
    } as unknown as DoctorDaySlots;

    const out = toPublicDay(dirty);
    expect(Object.keys(out).sort()).toEqual([
      'bacSiId',
      'khungGio',
      'trangThaiNgay',
    ]);
    expect(Object.keys(out.khungGio[0] ?? {}).sort()).toEqual([
      'batDau',
      'ca',
      'ketThuc',
      'khungGioId',
      'trangThai',
    ]);
    expect(JSON.stringify(out)).not.toMatch(
      /giuChoDen|lichHenId|lyDo|email|nguoiDatId/,
    );
  });

  it('`ngay` không lặp ở từng phần tử (nó nằm ở cấp trên của thân phản hồi)', () => {
    expect(toPublicDay(day('7'))).not.toHaveProperty('ngay');
  });
});

describe('KGC-09 trạng thái chuyển đúng', () => {
  it.each<[DayStatus, string]>([
    ['CoLich', 'CoLich'],
    ['KhongCoLich', 'KhongCoLich'],
    ['ChiNhanhNghi', 'ChiNhanhNghi'],
    ['NghiPhep', 'KhongCoLich'], // gộp (Đại chọn 17/11/2026): không lộ việc xin nghỉ phép
  ])('trangThaiNgay %s ⇒ %s', (input, expected) => {
    expect(toPublicDay(day('7', input)).trangThaiNgay).toBe(expected);
  });

  it('`thuNghi` chỉ có khi ChiNhanhNghi', () => {
    expect(toPublicDay(day('7', 'ChiNhanhNghi', { thuNghi: 4 }))).toMatchObject(
      { thuNghi: 4 },
    );
    // Dù reader (giả định) trả `thuNghi` ở trạng thái khác, công khai KHÔNG có.
    for (const status of ['CoLich', 'KhongCoLich', 'NghiPhep'] as DayStatus[])
      expect(toPublicDay(day('7', status, { thuNghi: 4 }))).not.toHaveProperty(
        'thuNghi',
      );
    expect(toPublicDay(day('7', 'ChiNhanhNghi'))).not.toHaveProperty('thuNghi');
  });

  it('bốn trạng thái ô chuyển NGUYÊN, giữ thứ tự ô', () => {
    const states = ['ConTrong', 'DaDat', 'DangGiuCho', 'HetHan'] as const;
    const out = toPublicDay(
      day('7', 'CoLich', {
        khungGio: states.map((state, i) => slot(`70${i}`, state)),
      }),
    );
    expect(out.khungGio.map((s) => s.trangThai)).toEqual([...states]);
    expect(out.khungGio.map((s) => s.khungGioId)).toEqual([
      '700',
      '701',
      '702',
      '703',
    ]);
  });
});

describe('KGC-10 bác sĩ ẩn hoặc không tồn tại, thứ tự, một phần tử cho mỗi id', () => {
  it('thiếu trong kết quả reader ⇒ KhongCoLich rỗng, đúng vị trí, đúng thứ tự đầu vào', () => {
    const items = assembleItems(['5', '9', '7'], [day('7'), day('5')]);
    expect(items.map((item) => item.bacSiId)).toEqual(['5', '9', '7']);
    expect(items[1]).toEqual({
      bacSiId: '9',
      trangThaiNgay: 'KhongCoLich',
      khungGio: [],
    });
    expect(items[0]?.khungGio).toHaveLength(1);
  });

  it('phần tử "không công khai" giống HỆT phần tử reader trả cho id không tồn tại (không phân biệt được)', () => {
    const fromReader = toPublicDay(day('123', 'KhongCoLich', { khungGio: [] }));
    expect(unavailableDoctor('123')).toEqual(fromReader);
    expect(JSON.stringify(unavailableDoctor('123'))).toBe(
      JSON.stringify(fromReader),
    );
  });

  it('không có id nào ⇒ mảng rỗng', () => {
    expect(assembleItems([], [])).toEqual([]);
  });
});
