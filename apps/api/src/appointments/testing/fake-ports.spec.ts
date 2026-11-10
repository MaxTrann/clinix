import type { EntityManager } from 'typeorm';
import type { CaLamViec } from '../../admin/entities/enums.js';
import {
  FakeAppointmentNotifier,
  FakeDoctorLeavePort,
  FakePaymentPort,
  FakePaymentSummaryPort,
  FakePendingBranchChangesPort,
  FakeRefundPort,
  FakeWaitlistPort,
  FakeWalletBalancePort,
  ScriptedCall,
  createFakePorts,
} from './fake-ports.js';

// Task P2 — BPO-02, BPO-03, BPO-04 (PLAN booking 7.19; TRACKING 3.6 P2-E): bản Fake lập trình được. Không DB: `EntityManager` là đối tượng giả, chỉ cần so DANH TÍNH.
const em = (): EntityManager => ({}) as unknown as EntityManager;
const LICH_HEN = { lichHenId: '11', benhNhanId: '7' };

describe('BPO-02 Fake thanh toán và ví', () => {
  it('ScriptedCall: ghi tham số (kể cả đúng đối tượng em), đếm, trả kết quả đặt sẵn và đổi được theo tham số', async () => {
    const call = new ScriptedCall<(x: string, n: number) => Promise<string>>(
      'mặc định',
    );
    expect(call.count).toBe(0);
    await expect(call.call('a', 1)).resolves.toBe('mặc định');
    call.returns('đã đổi');
    await expect(call.call('b', 2)).resolves.toBe('đã đổi');
    call.answers((x, n) => `${x}-${n}`);
    await expect(call.call('c', 3)).resolves.toBe('c-3');
    expect(call.calls).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(call.count).toBe(3);

    const manager = em();
    const port = new FakePaymentPort();
    await port.recordZeroPayment(manager, LICH_HEN);
    expect(port.recordZeroPaymentCall.calls[0]?.[0]).toBe(manager);
    expect(port.recordZeroPaymentCall.calls[0]?.[1]).toEqual(LICH_HEN);
  });

  it('ném lỗi một lần rồi bình thường, hoặc mọi lần; vẫn ghi lại lần gọi bị lỗi; reset đưa về ban đầu', async () => {
    const port = new FakePaymentPort();
    const boom = new Error('lỗi giả lập');
    port.recordZeroPaymentCall.throwsOnce(boom);
    await expect(port.recordZeroPayment(em(), LICH_HEN)).rejects.toBe(boom);
    await expect(
      port.recordZeroPayment(em(), LICH_HEN),
    ).resolves.toBeUndefined();
    expect(port.recordZeroPaymentCall.count).toBe(2);

    port.recordZeroPaymentCall.throwsOnce(boom).throwsOnce(boom);
    await expect(port.recordZeroPayment(em(), LICH_HEN)).rejects.toBe(boom);
    await expect(port.recordZeroPayment(em(), LICH_HEN)).rejects.toBe(boom);
    await expect(
      port.recordZeroPayment(em(), LICH_HEN),
    ).resolves.toBeUndefined();

    port.recordZeroPaymentCall.throwsAlways(boom);
    await expect(port.recordZeroPayment(em(), LICH_HEN)).rejects.toBe(boom);
    await expect(port.recordZeroPayment(em(), LICH_HEN)).rejects.toBe(boom);

    port.recordZeroPaymentCall.reset();
    expect(port.recordZeroPaymentCall.count).toBe(0);
    await expect(
      port.recordZeroPayment(em(), LICH_HEN),
    ).resolves.toBeUndefined();
  });

  it('onCall chạy TRƯỚC khi trả và sau khi đã ghi lần gọi (kể cả hook bất đồng bộ); lỗi trong hook lan ra', async () => {
    const port = new FakeRefundPort();
    const seen: number[] = [];
    port.refundCall.onCall(async () => {
      await Promise.resolve();
      seen.push(port.refundCall.count);
    });
    await port.refund({ lichHenId: '1', soTien: '50000.00', lyDo: 'x' });
    expect(seen).toEqual([1]);

    port.refundCall.onCall(() => {
      throw new Error('hook hỏng');
    });
    await expect(
      port.refund({ lichHenId: '2', soTien: '1.00', lyDo: 'y' }),
    ).rejects.toThrow('hook hỏng');
  });

  it('FakePaymentSummaryPort: số đã thu và số còn phải thu đặt theo lichHenId, id không nêu ⇒ giá trị dự phòng', async () => {
    const port = new FakePaymentSummaryPort()
      .paid({ '11': '100000.00' })
      .remaining({ '11': '250000.00' }, '999.00');
    await expect(port.amountPaid(em(), '11')).resolves.toBe('100000.00');
    await expect(port.amountPaid(em(), '12')).resolves.toBe('0.00');
    await expect(port.remainingToCollect(em(), '11')).resolves.toBe(
      '250000.00',
    );
    await expect(port.remainingToCollect(em(), '12')).resolves.toBe('999.00');
    expect(port.amountPaidCall.count).toBe(2);
  });

  it('FakeRefundPort: ba kết quả Refunded, Failed, NotNeeded và ghi đúng tham số; FakeWalletBalancePort: mặc định null, đặt được', async () => {
    const refund = new FakeRefundPort();
    const input = { lichHenId: '11', soTien: '123456.78', lyDo: 'BenhNhanHuy' };
    await expect(refund.refund(input)).resolves.toEqual({ kind: 'Refunded' });
    await expect(refund.result('Failed').refund(input)).resolves.toEqual({
      kind: 'Failed',
    });
    await expect(refund.result('NotNeeded').refund(input)).resolves.toEqual({
      kind: 'NotNeeded',
    });
    expect(refund.refundCall.calls.map(([arg]) => arg)).toEqual([
      input,
      input,
      input,
    ]);

    const wallet = new FakeWalletBalancePort();
    await expect(wallet.available('7')).resolves.toBeNull();
    wallet.availableCall.returns('75000.00');
    await expect(wallet.available('7')).resolves.toBe('75000.00');
  });
});

