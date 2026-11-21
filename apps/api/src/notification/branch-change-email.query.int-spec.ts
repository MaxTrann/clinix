import type { DataSource } from 'typeorm';
import { CLAIM_EMAIL_SQL } from '../appointments/notifications/email-outbox.query.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import {
  readNotificationStatuses,
  skipPendingChangeNotices,
} from './branch-change-email.query.js';
import { BRANCH_CHANGE_EVENTS } from './branch-change-events.js';
import { BranchChangeNotifier } from './branch-change-notifier.js';
import {
  branchChangeWorld,
  readAll,
} from './testing/branch-change-fixtures.js';

// Admin C4 — hai câu về thư của yêu cầu thay đổi chi nhánh trên MySQL 8.4 THẬT: CN-105 (phần C4: dừng thư còn chờ gửi), NTB-05 (đọc trạng thái gửi).
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});
const notifier = new BranchChangeNotifier();
const E = BRANCH_CHANGE_EVENTS;
const NOW = new Date('2026-11-02T08:00:00+07:00');

type World = Awaited<ReturnType<typeof branchChangeWorld>>;

/** Ghi một thông báo rồi đặt thẳng trạng thái thư (giả lập kết quả của worker). Trả `thong_bao_id`. */
async function seed(
  w: World,
  taiKhoanId: string,
  event: Parameters<BranchChangeNotifier['notify']>[1]['event'],
  email?: { trangThai: 'DaGui' | 'ThatBai'; soLanThu: number },
): Promise<string> {
  const result = await db.transaction((em) =>
    notifier.notify(em, {
      yeuCauId: w.yeuCauId,
      taiKhoanId,
      event,
      noiDung: 'Nội dung mẫu.',
      now: NOW,
    }),
  );
  if (result.kind !== 'Inserted') throw new Error('seed: không ghi được');
  if (email?.trangThai === 'DaGui')
    await db.query(
      "UPDATE email_thong_bao SET trang_thai = 'DaGui', so_lan_thu = ?, da_gui_luc = '2026-11-02 08:05:00' WHERE thong_bao_id = ?",
      [email.soLanThu, result.thongBaoId],
    );
  if (email?.trangThai === 'ThatBai')
    await db.query(
      "UPDATE email_thong_bao SET trang_thai = 'ThatBai', so_lan_thu = ?, loi_cuoi = 'SEND_FAILED' WHERE thong_bao_id = ?",
      [email.soLanThu, result.thongBaoId],
    );
  return result.thongBaoId;
}

const emailRow = async (thongBaoId: string) =>
  (
    (await db.query(
      'SELECT email_thong_bao_id AS id, trang_thai AS trangThai, so_lan_thu AS soLanThu FROM email_thong_bao WHERE thong_bao_id = ?',
      [thongBaoId],
    )) as { id: string; trangThai: string; soLanThu: number }[]
  )[0];

