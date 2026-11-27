import { describe, expect, it } from 'vitest';

// chat F1 — ranh giới module (PLAN chat 5.13 "Kiến trúc", 5.11): `features/chat` chỉ import `shared/` và `auth` (qua `index.ts`); `features/patient`, `features/doctor`,
// `features/admin` không import `features/chat` (số hội thoại chưa đọc đi qua mục menu do router điền). Mã chạy không gọi `fetch` ngoài lớp client,
// không `dangerouslySetInnerHTML`, không kho trình duyệt cho nội dung (WCH-17 là của F3; F1 khoá sớm). Nếp `features/notification/architecture.test.ts`.
const CHAT = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const CONSUMERS = {
  patient: import.meta.glob(
    ['../patient/**/*.{ts,tsx}', '!../patient/**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>,
  doctor: import.meta.glob(
    ['../doctor/**/*.{ts,tsx}', '!../doctor/**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>,
  admin: import.meta.glob(
    ['../admin/**/*.{ts,tsx}', '!../admin/**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>,
};

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const ROOT = 'http://web.invalid/features/chat/';

/** Feature mà import tương đối của `file` trỏ vào, kèm phần đường dẫn còn lại; `null` nếu không vào `features/`. */
function featureTarget(
  file: string,
  specifier: string,
): { feature: string; rest: string[] } | null {
  if (!specifier.startsWith('.')) return null;
  const resolved = new URL(specifier, new URL(file, ROOT));
  const [, root, feature, ...rest] = resolved.pathname.split('/');
  if (root !== 'features' || feature === undefined) return null;
  return { feature, rest: rest.filter(Boolean) };
}

const CHAT_MAY_IMPORT: readonly string[] = ['auth'];

function chatAllowed(target: ReturnType<typeof featureTarget>): boolean {
  if (target === null || target.feature === 'chat') return true;
  return CHAT_MAY_IMPORT.includes(target.feature) && target.rest.length === 0;
}

const consumerAllowed = (target: ReturnType<typeof featureTarget>) =>
  target === null || target.feature !== 'chat';

function violations(
  sources: Record<string, string>,
  allowed: (target: ReturnType<typeof featureTarget>) => boolean,
) {
  const found: string[] = [];
  for (const [file, source] of Object.entries(sources))
    for (const match of source.matchAll(IMPORT_PATTERN))
      if (!allowed(featureTarget(file, match[1] ?? '')))
        found.push(`${file} → ${match[1]}`);
  return found;
}

describe('chat F1 — ranh giới module', () => {
  it('chat chỉ import shared/ và auth qua index.ts; patient, doctor, admin không import features/chat', () => {
    expect(Object.keys(CHAT).length).toBeGreaterThan(4);
    expect(violations(CHAT, chatAllowed)).toEqual([]);
    for (const [name, sources] of Object.entries(CONSUMERS)) {
      expect(Object.keys(sources).length, name).toBeGreaterThan(5);
      expect(violations(sources, consumerAllowed), name).toEqual([]);
    }
  });

  it('luật nhận đúng và cấm đúng (đối chứng)', () => {
    const fromChat = (spec: string) =>
      chatAllowed(featureTarget('./api/x.ts', spec));
    expect(fromChat('../../../shared/api/client')).toBe(true);
    expect(fromChat('./chat-types')).toBe(true);
    expect(fromChat('../../auth')).toBe(true);
    expect(fromChat('../../auth/auth-store')).toBe(false);
    expect(fromChat('../../notification')).toBe(false);
    expect(fromChat('../../search')).toBe(false);
    const fromPatient = (spec: string) =>
      consumerAllowed(featureTarget('../patient/shell/x.tsx', spec));
    expect(fromPatient('../../chat')).toBe(false);
    expect(fromPatient('../../../shared/ui/role-shell')).toBe(true);
  });

  it('không `fetch` ngoài lớp client, không `dangerouslySetInnerHTML`, không kho trình duyệt, không viết cứng đường dẫn trang theo vai trò', () => {
    for (const [file, source] of Object.entries(CHAT)) {
      expect(source, file).not.toMatch(/(?<![\w.])fetch\s*\(/);
      expect(source, file).not.toMatch(
        /dangerouslySetInnerHTML\s*=|\.innerHTML\b/,
      );
      expect(source, file).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
      expect(source, file).not.toMatch(
        /['`]\/(benh-nhan|le-tan|bac-si-portal|admin)\//,
      );
    }
  });

  it('chat F2: chỉ `features/chat/realtime/` import `socket.io-client` (một nơi mở socket, PLAN 5.13); không module nào khác của web import nó', () => {
    const ALL = import.meta.glob(
      ['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}', '!../../test/**'],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>;
    const users = Object.entries(ALL)
      .filter(([, source]) => /from\s*['"]socket\.io-client['"]/.test(source))
      .map(([file]) => file);
    expect(users).toEqual(['./realtime/chat-connection.ts']);
  });
});
