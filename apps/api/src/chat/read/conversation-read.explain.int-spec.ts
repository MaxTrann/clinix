import type { DataSource, EntityManager } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { MessageRepository } from '../core/message.repository.js';
import { ChatActorResolver } from './chat-actor.resolver.js';
import { ConversationReadRepository } from './conversation-read.repository.js';
import { ConversationReadService } from './conversation-read.service.js';
import { ReceptionScopeRepository } from '../../rbac/reception-scope.repository.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import {
  buildChatWorld,
  buildSendService,
  insertMessages,
  openConversation,
  userOf,
  type ChatWorld,
  buildChatNotifier,
} from '../testing/chat-world.js';

// chat B2 — EXPLAIN các câu đọc MỚI (PLAN chat 5.15 "EXPLAIN cho câu SQL mới"; tiêu chí X1 M1 đến M3, đặt TRƯỚC ở PLAN, không đổi):
//  - M1, M2: danh sách và số đếm của ba vai trò (mọi bộ lọc, tìm) KHÔNG quét toàn bảng `tin_nhan` (không dòng `type = ALL` trên bí danh của `tin_nhan`).
//  - M3: tin theo con trỏ (mới nhất, `truoc`, `sau`) ở hội thoại 20.000 tin dùng chỉ mục `tin_nhan_index_28 (hoi_thoai_id, tin_nhan_id)`, không `filesort`.
// Câu EXPLAIN là ĐÚNG câu và tham số mà repository gửi đi (ghi lại qua EntityManager bọc), không chép tay. Số đo thời gian là việc của X1 (TRACKING mục 6), không đo ở đây.
// Dữ liệu: khoảng 26.000 tin, hộp thư chi nhánh A 2.000 hội thoại; `ANALYZE TABLE` trước khi EXPLAIN để optimizer có thống kê (bảng nhỏ thì optimizer hay chọn quét).
let db: DataSource;
let w: ChatWorld;
useIntegrationHooks((d) => {
  db = d;
});

interface Recorded {
  sql: string;
  params: unknown[];
}
interface ExplainRow {
  table: string | null;
  type: string | null;
  key: string | null;
  Extra: string | null;
}

/** Service đọc chạy trên DB thật nhưng ghi lại mọi câu SQL nó gửi. */
function recordingReader(recorded: Recorded[]): ConversationReadService {
  const em = {
    query: (sql: string, params: unknown[] = []) => {
      recorded.push({ sql, params });
      return db.query(sql, params);
    },
  } as unknown as EntityManager;
  return new ConversationReadService(
    { manager: em } as unknown as DataSource,
    new ConversationReadRepository(),
    new ChatActorResolver(
      new ReceptionScopeService(new ReceptionScopeRepository(db)),
    ),
    new MessageRepository(),
    buildChatNotifier(),
  );
}
const explain = async ({ sql, params }: Recorded) =>
  (await db.query(`EXPLAIN ${sql}`, params)) as ExplainRow[];
// Bí danh của `tin_nhan` trong các câu đọc: t (tin cuối, trang tin), u (chưa đọc)
const MESSAGE_ALIASES = new Set(['t', 'u']);

let bigConversation: string;
let bigIds: string[];

beforeEach(async () => {
  w = await buildChatWorld(db);
  const sender = buildSendService(db);
  // Một hội thoại bác sĩ 20.000 tin (M3), xen với các hội thoại khác để id không liên tục
  ({ hoiThoaiId: bigConversation } = await openConversation(
    sender,
    w.patientA,
    { bacSiId: w.doctorA.taiKhoanId },
  ));
  bigIds = await insertMessages(
    db,
    bigConversation,
    w.doctorA.taiKhoanId,
    20_000,
  );
  await openConversation(sender, w.patientB, { bacSiId: w.doctorA.taiKhoanId });
  await openConversation(sender, w.patientA, { chiNhanhId: w.branchA });
  // 2.000 hộp thư chung chi nhánh A, mỗi hội thoại 3 tin (chèn thẳng: chỉ để có khối lượng, không xét bất biến một hội thoại mỗi cặp)
  await db.query('SET SESSION cte_max_recursion_depth = 10000');
  await db.query(
    `INSERT INTO hoi_thoai (loai, chi_nhanh_id, nguoi_tao_id, thoi_diem_tao)
     WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 2000)
     SELECT 'BenhNhan_LeTan', ?, ?, '2026-11-02 08:00:00' FROM seq`,
    [w.branchA, w.patientB.taiKhoanId],
  );
  for (let i = 0; i < 3; i += 1)
    await db.query(
      `INSERT INTO tin_nhan (hoi_thoai_id, nguoi_gui_id, ma_gui, noi_dung, thoi_diem_gui)
       SELECT h.hoi_thoai_id, h.nguoi_tao_id, NULL, 'Tin thử', '2026-11-02 08:00:00'
         FROM hoi_thoai h WHERE h.chi_nhanh_id = ? AND NOT EXISTS (SELECT 1 FROM tin_nhan x WHERE x.hoi_thoai_id = h.hoi_thoai_id AND x.nguoi_gui_id <> h.nguoi_tao_id)`,
      [w.branchA],
    );
  for (const table of ['hoi_thoai', 'tai_khoan_hoi_thoai', 'tin_nhan'])
    await db.query(`ANALYZE TABLE ${table}`);
}, 180_000);