describe('CN-105 (phần C4) dừng thư báo thay đổi còn chờ gửi khi hủy hay dời', () => {
  it('ChoGui và ThatBai của thư báo thay đổi ⇒ BoQua; DaGui, thư kết quả của người đề xuất và thư hủy giữ nguyên', async () => {
    const w = await branchChangeWorld(db);
    const choGui = await seed(w, w.patientAId, {
      type: E.AFFECTED,
      version: 1,
    });
    const thatBai = await seed(
      w,
      w.patientBId,
      { type: E.AFFECTED, version: 1 },
      { trangThai: 'ThatBai', soLanThu: 1 },
    );
    const daGui = await seed(
      w,
      w.patientAId,
      { type: E.RESCHEDULED, version: 1 },
      { trangThai: 'DaGui', soLanThu: 1 },
    );
    const ketQua = await seed(w, w.proposerId, { type: E.RESULT });
    const huy = await seed(w, w.patientAId, { type: E.CANCELLED });

    const skipped = await db.transaction((em) =>
      skipPendingChangeNotices(em, w.yeuCauId),
    );

    expect(skipped).toBe(2);
    expect((await emailRow(choGui))?.trangThai).toBe('BoQua');
    expect((await emailRow(thatBai))?.trangThai).toBe('BoQua');
    expect((await emailRow(daGui))?.trangThai).toBe('DaGui');
    expect((await emailRow(ketQua))?.trangThai).toBe('ChoGui');
    expect((await emailRow(huy))?.trangThai).toBe('ChoGui');
  });

  it('sau khi dừng, câu NHẬN VIỆC của worker booking ảnh hưởng 0 dòng (worker không gửi nữa)', async () => {
    const w = await branchChangeWorld(db);
    const id = await seed(w, w.patientAId, { type: E.AFFECTED, version: 1 });
    const before = await emailRow(id);
    await db.transaction((em) => skipPendingChangeNotices(em, w.yeuCauId));
    const claim: { affectedRows: number } = await db.query(CLAIM_EMAIL_SQL, [
      NOW,
      before?.id,
      before?.soLanThu,
    ]);
    expect(claim.affectedRows).toBe(0);
  });

  it('chỉ đụng thư của ĐÚNG yêu cầu; gọi lại lần hai là 0 dòng; hoàn tác giao dịch thì thư vẫn ChoGui', async () => {
    const w = await branchChangeWorld(db);
    const other = await branchChangeWorld(db);
    const mine = await seed(w, w.patientAId, { type: E.AFFECTED, version: 1 });
    const theirs = await seed(other, other.patientAId, {
      type: E.AFFECTED,
      version: 1,
    });

    await expect(
      db.transaction(async (em) => {
        await skipPendingChangeNotices(em, w.yeuCauId);
        throw new Error('người gọi lỗi sau đó');
      }),
    ).rejects.toThrow('người gọi lỗi sau đó');
    expect((await emailRow(mine))?.trangThai).toBe('ChoGui');

    expect(
      await db.transaction((em) => skipPendingChangeNotices(em, w.yeuCauId)),
    ).toBe(1);
    expect(
      await db.transaction((em) => skipPendingChangeNotices(em, w.yeuCauId)),
    ).toBe(0);
    expect((await emailRow(theirs))?.trangThai).toBe('ChoGui');
  });
});

describe('NTB-05 đọc trạng thái gửi của một yêu cầu', () => {
  it('đúng trạng thái theo từng thông báo; loại chỉ trong ứng dụng có trạng thái thư null; không có loi_cuoi', async () => {
    const w = await branchChangeWorld(db);
    const other = await branchChangeWorld(db);
    await seed(
      w,
      w.proposerId,
      { type: E.RESULT },
      { trangThai: 'DaGui', soLanThu: 2 },
    );
    await seed(
      w,
      w.patientAId,
      { type: E.AFFECTED, version: 1 },
      { trangThai: 'ThatBai', soLanThu: 3 },
    );
    await seed(w, w.proposerId, { type: E.OVERDUE, version: 1 });
    await seed(other, other.proposerId, { type: E.RESULT });

    const statuses = await readNotificationStatuses(db.manager, w.yeuCauId);

    expect(statuses).toEqual([
      expect.objectContaining({
        taiKhoanId: w.proposerId,
        loaiSuKien: 'KetQuaYeuCauThayDoiChiNhanh',
        trangThaiEmail: 'DaGui',
        soLanThu: 2,
        daGuiLuc: '2026-11-02 08:05:00',
      }),
      expect.objectContaining({
        taiKhoanId: w.patientAId,
        trangThaiEmail: 'ThatBai',
        soLanThu: 3,
        daGuiLuc: null,
      }),
      expect.objectContaining({
        loaiSuKien: 'YeuCauThayDoiChiNhanhQuaHan:v1',
        trangThaiEmail: null,
        soLanThu: 0,
      }),
    ]);
    for (const s of statuses) expect(Object.keys(s)).not.toContain('loiCuoi');
    expect((await readAll(db)).length).toBe(4);
  });

  it('yêu cầu không có thông báo ⇒ danh sách rỗng', async () => {
    const w = await branchChangeWorld(db);
    expect(await readNotificationStatuses(db.manager, w.yeuCauId)).toEqual([]);
  });
});
