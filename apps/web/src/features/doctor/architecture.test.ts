import { describe, expect, it } from 'vitest';

// doctor-exam F1, WHT-10 [đề xuất]. Q20 phương án C có hai nửa: `features/booking` import `features/doctor` CHỈ qua `index.ts` (BWZ-08, `features/booking/architecture.test.ts`) và
// `features/doctor` KHÔNG import `features/booking` (nửa này khoá ở đây). Dữ liệu và hàm tải lại đi qua props, không qua import. Đọc mã bằng `import.meta.glob` (không cần `node:fs`); bỏ file test.
const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const ROOT = 'http://web.invalid/features/doctor/';

// Thư mục `features/<tên>` mà một import tương đối của `file` (khoá `./leave/x.ts`) trỏ vào; null nếu không trỏ vào `features/`
function featureOf(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const resolved = new URL(specifier, new URL(file.slice(2), ROOT));
  const [, root, feature] = resolved.pathname.split('/');
  return root === 'features' ? (feature ?? null) : null;
}

describe('doctor-exam F1 — features/doctor không import booking (Q20)', () => {
  it('WHT-10 không file mã nào của features/doctor import features/booking', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(10);

    const violations: string[] = [];
    for (const file of files) {
      for (const match of SOURCES[file].matchAll(IMPORT_PATTERN)) {
        if (featureOf(file, match[1]) === 'booking') {
          violations.push(`${file} → ${match[1]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('WHT-10 bộ quét có tác dụng: nhận ra import booking ở mọi độ sâu, không nhầm `shared/routes/booking-paths` (đối chứng)', () => {
    expect(featureOf('./index.ts', '../booking')).toBe('booking');
    expect(
      featureOf(
        './examination/doctor/x.tsx',
        '../../../booking/appointments/common/status-chip',
      ),
    ).toBe('booking');
    expect(featureOf('./examination/doctor/x.tsx', '../../index')).toBe(
      'doctor',
    );
    expect(
      featureOf('./leave/x.ts', '../../../shared/routes/booking-paths'),
    ).toBeNull();
    expect(featureOf('./leave/x.ts', 'react')).toBeNull();
  });

  it('WHT-10 bộ quét thấy mã thật: có index.ts và examination/ trong danh sách file', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining([
        './index.ts',
        './examination/doctor/complete-action.tsx',
      ]),
    );
  });
});
