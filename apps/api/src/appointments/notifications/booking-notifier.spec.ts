import {
  BOOKING_NOTIFICATION_EVENTS,
  RESCHEDULE_NOTIFICATION_EVENTS,
} from '../appointments.constants.js';
import {
  contextOf,
  duplicateEntryError,
  eventOf,
  foreignKeyError,
  LICH_HEN_ID,
  MA_LICH_HEN,
  TAI_KHOAN_DAT,
} from '../testing/notification-fixtures.js';
import {
  REQUEST_LOAI,
  requestEvent,
  rescheduledEvent,
} from '../testing/reschedule-notification-world.js';
import { isLockingStatement } from '../testing/query-spy.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import { BookingNotifier } from './booking-notifier.js';
import {
  READ_CONTEXT_SQL,
  READ_NO_SHOW_COUNT_SQL,
  READ_NO_SHOW_THRESHOLD_SQL,
} from './notification-context.query.js';
import {
  INSERT_EMAIL_THONG_BAO_SQL,
  INSERT_THONG_BAO_SQL,
  INSERT_THONG_BAO_YEU_CAU_SQL,
  THONG_BAO_LICH_HEN_KEY,
  THONG_BAO_YEU_CAU_DOI_LICH_KEY,
} from './thong-bao-insert.query.js';

// Task B15 — `BookingNotifier` với `EntityManager` GIẢ (PLAN booking 5.12; TRACKING 3.37 B15-G): thứ tự câu, tham số, "không khoá", và NTF-04 (chỉ nuốt 1062 của ĐÚNG chỉ mục thong_bao_index_lich_hen; mọi lỗi khác nổi lên).
// Đơn vị, không DB; hành vi thật trên MySQL (hoàn tác, UNIQUE thật, khoá) ở `booking-notifier.int-spec.ts`.
const { CONFIRMED, CANCELLED, NO_SHOW, NO_SHOW_LOCK } =
  BOOKING_NOTIFICATION_EVENTS;

function answerOf(sql: string): unknown {
  if (sql === READ_CONTEXT_SQL) return [contextOf()];
  if (sql === READ_NO_SHOW_COUNT_SQL) return [{ soLan: 3 }];
  if (sql === READ_NO_SHOW_THRESHOLD_SQL) return [{ nguong: 3 }];
  if (sql === INSERT_THONG_BAO_SQL || sql === INSERT_THONG_BAO_YEU_CAU_SQL)
    return { insertId: 900 };
  return { insertId: 1 };
}

const setup = () => {
  const em = new ScriptedEntityManager(answerOf);
  return { em, notifier: new BookingNotifier() };
};

