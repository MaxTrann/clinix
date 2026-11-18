import { PARAMS } from './system-config-params';
import {
  CONFIG_KEYS,
  type ConfigKey,
  type SystemConfig,
} from './system-config-types';
import {
  REASON_MAX_LENGTH,
  REASON_REQUIRED_MESSAGE,
  REASON_TOO_LONG_MESSAGE,
  REQUIRED_MESSAGE,
  WEIGHT_SUM_MESSAGE,
  firstInvalidKey,
  invalidValueMessage,
  reasonError,
  validateDraft,
} from './system-config-validation';
import { draftFromConfig, type Draft } from './system-config-values';
import {
  EMPTY_CONFIG,
  FULL_CONFIG,
  configWith,
} from './testing/system-config-test-kit';

// admin F5, kiểm bản nháp (PLAN 7.7: CH-04 đến CH-08, CH-21 phía giao diện; mã CHF5-03 đến CHF5-08 là [đề xuất], TRACKING admin 9A.8 mục 3).

type ScalarKey = Exclude<ConfigKey, 'thoiDiemNhacLich'>;

function draftWith(
  config: SystemConfig,
  edits: Partial<Record<ScalarKey, string>> & { thoiDiemNhacLich?: string[] },
): Draft {
  return { ...draftFromConfig(config), ...edits };
}

const INT_KEYS = CONFIG_KEYS.filter(
  (key) => PARAMS[key].rule.kind === 'int',
) as ScalarKey[];

describe('CHF5-03 số nguyên theo bảng miền (it.each cho từng tham số, biên dưới và biên trên)', () => {
  it('CHF5-03 có 9 tham số số nguyên', () => {
    expect(INT_KEYS).toHaveLength(9);
  });

  for (const key of INT_KEYS) {
    const rule = PARAMS[key].rule;
    if (rule.kind !== 'int') continue;
    // Giá trị đã lưu ở giữa miền, nên mọi giá trị thử đều "đã đổi" (không bị coi là chưa đổi)
    const base = configWith({ [key]: Math.floor((rule.min + rule.max) / 2) });
    const accepted: [string, number][] = [
      [String(rule.min), rule.min],
      [String(rule.max), rule.max],
      [` ${rule.max} `, rule.max],
    ];
    const rejected = [
      String(rule.max + 1),
      String(rule.min - 1),
      '-1',
      'abc',
      '1.5',
      '1,5',
      '1e2',
      '+5',
      '٣',
      '9999999',
    ];

    it.each(accepted)(`CHF5-03 ${key}: nhận %j`, (text, value) => {
      const result = validateDraft(base, draftWith(base, { [key]: text }));
      expect(result.errors).toEqual({});
      expect(result.patch).toEqual({ [key]: value });
    });

    it.each(rejected)(`CHF5-03 ${key}: từ chối %j`, (text) => {
      const result = validateDraft(base, draftWith(base, { [key]: text }));
      expect(result.errors[key]).toBe(invalidValueMessage(key));
      expect(result.patch).toEqual({});
    });

    it(`CHF5-03 ${key}: ô để trống (đã có cấu hình) là lỗi bắt buộc, không phải "chưa đổi"`, () => {
      const result = validateDraft(base, draftWith(base, { [key]: '  ' }));
      expect(result.errors[key]).toBe(REQUIRED_MESSAGE);
    });
  }
});

describe('CHF5-04 số ngày báo trước 0 và 61 bị từ chối (CH-21), 1 và 60 được nhận', () => {
  it.each([
    ['0', false],
    ['61', false],
    ['1', true],
    ['60', true],
  ] as const)('CHF5-04 %j', (text, ok) => {
    const result = validateDraft(
      FULL_CONFIG,
      draftWith(FULL_CONFIG, { soNgayBaoTruocDoiGioLam: text }),
    );
    expect(result.errors.soNgayBaoTruocDoiGioLam === undefined).toBe(ok);
  });
});

