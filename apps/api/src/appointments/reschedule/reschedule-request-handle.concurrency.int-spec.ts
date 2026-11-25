import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { createGate, runRounds } from '../testing/concurrency-harness.js';
import {
  reportRounds,
  sleep,
  winnerTally,
} from '../testing/concurrency-report.js';
import { appFailure } from '../testing/patient-reschedule-world.js';
import {
  HANDLING_NOTE,
  requestHandleWorld,
  type RequestHandleWorld,
} from '../testing/reschedule-request-handle-world.js';
import { interceptStatements } from '../testing/statement-recorder.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';

// reschedule B9 — ĐỒNG THỜI nhẹ của DUYỆT và TỪ CHỐI (XDL-49; PLAN reschedule 5.4, 7.4) trên MySQL 8.4 THẬT với lõi B4, Audit và thông báo THẬT. Hai nhóm:
//  - VÒNG ĐUA (12 vòng, hai bên xuất phát cùng một cổng, bên đầu xen kẽ theo vòng): (1) hai Lễ tân cùng DUYỆT một yêu cầu; (2) một DUYỆT, một TỪ CHỐI cùng yêu cầu; (3) hai yêu cầu của hai lịch cùng mong muốn MỘT
//    khung giờ. Mọi yêu cầu qua `withBookingTransaction` thật nên "không lỗi" là SAU thử lại: số thử lại 1213/1205 khác 0 là THỨ TỰ KHOÁ SAI (`reportRounds`, in ở dòng `[B9-…]`; 503 nếu hết lượt).
//  - CỔNG XÁC ĐỊNH (không phụ thuộc may rủi thời điểm): repository giả dừng lần đọc thường `findForHandling` SAU khi đã đọc xong; trong lúc dừng, một giao dịch khác xử lý trước hay chiếm khung giờ; thả cổng thì bên bị dừng
//    PHẢI quyết bằng hàng ĐÃ KHOÁ (409), không bằng lần đọc cũ. Chứng minh quyết định ở một nơi, dưới khoá 6c (duyệt) hay khoá yêu cầu (từ chối).
// Đếm toàn bộ cặp đồng thời: X2 (TDL-01…TDL-18). CHẠY MỘT MÌNH (khoá hàng và thời gian chờ nhạy với tải).
const ROUNDS = 12;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});

/** Repository THẬT, nhưng lần `findForHandling` kế tiếp (nếu đã `holdNextRead`) dừng sau khi đọc xong cho tới khi `release()`. */
class GatedRequests extends RescheduleRequestRepository {
  private armed: { reached: () => void; released: Promise<void> } | null = null;

  holdNextRead() {
    let reached!: () => void;
    let release!: () => void;
    const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.armed = { reached, released };
    return { reached: reachedPromise, release };
  }

  override async findForHandling(
    ...args: Parameters<RescheduleRequestRepository['findForHandling']>
  ) {
    const row = await super.findForHandling(...args);
    const armed = this.armed;
    if (armed !== null) {
      this.armed = null;
      armed.reached();
      await armed.released;
    }
    return row;
  }
}

/** Xoá hộp thư đi, thông báo, nhật ký, yêu cầu và mọi lịch (con trước, vì lịch mới trỏ lịch cũ), đặt mọi khung giờ về `ConTrong`, đặt lại bộ đếm của cổng Fake: dựng lại trạng thái đầu mỗi vòng. */
async function reset(w: RequestHandleWorld): Promise<void> {
  await db.query('DELETE FROM email_thong_bao');
  await db.query('DELETE FROM thong_bao');
  await db.query('DELETE FROM nhat_ky_hanh_dong');
  await db.query('DELETE FROM yeu_cau_doi_lich_ngoai_chinh_sach');
  await db.query('DELETE FROM lich_hen ORDER BY lich_hen_id DESC');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
  w.waitlist.onSlotReleasedCall.reset();
}