describe('NTF-01 (đơn vị) chuỗi câu: đọc, ghi thong_bao, ghi email — cùng em, không khoá', () => {
  it('xác nhận: SELECT ngữ cảnh, INSERT thong_bao (tài khoản ĐẶT, loại, lịch, chữ, giây), rồi INSERT email_thong_bao với id vừa chèn', async () => {
    const { em, notifier } = setup();
    await notifier.notify(em.em, eventOf(CONFIRMED));
    expect(em.queries.map((q) => q.sql)).toEqual([
      READ_CONTEXT_SQL,
      INSERT_THONG_BAO_SQL,
      INSERT_EMAIL_THONG_BAO_SQL,
    ]);
    const [, thongBao, email] = em.queries;
    const [taiKhoanId, noiDung, loai, lichHenId, thoiDiem] = thongBao!.params;
    expect([taiKhoanId, loai, lichHenId]).toEqual([
      TAI_KHOAN_DAT,
      CONFIRMED,
      LICH_HEN_ID,
    ]);
    expect(noiDung).toContain(MA_LICH_HEN);
    // `toSecond`: không có phần mili giây
    expect(thoiDiem).toBeInstanceOf(Date);
    expect((thoiDiem as Date).getMilliseconds()).toBe(0);
    expect(email!.params).toEqual(['900']);
  });

  it('ghi cho `event.taiKhoanId` (tài khoản ĐẶT mà lõi truyền vào), không suy ra người nhận từ nơi nào khác', async () => {
    const { em, notifier } = setup();
    await notifier.notify(em.em, { ...eventOf(CONFIRMED), taiKhoanId: '555' });
    expect(em.queries[1]!.params[0]).toBe('555');
  });

  it('KHÔNG có câu nào khoá hàng (không FOR UPDATE, FOR SHARE): không thêm chu trình khoá (PLAN 5.3)', async () => {
    for (const event of [
      eventOf(CONFIRMED),
      eventOf(CANCELLED, {
        huy: { reason: 'LeTanHuy', hoanCoc: null },
      }),
      eventOf(NO_SHOW),
      eventOf(NO_SHOW_LOCK),
    ]) {
      const { em, notifier } = setup();
      await notifier.notify(em.em, event);
      expect(
        em.queries.filter((q) => isLockingStatement(q.sql)),
        event.loaiSuKien,
      ).toEqual([]);
    }
  });

  it('huỷ: chữ biến thể và câu hoàn nằm trong `noi_dung` (phương án P)', async () => {
    const { em, notifier } = setup();
    await notifier.notify(
      em.em,
      eventOf(CANCELLED, {
        huy: {
          reason: 'BacSiNghiPhep',
          hoanCoc: { tyLe: 100, soTien: '100000.00' },
        },
      }),
    );
    expect(em.queries[1]!.params[1]).toBe(
      `Lịch hẹn ${MA_LICH_HEN} đã bị hủy do bác sĩ nghỉ phép. Hoàn dự kiến 100.000 VNĐ (100% tiền cọc).`,
    );
  });

  it('Vắng mặt và khoá: đọc số lần và ngưỡng SAU ngữ cảnh, rồi mới ghi', async () => {
    for (const loai of [NO_SHOW, NO_SHOW_LOCK]) {
      const { em, notifier } = setup();
      await notifier.notify(em.em, eventOf(loai));
      expect(em.queries.map((q) => q.sql)).toEqual([
        READ_CONTEXT_SQL,
        READ_NO_SHOW_COUNT_SQL,
        READ_NO_SHOW_THRESHOLD_SQL,
        INSERT_THONG_BAO_SQL,
        INSERT_EMAIL_THONG_BAO_SQL,
      ]);
      expect(em.queries[3]!.params[1]).toContain('3');
    }
  });

  it('xác nhận và huỷ KHÔNG đọc bộ đếm no-show (không đọc thừa trong giao dịch)', async () => {
    for (const event of [eventOf(CONFIRMED), eventOf(CANCELLED)]) {
      const { em, notifier } = setup();
      await notifier.notify(em.em, event);
      expect(em.queries.map((q) => q.sql)).not.toContain(
        READ_NO_SHOW_COUNT_SQL,
      );
    }
  });
});

describe('NTF-03 (đơn vị) UNIQUE trùng là "đã có"', () => {
  it('1062 của thong_bao_index_lich_hen: trả về bình thường, KHÔNG ghi dòng email thứ hai', async () => {
    const { em, notifier } = setup();
    em.failQuery = (sql) =>
      sql === INSERT_THONG_BAO_SQL
        ? duplicateEntryError(`thong_bao.${THONG_BAO_LICH_HEN_KEY}`)
        : undefined;
    await expect(
      notifier.notify(em.em, eventOf(NO_SHOW)),
    ).resolves.toBeUndefined();
    expect(em.queries.map((q) => q.sql)).not.toContain(
      INSERT_EMAIL_THONG_BAO_SQL,
    );
  });
});

