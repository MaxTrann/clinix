import {
  caOf,
  countByState,
  groupDay,
  missingCount,
  shiftBoundary,
  sortByTime,
  summarize,
  tallyStates,
  vnTimeOf,
  type DayDoctor,
} from './appointment-group';

// doctor UX6 (G1, G9, G11): hàm thuần gộp lịch hẹn theo giờ, ca và trạng thái. DUX6-01 đến DUX6-14 [đề xuất]; phủ WL-06, WL-08, WL-13 [đề xuất].
// Chỉ dữ liệu GIẢ. Giờ lịch hẹn là ISO UTC của API; giờ Việt Nam = UTC + 7.

describe('vnTimeOf (giờ Việt Nam từ ISO UTC)', () => {
  it('DUX6-01 01:00Z là 08:00 giờ Việt Nam; 05:30Z là 12:30', () => {
    expect(vnTimeOf('2026-10-14T01:00:00.000Z')).toBe('08:00');
    expect(vnTimeOf('2026-10-14T05:30:00.000Z')).toBe('12:30');
  });

  it('DUX6-02 biên ngày: 17:30Z là 00:30 (ngày hôm sau theo giờ Việt Nam); 16:59Z là 23:59', () => {
    expect(vnTimeOf('2026-10-14T17:30:00.000Z')).toBe('00:30');
    expect(vnTimeOf('2026-10-14T16:59:00.000Z')).toBe('23:59');
  });

  it('DUX6-03 chuỗi sai dạng: trả null, không ném', () => {
    expect(vnTimeOf('không phải ngày')).toBeNull();
    expect(vnTimeOf('')).toBeNull();
    expect(vnTimeOf('2026-13-45T99:00:00Z')).toBeNull();
  });
});

