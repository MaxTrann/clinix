import { readCssSource } from '../../../test/css-source';
import {
  DISPLAY_ORDER,
  PARAMS,
  PARAM_TABS,
  REMINDER_LIMITS,
  isConfigKey,
  tabOf,
  type ParamRule,
} from './system-config-params';
import { CONFIG_KEYS } from './system-config-types';

// admin F5. Mã CHF5-nn là [đề xuất] (TRACKING admin 9A.8 mục 3). Bảng miền ở web là bản SAO của `CONFIG_PARAMS` của API (Q34): web không import được
// từ `apps/api`, nên test đọc file nguồn của API và so từng khoá. Đổi một bên mà quên bên kia thì test đỏ.
// Đọc bằng `node:fs` (trợ giúp `readCssSource` của test, tên nói CSS nhưng chỉ là đọc một file theo đường dẫn tương đối với file test), KHÔNG bằng
// `import.meta.glob(..., { query: '?raw' })`: Vite chặn `?raw` ngoài thư mục `apps/web` ("Denied ID", đã thử 19/11/2026). Docker build của web không có
// `apps/api` nhưng chỉ chạy `tsc` và `vite build`, không chạy test này.
const apiSource = readCssSource(
  import.meta.url,
  '../../../../../api/src/admin/system-config/system-config-params.ts',
);

function ruleText(rule: ParamRule): string {
  return rule.kind === 'int'
    ? `{ kind: 'int', min: ${rule.min}, max: ${rule.max} }`
    : `{ kind: '${rule.kind}' }`;
}

describe('CHF5-01 bảng 12 tham số của web khớp CONFIG_PARAMS của API (đọc từ file nguồn API)', () => {
  it('CHF5-01a đọc được file của API và thấy đủ 12 khoá theo CONFIG_KEYS, cùng thứ tự', () => {
    expect(apiSource.length).toBeGreaterThan(1000);
    const block = /export const CONFIG_KEYS = \[([\s\S]*?)\] as const/.exec(
      apiSource,
    );
    const apiKeys = [...(block?.[1] ?? '').matchAll(/'(\w+)'/g)].map(
      (match) => match[1],
    );
    expect(apiKeys).toHaveLength(12);
    expect(apiKeys).toEqual([...CONFIG_KEYS]);
  });

  it('CHF5-01b mỗi khoá: cùng loại, cùng min/max và cùng cờ bắt buộc lần đầu', () => {
    const entries = [
      ...apiSource.matchAll(
        /^ {2}(\w+): \{\s*column: '[a-z0-9_]+',\s*rule: (\{[^}]*\}),\s*requiredOnCreate: (true|false),\s*\},/gm,
      ),
    ];
    // Đủ 12 mục thì biểu thức chính quy không bỏ sót khoá nào (API đổi cách viết thì ca này đỏ, không im lặng)
    expect(entries).toHaveLength(12);
    for (const [, key, rule, required] of entries) {
      expect(isConfigKey(key ?? ''), key).toBe(true);
      const def = PARAMS[key as keyof typeof PARAMS];
      expect(ruleText(def.rule), key).toBe((rule ?? '').replace(/\s+/g, ' '));
      expect(def.requiredOnCreate, key).toBe(required === 'true');
    }
  });

  it('CHF5-01c giới hạn nhắc lịch (5 mốc, 1 đến 720 giờ) và hai quy tắc của trọng số khớp API', () => {
    expect(apiSource).toContain(
      `export const REMINDER_LIMITS = { maxItems: ${REMINDER_LIMITS.maxItems}, minHours: ${REMINDER_LIMITS.minHours}, maxHours: ${REMINDER_LIMITS.maxHours} };`,
    );
    // Trọng số: tối đa 2 chữ số thập phân và tổng tính bằng phần trăm nguyên (CH-08, M3 của B5)
    expect(apiSource).toContain('Number(value.toFixed(2)) === value');
    expect(apiSource).toContain('toHundredths(w1) + toHundredths(w2) === 100');
  });

  it('CHF5-01d bảy khoá bắt buộc lần đầu đúng như Q35', () => {
    expect(CONFIG_KEYS.filter((key) => PARAMS[key].requiredOnCreate)).toEqual([
      'soLichHenToiDaMoiHoSo',
      'soLanTuDoiLichToiDa',
      'checkInTruocPhut',
      'checkInSauPhut',
      'soNgayBaoTruocDoiGioLam',
      'trongSoW1',
      'trongSoW2',
    ]);
  });
});

describe('CHF5-02 mỗi tham số có nhãn, đơn vị và đúng một thẻ trên màn hình', () => {
  it('CHF5-02 12 khoá, mỗi khoá một thẻ; DISPLAY_ORDER là hoán vị của CONFIG_KEYS; tabOf đúng', () => {
    expect(Object.keys(PARAMS)).toEqual([...CONFIG_KEYS]);
    const placed = PARAM_TABS.flatMap((tab) =>
      tab.groups.flatMap((group) => group.keys),
    );
    expect([...placed].sort()).toEqual([...CONFIG_KEYS].sort());
    expect(new Set(placed).size).toBe(12);
    expect([...DISPLAY_ORDER]).toEqual(placed);
    for (const key of CONFIG_KEYS) {
      expect(PARAMS[key].label.length, key).toBeGreaterThan(0);
      expect(PARAMS[key].key).toBe(key);
    }
    expect(PARAM_TABS.map((tab) => tab.label)).toEqual([
      'Lịch khám & tiếp đón',
      'Danh sách chờ & nhắc lịch',
      'Quy tắc nâng cao',
    ]);
    expect(tabOf('thoiGianGiuCho')).toBe('booking');
    expect(tabOf('thoiDiemNhacLich')).toBe('waitlist');
    expect(tabOf('trongSoW2')).toBe('advanced');
  });

  it('CHF5-02 isConfigKey chỉ nhận khoá của chính bảng (không nhận thuộc tính có sẵn của Object)', () => {
    expect(isConfigKey('nguongNoShow')).toBe(true);
    for (const name of ['constructor', 'toString', '__proto__', 'id', '']) {
      expect(isConfigKey(name), name).toBe(false);
    }
  });
});
