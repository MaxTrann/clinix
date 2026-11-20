import { TopupNotifier } from '../../payment/topup/topup-notifier.js';
import { RefundNotifier } from '../../wallet/refund/refund-notifier.js';
import { WithdrawalNotifier } from '../../wallet/withdrawal/withdrawal-notifier.js';
import {
  createOutbox,
  emailOf,
  insertQueuedEmail,
  readOutbox,
} from '../testing/notification-world.js';
import {
  db,
  logs,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import { emptyEmailOutboxSummary } from './email-outbox.service.js';

// payment B17 — thư của payment và wallet trên MySQL 8.4 THẬT với `FakeMailService` (PLAN payment 5.12, 7; Q18): TDT-09 (bộ ghi của payment, wallet xếp đúng thư; worker gửi đúng bốn mẫu; loại chỉ có trong
// ứng dụng và loại lạ vẫn bị bỏ qua, không lỗi). Mẫu thư (TDT-10): payment-mail.templates.spec.ts. Hoàn đặc biệt (xếp thư trong giao dịch của B13): special-refund.int-spec.ts HDB-02. KHÔNG có thư thật nào.
useStatusWorldHooks();
const NOW = new Date('2026-11-02T08:30:00+07:00');
const AT = new Date('2026-11-02T08:00:00+07:00');

async function sweep(service: ReturnType<typeof createOutbox>['service']) {
  const summary = emptyEmailOutboxSummary();
  await service.sweep(NOW, summary);
  return summary;
}

/** Loại của mọi dòng thư, theo thứ tự ghi. */
const queuedTypes = async (): Promise<string[]> =>
  (
    await db.query<{ loai: string }[]>(
      'SELECT t.loai_su_kien AS loai FROM email_thong_bao e JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id ORDER BY e.email_thong_bao_id',
    )
  ).map((row) => row.loai);

describe('TDT-09 bộ ghi của payment, wallet xếp thư ĐÚNG năm loại, cùng giao dịch với thông báo', () => {
  it('nạp thất bại, hoàn cọc, rút được duyệt, rút bị từ chối có thư; nạp thành công, đã gửi yêu cầu rút, "cần xử lý" chỉ có thông báo; hoàn cọc ghi lần hai cùng lịch không xếp thư lần hai', async () => {
    const w = await world();
    const lich = await w.booked('DaHuy', 0);
    const topup = new TopupNotifier();
    const withdrawal = new WithdrawalNotifier();
    const refund = new RefundNotifier();
    const patient = { benhNhanId: w.patientId, soTien: '200000.00', now: AT };

    await db.transaction(async (em) => {
      await topup.notifySucceeded(em, patient);
      await topup.notifyFailed(em, patient);
      await topup.notifyNeedsAttention(em, {
        giaoDichId: '9',
        adminIds: [w.systemAdmin.account.taiKhoanId],
        now: AT,
      });
      await withdrawal.notifySubmitted(em, patient);
      await withdrawal.notifyApproved(em, { ...patient, ghiChu: 'Đã chuyển' });
      await withdrawal.notifyRejected(em, patient);
      const refundInput = {
        lichHenId: lich.lichHenId,
        taiKhoanId: w.patientId,
        maLichHen: lich.maLichHen,
        soTien: '50000.00',
        now: AT,
      };
      await expect(refund.notifyRefunded(em, refundInput)).resolves.toEqual({
        kind: 'Inserted',
        thongBaoId: expect.any(String),
      });
      await expect(refund.notifyRefunded(em, refundInput)).resolves.toEqual({
        kind: 'AlreadyExists',
      });
    });

    expect(await queuedTypes()).toEqual([
      'NapViThatBai',
      'RutTienDuocDuyet',
      'RutTienBiTuChoi',
      'HoanCocThanhCong',
    ]);
    expect((await readOutbox(db)).every((r) => r.trangThai === 'ChoGui')).toBe(
      true,
    );
  });

  it('giao dịch của người gọi hoàn tác ⇒ không còn thông báo, cũng không còn dòng thư', async () => {
    const w = await world();
    await expect(
      db.transaction(async (em) => {
        await new TopupNotifier().notifyFailed(em, {
          benhNhanId: w.patientId,
          soTien: '200000.00',
          now: AT,
        });
        throw new Error('lỗi giả sau khi ghi');
      }),
    ).rejects.toThrow('lỗi giả sau khi ghi');
    expect(await readOutbox(db)).toEqual([]);
    expect(
      await db.query(
        "SELECT 1 FROM thong_bao WHERE loai_su_kien = 'NapViThatBai'",
      ),
    ).toEqual([]);
  });
});

describe('TDT-09 worker gửi đúng bốn mẫu cho năm loại của payment, wallet; loại chỉ có trong ứng dụng và loại lạ vẫn bị bỏ qua', () => {
  it('năm thư gửi MỘT lần tới đúng người nhận, đúng tiêu đề, mang câu của thông báo; ba dòng loại khác nguyên vẹn', async () => {
    const w = await world();
    const lich = await w.booked('DaHuy', 0);
    const queue = (loai: string, lichHenId: string | null, noiDung: string) =>
      insertQueuedEmail(db, {
        taiKhoanId: w.patientId,
        lichHenId,
        loai,
        noiDung,
      });
    await queue('NapViThatBai', null, 'Câu nạp thất bại.');
    await queue('HoanCocThanhCong', lich.lichHenId, 'Câu hoàn cọc.');
    await queue('HoanTienDacBiet', lich.lichHenId, 'Câu hoàn đặc biệt.');
    await queue('RutTienDuocDuyet', null, 'Câu rút được duyệt.');
    await queue('RutTienBiTuChoi', null, 'Câu rút bị từ chối.');
    // Có dòng thư (chèn tay) nhưng KHÔNG thuộc loại có thư: worker không chọn, không đổi
    await queue('NapViThanhCong', null, 'Chỉ trong ứng dụng.');
    await queue('RutTienDaGui', null, 'Chỉ trong ứng dụng.');
    await queue('FakeThanhToan', null, 'Loại lạ.');
    const before = await readOutbox(db);
    const { mail, service } = createOutbox(db);

    expect(await sweep(service)).toMatchObject({ sent: 5, failed: 0 });

    const to = await emailOf(db, w.patientId);
    expect(mail.sent.map((m) => [m.to, m.subject])).toEqual([
      [to, '[CLINIX] Thanh toán không thành công'],
      [to, '[CLINIX] Hoàn tiền đã được xử lý'],
      [to, '[CLINIX] Hoàn tiền đã được xử lý'],
      [to, '[CLINIX] Yêu cầu rút tiền đã được duyệt'],
      [to, '[CLINIX] Yêu cầu rút tiền bị từ chối'],
    ]);
    expect(mail.sent[0]!.text).toContain('Câu nạp thất bại.');
    // Thư hoàn tiền in mã lịch hẹn đọc qua lich_hen_id; thời gian là lúc ghi thông báo, giờ Việt Nam
    expect(mail.sent[1]!.text).toContain(`Mã lịch hẹn: ${lich.maLichHen}`);
    expect(mail.sent[1]!.text).toContain('Thời gian xử lý: 02/11/2026 — 08:00');
    expect(mail.sent[2]!.text).toContain('Phòng khám đã hoàn một khoản tiền');
    expect(mail.sent[4]!.text).toContain('Câu rút bị từ chối.');

    const after = await readOutbox(db);
    expect(after.slice(0, 5).map((r) => r.trangThai)).toEqual(
      Array(5).fill('DaGui'),
    );
    expect(after.slice(5)).toEqual(before.slice(5));

    // Lượt sau không gửi lại
    mail.reset();
    expect(await sweep(service)).toMatchObject({ sent: 0, failed: 0 });
    expect(mail.attempts).toEqual([]);
  });

  it('thư hoàn tiền thiếu lich_hen_id ⇒ ThatBai THIEU_LICH_HEN (lỗi cố định, log không địa chỉ); thư khác vẫn gửi', async () => {
    const w = await world();
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: null,
      loai: 'HoanCocThanhCong',
    });
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: null,
      loai: 'RutTienDuocDuyet',
    });
    const { mail, service } = createOutbox(db);

    expect(await sweep(service)).toMatchObject({ sent: 1, failed: 1 });

    expect(mail.attempts).toHaveLength(1);
    expect(await readOutbox(db)).toEqual([
      expect.objectContaining({
        trangThai: 'ThatBai',
        soLanThu: 1,
        loiCuoi: 'THIEU_LICH_HEN',
      }),
      expect.objectContaining({ trangThai: 'DaGui', soLanThu: 1 }),
    ]);
    const to = await emailOf(db, w.patientId);
    expect(logs.join('\n')).not.toContain(to);
  });
});
