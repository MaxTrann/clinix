import type { DataSource } from 'typeorm';
import {
  emptyEmailOutboxSummary,
  type EmailOutboxSummary,
} from '../appointments/notifications/email-outbox.service.js';
import { BRANCH_CHANGE_SUBJECTS } from '../appointments/notifications/branch-change-mail.templates.js';
import { EMAIL_MAX_ATTEMPTS } from '../appointments/notifications/notifications.constants.js';
import {
  createOutbox,
  emailOf,
} from '../appointments/testing/notification-world.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import { FakeMailService } from '../mail/testing/fake-mail.service.js';
import {
  BRANCH_CHANGE_EVENTS,
  type BranchChangeEvent,
} from './branch-change-events.js';
import { BranchChangeNotifier } from './branch-change-notifier.js';
import { branchChangeWorld } from './testing/branch-change-fixtures.js';

// Admin C4 — thư của yêu cầu thay đổi chi nhánh đi qua worker hộp thư đi của booking, trên MySQL 8.4 THẬT với `FakeMailService` (không thư thật):
// CN-70 (một bệnh nhân lỗi: thông báo giữ nguyên, ThatBai, người khác vẫn gửi), CN-71 (gửi lại thành DaGui, không gửi trùng), CN-72 (hai worker: chỉ một bên gửi),
// CN-73 (dừng ở ThatBai sau 3 lần), cùng ca: mã có phiên bản được chọn, loại chỉ trong ứng dụng không bị chọn, thiếu yêu cầu ⇒ THIEU_YEU_CAU.
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});
const notifier = new BranchChangeNotifier();
const E = BRANCH_CHANGE_EVENTS;
const AT = new Date('2026-11-02T08:00:00+07:00');
const NOW = new Date('2026-11-02T08:30:00+07:00');
const minutesAfter = (m: number) => new Date(NOW.getTime() + m * 60_000);

type World = Awaited<ReturnType<typeof branchChangeWorld>>;

async function notify(w: World, taiKhoanId: string, event: BranchChangeEvent) {
  return db.transaction((em) =>
    notifier.notify(em, {
      yeuCauId: w.yeuCauId,
      taiKhoanId,
      event,
      noiDung: 'Lịch hẹn bị ảnh hưởng: LH00000001.',
      now: AT,
    }),
  );
}

async function sweep(
  service: ReturnType<typeof createOutbox>['service'],
  now: Date = NOW,
): Promise<EmailOutboxSummary> {
  const summary = emptyEmailOutboxSummary();
  await service.sweep(now, summary);
  return summary;
}

const emails = (): Promise<
  {
    trangThai: string;
    soLanThu: number;
    loiCuoi: string | null;
    daGuiLuc: string | null;
  }[]
> =>
  db.query(
    `SELECT trang_thai AS trangThai, so_lan_thu AS soLanThu, loi_cuoi AS loiCuoi, DATE_FORMAT(da_gui_luc, '%Y-%m-%d %H:%i:%s') AS daGuiLuc
       FROM email_thong_bao ORDER BY email_thong_bao_id`,
  );

describe('worker gửi đúng thư của yêu cầu thay đổi chi nhánh', () => {
  it('bốn loại có thư (kể cả mã `:v2`) được gửi đúng mẫu tới đúng người; quá hạn và rút không bị chọn', async () => {
    const w = await branchChangeWorld(db);
    await notify(w, w.proposerId, { type: E.RESULT });
    await notify(w, w.patientAId, { type: E.AFFECTED, version: 2 });
    await notify(w, w.patientBId, { type: E.RESCHEDULED, version: 1 });
    await notify(w, w.patientBId, { type: E.CANCELLED });
    await notify(w, w.proposerId, { type: E.OVERDUE, version: 1 });
    await notify(w, w.proposerId, { type: E.WITHDRAWN });
    const { mail, service } = createOutbox(db);

    expect(await sweep(service)).toMatchObject({ sent: 4, failed: 0 });

    expect(mail.sent.map((m) => [m.to, m.subject])).toEqual([
      [await emailOf(db, w.proposerId), BRANCH_CHANGE_SUBJECTS.result],
      [await emailOf(db, w.patientAId), BRANCH_CHANGE_SUBJECTS.affected],
      [await emailOf(db, w.patientBId), BRANCH_CHANGE_SUBJECTS.rescheduled],
      [await emailOf(db, w.patientBId), BRANCH_CHANGE_SUBJECTS.cancelled],
    ]);
    expect(mail.sent[1]?.text).toContain('LH00000001');
    expect((await emails()).every((e) => e.trangThai === 'DaGui')).toBe(true);
  });

  it('ca âm: yêu cầu bị xoá khỏi dòng thông báo ⇒ ThatBai với loi_cuoi THIEU_YEU_CAU, không gọi MailService', async () => {
    const w = await branchChangeWorld(db);
    await notify(w, w.patientAId, { type: E.AFFECTED, version: 1 });
    await db.query('UPDATE thong_bao SET yeu_cau_thay_doi_chi_nhanh_id = NULL');
    const { mail, service } = createOutbox(db);

    expect(await sweep(service)).toMatchObject({ sent: 0, failed: 1 });
    expect(mail.attempts).toHaveLength(0);
    expect(await emails()).toEqual([
      expect.objectContaining({
        trangThai: 'ThatBai',
        loiCuoi: 'THIEU_YEU_CAU',
        soLanThu: 1,
      }),
    ]);
  });
});

