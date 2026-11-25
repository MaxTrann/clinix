import { describe, expect, it } from 'vitest';
import { strip, violations } from '../../../testing/static-scan';

// reschedule F1, mã ca WDH-10 (PLAN reschedule 7.11, "ca kiến trúc như BWZ-08"): bộ quét TĨNH các file mã của trang đổi lịch (thư mục `reschedule/` và mọi `detail/reschedule-*`: nút, banner, thông báo):
// không `fetch` ngoài lớp API client, đường dẫn dựng từ `booking-paths` (không viết tay), không `dangerouslySetInnerHTML`, không kho trình duyệt, id không qua `Number`. reschedule F2 thêm: không ghi
// ra `console` (lý do, mã lịch là dữ liệu cá nhân). Đọc mã bằng `import.meta.glob` của Vite với `?raw` (nếp BWZ-08), bỏ file test, và bỏ chú thích trước khi quét (chú thích có thể nhắc các từ này).
const SOURCES = import.meta.glob(
  [
    './*.{ts,tsx}',
    '!./*.test.{ts,tsx}',
    '../detail/reschedule-*.{ts,tsx}',
    '!../detail/reschedule-*.test.{ts,tsx}',
    // reschedule F3: phần dùng chung đã chuyển lên `appointments/common/`
    '../../common/reschedule-*.{ts,tsx}',
    '!../../common/reschedule-*.test.{ts,tsx}',
    '../../common/current-appointment-card.tsx',
    '../../common/use-reschedule-submit.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('reschedule F1 — kiến trúc web của trang đổi lịch (WDH-10)', () => {
  it('WDH-10 bộ quét thấy mã thật: trang, bộ đọc, hook, mã lỗi, màn xác nhận và nút ở chi tiết', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining([
        './reschedule-page.tsx',
        './reschedule-confirm-page.tsx',
        './reschedule-preview-api.ts',
        './use-reschedule-preview.ts',
        '../../common/reschedule-errors.ts',
        '../../common/reschedule-text.ts',
        '../../common/current-appointment-card.tsx',
        '../detail/reschedule-section.tsx',
        // reschedule F2
        './reschedule-submit-api.ts',
        './use-submit-reschedule.ts',
        '../../common/reschedule-failure.ts',
        '../../common/reschedule-reason-rules.ts',
        '../../common/reschedule-reason-field.tsx',
        '../../common/reschedule-confirm-form.tsx',
        '../../common/reschedule-notice-state.ts',
        // reschedule F3: phần cắt ra để Lễ tân đổi hộ dùng chung
        '../../common/reschedule-payload.ts',
        '../../common/reschedule-views.tsx',
        '../../common/use-reschedule-submit.ts',
        './reschedule-links.ts',
        '../detail/reschedule-request-banner.tsx',
        '../detail/reschedule-result-notice.tsx',
        '../detail/reschedule-alive.ts',
      ]),
    );
  });

  it('WDH-10 không fetch ngoài lớp client, không dangerouslySetInnerHTML, không kho trình duyệt, không đường dẫn viết tay, không ép id sang số', () => {
    expect(violations(SOURCES)).toEqual([]);
  });

  it('WDH-10 mọi lời gọi mạng đi qua `request()` của lớp API client duy nhất, và chỉ ở hai bộ đọc: preview (GET) và gửi (POST)', () => {
    const callers = Object.entries(SOURCES)
      .filter(([, source]) => /\brequest\s*(<[^>]*>)?\s*\(/.test(strip(source)))
      .map(([file]) => file)
      .sort();
    expect(callers).toEqual([
      './reschedule-preview-api.ts',
      './reschedule-submit-api.ts',
    ]);
    for (const file of callers) {
      expect(SOURCES[file]).toContain(
        "from '../../../../../shared/api/client'",
      );
    }
  });

  it('WDH-10 chỉ MỘT nơi gửi POST đổi lịch (`reschedule-submit-api.ts`) và nó không truyền `signal` (nếp hộp huỷ: yêu cầu đã gửi thì máy chủ vẫn xử lý)', () => {
    const posters = Object.entries(SOURCES)
      .filter(([, source]) => /method:\s*'POST'/.test(strip(source)))
      .map(([file]) => file);
    expect(posters).toEqual(['./reschedule-submit-api.ts']);
    expect(strip(SOURCES['./reschedule-submit-api.ts'])).not.toMatch(
      /\bsignal\b/,
    );
  });

  it('WDH-10 đường dẫn điều hướng lấy từ `shared/routes/booking-paths`', () => {
    for (const file of [
      './reschedule-page.tsx',
      './reschedule-confirm-page.tsx',
      '../detail/reschedule-section.tsx',
    ]) {
      expect(SOURCES[file]).toContain('shared/routes/booking-paths');
    }
  });

  it('WDH-10 bộ chọn khung giờ nhập từ cổng `index.ts` của search (không đi sâu vào search)', () => {
    const imports = [
      ...SOURCES['./reschedule-page.tsx'].matchAll(
        /import\s*\{[^}]*\bSlotPicker\b[^}]*\}\s*from\s*'([^']+)'/g,
      ),
    ].map((match) => match[1]);
    expect(imports).toEqual(['../../../../search']);
  });

  it('WDH-10 bộ quét có tác dụng (đối chứng): bắt từng loại vi phạm trong mã giả', () => {
    const bad = {
      './a.ts': 'const r = await fetch("/api/x");',
      './b.tsx': '<div dangerouslySetInnerHTML={{ __html: x }} />',
      './c.ts': "localStorage.setItem('k', v);",
      './d.ts': "const to = '/benh-nhan/lich-hen-cua-toi';",
      './e.ts': 'const id = Number(slot.khungGioId);',
      './f.ts': 'const id = parseInt(slot.khungGioId, 10);',
      './g.ts': 'document.cookie = "a=b";',
      './h.ts': 'el.innerHTML = x;',
      './i.ts': 'const x = axios.get("/api");',
      './j.ts': 'console.log(lyDo);',
      './k.ts': 'console.error(maLichHen)',
    };
    expect(violations(bad)).toHaveLength(Object.keys(bad).length);
  });

  it('WDH-10 bộ quét không báo nhầm (đối chứng): chú thích nhắc các từ này và `request(` hợp lệ đều lành', () => {
    const good = {
      './a.ts': [
        '// không fetch(), không Number(id), không localStorage',
        '/* dangerouslySetInnerHTML là cấm */',
        'const to = patientAppointmentDetailPath(ma);',
        "const out = await request<unknown>('patient/x', { query });",
        'const url = "http://web.invalid/x";',
      ].join('\n'),
    };
    expect(violations(good)).toEqual([]);
  });
});