describe('sortByTime', () => {
  it('DUX6-04 sắp tăng theo giờ; cùng giờ giữ nguyên thứ tự gốc; không đổi mảng vào', () => {
    const input = [
      { id: 'c', thoiGian: '2026-10-14T03:00:00.000Z' },
      { id: 'a', thoiGian: '2026-10-14T01:00:00.000Z' },
      { id: 'b', thoiGian: '2026-10-14T01:00:00.000Z' },
    ];
    const sorted = sortByTime(input);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('đếm theo trạng thái', () => {
  it('DUX6-05 thứ tự CỐ ĐỊNH (Chờ thanh toán, Đã xác nhận, Đã tiếp đón, Hoàn thành, Vắng mặt, Đã hủy ở CUỐI), bỏ trạng thái 0', () => {
    const counts = tallyStates([
      { trangThai: 'DaHuy' },
      { trangThai: 'HoanThanh' },
      { trangThai: 'DaXacNhan' },
      { trangThai: 'DaXacNhan' },
      { trangThai: 'DaTiepDon' },
    ]);
    expect(countByState(counts)).toEqual([
      { state: 'DaXacNhan', label: 'Đã xác nhận', count: 2 },
      { state: 'DaTiepDon', label: 'Đã tiếp đón', count: 1 },
      { state: 'HoanThanh', label: 'Hoàn thành', count: 1 },
      { state: 'DaHuy', label: 'Đã hủy', count: 1 },
    ]);
  });

  it('DUX6-06 mã lạ (kể cả DaDoiLich) gom vào "Chưa xác định", không ném và không lộ mã thô', () => {
    const counts = tallyStates([
      { trangThai: 'DaDoiLich' },
      { trangThai: 'MaLa' },
      { trangThai: 'HoanThanh' },
    ]);
    const list = countByState(counts);
    expect(list).toEqual([
      { state: 'HoanThanh', label: 'Hoàn thành', count: 1 },
      { state: 'Unknown', label: 'Chưa xác định', count: 2 },
    ]);
    expect(JSON.stringify(list)).not.toContain('DaDoiLich');
    expect(JSON.stringify(list)).not.toContain('MaLa');
  });

  it('DUX6-07 rỗng: không có mục nào, tổng 0, câu "Chưa có lịch hẹn"', () => {
    expect(countByState({})).toEqual([]);
    expect(summarize({})).toEqual({ total: 0, text: 'Chưa có lịch hẹn' });
  });

  it('DUX6-05b tổng KHÔNG tính Đã hủy (Đại chọn 23/11/2026), nhưng Đã hủy vẫn hiện riêng ở cuối dòng', () => {
    expect(
      summarize({ DaXacNhan: 1, DaTiepDon: 1, HoanThanh: 1, DaHuy: 2 }),
    ).toEqual({
      total: 3,
      text: '3 lịch hẹn: 1 Đã xác nhận · 1 Đã tiếp đón · 1 Hoàn thành · 2 Đã hủy',
    });
    // Chỉ có lịch đã hủy: tổng 0 nhưng vẫn nói rõ có lịch hủy
    expect(summarize({ DaHuy: 1 })).toEqual({
      total: 0,
      text: 'Chưa có lịch hẹn · 1 Đã hủy',
    });
  });
});

describe('ranh giới ca sáng, chiều theo giờ', () => {
  const MORNING = { ca: 'CaSang', batDau: '08:00', ketThuc: '12:00' } as const;
  const AFTERNOON = {
    ca: 'CaChieu',
    batDau: '13:00',
    ketThuc: '17:00',
  } as const;

  it('DUX6-08 ranh giới là giờ kết thúc ca sáng; nửa mở: 11:59 là sáng, 12:00 là chiều', () => {
    const boundary = shiftBoundary([MORNING, AFTERNOON]);
    expect(boundary).toBe('12:00');
    expect(caOf('08:00', boundary)).toBe('CaSang');
    expect(caOf('11:59', boundary)).toBe('CaSang');
    expect(caOf('12:00', boundary)).toBe('CaChieu');
  });

  it('DUX6-09 khe giữa hai ca (12:30) về ca chiều', () => {
    const boundary = shiftBoundary([MORNING, AFTERNOON]);
    expect(caOf('12:30', boundary)).toBe('CaChieu');
    expect(caOf('13:00', boundary)).toBe('CaChieu');
  });

  it('DUX6-10 thiếu giờ ca sáng (giờ không còn hiệu lực): dùng giờ bắt đầu ca chiều', () => {
    const boundary = shiftBoundary([
      { ca: 'CaSang', batDau: null, ketThuc: null },
      AFTERNOON,
    ]);
    expect(boundary).toBe('13:00');
    expect(caOf('12:30', boundary)).toBe('CaSang');
    expect(caOf('13:00', boundary)).toBe('CaChieu');
  });

  it('DUX6-11 thiếu cả hai (hoặc không có ca): dùng 12:00 [đề xuất]', () => {
    expect(
      shiftBoundary([
        { ca: 'CaSang', batDau: null, ketThuc: null },
        { ca: 'CaChieu', batDau: null, ketThuc: null },
      ]),
    ).toBe('12:00');
    expect(shiftBoundary([])).toBe('12:00');
  });

  it('DUX6-12 bác sĩ chỉ có ca chiều: ranh giới là giờ bắt đầu ca chiều; lịch trước giờ đó không rơi vào ca chiều', () => {
    const boundary = shiftBoundary([AFTERNOON]);
    expect(boundary).toBe('13:00');
    expect(caOf('09:00', boundary)).toBe('CaSang');
  });

  it('DUX6-12b chỉ có ca sáng: ranh giới là giờ kết thúc ca sáng', () => {
    expect(shiftBoundary([MORNING])).toBe('12:00');
  });
});

describe('groupDay (Lễ tân: nhóm lịch hẹn của một ngày theo bác sĩ và ca)', () => {
  const DAY = '2026-10-14';
  const DOCTORS: DayDoctor[] = [
    {
      bacSiId: '11',
      hoTen: 'BS. Mẫu Một',
      chuyenKhoa: 'Tim mạch',
      ca: [
        { ngay: DAY, ca: 'CaSang', batDau: '08:00', ketThuc: '12:00' },
        { ngay: DAY, ca: 'CaChieu', batDau: '13:00', ketThuc: '17:00' },
      ],
    },
    {
      bacSiId: '12',
      hoTen: 'BS. Mẫu Hai',
      chuyenKhoa: 'Nhi',
      ca: [{ ngay: DAY, ca: 'CaSang', batDau: '08:00', ketThuc: '12:00' }],
    },
  ];
  const line = (
    bacSi: string,
    chuyenKhoa: string,
    isoUtc: string,
    trangThai: string,
  ) => ({ bacSi, chuyenKhoa, thoiGian: isoUtc, trangThai });

  it('DUX6-13 nhiều bác sĩ: mỗi (bác sĩ, ca) đúng số theo trạng thái; không lẫn nhau', () => {
    const result = groupDay(
      [
        line(
          'BS. Mẫu Một',
          'Tim mạch',
          '2026-10-14T01:00:00.000Z',
          'DaXacNhan',
        ), // 08:00 sáng
        line(
          'BS. Mẫu Một',
          'Tim mạch',
          '2026-10-14T02:00:00.000Z',
          'HoanThanh',
        ), // 09:00 sáng
        line(
          'BS. Mẫu Một',
          'Tim mạch',
          '2026-10-14T07:00:00.000Z',
          'DaTiepDon',
        ), // 14:00 chiều
        line('BS. Mẫu Hai', 'Nhi', '2026-10-14T01:30:00.000Z', 'DaXacNhan'), // 08:30 sáng
        line('BS. Người Lạ', 'Nhi', '2026-10-14T01:30:00.000Z', 'DaXacNhan'), // không có trong lưới: bỏ qua
      ],
      DOCTORS,
      DAY,
    );
    expect(result.counts.get('11|CaSang')).toEqual({
      DaXacNhan: 1,
      HoanThanh: 1,
    });
    expect(result.counts.get('11|CaChieu')).toEqual({ DaTiepDon: 1 });
    expect(result.counts.get('12|CaSang')).toEqual({ DaXacNhan: 1 });
    expect(result.counts.has('12|CaChieu')).toBe(false);
    expect(result.ambiguous.size).toBe(0);
  });

  it('DUX6-13b cùng tên khác chuyên khoa: tách riêng, không mơ hồ', () => {
    const same: DayDoctor[] = [
      {
        ...DOCTORS[0],
        bacSiId: '21',
        hoTen: 'BS. Trùng Tên',
        chuyenKhoa: 'Nhi',
      },
      {
        ...DOCTORS[0],
        bacSiId: '22',
        hoTen: 'BS. Trùng Tên',
        chuyenKhoa: 'Tim mạch',
      },
    ];
    const result = groupDay(
      [
        line(
          'BS. Trùng Tên',
          'Tim mạch',
          '2026-10-14T01:00:00.000Z',
          'DaXacNhan',
        ),
      ],
      same,
      DAY,
    );
    expect(result.counts.get('22|CaSang')).toEqual({ DaXacNhan: 1 });
    expect(result.counts.has('21|CaSang')).toBe(false);
    expect(result.ambiguous.size).toBe(0);
  });

  it('DUX6-14 cùng tên VÀ cùng chuyên khoa: mơ hồ, KHÔNG gán số cho ai (hiện "—")', () => {
    const twins: DayDoctor[] = [
      { ...DOCTORS[0], bacSiId: '31', hoTen: 'BS. Song Sinh' },
      { ...DOCTORS[0], bacSiId: '32', hoTen: 'BS. Song Sinh' },
    ];
    const result = groupDay(
      [
        line(
          'BS. Song Sinh',
          'Tim mạch',
          '2026-10-14T01:00:00.000Z',
          'DaXacNhan',
        ),
      ],
      twins,
      DAY,
    );
    expect([...result.ambiguous].sort()).toEqual(['31', '32']);
    expect(result.counts.size).toBe(0);
  });

  it('DUX6-12c ranh giới theo CA CỦA CHÍNH bác sĩ đó trong ngày (bác sĩ ca sáng đổi giờ kết thúc 11:30)', () => {
    const early: DayDoctor[] = [
      {
        bacSiId: '41',
        hoTen: 'BS. Giờ Lệch',
        chuyenKhoa: 'Nhi',
        ca: [
          { ngay: DAY, ca: 'CaSang', batDau: '08:30', ketThuc: '11:30' },
          { ngay: DAY, ca: 'CaChieu', batDau: '13:30', ketThuc: '17:00' },
        ],
      },
    ];
    const result = groupDay(
      [
        line('BS. Giờ Lệch', 'Nhi', '2026-10-14T04:30:00.000Z', 'DaXacNhan'), // 11:30 => chiều (nửa mở)
        line('BS. Giờ Lệch', 'Nhi', '2026-10-14T04:00:00.000Z', 'DaXacNhan'), // 11:00 => sáng
      ],
      early,
      DAY,
    );
    expect(result.counts.get('41|CaSang')).toEqual({ DaXacNhan: 1 });
    expect(result.counts.get('41|CaChieu')).toEqual({ DaXacNhan: 1 });
  });

  it('DUX6-14b missingCount: số lịch còn thiếu khi danh sách bị cắt, không âm', () => {
    expect(missingCount(230, 100)).toBe(130);
    expect(missingCount(100, 100)).toBe(0);
    expect(missingCount(3, 5)).toBe(0);
  });
});