describe('NTF-04 chỉ nuốt 1062 của ĐÚNG chỉ mục; mọi lỗi khác nổi lên và hoàn tác lõi', () => {
  const failWith = (error: Error) => {
    const { em, notifier } = setup();
    em.failQuery = (sql) => (sql === INSERT_THONG_BAO_SQL ? error : undefined);
    return { em, notifier };
  };

  it.each([
    [
      '1062 của chỉ mục KHÁC (yêu cầu đổi chi nhánh)',
      duplicateEntryError('thong_bao.thong_bao_index_yeu_cau_chi_nhanh'),
    ],
    ['1062 không nêu tên khoá', duplicateEntryError(null)],
    ['1062 của PRIMARY', duplicateEntryError('thong_bao.PRIMARY')],
    ['1452 khoá ngoại (tài khoản hay lịch không tồn tại)', foreignKeyError()],
    ['lỗi bất kỳ (mất kết nối)', new Error('mất kết nối')],
  ])('%s: ném lại nguyên lỗi, không ghi email', async (_name, error) => {
    const { em, notifier } = failWith(error);
    await expect(notifier.notify(em.em, eventOf(CONFIRMED))).rejects.toBe(
      error,
    );
    expect(em.queries.map((q) => q.sql)).not.toContain(
      INSERT_EMAIL_THONG_BAO_SQL,
    );
  });

  it('lỗi ở câu INSERT email_thong_bao cũng NỔI LÊN (không nuốt): lõi hoàn tác cả dòng thong_bao đã ghi', async () => {
    const { em, notifier } = setup();
    const boom = new Error('email hỏng');
    em.failQuery = (sql) =>
      sql === INSERT_EMAIL_THONG_BAO_SQL ? boom : undefined;
    await expect(notifier.notify(em.em, eventOf(CONFIRMED))).rejects.toBe(boom);
  });

  it('lỗi 1062 của chính câu INSERT email_thong_bao (thong_bao_id UNIQUE) cũng nổi lên: dữ liệu lệch, không im lặng', async () => {
    const { em, notifier } = setup();
    const dup = duplicateEntryError('email_thong_bao.thong_bao_id');
    em.failQuery = (sql) =>
      sql === INSERT_EMAIL_THONG_BAO_SQL ? dup : undefined;
    await expect(notifier.notify(em.em, eventOf(CONFIRMED))).rejects.toBe(dup);
  });

  it('lịch không tồn tại khi ghi thông báo: NÉM lỗi TRƯỚC mọi INSERT (dữ liệu lệch ⇒ hoàn tác lõi)', async () => {
    const em = new ScriptedEntityManager((sql) =>
      sql === READ_CONTEXT_SQL ? [] : answerOf(sql),
    );
    await expect(
      new BookingNotifier().notify(em.em, eventOf(CONFIRMED)),
    ).rejects.toThrow(/không có khi ghi thông báo/);
    expect(em.queries.map((q) => q.sql)).toEqual([READ_CONTEXT_SQL]);
  });
});

// reschedule B3 — bốn sự kiện đổi lịch qua `BookingNotifier` với `EntityManager` GIẢ (PLAN reschedule 5.10, 7.8): NDL-01 (chuỗi câu, tham số, "không khoá", thiếu trường ⇒ ném trước mọi INSERT), NDL-03 (1062 đúng khoá ⇒ "đã có"),
// NDL-01 ca âm (chỉ nuốt 1062 của ĐÚNG khoá của đường mình; mọi lỗi khác nổi lên). Hành vi thật trên MySQL (hoàn tác, UNIQUE, người nhận): `reschedule-notifier.int-spec.ts`.
const { RESCHEDULED } = RESCHEDULE_NOTIFICATION_EVENTS;
const MA_CU = 'CLX-20261105-0007';
const rescheduledOf = () =>
  rescheduledEvent({
    lichHenMoiId: LICH_HEN_ID,
    taiKhoanId: TAI_KHOAN_DAT,
    maLichHenCu: MA_CU,
  });
const requestOf = (loai: (typeof REQUEST_LOAI)[number]) =>
  requestEvent(loai, {
    lichHenCuId: LICH_HEN_ID,
    taiKhoanId: TAI_KHOAN_DAT,
    yeuCauId: '5',
    ghiChu: 'Ghi chú thử',
    maLichHenMoi: 'CLX-20261110-0099',
  });