describe('CN-70 MailService lỗi với một bệnh nhân', () => {
  it('thông báo giữ nguyên; thư đó ThatBai + loi_cuoi + so_lan_thu 1; bệnh nhân khác vẫn DaGui; yêu cầu không đổi', async () => {
    const w = await branchChangeWorld(db);
    await notify(w, w.patientAId, { type: E.AFFECTED, version: 1 });
    await notify(w, w.patientBId, { type: E.AFFECTED, version: 1 });
    const { mail, service } = createOutbox(
      db,
      new FakeMailService().failNextWith('CONNECTION'),
    );

    expect(await sweep(service)).toMatchObject({ sent: 1, failed: 1 });

    expect(await emails()).toEqual([
      expect.objectContaining({
        trangThai: 'ThatBai',
        loiCuoi: 'CONNECTION',
        soLanThu: 1,
        daGuiLuc: null,
      }),
      expect.objectContaining({ trangThai: 'DaGui', soLanThu: 1 }),
    ]);
    expect(mail.sent.map((m) => m.to)).toEqual([
      await emailOf(db, w.patientBId),
    ]);
    const thongBao: { n: number }[] = await db.query(
      'SELECT COUNT(*) AS n FROM thong_bao',
    );
    expect(Number(thongBao[0]?.n)).toBe(2);
    const yeuCau: { trangThai: string }[] = await db.query(
      'SELECT trang_thai AS trangThai FROM yeu_cau_thay_doi_chi_nhanh WHERE yeu_cau_thay_doi_chi_nhanh_id = ?',
      [w.yeuCauId],
    );
    expect(yeuCau[0]?.trangThai).toBe('ChoDuyet');
  });
});

describe('CN-71 gửi lại thư lỗi', () => {
  it('chưa quá nhịp 5 phút thì không thử lại; quá nhịp thì DaGui + da_gui_luc; lượt sau không gửi trùng', async () => {
    const w = await branchChangeWorld(db);
    await notify(w, w.proposerId, { type: E.RESULT });
    const mail = new FakeMailService().failNextWith('TIMEOUT');
    const { service } = createOutbox(db, mail);

    await sweep(service, NOW);
    expect(await sweep(service, minutesAfter(4))).toMatchObject({
      sent: 0,
      failed: 0,
    });
    expect(await sweep(service, minutesAfter(5))).toMatchObject({ sent: 1 });
    expect(await sweep(service, minutesAfter(30))).toMatchObject({
      sent: 0,
      failed: 0,
    });

    expect(mail.attempts).toHaveLength(2);
    expect(await emails()).toEqual([
      expect.objectContaining({
        trangThai: 'DaGui',
        soLanThu: 2,
        loiCuoi: null,
        daGuiLuc: '2026-11-02 08:35:00',
      }),
    ]);
  });
});

describe('CN-72 hai worker cùng chạy', () => {
  it('cùng một lượt song song: mỗi thư chỉ một bên gọi MailService', async () => {
    const w = await branchChangeWorld(db);
    await notify(w, w.patientAId, { type: E.AFFECTED, version: 1 });
    await notify(w, w.patientBId, { type: E.AFFECTED, version: 1 });
    await notify(w, w.proposerId, { type: E.RESULT });
    const first = createOutbox(db);
    const second = createOutbox(db);

    const [a, b] = await Promise.all([
      sweep(first.service),
      sweep(second.service),
    ]);

    expect(a.sent + b.sent).toBe(3);
    expect(first.mail.attempts.length + second.mail.attempts.length).toBe(3);
    expect(
      (await emails()).every(
        (e) => e.trangThai === 'DaGui' && e.soLanThu === 1,
      ),
    ).toBe(true);
  });
});

describe('CN-73 trần số lần thử', () => {
  it(`lỗi ${String(EMAIL_MAX_ATTEMPTS)} lần thì dừng ở ThatBai, worker không chọn nữa`, async () => {
    const w = await branchChangeWorld(db);
    await notify(w, w.patientAId, { type: E.CANCELLED });
    const mail = new FakeMailService().failAllWith('CONNECTION');
    const { service } = createOutbox(db, mail);

    for (let i = 0; i < EMAIL_MAX_ATTEMPTS + 2; i++)
      await sweep(service, minutesAfter(i * 10));

    expect(mail.attempts).toHaveLength(EMAIL_MAX_ATTEMPTS);
    expect(await emails()).toEqual([
      expect.objectContaining({
        trangThai: 'ThatBai',
        soLanThu: EMAIL_MAX_ATTEMPTS,
        loiCuoi: 'CONNECTION',
      }),
    ]);
  });
});
