import {
  CONFIG_KEYS,
  CONFIG_PARAMS,
  isValidConfigValue,
  normalizeReminders,
  sameConfigValue,
  toHundredths,
  weightsOf,
  weightsSumToOne,
  type ConfigKey,
} from '../system-config-params.js';

// Miền của 9 tham số nguyên (PLAN admin 5.7, Q34): [khoá, min, max]
const INT_BOUNDS: [ConfigKey, number, number][] = [
  ['thoiGianGiuCho', 1, 60],
  ['soLichHenToiDaMoiHoSo', 1, 20],
  ['soLanTuDoiLichToiDa', 0, 10],
  ['checkInTruocPhut', 0, 240],
  ['checkInSauPhut', 0, 240],
  ['thoiHanPhanHoiLoiMoi', 1, 1440],
  ['soMucChoToiDa', 0, 10],
  ['nguongNoShow', 1, 10],
  ['soNgayBaoTruocDoiGioLam', 1, 60],
];

describe('B5 CH — bảng miền giá trị chuẩn (system-config-params)', () => {
  it('CH-11/12: bảng đủ 12 khoá, tên cột đúng, đúng 7 cột bắt buộc khi tạo lần đầu', () => {
    expect([...CONFIG_KEYS]).toHaveLength(12);
    expect(new Set(CONFIG_KEYS).size).toBe(12);
    expect(CONFIG_KEYS.map((key) => CONFIG_PARAMS[key].column)).toEqual([
      'thoi_gian_giu_cho',
      'thoi_diem_nhac_lich',
      'so_lich_hen_toi_da_moi_ho_so',
      'so_lan_tu_doi_lich_toi_da',
      'check_in_truoc_phut',
      'check_in_sau_phut',
      'thoi_han_phan_hoi_loi_moi',
      'so_muc_cho_toi_da',
      'nguong_no_show',
      'so_ngay_bao_truoc_doi_gio_lam',
      'trong_so_w1',
      'trong_so_w2',
    ]);
    // Bảy cột NOT NULL không có DEFAULT ở DB; năm cột còn lại có DEFAULT (15, [72,24,2], 60, 2, 3)
    expect(
      CONFIG_KEYS.filter((key) => CONFIG_PARAMS[key].requiredOnCreate),
    ).toEqual([
      'soLichHenToiDaMoiHoSo',
      'soLanTuDoiLichToiDa',
      'checkInTruocPhut',
      'checkInSauPhut',
      'soNgayBaoTruocDoiGioLam',
      'trongSoW1',
      'trongSoW2',
    ]);
  });

  describe('CH-06: biên dưới và trên của từng tham số nguyên (it.each)', () => {
    it.each(INT_BOUNDS)('%s: min %d và max %d', (key, min, max) => {
      expect(isValidConfigValue(key, min)).toBe(true);
      expect(isValidConfigValue(key, max)).toBe(true);
      expect(isValidConfigValue(key, min - 1)).toBe(false);
      expect(isValidConfigValue(key, max + 1)).toBe(false);
      expect(isValidConfigValue(key, Math.floor((min + max) / 2))).toBe(true);
    });
  });

  it('CH-21: so_ngay_bao_truoc_doi_gio_lam 0 (DB cho phép) và 61 bị từ chối; 1 và 60 qua', () => {
    const key = 'soNgayBaoTruocDoiGioLam';
    expect(isValidConfigValue(key, 0)).toBe(false);
    expect(isValidConfigValue(key, 61)).toBe(false);
    expect(isValidConfigValue(key, 1)).toBe(true);
    expect(isValidConfigValue(key, 60)).toBe(true);
  });

  describe('CH-05: giá trị không phải số nguyên hợp lệ bị từ chối ở mọi tham số nguyên', () => {
    const NOT_VALID: [string, unknown][] = [
      ['âm', -1],
      ['chuỗi số', '15'],
      ['boolean', true],
      ['null', null],
      ['undefined', undefined],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['số lẻ', 5.5],
      ['mảng một số', [5]],
      ['object', { value: 5 }],
    ];
    it.each(INT_BOUNDS.map(([key]) => key))('%s', (key) => {
      for (const [label, value] of NOT_VALID)
        expect(isValidConfigValue(key, value), label).toBe(false);
    });
    it('0 bị từ chối ở tham số phải > 0 (giữ chỗ, hạn phản hồi, ngưỡng no-show, số lịch/hồ sơ)', () => {
      for (const key of [
        'thoiGianGiuCho',
        'thoiHanPhanHoiLoiMoi',
        'nguongNoShow',
        'soLichHenToiDaMoiHoSo',
      ] as const)
        expect(isValidConfigValue(key, 0), key).toBe(false);
    });
  });

  describe('CH-07: thoi_diem_nhac_lich', () => {
    const key = 'thoiDiemNhacLich';
    it('hợp lệ: 1 đến 5 mốc nguyên 1 đến 720, không trùng', () => {
      for (const value of [
        [1],
        [720],
        [72, 24, 2],
        [2, 24, 72],
        [1, 2, 3, 4, 5],
        [720, 1],
      ])
        expect(isValidConfigValue(key, value), JSON.stringify(value)).toBe(
          true,
        );
    });
    it.each([
      ['không phải mảng (số)', 72],
      ['không phải mảng (chuỗi)', '72'],
      ['không phải mảng (object)', { 0: 72 }],
      ['null', null],
      ['rỗng', []],
      ['sáu phần tử', [1, 2, 3, 4, 5, 6]],
      ['phần tử 0', [0]],
      ['phần tử âm', [-1, 24]],
      ['phần tử 721', [721]],
      ['phần tử không nguyên', [1.5]],
      ['phần tử là chuỗi', ['24']],
      ['phần tử null', [null]],
      ['trùng', [24, 24]],
      ['trùng cách xa', [72, 24, 72]],
    ])('từ chối: %s', (_label, value) => {
      expect(isValidConfigValue(key, value)).toBe(false);
    });
  });

  describe('CH-08 và CHB5-05: trọng số w1, w2', () => {
    it.each(['trongSoW1', 'trongSoW2'] as const)(
      '%s: 0 đến 1, tối đa hai chữ số thập phân',
      (key) => {
        for (const value of [0, 0.01, 0.6, 0.07, 0.99, 1])
          expect(isValidConfigValue(key, value), String(value)).toBe(true);
        for (const [label, value] of [
          ['âm', -0.01],
          ['lớn hơn 1', 1.01],
          ['ba chữ số thập phân', 0.605],
          ['ba chữ số thập phân gần 1', 1.005],
          ['ba chữ số, tròn lên thành hợp lệ', 0.555],
          ['nhiễu số thực', 0.1 + 0.2],
          ['chuỗi', '0.6'],
          ['null', null],
          ['NaN', Number.NaN],
          ['Infinity', Number.POSITIVE_INFINITY],
        ] as [string, unknown][])
          expect(isValidConfigValue(key, value), label).toBe(false);
      },
    );

    it('tổng w1 + w2 = 1,00 tính bằng phần trăm nguyên', () => {
      expect(weightsSumToOne(0.6, 0.4)).toBe(true);
      expect(weightsSumToOne(0, 1)).toBe(true);
      expect(weightsSumToOne(1, 0)).toBe(true);
      expect(weightsSumToOne(0.6, 0.5)).toBe(false);
      expect(weightsSumToOne(0.01, 0.98)).toBe(false);
      expect(weightsSumToOne(0, 0)).toBe(false);
      expect(weightsSumToOne(1, 1)).toBe(false);
    });

    it('CHB5-05: cả 101 cặp (i/100, (100-i)/100) đều đúng 1,00 và lệch một phần trăm thì sai', () => {
      // Với giá trị hai chữ số, phép cộng số thực cũng cho đúng 1 (phiên kiểm đã liệt kê 101 cặp): bằng chứng rằng
      // đổi sang cộng số thực KHÔNG đổi được kết quả (đột biến M3 tương đương). Lỗi thật là nhận ba chữ số hoặc làm tròn: xem ca trên.
      for (let i = 0; i <= 100; i += 1) {
        const w1 = i / 100;
        const w2 = (100 - i) / 100;
        expect(isValidConfigValue('trongSoW1', w1), String(w1)).toBe(true);
        expect(isValidConfigValue('trongSoW2', w2), String(w2)).toBe(true);
        expect(weightsSumToOne(w1, w2), `${String(w1)} + ${String(w2)}`).toBe(
          true,
        );
        if (i < 100) expect(weightsSumToOne(w1, w2 + 0.01)).toBe(false);
      }
    });

    it('toHundredths đổi trọng số hợp lệ ra số nguyên chính xác', () => {
      expect(toHundredths(0.07)).toBe(7);
      expect(toHundredths(0.29)).toBe(29);
      expect(toHundredths(0.57)).toBe(57);
      expect(toHundredths(1)).toBe(100);
    });

    it('weightsOf: đủ cặp thì trả [w1, w2], thiếu một thì null', () => {
      expect(weightsOf({ trongSoW1: 0.7, trongSoW2: 0.3 })).toEqual([0.7, 0.3]);
      expect(weightsOf({ trongSoW1: 0.7 })).toBeNull();
      expect(weightsOf({ trongSoW2: 0.3 })).toBeNull();
      expect(weightsOf({})).toBeNull();
    });
  });

  describe('CHB5-03: chuẩn hoá và so sánh', () => {
    it('normalizeReminders sắp giảm dần và không sửa mảng gốc', () => {
      const input = [2, 72, 24];
      expect(normalizeReminders(input)).toEqual([72, 24, 2]);
      expect(input).toEqual([2, 72, 24]);
      // sắp theo SỐ, không theo chữ: 100 > 24 > 9
      expect(normalizeReminders([9, 100, 24])).toEqual([100, 24, 9]);
    });

    it('sameConfigValue: số so bằng nhau; mảng so từng phần tử; số khác mảng thì khác', () => {
      expect(sameConfigValue(15, 15)).toBe(true);
      expect(sameConfigValue(15, 16)).toBe(false);
      expect(sameConfigValue(0.6, 0.6)).toBe(true);
      expect(sameConfigValue([72, 24, 2], [72, 24, 2])).toBe(true);
      expect(sameConfigValue([72, 24, 2], [72, 24])).toBe(false);
      expect(sameConfigValue([72, 24, 2], [72, 24, 3])).toBe(false);
      expect(sameConfigValue([72, 24, 2], [2, 24, 72])).toBe(false);
      expect(sameConfigValue(15, [15])).toBe(false);
      expect(sameConfigValue([15], 15)).toBe(false);
    });
  });
});
