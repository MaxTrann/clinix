import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { NotificationCenterRepository } from '../../notification/center/notification-center.repository.js';
import { newMessageEventCode } from '../chat.constants.js';
import type { ChatActor } from '../core/chat-access.policy.js';
import type { AttachedFile } from '../core/message.repository.js';
import type { SendMessageService } from '../core/send-message.service.js';
import { doctorLabel } from '../rest/chat-view.mapper.js';
import {
  buildChatNotifier,
  buildChatWorld,
  buildReadService,
  buildSendService,
  newSendId,
  userOf,
  type ChatWorld,
} from '../testing/chat-world.js';
import { ChatNotificationRepository } from './chat-notification.repository.js';

// chat B6 — thông báo tin nhắn mới trên MySQL 8.4 THẬT (PLAN chat 5.10, 7.9, 7.10): TBC-01…TBC-06, TBC-09, TBC-10, BCH-03; EXPLAIN ba câu mới.
// Lõi gửi thật với cổng thông báo thật (`buildChatNotifier`), service đọc thật (đánh dấu đọc). TBC-07 ở danh mục (U), TBC-08 ở e2e và notification-link.spec.
let db: DataSource;
let w: ChatWorld;
let core: SendMessageService;
useIntegrationHooks((d) => {
  db = d;
});

beforeEach(async () => {
  w = await buildChatWorld(db);
  core = buildSendService(db, { notifier: buildChatNotifier() });
});

interface NotificationRow {
  taiKhoanId: string;
  loai: string;
  noiDung: string;
  daDoc: boolean;
}

async function notificationsOf(taiKhoanId: string): Promise<NotificationRow[]> {
  const rows = (await db.query(
    `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, loai_su_kien AS loai, noi_dung AS noiDung, trang_thai_doc AS daDoc
       FROM thong_bao WHERE tai_khoan_id = ? ORDER BY thong_bao_id`,
    [taiKhoanId],
  )) as (Omit<NotificationRow, 'daDoc'> & { daDoc: number })[];
  return rows.map((r) => ({ ...r, daDoc: Number(r.daDoc) === 1 }));
}

const count = async (sql: string, params: unknown[] = []) =>
  Number(((await db.query(sql, params)) as { n: string }[])[0]?.n ?? 0);

/** IVC-06: tối đa một thông báo chưa đọc `TinNhanMoi:{id}` mỗi (tài khoản, hội thoại). */
const duplicatedUnread = () =>
  db.query(
    `SELECT tai_khoan_id, loai_su_kien FROM thong_bao
      WHERE trang_thai_doc = 0 AND loai_su_kien LIKE 'TinNhanMoi:%'
      GROUP BY tai_khoan_id, loai_su_kien HAVING COUNT(*) > 1`,
  );

async function send(
  actor: ChatActor,
  target: { hoiThoaiId: string } | { bacSiId: string } | { chiNhanhId: string },
  noiDung: string = 'Tin thử',
  tep: AttachedFile | null = null,
) {
  const outcome = await core.send({
    actor,
    target,
    noiDung,
    maGui: newSendId(),
    tep,
  });
  if (outcome.kind !== 'Sent') throw new Error(`gửi lỗi: ${outcome.kind}`);
  return outcome.tinNhan;
}

const markRead = (actor: ChatActor, hoiThoaiId: string, tinNhanId: string) =>
  buildReadService(db).markRead(userOf(actor), hoiThoaiId, tinNhanId);

const branchOf = (id: string): ChiNhanh => ({ chiNhanhId: id }) as ChiNhanh;