describe('BPO-03 Fake danh sách chờ và thông báo', () => {
  it('FakeWaitlistPort ghi khungGioId theo thứ tự gọi; ném lỗi đặt sẵn', async () => {
    const waitlist = new FakeWaitlistPort();
    await waitlist.onSlotReleased('5');
    await waitlist.onSlotReleased('3');
    expect(waitlist.releasedSlotIds).toEqual(['5', '3']);
    const boom = new Error('mời lỗi');
    waitlist.onSlotReleasedCall.throwsOnce(boom);
    await expect(waitlist.onSlotReleased('9')).rejects.toBe(boom);
    expect(waitlist.releasedSlotIds).toEqual(['5', '3', '9']);
  });

  it('FakeAppointmentNotifier ghi sự kiện theo thứ tự và đúng em; lỗi đặt sẵn mô phỏng "lỗi ở ghi thông báo" (DL-27)', async () => {
    const notifier = new FakeAppointmentNotifier();
    const manager = em();
    const first = {
      loaiSuKien: 'LichHenDaXacNhan',
      lichHenId: '11',
      taiKhoanId: '7',
    } as const;
    const second = { ...first, loaiSuKien: 'LichHenDaHuy' } as const;
    await notifier.notify(manager, first);
    await notifier.notify(manager, second);
    expect(notifier.events).toEqual([first, second]);
    expect(notifier.notifyCall.calls[0]?.[0]).toBe(manager);

    notifier.notifyCall.throwsOnce(new Error('ghi thông báo hỏng'));
    await expect(notifier.notify(manager, first)).rejects.toThrow(
      'ghi thông báo hỏng',
    );
    expect(notifier.events).toHaveLength(3);
  });

  it('createFakePorts trả tám Fake độc lập, mỗi lần gọi một bộ mới', async () => {
    const a = createFakePorts();
    const b = createFakePorts();
    expect(Object.keys(a)).toHaveLength(8);
    await a.waitlist.onSlotReleased('1');
    expect(b.waitlist.releasedSlotIds).toEqual([]);
  });
});

