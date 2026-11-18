import {
  formatChangeValue,
  formatThoiDiem,
  labelOfKey,
  summarizeChanges,
} from './history-format';
import type { ConfigKey } from './system-config-types';
import {
  buildUpdateBody,
  describeChanges,
  validateDraft,
} from './system-config-validation';
import {
  changedKeys,
  draftFromConfig,
  formatConfigValue,
  formatWeight,
  normalizeReminders,
  parseWeightHundredths,
  parseWholeNumber,
  sameConfigValue,
  trimAscii,
  type Draft,
} from './system-config-values';
import {
  EMPTY_CONFIG,
  FULL_CONFIG,
  configWith,
} from './testing/system-config-test-kit';

// admin F5, hàm thuần: so sánh, dựng thân PUT, định dạng (mã CHF5-09 đến CHF5-11 là [đề xuất], TRACKING admin 9A.8 mục 3).

const edit = (draft: Draft, edits: Partial<Draft>): Draft => ({
  ...draft,
  ...edits,
});

describe('CHF5-09 so sánh với giá trị đã lưu: chỉ khoá ĐỔI mới được tính', () => {
  const base = draftFromConfig(FULL_CONFIG);

  it('CHF5-09 bản nháp dựng từ cấu hình thì không đổi gì; trọng số hiện `0,60`, nhắc lịch giảm dần', () => {
    expect(changedKeys(FULL_CONFIG, base)).toEqual([]);
    expect(base.trongSoW1).toBe('0,60');
    expect(base.trongSoW2).toBe('0,40');
    expect(base.thoiDiemNhacLich).toEqual(['72', '24', '2']);
    expect(base.thoiGianGiuCho).toBe('15');
  });

  it('CHF5-09 cùng giá trị viết khác đi vẫn là "không đổi": `015`, ` 15 `, `0,6`, `0.60`, nhắc lịch đổi thứ tự', () => {
    for (const edits of [
      { thoiGianGiuCho: '015' },
      { thoiGianGiuCho: ' 15 ' },
      { trongSoW1: '0,6' },
      { trongSoW1: '0.60' },
      { trongSoW2: '.4' },
      { thoiDiemNhacLich: ['2', '72', '24'] },
    ] as Partial<Draft>[]) {
      // `.4` không hợp lệ nên là "đã đổi" (lỗi); các ô còn lại phải là "không đổi"
      const expected = JSON.stringify(edits).includes('.4')
        ? ['trongSoW2']
        : [];
      expect(
        changedKeys(FULL_CONFIG, edit(base, edits)),
        JSON.stringify(edits),
      ).toEqual(expected);
    }
  });

  it('CHF5-09 đổi hai ô: đúng hai khoá, theo thứ tự CONFIG_KEYS', () => {
    expect(
      changedKeys(
        FULL_CONFIG,
        edit(base, { nguongNoShow: '4', thoiGianGiuCho: '20' }),
      ),
    ).toEqual(['thoiGianGiuCho', 'nguongNoShow']);
  });

  it('CHF5-09 ô trống hay chữ sai (đã có cấu hình) là "đã đổi" để bị báo lỗi, không im lặng bỏ qua', () => {
    expect(
      changedKeys(FULL_CONFIG, edit(base, { checkInSauPhut: '' })),
    ).toEqual(['checkInSauPhut']);
    expect(
      changedKeys(FULL_CONFIG, edit(base, { checkInSauPhut: 'x' })),
    ).toEqual(['checkInSauPhut']);
  });

  it('CHF5-09 ô giữ NGUYÊN từng ký tự thì chưa đổi, kể cả khi giá trị ngoài miền (giữ chỗ 120)', () => {
    const legacy = configWith({ thoiGianGiuCho: 120 });
    expect(changedKeys(legacy, draftFromConfig(legacy))).toEqual([]);
  });

  it('CHF5-09 chưa có cấu hình: bản nháp trống không đổi gì; điền ô nào thì ô đó "đã đổi"', () => {
    const empty = draftFromConfig(EMPTY_CONFIG);
    expect(empty.thoiDiemNhacLich).toEqual([]);
    expect(empty.trongSoW1).toBe('');
    expect(changedKeys(EMPTY_CONFIG, empty)).toEqual([]);
    expect(
      changedKeys(EMPTY_CONFIG, edit(empty, { nguongNoShow: '3' })),
    ).toEqual(['nguongNoShow']);
  });

  it('CHF5-09 parseWholeNumber và parseWeightHundredths', () => {
    expect(parseWholeNumber(' 007 ')).toBe(7);
    for (const bad of ['', ' ', '1.5', '-1', '1e2', '1234567', '٣', '1 2'])
      expect(parseWholeNumber(bad), bad).toBeNull();
    expect(parseWeightHundredths('0,6')).toBe(60);
    expect(parseWeightHundredths('0.07')).toBe(7);
    expect(parseWeightHundredths('1')).toBe(100);
    expect(parseWeightHundredths('1,00')).toBe(100);
    for (const bad of [
      '',
      '0,605',
      '0,050',
      '0,100',
      '1,01',
      '101',
      ',5',
      '0,',
      '-0,1',
      'a',
    ])
      expect(parseWeightHundredths(bad), bad).toBeNull();
    expect(trimAscii('\t x \n')).toBe('x');
    expect(trimAscii(' x ')).toBe(' x ');
  });

  it('CHF5-09 sameConfigValue và normalizeReminders (không sửa mảng gốc)', () => {
    expect(sameConfigValue(3, 3)).toBe(true);
    expect(sameConfigValue(3, 4)).toBe(false);
    expect(sameConfigValue([72, 24], [72, 24])).toBe(true);
    expect(sameConfigValue([72, 24], [24, 72])).toBe(false);
    expect(sameConfigValue(3, [3])).toBe(false);
    const original = [2, 72, 24];
    expect(normalizeReminders(original)).toEqual([72, 24, 2]);
    expect(original).toEqual([2, 72, 24]);
  });
});