/** Hai việc xuất phát CÙNG LÚC; vòng lẻ việc thứ hai chậm `lag` ms (mặc định 4), vòng chẵn việc thứ nhất chậm `lag` ms: xen kẽ ai đi trước để CẢ HAI nhánh thắng đều chạy. */
function pair(
  round: number,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
  lag = 4,
) {
  const gate = createGate(2);
  return [
    async (): Promise<unknown> => {
      await gate.arrive();
      if (round % 2 === 0) await sleep(lag);
      return first();
    },
    async (): Promise<unknown> => {
      await gate.arrive();
      if (round % 2 === 1) await sleep(lag);
      return second();
    },
  ] as const;
}

const codeOf = (error: unknown): string | undefined =>
  error instanceof AppException
    ? (error.getResponse() as { maLoi: string }).maLoi
    : undefined;

/** Đúng MỘT bên thành công (200) và MỘT bên bị từ chối bằng lỗi nghiệp vụ `code` (không 500, không 503). */
function expectOneWinOneLoss(
  results: readonly PromiseSettledResult<unknown>[],
  code: string,
): void {
  const wins = results.filter((r) => r.status === 'fulfilled');
  const losses = results.flatMap((r) =>
    r.status === 'rejected' ? [r.reason as unknown] : [],
  );
  expect(wins).toHaveLength(1);
  expect(losses.map(codeOf)).toEqual([code]);
}

// Câu ĐỌC yêu cầu theo khoá chính TRONG giao dịch (`lockRescheduleRequest` của B1: `FROM yeu_cau… WHERE … = ?` rồi `FOR UPDATE`). `findForHandling` có JOIN và bí danh `yc` nên KHÔNG khớp. Mẫu cố ý không
// đòi `FOR UPDATE`: bản đột biến bỏ khoá (M23) vẫn dừng đúng chỗ, để ca chứng minh CHÍNH khoá mới tạo ra kết quả đúng.
const REQUEST_READ_IN_TX =
  /FROM yeu_cau_doi_lich_ngoai_chinh_sach WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = \?/;

/**
 * Dừng MỘT lần, SAU khi câu đọc yêu cầu trong giao dịch đã chạy THẬT: bên đầu tiên chạm câu đó giữ nguyên chỗ (cùng khoá hàng nếu có) cho tới `release()`. Câu của bên thứ hai đi qua, nhưng nếu khoá có thật thì
 * nó bị CHẶN ở đúng câu đó cho tới khi bên đầu commit. `reached()` hỏng sau 5 giây nếu không ai tới câu đó (đột biến bỏ khoá yêu cầu), để ca báo lỗi rõ thay vì treo.
 */
function pauseAfterRequestRead() {
  let reached!: () => void;
  let release!: () => void;
  const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  let paused = false;
  interceptStatements(db, async (call, run) => {
    const result = await run();
    if (!paused && REQUEST_READ_IN_TX.test(call.sql)) {
      paused = true;
      reached();
      await released;
    }
    return result;
  });
  return {
    release,
    reached: () =>
      Promise.race([
        reachedPromise,
        sleep(5000).then(() => {
          throw new Error('không giao dịch nào tới câu đọc yêu cầu có khoá');
        }),
      ]),
  };
}

describe('XDL-49 hai Lễ tân cùng DUYỆT một yêu cầu', () => {
  it(`${String(ROUNDS)} vòng: đúng MỘT thắng (200), một thua 409 YEU_CAU_DA_XU_LY; đúng một lịch mới, một dòng Audit, một thông báo, một thư; yêu cầu DaDuyet; không mời danh sách chờ hai lần; INV-1…INV-10; 0 lần thử lại`, async () => {
    const w = await requestHandleWorld(db, fx);
    const second = await w.secondReceptionist();
    const tally = winnerTally();

    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return w.openRequest(0, 2, { soLan: 2 });
      },
      race: ({ yeuCauId }, round) =>
        pair(
          round,
          () => w.approve(yeuCauId, { ghiChu: HANDLING_NOTE }, w.receptionId),
          () => w.approve(yeuCauId, { ghiChu: HANDLING_NOTE }, second),
        ),
      check: async ({ lich, yeuCauId }, results) => {
        expectOneWinOneLoss(results, 'YEU_CAU_DA_XU_LY');
        expect(await w.countRows('lich_hen')).toBe(2);
        expect(await w.auditCount()).toBe(1);
        expect(await w.countRows('thong_bao')).toBe(1);
        expect(await w.countRows('email_thong_bao')).toBe(1);
        expect((await w.requestRow(yeuCauId)).trangThai).toBe('DaDuyet');
        expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaDoiLich');
        expect(w.waitlist.releasedSlotIds).toHaveLength(1);
        await w.expectSettled();
        tally.add('một lịch mới');
      },
    });

    reportRounds(
      'B9-XDL-49a',
      'hai Lễ tân cùng duyệt',
      ROUNDS,
      tally.winners,
      logs,
    );
  });
});

