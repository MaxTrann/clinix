import type { EntityManager } from 'typeorm';
import type { DataSource } from 'typeorm';
import { AuditError } from '../../audit/audit-error.js';
import type { AuditEntry } from '../../audit/audit-entry.js';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AppointmentEvent } from '../ports/appointment-notifier.port.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  PROXY_REASON,
  receptionRescheduleWorld,
  type ReceptionRescheduleWorldOptions,
} from '../testing/reception-reschedule-world.js';

// reschedule B7 — LỖI GHI AUDIT ⇒ hoàn tác TRỌN cả đổi lịch (2.4.70 A1; PLAN reschedule 5.5 bước 8, 5.11): DLO-08 (Audit ghi xong dòng rồi ném `AuditError`), DLO-17 `[đề xuất]` (luật THẬT của P2 từ chối entry mà DTO
// lẽ ra đã chặn: ép qua dịch vụ), HDL-10 phần B7 (Audit và thông báo cùng giao dịch với `INSERT lich_hen`: thông báo ném SAU Audit thì dòng Audit cũng mất). `AuditError` PHẢI nổi (không nuốt). Thế giới:
// `receptionRescheduleWorld` (lõi B4 và `ReceptionScopeService` thật). Mọi dữ liệu là giả.

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

/** Audit THẬT, nhưng ghi XONG dòng rồi ném `AuditError` khi `failing = true`: chứng minh dòng vừa ghi cũng bị hoàn tác. */
class FlakyAudit extends AuditService {
  failing = true;
  override async record(em: EntityManager, entry: AuditEntry): Promise<void> {
    await super.record(em, entry);
    if (this.failing) throw new AuditError('AUDIT_WRITE_FAILED');
  }
}

const world = (options?: ReceptionRescheduleWorldOptions) =>
  receptionRescheduleWorld(db, fx, options);

describe('DLO-08 Audit lỗi ⇒ hoàn tác TRỌN: lịch mới, hai khung giờ, bộ đếm, thông báo, thư, và CẢ dòng Audit vừa ghi', () => {
  it('AuditError nổi nguyên (không bị nuốt, không đổi sang lỗi khác); mọi thứ về đúng trạng thái trước; không mời danh sách chờ; lần sau Audit lành đổi được', async () => {
    const audit = new FlakyAudit(new AuditRepository());
    const w = await world({ audit });
    const lich = await w.book(0, { soLan: 1 });
    const base = await w.untouched();
    const rowBefore = await w.rawRow(lich.lichHenId);

    await expect(w.reschedule(lich.maLichHen, 2)).rejects.toMatchObject({
      name: 'AuditError',
      code: 'AUDIT_WRITE_FAILED',
    });

    expect(await w.untouched()).toEqual(base);
    expect(await w.auditCount()).toBe(0);
    expect(await w.countRows('thong_bao')).toBe(0);
    expect(await w.rawRow(lich.lichHenId)).toEqual(rowBefore);
    expect(w.waitlist.releasedSlotIds).toEqual([]);
    await w.expectSlot(0, 'DaDat');
    await w.expectSlot(2, 'ConTrong');
    await w.expectSettled();

    audit.failing = false;
    const retry = await w.reschedule(lich.maLichHen, 2);
    expect(retry.ketQua).toBe('DaDoi');
    expect(await w.auditCount()).toBe(1);
    await w.expectSettled();
  });
});

describe('DLO-17 luật Audit THẬT từ chối entry mà DTO lẽ ra đã chặn ⇒ AuditError nổi và đổi lịch bị hoàn tác trọn (không 201 giả, không dòng nào còn lại)', () => {
  it.each([
    [
      'chữ giống bí mật (redactText che)',
      'password=abc12345',
      'AUDIT_SENSITIVE_DATA',
    ],
    ['chỉ U+00A0 (trim() rỗng)', ' ', 'AUDIT_ENTRY_INVALID'],
    ['256 ký tự (quá trần 255)', 'a'.repeat(256), 'AUDIT_ENTRY_INVALID'],
    ['rỗng', '', 'AUDIT_ENTRY_INVALID'],
  ])('lý do %s ⇒ %s, DB nguyên vẹn', async (_name, lyDo, code) => {
    const w = await world();
    const lich = await w.book(0);
    const base = await w.untouched();

    await expect(w.reschedule(lich.maLichHen, 2, lyDo)).rejects.toMatchObject({
      name: 'AuditError',
      code,
    });

    expect(await w.untouched()).toEqual(base);
    expect(await w.countRows('thong_bao')).toBe(0);
    await w.expectSlot(0, 'DaDat');
    await w.expectSettled();
  });

  it('lý do đúng 255 ký tự ĐI HẾT đường tới nhật ký thật (trần DTO = trần Audit): một dòng, ly_do nguyên', async () => {
    const w = await world();
    const lich = await w.book(0);
    const lyDo = 'đ'.repeat(255);

    await w.reschedule(lich.maLichHen, 2, lyDo);

    const rows = await w.auditRows();
    expect(rows.map((row) => (row.chiTiet as { ly_do: string }).ly_do)).toEqual(
      [lyDo],
    );
  });
});

describe('HDL-10 (phần B7) Audit ghi CÙNG giao dịch với INSERT lich_hen và thông báo', () => {
  it('thông báo ném SAU khi Audit đã ghi ⇒ dòng Audit cũng mất, lịch mới và khung giờ về như cũ (cùng một giao dịch)', async () => {
    const notifier = {
      notify: (_em: EntityManager, _event: AppointmentEvent): Promise<void> =>
        Promise.reject(new Error('thông báo hỏng')),
    };
    const w = await world({ notifier });
    const lich = await w.book(0);
    const base = await w.untouched();

    await expect(w.reschedule(lich.maLichHen, 2)).rejects.toThrow(
      'thông báo hỏng',
    );

    expect(await w.auditCount()).toBe(0);
    expect(await w.untouched()).toEqual(base);
    await w.expectSlot(0, 'DaDat');
    await w.expectSettled();
  });

  it('thành công thì Audit, lịch mới, thông báo và thư cùng có mặt (đối chứng của ca trên)', async () => {
    const w = await world();
    const lich = await w.book(0);
    await w.reschedule(lich.maLichHen, 2, PROXY_REASON);
    expect(await w.auditCount()).toBe(1);
    expect(await w.countRows('thong_bao')).toBe(1);
    expect(await w.countRows('email_thong_bao')).toBe(1);
  });
});
