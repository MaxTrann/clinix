import { describe, expect, it } from 'vitest';

// search UI PR-B (UIB-08; mã là [đề xuất]). T3 (Trung đồng ý 17/11/2026): `features/search` và `features/booking` KHÔNG import chéo; chỗ dùng chung
// (thanh bước) nằm ở `shared/ui`. BWZ-08 (`features/booking/architecture.test.ts`) chỉ khoá chiều booking đi ra ngoài; test này khoá chiều ngược lại
// cho MỌI file mã của `features/search`, và khoá `shared/` không phụ thuộc `features/` ở hai file thanh bước. Cách đọc mã giống BWZ-08:
// `import.meta.glob` của Vite với `?raw` (không cần `node:fs`), bỏ file test.
const SEARCH_SOURCES = import.meta.glob(
  ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const STEPPER_SOURCES = import.meta.glob(
  ['../../shared/ui/booking-stepper.tsx', '../../shared/ui/wizard-steps.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const ORIGIN = 'http://web.invalid';

// Module `features/<tên>` mà import tương đối `specifier` của file ở `baseUrl` trỏ vào; null nếu không trỏ vào `features/` (shared, thư viện…)
function featureOf(baseUrl: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const [, root, feature] = new URL(specifier, baseUrl).pathname.split('/');
  return root === 'features' && feature !== undefined ? feature : null;
}

// Mọi import của một nhóm file trỏ vào `features/<forbidden>`; `locate` đổi khoá glob thành URL giả của file
function violations(
  sources: Record<string, string>,
  locate: (key: string) => string,
  forbidden: (feature: string) => boolean,
): string[] {
  const found: string[] = [];
  for (const [key, source] of Object.entries(sources)) {
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const feature = featureOf(locate(key), match[1]);
      if (feature !== null && forbidden(feature)) {
        found.push(`${key} → ${match[1]}`);
      }
    }
  }
  return found;
}

const searchUrl = (key: string) => `${ORIGIN}/features/search/${key.slice(2)}`;
const sharedUrl = (key: string) =>
  `${ORIGIN}/shared/ui/${key.split('/').pop()}`;

describe('search UI PR-B — không import chéo search ⇄ booking (UIB-08)', () => {
  it('UIB-08 không file mã nào của features/search import features/booking', () => {
    expect(Object.keys(SEARCH_SOURCES).length).toBeGreaterThan(20);
    expect(
      violations(SEARCH_SOURCES, searchUrl, (feature) => feature === 'booking'),
    ).toEqual([]);
  });

  it('UIB-08 thanh bước ở shared/ui không import features/ nào (shared không phụ thuộc features)', () => {
    expect(Object.keys(STEPPER_SOURCES).sort()).toEqual([
      '../../shared/ui/booking-stepper.tsx',
      '../../shared/ui/wizard-steps.ts',
    ]);
    expect(violations(STEPPER_SOURCES, sharedUrl, () => true)).toEqual([]);
  });

  it('UIB-08 bộ quét có tác dụng: bắt import tĩnh, import() và export … from tới booking (đối chứng)', () => {
    const bad = {
      './a.ts': "import { X } from '../booking/wizard/x';",
      './b.ts': "const m = await import('../booking');",
      './c.ts': "export { Y } from '../booking/y';",
      './d.ts': "import '../booking/side-effect';",
    };
    expect(violations(bad, searchUrl, (f) => f === 'booking')).toHaveLength(4);
  });

  it('UIB-08 bộ quét không báo nhầm: shared, auth, thư viện và import trong chính search đều lành (đối chứng)', () => {
    const good = {
      './services/a.tsx': [
        "import { BookingStepper } from '../../../shared/ui/booking-stepper';",
        "import { useAuth } from '../../auth';",
        "import { Link } from 'react-router';",
        "import { serviceListPath } from '../search-paths';",
      ].join('\n'),
    };
    expect(violations(good, searchUrl, (f) => f === 'booking')).toEqual([]);
    expect(featureOf(`${ORIGIN}/features/search/x.ts`, '../booking')).toBe(
      'booking',
    );
    expect(
      featureOf(`${ORIGIN}/shared/ui/x.tsx`, '../../features/booking/y'),
    ).toBe('booking');
  });

  it('UIB-08 bộ quét thấy mã thật: có dải nhắc đăng nhập và ba trang đặt lịch trong danh sách file', () => {
    expect(Object.keys(SEARCH_SOURCES)).toEqual(
      expect.arrayContaining([
        './guest-login-banner.tsx',
        './services/service-group-page.tsx',
        './services/service-list-page.tsx',
        './doctors/doctor-list-page.tsx',
      ]),
    );
  });

  // search PR-C2 (mã ca SLT-87): dải ngày và lưới khung giờ dùng `bookingInfoPath` từ `shared/routes`, không import `features/booking`
  it('SLT-87 bộ quét thấy thư mục slots/ và bộ đọc khung giờ; không file nào trong đó import features/booking', () => {
    const slotSources = Object.fromEntries(
      Object.entries(SEARCH_SOURCES).filter(
        ([key]) => key.startsWith('./slots/') || key.startsWith('./api/slot-'),
      ),
    );
    expect(Object.keys(slotSources)).toEqual(
      expect.arrayContaining([
        './slots/date-strip.tsx',
        './slots/doctor-slot-grid.tsx',
        './slots/doctor-slot-panel.tsx',
        './slots/slot-cell.tsx',
        './slots/use-doctor-slots.ts',
        './api/slot-readers.ts',
      ]),
    );
    expect(
      violations(slotSources, searchUrl, (feature) => feature === 'booking'),
    ).toEqual([]);
    // Liên kết sang Bước 4 đi qua đường dẫn dùng chung của `shared/routes`
    expect(slotSources['./slots/slot-cell.tsx']).toContain(
      'shared/routes/booking-paths',
    );
  });
});