describe('XDL-49 một DUYỆT, một TỪ CHỐI cùng một yêu cầu', () => {
  it(`${String(ROUNDS)} vòng: đúng MỘT thắng, một thua 409 YEU_CAU_DA_XU_LY; kết quả NHẤT QUÁN (duyệt thắng ⇒ DaDuyet, lịch mới, thông báo DaDuyet; từ chối thắng ⇒ TuChoi, KHÔNG lịch mới, thông báo BiTuChoi); đúng một Audit và một thông báo; INV-1…INV-10; 0 lần thử lại`, async () => {
    const w = await requestHandleWorld(db, fx);
    const second = await w.secondReceptionist();
    const tally = winnerTally();

    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return w.openRequest(0, 2, { soLan: 2 });
      },
      race: ({ yeuCauId }, round) =>
        pair(
          round,
          () => w.approve(yeuCauId, { ghiChu: HANDLING_NOTE }, w.receptionId),
          () => w.reject(yeuCauId, { ghiChu: HANDLING_NOTE }, second),
          // Đường từ chối ngắn hơn đường duyệt (một khoá, không đọc bộ luật): trễ 4 ms vẫn để từ chối thắng 12/12; 40 ms để CẢ HAI nhánh thắng chạy
          40,
        ),
      check: async ({ lich, yeuCauId }, results) => {
        expectOneWinOneLoss(results, 'YEU_CAU_DA_XU_LY');
        const approved = results[0]?.status === 'fulfilled';
        expect((await w.requestRow(yeuCauId)).trangThai).toBe(
          approved ? 'DaDuyet' : 'TuChoi',
        );
        expect(await w.countRows('lich_hen')).toBe(approved ? 2 : 1);
        expect((await w.rowOf(lich.lichHenId)).trangThai).toBe(
          approved ? 'DaDoiLich' : 'DaXacNhan',
        );
        const audit = await w.auditRows();
        expect(audit).toHaveLength(1);
        expect(audit[0]?.chiTiet).toMatchObject({
          sau: { trang_thai: approved ? 'DaDuyet' : 'TuChoi' },
        });
        const notices = await w.notices();
        expect(notices.map((n) => n.loai)).toEqual([
          approved ? 'YeuCauDoiLichDaDuyet' : 'YeuCauDoiLichBiTuChoi',
        ]);
        expect(await w.countRows('email_thong_bao')).toBe(1);
        await w.expectSlot(0, approved ? 'ConTrong' : 'DaDat');
        await w.expectSlot(2, approved ? 'DaDat' : 'ConTrong');
        await w.expectSettled();
        tally.add(approved ? 'duyệt thắng' : 'từ chối thắng');
      },
    });

    reportRounds('B9-XDL-49b', 'duyệt và từ chối', ROUNDS, tally.winners, logs);
  });
});

