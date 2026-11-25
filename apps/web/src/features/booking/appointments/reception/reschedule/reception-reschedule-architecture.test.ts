import { describe, expect, it } from 'vitest';
import { strip, violations } from '../../../testing/static-scan';

// reschedule F3, mã ca WDO-14 [đề xuất] ("ca kiến trúc như BWZ-08", PLAN reschedule 5.12 dòng Kiến trúc web): bộ quét TĨNH mã của Lễ tân đổi lịch hộ (thư mục `reschedule/` và `detail/reception-reschedule-*`) với CÙNG
// danh sách luật của trang Bệnh nhân (`testing/static-scan.ts`): không `fetch` ngoài lớp API client, đường dẫn dựng từ `booking-paths`, không `dangerouslySetInnerHTML`, không kho trình duyệt, id không qua `Number`,
// không ghi `console`. Cộng các luật RIÊNG của F3: một nơi gọi mạng và một nơi gửi POST (không `signal`), thân gửi chỉ `khungGioId` và `lyDo`, `SlotPicker` qua `index.ts` của search, và phân tầng (`common/` không
// phụ thuộc thư mục của vai nào; Lễ tân không nhập mã của Bệnh nhân). Phần dùng chung `common/reschedule-*` được quét ở `patient/reschedule/reschedule-architecture.test.ts` (WDH-10).
const SOURCES = import.meta.glob(
  [
    './*.{ts,tsx}',
    '!./*.test.{ts,tsx}',
    '../detail/reception-reschedule-*.{ts,tsx}',
    '!../detail/reception-reschedule-*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

// Mọi file mã trực tiếp của `common/` (không test): để khoá phân tầng
const COMMON = import.meta.glob(
  ['../../common/*.{ts,tsx}', '!../../common/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const importsOf = (source: string) =>
  [...strip(source).matchAll(IMPORT_PATTERN)].map((match) => match[1]);
// Thư mục của một vai: `common/` không được phụ thuộc vào đây
const ROLE_DIRS = /(^|\/)(patient|reception|admin|doctor)\//;

describe('reschedule F3 — kiến trúc web của Lễ tân đổi lịch hộ (WDO-14)', () => {
  it('WDO-14 bộ quét thấy mã thật: hai trang, bộ đọc, hook, chữ, liên kết, nút và thông báo ở chi tiết', () => {
    expect(Object.keys(SOURCES).sort()).toEqual(
      [
        './reception-reschedule-api.ts',
        './reception-reschedule-confirm-page.tsx',
        './reception-reschedule-links.ts',
        './reception-reschedule-page.tsx',
        './reception-reschedule-text.ts',
        './reception-reschedule-types.ts',
        './use-reception-reschedule-preview.ts',
        './use-reception-reschedule-submit.ts',
        '../detail/reception-reschedule-action.tsx',
        '../detail/reception-reschedule-done-notice.tsx',
        '../detail/reception-reschedule-visibility.ts',
      ].sort(),
    );
  });

  it('WDO-14 không fetch ngoài lớp client, không dangerouslySetInnerHTML, không kho trình duyệt, không đường dẫn viết tay, không ép id sang số, không ghi console', () => {
    expect(violations(SOURCES)).toEqual([]);
  });

  it('WDO-14 mọi lời gọi mạng đi qua `request()` của lớp API client duy nhất và chỉ ở MỘT file (`reception-reschedule-api.ts`: preview GET và gửi POST)', () => {
    const callers = Object.entries(SOURCES)
      .filter(([, source]) => /\brequest\s*(<[^>]*>)?\s*\(/.test(strip(source)))
      .map(([file]) => file);
    expect(callers).toEqual(['./reception-reschedule-api.ts']);
    expect(SOURCES['./reception-reschedule-api.ts']).toContain(
      "from '../../../../../shared/api/client'",
    );
  });

  it('WDO-14 chỉ MỘT nơi gửi POST đổi lịch hộ và hàm gửi KHÔNG truyền `signal` (yêu cầu đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ)', () => {
    const posters = Object.entries(SOURCES)
      .filter(([, source]) => /method:\s*'POST'/.test(strip(source)))
      .map(([file]) => file);
    expect(posters).toEqual(['./reception-reschedule-api.ts']);
    const code = strip(SOURCES['./reception-reschedule-api.ts']);
    const submit = code.slice(
      code.indexOf('export async function submitReceptionReschedule'),
    );
    expect(submit).toContain("method: 'POST'");
    expect(submit).not.toMatch(/\bsignal\b/);
    // đối chứng: hàm GET ở TRÊN có `signal` (huỷ được khi rời trang), nên phép cắt ở trên đúng là tách hai hàm
    expect(
      code.slice(
        0,
        code.indexOf('export async function submitReceptionReschedule'),
      ),
    ).toMatch(/\bsignal\b/);
  });

  it('WDO-14 thân gửi CHỈ có `khungGioId` và `lyDo`: không `lyDoYeuCau`, `chiNhanhId`, `benhNhanId` (chi nhánh do máy chủ lấy từ tài khoản)', () => {
    const code = strip(SOURCES['./reception-reschedule-api.ts']);
    expect(code).toContain(
      'json: { khungGioId: input.khungGioId, lyDo: input.lyDo }',
    );
    for (const word of ['lyDoYeuCau', 'chiNhanhId', 'benhNhanId']) {
      expect(code, word).not.toContain(word);
    }
  });

  it('WDO-14 đường dẫn điều hướng lấy từ `shared/routes/booking-paths`', () => {
    for (const file of [
      './reception-reschedule-page.tsx',
      './reception-reschedule-confirm-page.tsx',
      './reception-reschedule-links.ts',
      '../detail/reception-reschedule-action.tsx',
    ]) {
      expect(SOURCES[file], file).toContain('shared/routes/booking-paths');
    }
  });

  it('WDO-14 bộ chọn khung giờ nhập từ cổng `index.ts` của search (không đi sâu vào search)', () => {
    const imports = [
      ...SOURCES['./reception-reschedule-page.tsx'].matchAll(
        /import\s*\{[^}]*\bSlotPicker\b[^}]*\}\s*from\s*'([^']+)'/g,
      ),
    ].map((match) => match[1]);
    expect(imports).toEqual(['../../../../search']);
  });

  it('WDO-14 Lễ tân KHÔNG nhập mã của Bệnh nhân (`patient/`): phần dùng chung đi qua `common/`', () => {
    for (const [file, source] of Object.entries(SOURCES)) {
      const bad = importsOf(source).filter((path) =>
        /(^|\/)patient\//.test(path),
      );
      expect(bad, file).toEqual([]);
    }
  });

  it('WDO-14 phân tầng: không file nào của `common/` nhập thư mục của một vai (`patient/`, `reception/`, `admin/`, `doctor/`)', () => {
    expect(Object.keys(COMMON).length).toBeGreaterThan(40);
    const found: string[] = [];
    for (const [file, source] of Object.entries(COMMON)) {
      for (const path of importsOf(source)) {
        if (ROLE_DIRS.test(path)) found.push(`${file} → ${path}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('WDO-14 phân tầng có tác dụng (đối chứng): bắt nhập `patient/` hay `reception/` trong mã giả, không báo nhầm `common/` và `wizard/`', () => {
    const bad = [
      "import { X } from '../patient/detail/detail-messages';",
      "import { Y } from '../reception/reschedule/a';",
      "const z = await import('../../doctor/x');",
    ];
    for (const line of bad) {
      expect(
        importsOf(line).some((path) => ROLE_DIRS.test(path)),
        line,
      ).toBe(true);
    }
    const good = [
      "import { A } from './action-text';",
      "import { B } from '../../wizard/booking-notice';",
      "// import { C } from '../patient/x';",
    ];
    for (const line of good) {
      expect(
        importsOf(line).some((path) => ROLE_DIRS.test(path)),
        line,
      ).toBe(false);
    }
  });
});