describe('NDL-01 (đơn vị) chuỗi câu của bốn sự kiện đổi lịch: đọc, ghi thong_bao, ghi email — cùng em, không khoá', () => {
  it('LichHenDaDoiLich: SELECT ngữ cảnh của lịch MỚI, INSERT thong_bao theo `lich_hen_id` = lịch mới (đường cũ), rồi email với id vừa chèn', async () => {
    const { em, notifier } = setup();
    await notifier.notify(em.em, rescheduledOf());
    expect(em.queries.map((q) => q.sql)).toEqual([
      READ_CONTEXT_SQL,
      INSERT_THONG_BAO_SQL,
      INSERT_EMAIL_THONG_BAO_SQL,
    ]);
    expect(em.queries[0]!.params).toEqual([LICH_HEN_ID]);
    const [taiKhoanId, noiDung, loai, lichHenId, thoiDiem] =
      em.queries[1]!.params;
    expect([taiKhoanId, loai, lichHenId]).toEqual([
      TAI_KHOAN_DAT,
      RESCHEDULED,
      LICH_HEN_ID,
    ]);
    expect(noiDung).toContain(MA_CU);
    expect(noiDung).toContain(MA_LICH_HEN);
    expect((thoiDiem as Date).getMilliseconds()).toBe(0);
    expect(em.queries[2]!.params).toEqual(['900']);
  });

  it.each(REQUEST_LOAI)(
    '%s: INSERT thong_bao theo `yeu_cau_…_id` (KHÔNG có cột lich_hen_id), rồi email; ngữ cảnh đọc từ lịch CŨ',
    async (loai) => {
      const { em, notifier } = setup();
      await notifier.notify(em.em, requestOf(loai));
      expect(em.queries.map((q) => q.sql)).toEqual([
        READ_CONTEXT_SQL,
        INSERT_THONG_BAO_YEU_CAU_SQL,
        INSERT_EMAIL_THONG_BAO_SQL,
      ]);
      expect(INSERT_THONG_BAO_YEU_CAU_SQL).not.toMatch(/lich_hen_id/);
      expect(em.queries[0]!.params).toEqual([LICH_HEN_ID]);
      const [taiKhoanId, noiDung, loaiGhi, yeuCauId] = em.queries[1]!.params;
      expect([taiKhoanId, loaiGhi, yeuCauId]).toEqual([
        TAI_KHOAN_DAT,
        loai,
        '5',
      ]);
      expect(noiDung).toContain(MA_LICH_HEN);
      expect(em.queries[2]!.params).toEqual(['900']);
    },
  );

  it('ghi cho `event.taiKhoanId` do người gọi truyền (tài khoản ĐẶT), không suy ra người nhận từ nơi nào khác', async () => {
    for (const event of [rescheduledOf(), requestOf(REQUEST_LOAI[0])]) {
      const { em, notifier } = setup();
      await notifier.notify(em.em, { ...event, taiKhoanId: '555' });
      expect(em.queries[1]!.params[0], event.loaiSuKien).toBe('555');
    }
  });

  it('KHÔNG có câu nào khoá hàng và KHÔNG đọc bộ đếm no-show (không thêm chu trình khoá, không đọc thừa)', () => {
    return Promise.all(
      [rescheduledOf(), ...REQUEST_LOAI.map(requestOf)].map(async (event) => {
        const { em, notifier } = setup();
        await notifier.notify(em.em, event);
        expect(
          em.queries.filter((q) => isLockingStatement(q.sql)),
          event.loaiSuKien,
        ).toEqual([]);
        expect(em.queries.map((q) => q.sql)).not.toContain(
          READ_NO_SHOW_COUNT_SQL,
        );
      }),
    );
  });

  it('thiếu `doiLich` hay `yeuCau` là lỗi lập trình của người gọi: NÉM sau câu đọc, TRƯỚC mọi INSERT (hoàn tác hành động gốc)', async () => {
    const withoutDoiLich = { ...rescheduledOf() };
    delete withoutDoiLich.doiLich;
    const withoutYeuCau = { ...requestOf(REQUEST_LOAI[1]) };
    delete withoutYeuCau.yeuCau;
    for (const event of [withoutDoiLich, withoutYeuCau]) {
      const { em, notifier } = setup();
      await expect(notifier.notify(em.em, event)).rejects.toThrow(/thiếu/);
      expect(em.queries.map((q) => q.sql)).toEqual([READ_CONTEXT_SQL]);
    }
  });

  it('lịch không tồn tại khi ghi thông báo đổi lịch: NÉM trước mọi INSERT (dữ liệu lệch)', async () => {
    const em = new ScriptedEntityManager((sql) =>
      sql === READ_CONTEXT_SQL ? [] : answerOf(sql),
    );
    await expect(
      new BookingNotifier().notify(em.em, rescheduledOf()),
    ).rejects.toThrow(/không có khi ghi thông báo/);
    expect(em.queries.map((q) => q.sql)).toEqual([READ_CONTEXT_SQL]);
  });
});