describe('XDL-49 hai yêu cầu của hai lịch cùng mong muốn MỘT khung giờ', () => {
  it(`${String(ROUNDS)} vòng: đúng MỘT thắng, một thua 409 KHUNG_GIO_DA_DAT; yêu cầu bên thua VẪN ChoDuyet, lịch của bên thua còn DaXacNhan, không Audit, không thông báo của bên thua; INV-1…INV-10; 0 lần thử lại`, async () => {
    const w = await requestHandleWorld(db, fx);
    const second = await w.secondReceptionist();
    const other = await fx.admin.patient();
    const tally = winnerTally();

    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return {
          mine: await w.openRequest(0, 4, { soLan: 2 }),
          theirs: await w.openRequest(1, 4, {
            soLan: 2,
            patientId: other.account.taiKhoanId,
          }),
        };
      },
      race: ({ mine, theirs }, round) =>
        pair(
          round,
          () =>
            w.approve(mine.yeuCauId, { ghiChu: HANDLING_NOTE }, w.receptionId),
          () => w.approve(theirs.yeuCauId, { ghiChu: HANDLING_NOTE }, second),
        ),
      check: async ({ mine, theirs }, results) => {
        expectOneWinOneLoss(results, 'KHUNG_GIO_DA_DAT');
        const states = [
          (await w.requestRow(mine.yeuCauId)).trangThai,
          (await w.requestRow(theirs.yeuCauId)).trangThai,
        ].sort();
        expect(states).toEqual(['ChoDuyet', 'DaDuyet']);
        expect(await w.auditCount()).toBe(1);
        expect(await w.countRows('thong_bao')).toBe(1);
        const lichStates = [
          (await w.rowOf(mine.lich.lichHenId)).trangThai,
          (await w.rowOf(theirs.lich.lichHenId)).trangThai,
        ].sort();
        expect(lichStates).toEqual(['DaDoiLich', 'DaXacNhan']);
        await w.expectSettled();
        tally.add('một lịch mới');
      },
    });

    reportRounds(
      'B9-XDL-49c',
      'hai yêu cầu, một khung giờ',
      ROUNDS,
      tally.winners,
      logs,
    );
  });
});