describe('BPO-04 Fake nghỉ phép và thay đổi chi nhánh', () => {
  const input: { bacSiId: string; ngay: string; ca: CaLamViec } = {
    bacSiId: '4',
    ngay: '2026-12-01',
    ca: 'CaSang',
  };

  it('FakeDoctorLeavePort: mặc định không chặn; blocks() chặn mọi lời gọi với trạng thái đặt sẵn; ghi em và tham số', async () => {
    const leave = new FakeDoctorLeavePort();
    const manager = em();
    await expect(leave.findBlockingLeave(manager, input)).resolves.toBeNull();
    leave.blocks();
    await expect(leave.findBlockingLeave(manager, input)).resolves.toEqual({
      yeuCauNghiPhepId: '1',
      trangThai: 'DaDuyet',
    });
    leave.blocks({}, 'ChoDuyet', '9');
    await expect(leave.findBlockingLeave(manager, input)).resolves.toEqual({
      yeuCauNghiPhepId: '9',
      trangThai: 'ChoDuyet',
    });
    expect(leave.findBlockingLeaveCall.calls[0]?.[0]).toBe(manager);
    expect(leave.findBlockingLeaveCall.calls[0]?.[1]).toEqual(input);
    expect(leave.findBlockingLeaveCall.count).toBe(3);
    leave.allows();
    await expect(leave.findBlockingLeave(manager, input)).resolves.toBeNull();
  });

  it('FakeDoctorLeavePort: chặn có điều kiện, khớp theo bacSiId, ngay, ca (khoá không nêu thì bỏ qua)', async () => {
    const leave = new FakeDoctorLeavePort().blocks({
      bacSiId: '4',
      ngay: '2026-12-01',
      ca: 'CaSang',
    });
    const ask = (override: Partial<typeof input>) =>
      leave.findBlockingLeave(em(), { ...input, ...override });
    await expect(ask({})).resolves.not.toBeNull();
    await expect(ask({ bacSiId: '5' })).resolves.toBeNull();
    await expect(ask({ ngay: '2026-12-02' })).resolves.toBeNull();
    await expect(ask({ ca: 'CaChieu' })).resolves.toBeNull();

    leave.blocks({ ca: 'CaSang' });
    await expect(ask({ bacSiId: '5', ngay: '2027-01-01' })).resolves.not.toBe(
      null,
    );
    await expect(ask({ ca: 'CaChieu' })).resolves.toBeNull();
  });

  it('FakePendingBranchChangesPort: chặn có điều kiện theo chiNhanhId, dichVuKhamId, ngayGio (so theo mili giây); không chặn thì null', async () => {
    const port = new FakePendingBranchChangesPort();
    const slot = {
      chiNhanhId: '2',
      ngayGio: new Date('2026-12-01T01:00:00.000Z'),
      thoiLuongPhut: 30,
      dichVuKhamId: '8',
    };
    await expect(port.findBlocking(em(), slot)).resolves.toBeNull();

    port.blocks({ chiNhanhId: '2', ngayGio: new Date(slot.ngayGio) }, '77');
    await expect(port.findBlocking(em(), slot)).resolves.toEqual({
      yeuCauThayDoiChiNhanhId: '77',
    });
    await expect(
      port.findBlocking(em(), { ...slot, chiNhanhId: '3' }),
    ).resolves.toBeNull();
    await expect(
      port.findBlocking(em(), {
        ...slot,
        ngayGio: new Date('2026-12-01T01:00:00.001Z'),
      }),
    ).resolves.toBeNull();
    expect(port.findBlockingCall.count).toBe(4);

    port.allows();
    await expect(port.findBlocking(em(), slot)).resolves.toBeNull();
  });
});