describe('CHF5-10 thân PUT: lý do đã cắt + CHỈ khoá đổi, số JSON (không chuỗi)', () => {
  it('CHF5-10 chỉ một ô đổi ⇒ thân có đúng `lyDo` và ô đó', () => {
    const draft = edit(draftFromConfig(FULL_CONFIG), { thoiGianGiuCho: '20' });
    const { patch } = validateDraft(FULL_CONFIG, draft);
    expect(buildUpdateBody(patch, '  Tăng giờ giữ chỗ \n')).toEqual({
      lyDo: 'Tăng giờ giữ chỗ',
      thoiGianGiuCho: 20,
    });
  });

  it('CHF5-10 nhiều ô: số là number, nhắc lịch là mảng number giảm dần, trọng số n/100; JSON không có chuỗi số', () => {
    const draft = edit(draftFromConfig(FULL_CONFIG), {
      nguongNoShow: '4',
      thoiDiemNhacLich: ['2', '48'],
      trongSoW1: '0,07',
      trongSoW2: '0,93',
    });
    const { patch, errors } = validateDraft(FULL_CONFIG, draft);
    expect(errors).toEqual({});
    const body = buildUpdateBody(patch, 'Đổi quy tắc');
    expect(body).toEqual({
      lyDo: 'Đổi quy tắc',
      nguongNoShow: 4,
      thoiDiemNhacLich: [48, 2],
      trongSoW1: 0.07,
      trongSoW2: 0.93,
    });
    expect(JSON.stringify(body)).toBe(
      '{"lyDo":"Đổi quy tắc","thoiDiemNhacLich":[48,2],"nguongNoShow":4,"trongSoW1":0.07,"trongSoW2":0.93}',
    );
  });

  it('CHF5-10 không đổi gì ⇒ patch rỗng (nơi gọi không gửi PUT)', () => {
    expect(
      validateDraft(FULL_CONFIG, draftFromConfig(FULL_CONFIG)).patch,
    ).toEqual({});
  });

  it('CHF5-10 describeChanges: "nhãn, trước, sau" theo thứ tự trên màn hình; lần đầu thì trước là "Chưa có"', () => {
    const lines = describeChanges(FULL_CONFIG, {
      trongSoW1: 0.7,
      thoiGianGiuCho: 20,
      thoiDiemNhacLich: [48],
    });
    expect(lines.map((line) => line.key)).toEqual([
      'thoiGianGiuCho',
      'thoiDiemNhacLich',
      'trongSoW1',
    ]);
    expect(lines[0]).toMatchObject({
      before: '15 phút',
      after: '20 phút',
    });
    expect(lines[1]).toMatchObject({
      before: '72, 24, 2 giờ',
      after: '48 giờ',
    });
    expect(lines[2]).toMatchObject({ before: '0,60', after: '0,70' });
    expect(describeChanges(EMPTY_CONFIG, { nguongNoShow: 3 })[0]).toMatchObject(
      { before: 'Chưa có', after: '3 lần' },
    );
  });
});