describe('XDL-49 cổng xác định: bên bị dừng sau lần đọc thường PHẢI quyết bằng hàng ĐÃ KHOÁ', () => {
  async function gatedWorld() {
    const requests = new GatedRequests();
    const w = await requestHandleWorld(db, fx, { requests });
    return { w, requests, second: await w.secondReceptionist() };
  }

  it('khung giờ mong muốn bị người khác đặt GIỮA lần đọc và lần khoá ⇒ 409 KHUNG_GIO_DA_DAT, yêu cầu vẫn ChoDuyet, không ghi gì của duyệt', async () => {
    const { w, requests } = await gatedWorld();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const hold = requests.holdNextRead();

    const approving = appFailure(w.approve(yeuCauId));
    await hold.reached;
    const [other] = await fx.patients(1);
    await w.book(2, { patientId: other!.account.taiKhoanId });
    const base = await w.untouched();
    hold.release();
    const failure = await approving;

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('KHUNG_GIO_DA_DAT');
    expect(await w.untouched()).toEqual(base);
    expect((await w.requestRow(yeuCauId)).trangThai).toBe('ChoDuyet');
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaXacNhan');
  });

  it('DUYỆT bị dừng sau lần đọc ChoDuyet, trong lúc đó yêu cầu bị TỪ CHỐI ⇒ 409 YEU_CAU_DA_XU_LY từ B4 dưới khoá 6c (cổng sớm đã qua); chỉ có dòng Audit và thông báo của lần từ chối', async () => {
    const { w, requests, second } = await gatedWorld();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const hold = requests.holdNextRead();

    const approving = appFailure(w.approve(yeuCauId));
    await hold.reached;
    await w.reject(yeuCauId, { ghiChu: 'Từ chối trước' }, second);
    hold.release();
    const failure = await approving;

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'TuChoi',
      ghiChuXuLy: 'Từ chối trước',
      nguoiXuLyId: second,
    });
    expect(await w.auditCount()).toBe(1);
    expect((await w.notices()).map((n) => n.loai)).toEqual([
      'YeuCauDoiLichBiTuChoi',
    ]);
    expect(await w.countRows('lich_hen')).toBe(1);
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaXacNhan');
    await w.expectSettled();
  });

  it('TỪ CHỐI bị dừng sau lần đọc ChoDuyet, trong lúc đó yêu cầu bị TỪ CHỐI bởi người khác ⇒ 409 dưới khoá; ĐÚNG một Audit và một thông báo (NDL-29: không thông báo thứ hai); ghi chú là của người đến trước', async () => {
    const { w, requests, second } = await gatedWorld();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const hold = requests.holdNextRead();

    const rejecting = appFailure(w.reject(yeuCauId, { ghiChu: 'Người sau' }));
    await hold.reached;
    await w.reject(yeuCauId, { ghiChu: 'Người trước' }, second);
    hold.release();
    const failure = await rejecting;

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'TuChoi',
      ghiChuXuLy: 'Người trước',
      nguoiXuLyId: second,
    });
    expect(await w.auditCount()).toBe(1);
    expect(await w.countRows('thong_bao')).toBe(1);
    expect(await w.countRows('email_thong_bao')).toBe(1);
  });

  it('TỪ CHỐI bị dừng sau lần đọc ChoDuyet, trong lúc đó yêu cầu được DUYỆT ⇒ 409; yêu cầu vẫn DaDuyet, lịch mới còn nguyên, không dòng TuChoi nào', async () => {
    const { w, requests, second } = await gatedWorld();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const hold = requests.holdNextRead();

    const rejecting = appFailure(w.reject(yeuCauId));
    await hold.reached;
    await w.approve(yeuCauId, { ghiChu: 'Duyệt trước' }, second);
    hold.release();
    const failure = await rejecting;

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'DaDuyet',
      ghiChuXuLy: 'Duyệt trước',
    });
    expect(await w.auditCount()).toBe(1);
    expect((await w.notices()).map((n) => n.loai)).toEqual([
      'YeuCauDoiLichDaDuyet',
    ]);
    expect(await w.countRows('lich_hen')).toBe(2);
    await w.expectSettled();
  });

  it('XDL-49 / M23 khoá 6c giữ qua cả đoạn dừng: TỪ CHỐI bên thứ nhất dừng SAU câu khoá, bên thứ hai từ chối cùng lúc BỊ CHẶN ở khoá rồi thấy TuChoi ⇒ 409 sạch (không 500 vì UPDATE thua, không hai thông báo)', async () => {
    const { w, second } = await gatedWorld();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const pause = pauseAfterRequestRead();

    const first = w.reject(yeuCauId, { ghiChu: 'Người trước' }, w.receptionId);
    void first.catch(() => undefined);
    await pause.reached();
    const latecomer = appFailure(
      w.reject(yeuCauId, { ghiChu: 'Người sau' }, second),
    );
    void latecomer.catch(() => undefined);
    await sleep(400); // bên sau đã tới câu khoá và (nếu khoá có thật) đang bị chặn
    pause.release();

    expect((await first).yeuCau.trangThai).toBe('TuChoi');
    const failure = await latecomer;
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'TuChoi',
      ghiChuXuLy: 'Người trước',
      nguoiXuLyId: w.receptionId,
    });
    expect(await w.auditCount()).toBe(1);
    expect(await w.countRows('thong_bao')).toBe(1);
  });

  it('XDL-49 / M23 duyệt và từ chối nối tiếp trên CÙNG một khoá 6c: DUYỆT dừng sau câu khoá của B4, TỪ CHỐI cùng lúc BỊ CHẶN rồi thấy DaDuyet ⇒ 409; duyệt 200, một lịch mới, một Audit, một thông báo DaDuyet', async () => {
    const { w, second } = await gatedWorld();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const pause = pauseAfterRequestRead();

    const approving = w.approve(
      yeuCauId,
      { ghiChu: 'Duyệt trước' },
      w.receptionId,
    );
    void approving.catch(() => undefined);
    await pause.reached();
    const rejecting = appFailure(
      w.reject(yeuCauId, { ghiChu: 'Từ chối sau' }, second),
    );
    void rejecting.catch(() => undefined);
    await sleep(400);
    pause.release();

    expect((await approving).yeuCau.trangThai).toBe('DaDuyet');
    const failure = await rejecting;
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'DaDuyet',
      ghiChuXuLy: 'Duyệt trước',
    });
    expect(await w.countRows('lich_hen')).toBe(2);
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaDoiLich');
    expect(await w.auditCount()).toBe(1);
    expect((await w.notices()).map((n) => n.loai)).toEqual([
      'YeuCauDoiLichDaDuyet',
    ]);
    await w.expectSettled();
  });
});