describe('CHF5-05 nhắc lịch (CH-07): 1 đến 5 mốc, mỗi mốc 1 đến 720 giờ, không trùng', () => {
  const check = (list: string[], config = FULL_CONFIG) =>
    validateDraft(config, draftWith(config, { thoiDiemNhacLich: list }));
  const bad = invalidValueMessage('thoiDiemNhacLich');

  it.each([
    [[]],
    [['1', '2', '3', '4', '5', '6']],
    [['0']],
    [['721']],
    [['1.5']],
    [['abc']],
    [['24', '24']],
    [['']],
    [['72', '24', '']],
  ])('CHF5-05 từ chối %j (đã có cấu hình)', (list) => {
    expect(check(list).errors.thoiDiemNhacLich).toBe(bad);
  });

  it('CHF5-05 biên: 1 mốc, 5 mốc, giá trị 1 và 720 được nhận; gửi giảm dần', () => {
    expect(check(['1']).patch).toEqual({ thoiDiemNhacLich: [1] });
    expect(check(['720']).patch).toEqual({ thoiDiemNhacLich: [720] });
    expect(check(['1', '2', '3', '4', '5']).patch).toEqual({
      thoiDiemNhacLich: [5, 4, 3, 2, 1],
    });
    expect(check(['2', '72']).patch).toEqual({ thoiDiemNhacLich: [72, 2] });
  });

  it('CHF5-05 đổi thứ tự các mốc không phải là thay đổi', () => {
    const result = check(['2', '24', '72']);
    expect(result.errors).toEqual({});
    expect(result.changed).toEqual([]);
    expect(result.patch).toEqual({});
  });

  it('CHF5-05 lần đầu (chưa có cấu hình): danh sách trống là hợp lệ và KHÔNG được gửi; có mốc thì gửi', () => {
    expect(check([], EMPTY_CONFIG).errors.thoiDiemNhacLich).toBeUndefined();
    expect(check([], EMPTY_CONFIG).patch.thoiDiemNhacLich).toBeUndefined();
    expect(check(['48'], EMPTY_CONFIG).patch.thoiDiemNhacLich).toEqual([48]);
    expect(check(['48', '48'], EMPTY_CONFIG).errors.thoiDiemNhacLich).toBe(bad);
  });
});

describe('CHF5-06 trọng số (CH-08): 0 đến 1, tối đa 2 chữ số thập phân, tổng hai trọng số bằng 1,00', () => {
  const edit = (w1: string, w2: string) =>
    validateDraft(
      FULL_CONFIG,
      draftWith(FULL_CONFIG, { trongSoW1: w1, trongSoW2: w2 }),
    );

  it('CHF5-06 cặp hợp lệ (dấu phẩy hoặc dấu chấm) ra số thực đúng', () => {
    expect(edit('0,7', '0,3').patch).toEqual({
      trongSoW1: 0.7,
      trongSoW2: 0.3,
    });
    expect(edit('0.25', '0.75').patch).toEqual({
      trongSoW1: 0.25,
      trongSoW2: 0.75,
    });
    expect(edit('1', '0').patch).toEqual({ trongSoW1: 1, trongSoW2: 0 });
    expect(edit('0', '1,00').patch).toEqual({ trongSoW1: 0, trongSoW2: 1 });
  });

  // `0,050`, `0,100`, `0,000` có đủ 3 chữ số thập phân nhưng giá trị ≤ 1: nếu chỉ chặn bằng "lớn hơn 1" thì chúng lọt và đổi nghĩa (0,050 thành 0,5)
  it.each([
    '0,605',
    '0.123',
    '0,050',
    '0,100',
    '0,000',
    '-0,1',
    '1,01',
    '2',
    ',5',
    '0,',
    'abc',
    '1e-1',
  ])(
    'CHF5-06 từ chối %j (3 chữ số thập phân, âm, lớn hơn 1, sai dạng)',
    (text) => {
      const result = edit(text, '0,4');
      expect(result.errors.trongSoW1).toBe(invalidValueMessage('trongSoW1'));
    },
  );

  it('CHF5-06 tổng khác 1,00 báo lỗi ở CẢ HAI ô; sửa một ô mà ô kia giữ nguyên cũng kiểm với ô kia', () => {
    const both = edit('0,7', '0,4').errors;
    expect(both.trongSoW1).toBe(WEIGHT_SUM_MESSAGE);
    expect(both.trongSoW2).toBe(WEIGHT_SUM_MESSAGE);
    // Chỉ sửa w1: w2 lấy từ cấu hình đã lưu (0,4), 0,7 + 0,4 = 1,1
    const only = validateDraft(
      FULL_CONFIG,
      draftWith(FULL_CONFIG, { trongSoW1: '0,7' }),
    );
    expect(only.errors.trongSoW1).toBe(WEIGHT_SUM_MESSAGE);
    expect(only.errors.trongSoW2).toBe(WEIGHT_SUM_MESSAGE);
  });

  it('CHF5-06 cả 101 cặp (a, 100 - a) phần trăm đều qua, cặp lệch 0,01 đều bị chặn', () => {
    // Đã quét mọi cặp 0..100: cộng số thực cho cùng kết luận với cộng phần trăm nguyên, nên đột biến "cộng số thực" là tương đương (như M3 của B5)
    for (let a = 0; a <= 100; a += 1) {
      const text = (hundredths: number) =>
        (hundredths / 100).toFixed(2).replace('.', ',');
      // Chọn cặp khác giá trị đã lưu (0,60 và 0,40) để chắc chắn là "đã đổi"
      if (a === 60) continue;
      expect(edit(text(a), text(100 - a)).errors, `a=${a}`).toEqual({});
      if (a >= 1)
        expect(
          edit(text(a), text(101 - a)).errors.trongSoW1,
          `a=${a} lệch`,
        ).toBe(WEIGHT_SUM_MESSAGE);
    }
  });
});