describe('chat B2 — EXPLAIN (X1 M1 đến M3)', () => {
  it('M1, M2: danh sách (tất cả, chưa đọc, tìm, trang sau) và số đếm của Bệnh nhân, Bác sĩ, Lễ tân không quét toàn bảng tin_nhan', async () => {
    const recorded: Recorded[] = [];
    const reader = recordingReader(recorded);
    const cases = [
      {
        actor: w.patientA,
        queries: [{}, { loc: 'chua-doc' as const }, { loc: 'bac-si' as const }],
      },
      {
        actor: w.doctorA,
        queries: [{}, { loc: 'chua-doc' as const }, { q: 'Bệnh nhân' }],
      },
      {
        actor: w.receptionistA,
        queries: [
          {},
          { loc: 'chua-doc' as const },
          { q: 'Bệnh nhân' },
          { q: '0900000' },
        ],
      },
    ];
    for (const { actor, queries } of cases) {
      for (const query of queries) {
        const first = await reader.list(userOf(actor), {
          loc: 'tat-ca',
          limit: 20,
          ...query,
        });
        if (first.truocTiepTheo !== null)
          await reader.list(userOf(actor), {
            loc: 'tat-ca',
            limit: 20,
            ...query,
            truoc: first.truocTiepTheo,
          });
      }
      await reader.unreadCount(userOf(actor));
    }
    expect(recorded.length).toBeGreaterThan(20);
    for (const statement of recorded) {
      const plan = await explain(statement);
      const scans = plan.filter(
        (row) =>
          row.table !== null &&
          MESSAGE_ALIASES.has(row.table) &&
          row.type === 'ALL',
      );
      expect(scans, statement.sql).toEqual([]);
      // Đọc `tin_nhan` chỉ qua chỉ mục (hội thoại, tin) hay khoá chính
      for (const row of plan.filter(
        (r) => r.table !== null && MESSAGE_ALIASES.has(r.table),
      ))
        expect(['tin_nhan_index_28', 'PRIMARY'], statement.sql).toContain(
          row.key,
        );
    }
  });

  it('M3: tin mới nhất, `truoc`, `sau` ở hội thoại 20.000 tin dùng tin_nhan_index_28, không filesort; kết quả đúng thứ tự', async () => {
    const recorded: Recorded[] = [];
    const reader = recordingReader(recorded);
    const middle = bigIds[10_000] ?? '';
    const user = userOf(w.patientA);
    const newest = await reader.messages(user, bigConversation, { limit: 30 });
    const before = await reader.messages(user, bigConversation, {
      truoc: middle,
      limit: 30,
    });
    const after = await reader.messages(user, bigConversation, {
      sau: middle,
      limit: 30,
    });
    expect(newest.items.map((m) => m.id)).toEqual(bigIds.slice(-30));
    expect(before.items.map((m) => m.id)).toEqual(bigIds.slice(9_970, 10_000));
    expect(after.items.map((m) => m.id)).toEqual(bigIds.slice(10_001, 10_031));

    const pages = recorded.filter((r) =>
      r.sql.includes('FORCE INDEX (tin_nhan_index_28)'),
    );
    expect(pages).toHaveLength(3);
    for (const statement of pages) {
      const plan = await explain(statement);
      const messageRow = plan.find((r) => r.table === 't');
      expect(messageRow?.key, statement.sql).toBe('tin_nhan_index_28');
      expect(messageRow?.type).not.toBe('ALL');
      for (const row of plan)
        expect(row.Extra ?? '', statement.sql).not.toContain('filesort');
    }
  });
});
