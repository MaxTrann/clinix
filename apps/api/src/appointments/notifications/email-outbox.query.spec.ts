import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { isLockingStatement } from '../testing/query-spy.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import {
  CLAIM_EMAIL_SQL,
  MARK_FAILED_SQL,
  MARK_SENT_SQL,
  READ_EMAIL_PAYLOAD_SQL,
  RELEASE_CLAIM_SQL,
  SELECT_DUE_EMAILS_SQL,
  claimEmail,
  markFailed,
  markSent,
  releaseClaim,
  selectDueEmails,
  type DueEmail,
} from './email-outbox.query.js';
import {
  EMAIL_MAX_ATTEMPTS,
  EMAIL_RETRY_GAP_MINUTES,
} from './notifications.constants.js';

// Task B15 — câu SQL của hộp thư đi (PLAN booking 5.12; TRACKING 3.37 B15-H): chỉ thư của booking, nhận việc có điều kiện, kết quả chỉ ghi khi còn đúng lần nhận việc của mình, không khoá nào giữ lâu. OBX-01 (chọn lô), OBX-06 (chỉ bốn
// loại của booking), OBX-07 (điều kiện nhận việc; hành vi đồng thời ở int-spec). Đơn vị, không DB.
const DUE: DueEmail = {
  id: '7',
  thongBaoId: '70',
  trangThai: 'ThatBai',
  soLanThu: 1,
  lanThuCuoiLuc: '2026-11-02 07:50:00',
  loiCuoi: 'CONNECTION',
};
const NOW = new Date('2026-11-02T08:00:00+07:00');

