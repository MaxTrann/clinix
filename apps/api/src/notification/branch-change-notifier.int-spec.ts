import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import { BRANCH_CHANGE_EVENTS } from './branch-change-events.js';
import {
  BranchChangeNotifier,
  INSERT_BRANCH_CHANGE_THONG_BAO_SQL,
  type BranchChangeNotifyInput,
} from './branch-change-notifier.js';
import {
  branchChangeWorld,
  readAll,
} from './testing/branch-change-fixtures.js';

// Admin C4 — BranchChangeNotifier trên MySQL 8.4 THẬT: NTB-01 (idempotent theo UNIQUE), NTB-02 (lỗi khác nổi lên, hoàn tác), NTB-03 (loại chỉ trong ứng dụng không có thư).
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});
const notifier = new BranchChangeNotifier();
const E = BRANCH_CHANGE_EVENTS;
const NOW = new Date('2026-11-02T08:00:00+07:00');

type World = Awaited<ReturnType<typeof branchChangeWorld>>;
const inputOf = (
  w: World,
  over: Partial<BranchChangeNotifyInput> = {},
): BranchChangeNotifyInput => ({
  yeuCauId: w.yeuCauId,
  taiKhoanId: w.proposerId,
  event: { type: E.RESULT },
  noiDung: 'Yêu cầu thay đổi thông tin chi nhánh đã được duyệt.',
  now: NOW,
  ...over,
});

describe('NTB-01 ghi lần hai cùng (yêu cầu, tài khoản, loại) là "đã có", không trùng', () => {
  it('lần đầu Inserted + một dòng thư ChoGui; lần hai AlreadyExists, vẫn đúng một thông báo và một thư', async () => {
    const w = await branchChangeWorld(db);
    const first = await db.transaction((em) => notifier.notify(em, inputOf(w)));
    const second = await db.transaction((em) =>
      notifier.notify(em, inputOf(w)),
    );
    expect(first).toMatchObject({ kind: 'Inserted', emailQueued: true });
    expect(second).toEqual({ kind: 'AlreadyExists' });
    const rows = await readAll(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taiKhoanId: w.proposerId,
      loai: 'KetQuaYeuCauThayDoiChiNhanh',
      yeuCauId: w.yeuCauId,
      trangThaiEmail: 'ChoGui',
    });
  });

  it('"đã có" giữa giao dịch không làm hỏng giao dịch: câu ghi sau đó vẫn commit', async () => {
    const w = await branchChangeWorld(db);
    await db.transaction((em) => notifier.notify(em, inputOf(w)));
    await db.transaction(async (em) => {
      expect((await notifier.notify(em, inputOf(w))).kind).toBe(
        'AlreadyExists',
      );
      await notifier.notify(
        em,
        inputOf(w, {
          taiKhoanId: w.patientAId,
          event: { type: E.AFFECTED, version: 1 },
          noiDung: 'Lịch hẹn của bạn bị ảnh hưởng.',
        }),
      );
    });
    expect((await readAll(db)).map((r) => r.loai)).toEqual([
      'KetQuaYeuCauThayDoiChiNhanh',
      'ThayDoiChiNhanhAnhHuongLichHen:v1',
    ]);
  });

  it('phiên bản mới (:v2) sau khi dời hiệu lực là thông báo MỚI; khác người nhận cũng là dòng riêng', async () => {
    const w = await branchChangeWorld(db);
    const affected = (version: number, taiKhoanId: string) =>
      inputOf(w, {
        taiKhoanId,
        event: { type: E.AFFECTED, version },
        noiDung: 'Lịch hẹn của bạn bị ảnh hưởng.',
      });
    await db.transaction(async (em) => {
      await notifier.notify(em, affected(1, w.patientAId));
      await notifier.notify(em, affected(1, w.patientBId));
      await notifier.notify(em, affected(2, w.patientAId));
    });
    const rows = await readAll(db);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.trangThaiEmail === 'ChoGui')).toBe(true);
  });

  it('nội dung được làm sạch và cắt ≤ 500 ký tự; nội dung rỗng sau khi làm sạch bị từ chối, không ghi gì', async () => {
    const w = await branchChangeWorld(db);
    await db.transaction((em) =>
      notifier.notify(
        em,
        inputOf(w, { noiDung: `Dòng 1\nDòng 2 ${'a'.repeat(600)}` }),
      ),
    );
    const [row] = await readAll(db);
    expect(row?.noiDung.startsWith('Dòng 1 Dòng 2 ')).toBe(true);
    expect(row?.noiDung).toHaveLength(500);

    await expect(
      db.transaction((em) =>
        notifier.notify(
          em,
          inputOf(w, { taiKhoanId: w.patientAId, noiDung: ' \n\t ' }),
        ),
      ),
    ).rejects.toThrow(/rỗng/);
    expect(await readAll(db)).toHaveLength(1);
  });
});