describe('CHF5-07 chỉ ô ĐÃ ĐỔI mới bị kiểm miền và mới được gửi (giá trị cũ ngoài miền vẫn tải được)', () => {
  const legacy = configWith({ thoiGianGiuCho: 120 });

  it('CHF5-07 giữ nguyên ô ngoài miền (120) và sửa ô khác: không lỗi, patch chỉ có ô khác', () => {
    const result = validateDraft(
      legacy,
      draftWith(legacy, { soMucChoToiDa: '5' }),
    );
    expect(result.errors).toEqual({});
    expect(result.patch).toEqual({ soMucChoToiDa: 5 });
  });

  it('CHF5-07 sửa chính ô đó sang giá trị vẫn ngoài miền thì báo lỗi; sang giá trị trong miền thì nhận', () => {
    expect(
      validateDraft(legacy, draftWith(legacy, { thoiGianGiuCho: '121' })).errors
        .thoiGianGiuCho,
    ).toBe(invalidValueMessage('thoiGianGiuCho'));
    expect(
      validateDraft(legacy, draftWith(legacy, { thoiGianGiuCho: '30' })).patch,
    ).toEqual({ thoiGianGiuCho: 30 });
  });

  it('CHF5-07 không đổi gì: không lỗi, patch rỗng, changed rỗng', () => {
    const result = validateDraft(FULL_CONFIG, draftFromConfig(FULL_CONFIG));
    expect(result).toEqual({ errors: {}, patch: {}, changed: [] });
  });

  it('CHF5-07 lần đầu: bảy ô bắt buộc để trống ⇒ mỗi ô một lỗi; năm ô có DEFAULT để trống thì không lỗi và không gửi', () => {
    const result = validateDraft(EMPTY_CONFIG, draftFromConfig(EMPTY_CONFIG));
    expect(Object.keys(result.errors).sort()).toEqual(
      CONFIG_KEYS.filter((key) => PARAMS[key].requiredOnCreate).sort(),
    );
    for (const message of Object.values(result.errors))
      expect(message).toBe(REQUIRED_MESSAGE);
    expect(result.patch).toEqual({});
  });

  it('CHF5-07 lần đầu: nhập đủ bảy ô ⇒ patch đúng bảy khoá, không có khoá DEFAULT', () => {
    const draft = draftWith(EMPTY_CONFIG, {
      soLichHenToiDaMoiHoSo: '3',
      soLanTuDoiLichToiDa: '2',
      checkInTruocPhut: '30',
      checkInSauPhut: '15',
      soNgayBaoTruocDoiGioLam: '3',
      trongSoW1: '0,6',
      trongSoW2: '0,4',
    });
    const result = validateDraft(EMPTY_CONFIG, draft);
    expect(result.errors).toEqual({});
    expect(result.patch).toEqual({
      soLichHenToiDaMoiHoSo: 3,
      soLanTuDoiLichToiDa: 2,
      checkInTruocPhut: 30,
      checkInSauPhut: 15,
      soNgayBaoTruocDoiGioLam: 3,
      trongSoW1: 0.6,
      trongSoW2: 0.4,
    });
  });

  it('CHF5-07 lần đầu: ô tuỳ chọn chỉ có khoảng trắng vẫn là "chưa nhập" (không lỗi, không gửi); ô bắt buộc chỉ có khoảng trắng thì báo bắt buộc', () => {
    const required = {
      soLichHenToiDaMoiHoSo: '3',
      soLanTuDoiLichToiDa: '2',
      checkInTruocPhut: '30',
      checkInSauPhut: '15',
      soNgayBaoTruocDoiGioLam: '3',
      trongSoW1: '0,6',
      trongSoW2: '0,4',
    };
    const result = validateDraft(
      EMPTY_CONFIG,
      draftWith(EMPTY_CONFIG, {
        ...required,
        thoiGianGiuCho: '  ',
        thoiHanPhanHoiLoiMoi: '\t',
        soMucChoToiDa: ' ',
        nguongNoShow: '   ',
      }),
    );
    expect(result.errors).toEqual({});
    expect(Object.keys(result.patch).sort()).toEqual(
      Object.keys(required).sort(),
    );

    // Ô bắt buộc chỉ có khoảng trắng: không im lặng bỏ qua
    const blankRequired = validateDraft(
      EMPTY_CONFIG,
      draftWith(EMPTY_CONFIG, { ...required, checkInTruocPhut: '  ' }),
    );
    expect(blankRequired.errors).toEqual({
      checkInTruocPhut: REQUIRED_MESSAGE,
    });
  });

  it('CHF5-07 lần đầu: tổng trọng số khác 1,00 vẫn bị chặn', () => {
    const draft = draftWith(EMPTY_CONFIG, {
      soLichHenToiDaMoiHoSo: '3',
      soLanTuDoiLichToiDa: '2',
      checkInTruocPhut: '30',
      checkInSauPhut: '15',
      soNgayBaoTruocDoiGioLam: '3',
      trongSoW1: '0,6',
      trongSoW2: '0,5',
    });
    const result = validateDraft(EMPTY_CONFIG, draft);
    expect(result.errors.trongSoW1).toBe(WEIGHT_SUM_MESSAGE);
    expect(result.errors.trongSoW2).toBe(WEIGHT_SUM_MESSAGE);
  });

  it('CHF5-07 firstInvalidKey chọn ô lỗi đầu tiên theo thứ tự trên màn hình, không theo thứ tự khoá', () => {
    expect(
      firstInvalidKey({
        trongSoW1: 'x',
        thoiDiemNhacLich: 'y',
        nguongNoShow: 'z',
      }),
    ).toBe('nguongNoShow');
    expect(firstInvalidKey({})).toBeNull();
  });
});