/** Thêm Lễ tân cho chi nhánh A (TBC-04, TBC-06). */
async function moreReceptionists(
  n: number,
  trangThai: 'DangHoatDong' | 'NgungHoatDong' | 'ChoKichHoat' = 'DangHoatDong',
): Promise<ChatActor[]> {
  const fx = new AdminFixtures(db);
  const made: ChatActor[] = [];
  for (let i = 0; i < n; i += 1) {
    // CHECK `chk_tai_khoan_mat_khau`: tài khoản chờ kích hoạt chưa có mật khẩu
    const { account } = await fx.receptionist(branchOf(w.branchA), {
      trangThai,
      ...(trangThai === 'ChoKichHoat' ? { matKhauBam: null } : {}),
    });
    made.push({
      vaiTro: 'LeTan',
      taiKhoanId: account.taiKhoanId,
      chiNhanhId: w.branchA,
    });
  }
  return made;
}

describe('chat B6 — thông báo tin nhắn mới (MySQL thật)', () => {
  it('TBC-01: Bệnh nhân nhắn bác sĩ ⇒ đúng một thông báo `TinNhanMoi:{id}` chưa đọc cho Bác sĩ, câu có tên Bệnh nhân; Bệnh nhân không nhận; không dòng email', async () => {
    const first = await send(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    expect(await notificationsOf(w.doctorA.taiKhoanId)).toEqual([
      {
        taiKhoanId: w.doctorA.taiKhoanId,
        loai: newMessageEventCode(first.hoiThoaiId),
        noiDung: 'Bạn có tin nhắn mới từ bệnh nhân Bệnh nhân chỉ A.',
        daDoc: false,
      },
    ]);
    expect(await notificationsOf(w.patientA.taiKhoanId)).toEqual([]);
    expect(await count('SELECT COUNT(*) AS n FROM email_thong_bao')).toBe(0);
  });

  it('TBC-02: tin thứ hai, thứ ba khi Bác sĩ chưa đọc ⇒ vẫn MỘT dòng; hội thoại khác của cùng Bác sĩ thì dòng riêng (đột biến 15)', async () => {
    const first = await send(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    await send(w.patientA, { hoiThoaiId: first.hoiThoaiId });
    await send(w.patientA, { hoiThoaiId: first.hoiThoaiId });
    expect(await notificationsOf(w.doctorA.taiKhoanId)).toHaveLength(1);
    const other = await send(w.patientB, { bacSiId: w.doctorA.taiKhoanId });
    expect(
      (await notificationsOf(w.doctorA.taiKhoanId)).map((r) => r.loai),
    ).toEqual([
      newMessageEventCode(first.hoiThoaiId),
      newMessageEventCode(other.hoiThoaiId),
    ]);
    expect(await duplicatedUnread()).toEqual([]);
  });

  it('TBC-03: Bác sĩ đọc HẾT rồi Bệnh nhân nhắn tiếp ⇒ dòng cũ đã đọc, thêm một dòng mới chưa đọc (đột biến 17)', async () => {
    const first = await send(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    const second = await send(w.patientA, { hoiThoaiId: first.hoiThoaiId });
    await markRead(w.doctorA, first.hoiThoaiId, second.tinNhanId);
    expect(
      (await notificationsOf(w.doctorA.taiKhoanId)).map((r) => r.daDoc),
    ).toEqual([true]);
    await send(w.patientA, { hoiThoaiId: first.hoiThoaiId });
    expect(
      (await notificationsOf(w.doctorA.taiKhoanId)).map((r) => r.daDoc),
    ).toEqual([true, false]);
  });

  it('TBC-03 (chiều ngược): Bác sĩ trả lời ⇒ Bệnh nhân nhận câu có chức danh bác sĩ; Bệnh nhân đọc hết thì đã đọc; thông báo của Bác sĩ không đổi', async () => {
    const first = await send(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    const reply = await send(w.doctorA, { hoiThoaiId: first.hoiThoaiId });
    expect(await notificationsOf(w.patientA.taiKhoanId)).toEqual([
      {
        taiKhoanId: w.patientA.taiKhoanId,
        loai: newMessageEventCode(first.hoiThoaiId),
        noiDung: `Bạn có tin nhắn mới từ ${doctorLabel('BS', 'Bác sĩ A một')}.`,
        daDoc: false,
      },
    ]);
    await markRead(w.patientA, first.hoiThoaiId, reply.tinNhanId);
    expect(
      (await notificationsOf(w.patientA.taiKhoanId)).map((r) => r.daDoc),
    ).toEqual([true]);
    // Đọc của Bệnh nhân không đụng thông báo của Bác sĩ (chỉ dòng của chính người đọc)
    expect(
      (await notificationsOf(w.doctorA.taiKhoanId)).map((r) => r.daDoc),
    ).toEqual([false]);
  });

  it('TBC-04: hộp thư chung ba Lễ tân ⇒ mỗi Lễ tân một dòng, Lễ tân chi nhánh khác không; Lễ tân trả lời không báo đồng nghiệp; Bệnh nhân nhận MỘT dòng (không tên Lễ tân)', async () => {
    const [second, third] = await moreReceptionists(2);
    const receptionists = [w.receptionistA, second!, third!];
    const first = await send(w.patientA, { chiNhanhId: w.branchA });
    for (const r of receptionists)
      expect(await notificationsOf(r.taiKhoanId)).toEqual([
        {
          taiKhoanId: r.taiKhoanId,
          loai: newMessageEventCode(first.hoiThoaiId),
          noiDung:
            'Bệnh nhân Bệnh nhân chỉ A nhắn tin vào hộp thư chi nhánh Chi nhánh A.',
          daDoc: false,
        },
      ]);
    expect(await notificationsOf(w.receptionistB.taiKhoanId)).toEqual([]);

    // Hai Lễ tân trả lời: đồng nghiệp không có thêm dòng, Bệnh nhân vẫn một dòng
    await send(w.receptionistA, { hoiThoaiId: first.hoiThoaiId });
    await send(second!, { hoiThoaiId: first.hoiThoaiId });
    for (const r of receptionists)
      expect(await notificationsOf(r.taiKhoanId)).toHaveLength(1);
    expect(await notificationsOf(w.patientA.taiKhoanId)).toEqual([
      {
        taiKhoanId: w.patientA.taiKhoanId,
        loai: newMessageEventCode(first.hoiThoaiId),
        noiDung: 'Bạn có tin nhắn mới từ lễ tân chi nhánh Chi nhánh A.',
        daDoc: false,
      },
    ]);

    // Một Lễ tân đọc hết: chỉ dòng của người đó đã đọc
    const last = await send(w.patientA, { hoiThoaiId: first.hoiThoaiId });
    await markRead(third!, first.hoiThoaiId, last.tinNhanId);
    const states = await Promise.all(
      receptionists.map(async (r) =>
        (await notificationsOf(r.taiKhoanId)).map((x) => x.daDoc),
      ),
    );
    expect(states).toEqual([[false], [false], [true]]);
    expect(await duplicatedUnread()).toEqual([]);
  });

  it('TBC-05: nội dung rất dài, tên tệp rất dài, họ tên dài ⇒ thông báo không có nội dung tin, tên tệp, SĐT, email; ≤ 500 (đột biến 16)', async () => {
    const longName = `Phạm ${'Thị Ngọc Bích '.repeat(6)}`.slice(0, 100);
    await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      longName,
      w.patientA.taiKhoanId,
    ]);
    const secret = `Kết quả xét nghiệm riêng tư ${'x'.repeat(1900)}`;
    const fileName = `ket-qua-xet-nghiem-${'rat-dai-'.repeat(20)}.pdf`;
    const first = await send(
      w.patientA,
      { bacSiId: w.doctorA.taiKhoanId },
      secret,
    );
    await send(w.doctorA, { hoiThoaiId: first.hoiThoaiId }, secret);
    await send(w.patientA, { chiNhanhId: w.branchA }, '', {
      khoa: `2026/11/${randomUUID()}.pdf`,
      tenGoc: fileName,
      loai: 'application/pdf',
      dungLuong: 1024,
    });
    const people = (await db.query(
      'SELECT email, so_dien_thoai AS sdt FROM tai_khoan WHERE tai_khoan_id IN (?, ?, ?)',
      [w.patientA.taiKhoanId, w.doctorA.taiKhoanId, w.receptionistA.taiKhoanId],
    )) as { email: string | null; sdt: string | null }[];
    const forbidden = [
      'Kết quả xét nghiệm',
      'xxxxxxxx',
      'ket-qua-xet-nghiem',
      ...people.flatMap((p) => [p.email, p.sdt]).filter((v) => v !== null),
    ];
    const all = (await db.query('SELECT noi_dung AS t FROM thong_bao')) as {
      t: string;
    }[];
    expect(all).toHaveLength(3);
    for (const { t } of all) {
      expect(t.length).toBeLessThanOrEqual(500);
      for (const leaked of forbidden) expect(t, leaked).not.toContain(leaked);
    }
    expect(all.map((r) => r.t)).toContain(
      `Bạn có tin nhắn mới từ bệnh nhân ${longName.trim()}.`,
    );
  });

  it('TBC-06: Lễ tân ngưng hoạt động hay chờ kích hoạt của chi nhánh ⇒ không ghi; Lễ tân đang hoạt động vẫn nhận', async () => {
    const [stopped] = await moreReceptionists(1, 'NgungHoatDong');
    const [pending] = await moreReceptionists(1, 'ChoKichHoat');
    await send(w.patientA, { chiNhanhId: w.branchA });
    expect(await notificationsOf(stopped!.taiKhoanId)).toEqual([]);
    expect(await notificationsOf(pending!.taiKhoanId)).toEqual([]);
    expect(await notificationsOf(w.receptionistA.taiKhoanId)).toHaveLength(1);
  });

  it('TBC-06: Bệnh nhân bị ngưng hoạt động sau khi đã nhắn ⇒ lõi chặn trả lời (LOI-11) và không có thông báo nào cho Bệnh nhân (cả giao dịch hoàn tác)', async () => {
    const first = await send(w.patientA, { chiNhanhId: w.branchA });
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.patientA.taiKhoanId],
    );
    const outcome = await core.send({
      actor: w.receptionistA,
      target: { hoiThoaiId: first.hoiThoaiId },
      noiDung: 'Trả lời',
      maGui: newSendId(),
    });
    expect(outcome.kind).toBe('RecipientInactive');
    expect(await notificationsOf(w.patientA.taiKhoanId)).toEqual([]);
  });

  it('TBC-09: đọc MỘT PHẦN (còn tin chưa đọc sau mốc) ⇒ thông báo vẫn chưa đọc; đọc tới tin cuối mới đã đọc', async () => {
    const first = await send(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    const second = await send(w.patientA, { hoiThoaiId: first.hoiThoaiId });
    await markRead(w.doctorA, first.hoiThoaiId, first.tinNhanId);
    expect(
      (await notificationsOf(w.doctorA.taiKhoanId)).map((r) => r.daDoc),
    ).toEqual([false]);
    // Tin của chính Bác sĩ sau mốc không tính là chưa đọc (cùng công thức chưa đọc)
    const own = await send(w.doctorA, { hoiThoaiId: first.hoiThoaiId });
    await markRead(w.doctorA, first.hoiThoaiId, second.tinNhanId);
    expect(own.tinNhanId > second.tinNhanId).toBe(true);
    expect(
      (await notificationsOf(w.doctorA.taiKhoanId)).map((r) => r.daDoc),
    ).toEqual([true]);
  });

  it('TBC-10: "đánh dấu tất cả đã đọc" của Trung tâm thông báo rồi có tin mới ⇒ ghi dòng mới chưa đọc', async () => {
    const first = await send(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    const center = new NotificationCenterRepository();
    expect(
      await center.markAllBatch(db.manager, w.doctorA.taiKhoanId, 500),
    ).toBe(1);
    await send(w.patientA, { hoiThoaiId: first.hoiThoaiId });
    expect(
      (await notificationsOf(w.doctorA.taiKhoanId)).map((r) => r.daDoc),
    ).toEqual([true, false]);
  });

  it('BCH-03: mọi thao tác chat (mở hai loại hội thoại, trả lời, tệp, đánh dấu đọc) ⇒ không dòng `email_thong_bao`, `nhat_ky_hanh_dong`', async () => {
    const before = await count('SELECT COUNT(*) AS n FROM nhat_ky_hanh_dong');
    const doctorConv = await send(w.patientA, {
      bacSiId: w.doctorA.taiKhoanId,
    });
    const reply = await send(w.doctorA, { hoiThoaiId: doctorConv.hoiThoaiId });
    const inbox = await send(w.patientA, { chiNhanhId: w.branchA }, '', {
      khoa: `2026/11/${randomUUID()}.pdf`,
      tenGoc: 'a.pdf',
      loai: 'application/pdf',
      dungLuong: 10,
    });
    const answer = await send(w.receptionistA, {
      hoiThoaiId: inbox.hoiThoaiId,
    });
    await markRead(w.patientA, doctorConv.hoiThoaiId, reply.tinNhanId);
    await markRead(w.patientA, inbox.hoiThoaiId, answer.tinNhanId);
    await markRead(w.doctorA, doctorConv.hoiThoaiId, doctorConv.tinNhanId);
    expect(await count('SELECT COUNT(*) AS n FROM thong_bao')).toBe(4);
    expect(await count('SELECT COUNT(*) AS n FROM email_thong_bao')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM nhat_ky_hanh_dong')).toBe(
      before,
    );
  });
});

describe('chat B6 — EXPLAIN ba câu mới của thông báo', () => {
  interface ExplainRow {
    table: string | null;
    type: string | null;
    key: string | null;
  }
  it('chèn gộp (một người, Lễ tân chi nhánh) và đánh dấu đọc: `thong_bao` theo `thong_bao_index_25`, `tai_khoan` theo khoá chính, không quét cả bảng', async () => {
    const recorded: { sql: string; params: unknown[] }[] = [];
    const em = {
      query: (sql: string, params: unknown[] = []) => {
        recorded.push({ sql, params });
        return db.query(sql, params);
      },
    } as unknown as EntityManager;
    const repo = new ChatNotificationRepository();
    const n = {
      noiDung: 'x',
      loaiSuKien: newMessageEventCode('1'),
      thoiDiemTao: new Date('2026-11-02T01:00:00.000Z'),
    };
    await repo.notifyOne(em, w.doctorA.taiKhoanId, n);
    await repo.notifyReceptionists(em, w.branchA, n);
    await repo.markRead(em, w.doctorA.taiKhoanId, n.loaiSuKien);
    expect(recorded).toHaveLength(3);
    const plans = await Promise.all(
      recorded.map(
        async ({ sql, params }) =>
          (await db.query(`EXPLAIN ${sql}`, params)) as ExplainRow[],
      ),
    );
    const [one, receptionists, mark] = plans;
    const byTable = (rows: ExplainRow[]) =>
      new Map(rows.map((r) => [r.table, r]));
    // Bảng đọc (bí danh tk, lt, t) không bao giờ quét cả bảng; dòng tên `thong_bao` của câu INSERT là bảng ĐÍCH (không đọc) nên không xét
    for (const plan of [one!, receptionists!])
      for (const row of plan.filter((r) => r.table !== 'thong_bao'))
        expect(row.type, `${row.table}`).not.toBe('ALL');
    expect(byTable(one!).get('tk')).toMatchObject({
      type: 'const',
      key: 'PRIMARY',
    });
    expect(byTable(one!).get('t')).toMatchObject({ key: 'thong_bao_index_25' });
    expect(byTable(receptionists!).get('t')).toMatchObject({
      key: 'thong_bao_index_25',
    });
    expect(byTable(receptionists!).get('tk')).toMatchObject({
      type: 'eq_ref',
      key: 'PRIMARY',
    });
    expect(mark![0]).toMatchObject({ key: 'thong_bao_index_25' });
    expect(mark![0]?.type).not.toBe('ALL');
  });
});