describe('OBX-06 câu chọn lô: chỉ thư của booking, đúng điều kiện trạng thái, lần thử và nhịp', () => {
  it('JOIN thong_bao và lọc đúng BỐN loại sự kiện của booking (hàng của admin trong cùng bảng không bị chọn)', async () => {
    const em = new ScriptedEntityManager(() => []);
    await selectDueEmails(em.em, { now: NOW, afterId: '0', limit: 100 });
    const { sql, params } = em.queries[0]!;
    expect(sql).toBe(SELECT_DUE_EMAILS_SQL);
    expect(sql).toMatch(
      /JOIN thong_bao t ON t\.thong_bao_id = e\.thong_bao_id/,
    );
    expect(sql).toMatch(/t\.loai_su_kien IN \(\?, \?, \?, \?\)/);
    const events = Object.values(BOOKING_NOTIFICATION_EVENTS);
    expect(events).toHaveLength(4);
    expect(params.filter((p) => events.includes(p as never))).toEqual(events);
  });

  it('tham số: trần lần thử, mốc "đã quá nhịp" = now trừ 5 phút, bốn loại, con trỏ, cỡ lô — đúng thứ tự', async () => {
    const em = new ScriptedEntityManager(() => []);
    await selectDueEmails(em.em, { now: NOW, afterId: '41', limit: 100 });
    const params = em.queries[0]!.params;
    expect(params[0]).toBe(EMAIL_MAX_ATTEMPTS);
    expect((params[1] as Date).getTime()).toBe(
      NOW.getTime() - EMAIL_RETRY_GAP_MINUTES * 60_000,
    );
    expect(params.slice(2, 6)).toEqual(
      Object.values(BOOKING_NOTIFICATION_EVENTS),
    );
    expect(params.slice(6)).toEqual(['41', 100]);
  });

  it('chỉ ChoGui và ThatBai (không DaGui, không BoQua); chưa thử hoặc đã quá nhịp; sắp theo khoá chính', () => {
    expect(SELECT_DUE_EMAILS_SQL).toContain(
      "e.trang_thai IN ('ChoGui', 'ThatBai')",
    );
    expect(SELECT_DUE_EMAILS_SQL).not.toMatch(/DaGui|BoQua/);
    expect(SELECT_DUE_EMAILS_SQL).toContain('e.so_lan_thu < ?');
    expect(SELECT_DUE_EMAILS_SQL).toContain(
      '(e.lan_thu_cuoi_luc IS NULL OR e.lan_thu_cuoi_luc <= ?)',
    );
    expect(SELECT_DUE_EMAILS_SQL).toContain('ORDER BY e.email_thong_bao_id');
  });

  it('chỉ ĐỌC và không khoá; số lần thử được đổi từ chuỗi sang số', async () => {
    expect(isLockingStatement(SELECT_DUE_EMAILS_SQL)).toBe(false);
    expect(SELECT_DUE_EMAILS_SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    const em = new ScriptedEntityManager(() => [{ ...DUE, soLanThu: '2' }]);
    const rows = await selectDueEmails(em.em, {
      now: NOW,
      afterId: '0',
      limit: 1,
    });
    expect(rows[0]?.soLanThu).toBe(2);
  });
});

describe('OBX-07 nhận việc có điều kiện: đúng MỘT bên thắng; kết quả chỉ ghi khi còn đúng lần nhận việc của mình', () => {
  const answer = (affectedRows: number) =>
    new ScriptedEntityManager(() => ({ affectedRows }));

  it('nhận việc: tăng so_lan_thu và đặt lan_thu_cuoi_luc CÓ ĐIỀU KIỆN số lần đã đọc; true chỉ khi đúng một hàng đổi', async () => {
    expect(CLAIM_EMAIL_SQL).toContain('so_lan_thu = so_lan_thu + 1');
    expect(CLAIM_EMAIL_SQL).toContain("trang_thai IN ('ChoGui', 'ThatBai')");
    expect(CLAIM_EMAIL_SQL).toMatch(/AND so_lan_thu = \?$/);
    const won = answer(1);
    expect(await claimEmail(won.em, DUE, NOW)).toBe(true);
    expect(won.queries[0]).toEqual({
      sql: CLAIM_EMAIL_SQL,
      params: [NOW, '7', 1],
    });
    expect(await claimEmail(answer(0).em, DUE, NOW)).toBe(false);
  });

  it.each([
    ['DaGui', MARK_SENT_SQL],
    ['ThatBai', MARK_FAILED_SQL],
  ])(
    'ghi %s: chỉ khi so_lan_thu còn bằng số đã đọc cộng 1 (lần nhận việc CỦA MÌNH)',
    (_name, sql) => {
      expect(sql).toMatch(/AND so_lan_thu = \?$/);
      expect(sql).toContain("trang_thai IN ('ChoGui', 'ThatBai')");
    },
  );

  it('markSent và markFailed truyền số đã đọc cộng 1; markFailed cắt loi_cuoi ≤ 500 và đặt da_gui_luc NULL (CHECK)', async () => {
    const sent = answer(1);
    await markSent(sent.em, DUE, NOW);
    expect(sent.queries[0]).toEqual({
      sql: MARK_SENT_SQL,
      params: [NOW, '7', 2],
    });
    expect(MARK_SENT_SQL).toContain("trang_thai = 'DaGui'");
    expect(MARK_SENT_SQL).toContain('loi_cuoi = NULL');
    const failed = answer(1);
    await markFailed(failed.em, DUE, 'x'.repeat(900));
    expect((failed.queries[0]!.params[0] as string).length).toBe(500);
    expect(failed.queries[0]!.params.slice(1)).toEqual(['7', 2]);
    expect(MARK_FAILED_SQL).toContain("trang_thai = 'ThatBai'");
    expect(MARK_FAILED_SQL).toContain('da_gui_luc = NULL');
  });

  it('trả lại hàng (chưa cấu hình SMTP): đặt về ĐÚNG giá trị cũ, chỉ khi còn là lần nhận việc của mình', async () => {
    const released = answer(1);
    expect(await releaseClaim(released.em, DUE)).toBe(true);
    expect(released.queries[0]).toEqual({
      sql: RELEASE_CLAIM_SQL,
      params: [1, '2026-11-02 07:50:00', 'ThatBai', 'CONNECTION', '7', 2],
    });
    expect(await releaseClaim(answer(0).em, DUE)).toBe(false);
  });

  it('mọi câu ghi đều theo khoá chính của MỘT hàng (không UPDATE hàng loạt) và tự xác nhận (không FOR UPDATE)', () => {
    for (const sql of [
      CLAIM_EMAIL_SQL,
      MARK_SENT_SQL,
      MARK_FAILED_SQL,
      RELEASE_CLAIM_SQL,
    ]) {
      expect(sql).toContain('WHERE email_thong_bao_id = ?');
      expect(isLockingStatement(sql)).toBe(false);
    }
  });
});

describe('OBX-02 câu đọc người nhận: tài khoản của dòng thong_bao, không đọc dữ liệu thừa', () => {
  it('chỉ email, họ tên của người nhận cùng chữ thông báo; không SĐT, mật khẩu, lý do khám', () => {
    expect(READ_EMAIL_PAYLOAD_SQL).toContain(
      'JOIN tai_khoan tk ON tk.tai_khoan_id = t.tai_khoan_id',
    );
    expect(READ_EMAIL_PAYLOAD_SQL).not.toMatch(
      /so_dien_thoai|mat_khau|ly_do_kham|ly_do_huy/,
    );
    expect(isLockingStatement(READ_EMAIL_PAYLOAD_SQL)).toBe(false);
  });
});