describe('CHF5-08 lý do thay đổi (CH-04, Q38): 1 đến 500 ký tự UTF-16 sau trim', () => {
  it.each(['', ' ', '   ', '\n\t ', ' ', '  '])(
    'CHF5-08 từ chối %j (rỗng hay chỉ khoảng trắng)',
    (text) => {
      expect(reasonError(text)).toBe(REASON_REQUIRED_MESSAGE);
    },
  );

  it('CHF5-08 biên 500 và 501; khoảng trắng hai đầu không tính', () => {
    expect(reasonError('a')).toBeNull();
    expect(reasonError('a'.repeat(REASON_MAX_LENGTH))).toBeNull();
    expect(reasonError('a'.repeat(REASON_MAX_LENGTH + 1))).toBe(
      REASON_TOO_LONG_MESSAGE,
    );
    expect(reasonError(`  ${'a'.repeat(REASON_MAX_LENGTH)}\n `)).toBeNull();
  });

  it('CHF5-08 đếm theo đơn vị UTF-16 như API: emoji tính 2, nên 250 emoji qua, 251 thì không', () => {
    expect(reasonError('😀'.repeat(250))).toBeNull();
    expect(reasonError('😀'.repeat(251))).toBe(REASON_TOO_LONG_MESSAGE);
  });

  it('CHF5-08 chữ HTML là chữ thường, không bị từ chối', () => {
    expect(reasonError('<script>alert(1)</script>')).toBeNull();
  });
});