describe('CHF5-11 định dạng hiển thị: giá trị kèm đơn vị, giờ Việt Nam, tóm tắt lịch sử', () => {
  it.each<[ConfigKey, number | number[] | null, string]>([
    ['thoiGianGiuCho', 15, '15 phút'],
    ['checkInTruocPhut', 30, '30 phút trước giờ hẹn'],
    ['soNgayBaoTruocDoiGioLam', 3, '3 ngày'],
    ['thoiDiemNhacLich', [72, 24, 2], '72, 24, 2 giờ'],
    ['trongSoW1', 0.6, '0,60'],
    ['trongSoW2', 1, '1,00'],
    ['trongSoW2', 0, '0,00'],
    ['trongSoW1', 0.07, '0,07'],
    ['nguongNoShow', null, 'Chưa có'],
    ['thoiDiemNhacLich', null, 'Chưa có'],
  ])('CHF5-11 %s = %j ⇒ %s', (key, value, expected) => {
    expect(formatConfigValue(key, value)).toBe(expected);
  });

  it('CHF5-11 formatWeight làm tròn đúng 2 chữ số', () => {
    expect(formatWeight(0.6)).toBe('0,60');
    expect(formatWeight(0.29)).toBe('0,29');
  });

  it('CHF5-11 thời điểm: ISO UTC sang dd/MM/yyyy HH:mm:ss giờ Việt Nam (UTC+7), qua nửa đêm và đổi ngày', () => {
    expect(formatThoiDiem('2026-11-18T10:15:03.000Z')).toBe(
      '18/11/2026 17:15:03',
    );
    expect(formatThoiDiem('2026-11-18T17:00:00.000Z')).toBe(
      '19/11/2026 00:00:00',
    );
    expect(formatThoiDiem('2026-12-31T16:59:59.000Z')).toBe(
      '31/12/2026 23:59:59',
    );
    expect(formatThoiDiem('2026-12-31T17:00:00.000Z')).toBe(
      '01/01/2027 00:00:00',
    );
    expect(formatThoiDiem('không phải ngày')).toBe('—');
    expect(formatThoiDiem('')).toBe('—');
  });

  it('CHF5-11 khoá lạ (API thêm tham số mới): in khoá thô và giá trị thô, không vỡ', () => {
    expect(labelOfKey('thoiGianGiuCho')).toBe('Thời hạn giữ chỗ');
    expect(labelOfKey('thamSoMoi')).toBe('thamSoMoi');
    expect(labelOfKey('constructor')).toBe('constructor');
    expect(formatChangeValue('thamSoMoi', 5)).toBe('5');
    expect(formatChangeValue('thamSoMoi', [1, 2])).toBe('1, 2');
    expect(formatChangeValue('thamSoMoi', null)).toBe('Chưa có');
    expect(formatChangeValue('nguongNoShow', 3)).toBe('3 lần');
  });

  it('CHF5-11 summarizeChanges: tạo lần đầu, một tham số, ba tham số trở lên, rỗng', () => {
    const first = Array.from({ length: 12 }, (_, index) => ({
      khoa: `k${index}`,
      truoc: null,
      sau: 1,
    }));
    expect(summarizeChanges(first)).toBe('Tạo cấu hình lần đầu (12 tham số)');
    expect(
      summarizeChanges([{ khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 }]),
    ).toBe('1 tham số: Thời hạn giữ chỗ');
    expect(
      summarizeChanges([
        { khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 },
        { khoa: 'nguongNoShow', truoc: 3, sau: 4 },
        { khoa: 'trongSoW1', truoc: 0.6, sau: 0.7 },
      ]),
    ).toBe('3 tham số: Thời hạn giữ chỗ, Ngưỡng no-show khoá đặt lịch, +1');
    expect(summarizeChanges([])).toBe('—');
  });
});