describe('NTB-02 lỗi khác nổi lên và giao dịch của người gọi hoàn tác cả thông báo lẫn thư', () => {
  it('khoá ngoại (tài khoản không tồn tại) ⇒ ném lỗi; thông báo ghi trước đó trong cùng giao dịch cũng mất', async () => {
    const w = await branchChangeWorld(db);
    await expect(
      db.transaction(async (em) => {
        await notifier.notify(em, inputOf(w));
        await notifier.notify(em, inputOf(w, { taiKhoanId: '999999999' }));
      }),
    ).rejects.toMatchObject({ errno: 1452 });
    expect(await readAll(db)).toEqual([]);
    expect(await db.query('SELECT * FROM email_thong_bao')).toEqual([]);
  });

  it('1062 của chỉ mục KHÁC không bị nuốt', async () => {
    const w = await branchChangeWorld(db);
    const otherKey = Object.assign(new Error('dup'), {
      errno: 1062,
      code: 'ER_DUP_ENTRY',
      sqlMessage: "Duplicate entry 'x' for key 'thong_bao.PRIMARY'",
    });
    await expect(
      db.transaction(async (em) => {
        const real = em.query.bind(em);
        // Chỉ câu INSERT thong_bao của notifier bị giả lỗi; mọi câu khác chạy thật
        em.query = (async (sql: string, params?: unknown[]) => {
          if (sql === INSERT_BRANCH_CHANGE_THONG_BAO_SQL) throw otherKey;
          return real(sql, params);
        }) as typeof em.query;
        await notifier.notify(em, inputOf(w));
      }),
    ).rejects.toBe(otherKey);
    expect(await readAll(db)).toEqual([]);
  });
});

describe('NTB-03 loại chỉ trong ứng dụng không có dòng email_thong_bao', () => {
  it('quá hạn (:v1) và rút: thông báo có, thư không; bốn loại còn lại đều có thư ChoGui', async () => {
    const w = await branchChangeWorld(db);
    const results = await db.transaction(async (em) => [
      await notifier.notify(
        em,
        inputOf(w, { event: { type: E.OVERDUE, version: 1 } }),
      ),
      await notifier.notify(em, inputOf(w, { event: { type: E.WITHDRAWN } })),
      await notifier.notify(em, inputOf(w, { event: { type: E.CANCELLED } })),
      await notifier.notify(
        em,
        inputOf(w, { event: { type: E.RESCHEDULED, version: 1 } }),
      ),
    ]);
    expect(results.map((r) => r.kind === 'Inserted' && r.emailQueued)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect((await readAll(db)).map((r) => [r.loai, r.trangThaiEmail])).toEqual([
      ['YeuCauThayDoiChiNhanhQuaHan:v1', null],
      ['RutThayDoiChiNhanh', null],
      ['HuyThayDoiChiNhanh', 'ChoGui'],
      ['DoiHieuLucThayDoiChiNhanh:v1', 'ChoGui'],
    ]);
  });
});