describe('NDL-03 (đơn vị) UNIQUE trùng của đổi lịch là "đã có": không lỗi, không dòng email thứ hai', () => {
  it('ba loại yêu cầu: 1062 của thong_bao_index_yeu_cau_doi_lich ⇒ trả về bình thường, KHÔNG ghi email', async () => {
    for (const loai of REQUEST_LOAI) {
      const { em, notifier } = setup();
      em.failQuery = (sql) =>
        sql === INSERT_THONG_BAO_YEU_CAU_SQL
          ? duplicateEntryError(`thong_bao.${THONG_BAO_YEU_CAU_DOI_LICH_KEY}`)
          : undefined;
      await expect(
        notifier.notify(em.em, requestOf(loai)),
      ).resolves.toBeUndefined();
      expect(
        em.queries.map((q) => q.sql),
        loai,
      ).not.toContain(INSERT_EMAIL_THONG_BAO_SQL);
    }
  });

  it('LichHenDaDoiLich: 1062 của thong_bao_index_lich_hen ⇒ "đã có", KHÔNG ghi email', async () => {
    const { em, notifier } = setup();
    em.failQuery = (sql) =>
      sql === INSERT_THONG_BAO_SQL
        ? duplicateEntryError(`thong_bao.${THONG_BAO_LICH_HEN_KEY}`)
        : undefined;
    await expect(
      notifier.notify(em.em, rescheduledOf()),
    ).resolves.toBeUndefined();
    expect(em.queries.map((q) => q.sql)).not.toContain(
      INSERT_EMAIL_THONG_BAO_SQL,
    );
  });
});

describe('NDL-01 (đơn vị) ca âm: mỗi đường chỉ nuốt 1062 của ĐÚNG khoá của mình; mọi lỗi khác nổi lên và hoàn tác hành động gốc', () => {
  it.each([
    [
      'yêu cầu: 1062 của khoá lịch hẹn (khoá của đường khác)',
      requestOf(REQUEST_LOAI[0]),
      INSERT_THONG_BAO_YEU_CAU_SQL,
      duplicateEntryError(`thong_bao.${THONG_BAO_LICH_HEN_KEY}`),
    ],
    [
      'yêu cầu: 1062 của yêu cầu đổi chi nhánh',
      requestOf(REQUEST_LOAI[1]),
      INSERT_THONG_BAO_YEU_CAU_SQL,
      duplicateEntryError('thong_bao.thong_bao_index_yeu_cau_chi_nhanh'),
    ],
    [
      'yêu cầu: 1062 không nêu tên khoá',
      requestOf(REQUEST_LOAI[2]),
      INSERT_THONG_BAO_YEU_CAU_SQL,
      duplicateEntryError(null),
    ],
    [
      'yêu cầu: 1452 (yêu cầu hay tài khoản không tồn tại)',
      requestOf(REQUEST_LOAI[0]),
      INSERT_THONG_BAO_YEU_CAU_SQL,
      foreignKeyError(),
    ],
    [
      'đã đổi lịch: 1062 của khoá yêu cầu (khoá của đường khác)',
      rescheduledOf(),
      INSERT_THONG_BAO_SQL,
      duplicateEntryError(`thong_bao.${THONG_BAO_YEU_CAU_DOI_LICH_KEY}`),
    ],
    [
      'đã đổi lịch: 1452',
      rescheduledOf(),
      INSERT_THONG_BAO_SQL,
      foreignKeyError(),
    ],
    [
      'lỗi email_thong_bao của yêu cầu',
      requestOf(REQUEST_LOAI[1]),
      INSERT_EMAIL_THONG_BAO_SQL,
      new Error('email hỏng'),
    ],
    [
      'lỗi email_thong_bao của đã đổi lịch',
      rescheduledOf(),
      INSERT_EMAIL_THONG_BAO_SQL,
      new Error('email hỏng'),
    ],
  ])('%s: ném lại nguyên lỗi', async (_name, event, failingSql, error) => {
    const { em, notifier } = setup();
    em.failQuery = (sql) => (sql === failingSql ? error : undefined);
    await expect(notifier.notify(em.em, event)).rejects.toBe(error);
  });
});
