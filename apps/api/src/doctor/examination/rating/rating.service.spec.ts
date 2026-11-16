import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { ScriptedEntityManager } from '../../../appointments/testing/scripted-entity-manager.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { RatingDto } from './rating.dto.js';
import {
  INSERT_RATING_SQL,
  READ_OWNED_FOR_RATING_SQL,
  READ_RATING_SQL,
} from './rating.repository.js';
import { RatingService } from './rating.service.js';

// doctor-exam B6 — RatingService, tầng ĐƠN VỊ (không DB): thứ tự câu lệnh, sở hữu trước trạng thái, 1062, thử lại, lịch lấy từ lịch đã đọc (PLAN 5.3, 5.7; DGB-01…DGB-06, DGB-09, DGB-10, DGB-16).
// `DataSource` giả chỉ có `query` (đọc thường) và `transaction` (chạy thân với một `EntityManager` giả); `withBookingTransaction` là mã THẬT. Phần MySQL thật (UNIQUE, CHECK, khoá, đua):
// rating.int-spec.ts và rating.concurrency.int-spec.ts.
const CODE = 'CLX-20261110-7K3QD';
const PATIENT = '55';
const OWNED = { lichHenId: '900', trangThai: 'HoanThanh' };
/** 09:00 ngày 10/11/2026 giờ VN = 02:00Z */
const NOW = new Date('2026-11-10T09:00:00+07:00');
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

const body = (overrides: Partial<RatingDto> = {}): RatingDto => ({
  soSao: 4,
  nhanXet: 'Bác sĩ tận tình',
  ...overrides,
});

/** Lỗi MySQL giả như driver: 1062 trùng khoá, 1213 deadlock */
const mysqlFailure = (errno: 1062 | 1213 | 1452) =>
  Object.assign(new Error('lỗi MySQL giả'), {
    errno,
    code: {
      1062: 'ER_DUP_ENTRY',
      1213: 'ER_LOCK_DEADLOCK',
      1452: 'ER_NO_REFERENCED_ROW_2',
    }[errno],
  });

interface Options {
  /** Dòng lịch đọc thường; `null` = không có; mặc định lịch `HoanThanh` của mình */
  owned?: { lichHenId: string; trangThai: string } | null;
  /** Lỗi ném ở MỖI `INSERT` đầu tiên, theo thứ tự (số lần = độ dài mảng); sau đó `INSERT` thành công */
  insertFails?: Error[];
  /** Đọc lại không thấy dòng (không thể xảy ra ở DB thật) */
  noReadBack?: boolean;
}

function setup(options: Options = {}) {
  const fails = [...(options.insertFails ?? [])];
  let stored: {
    soSao: number;
    nhanXet: string | null;
    thoiDiemTao: Date;
  } | null = null;
  const em = new ScriptedEntityManager((sql, params) => {
    if (/@@session/.test(sql)) return [{ value: '50' }];
    if (sql === INSERT_RATING_SQL) {
      const [, soSao, nhanXet, thoiDiemTao] = params as [
        string,
        number,
        string | null,
        Date,
      ];
      stored = { soSao, nhanXet, thoiDiemTao };
      return { insertId: '7' };
    }
    if (sql === READ_RATING_SQL)
      return options.noReadBack === true || stored === null ? [] : [stored];
    return [];
  });
  em.failQuery = (sql) =>
    sql === INSERT_RATING_SQL ? fails.shift() : undefined;
  const query = vi.fn((..._args: unknown[]) =>
    Promise.resolve(options.owned === null ? [] : [options.owned ?? OWNED]),
  );
  const transaction = vi.fn(
    (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
      work(em.em),
  );
  const service = new RatingService({
    query,
    transaction,
  } as unknown as DataSource);
  /** Câu của THÂN giao dịch (bỏ câu đặt phiên) */
  const statements = () =>
    em.queries
      .map(({ sql }) => sql)
      .filter((sql) => !/^\s*SET SESSION|@@session/i.test(sql));
  return { service, em, query, transaction, statements };
}

/** `AppException` mà lời hứa ném ra (không ném hay lỗi khác thì làm test đỏ). */
async function appException(work: Promise<unknown>): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'phải bị từ chối bằng AppException').toBeInstanceOf(
    AppException,
  );
  return error as AppException;
}

/** Các dòng cảnh báo thử lại của `withBookingTransaction` */
let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DGB-01, DGB-16 gửi đánh giá: đọc thường NGOÀI giao dịch, rồi INSERT và đọc lại TRONG giao dịch', () => {
  it('đọc thường đúng một lần với (Bệnh nhân, mã) theo thứ tự đó; một giao dịch READ COMMITTED; thân gồm đúng INSERT rồi đọc lại; INSERT nhận lịch đã đọc, số sao, nhận xét đã chuẩn hoá, mốc now', async () => {
    const t = setup();
    const view = await t.service.submit(
      PATIENT,
      CODE,
      body({ soSao: 4, nhanXet: '  Tốt\r\nlắm \u0001 ' }),
    );
    expect(t.query.mock.calls).toEqual([
      [READ_OWNED_FOR_RATING_SQL, [PATIENT, CODE]],
    ]);
    expect(t.transaction).toHaveBeenCalledTimes(1);
    expect(t.transaction.mock.calls[0]?.[0]).toBe('READ COMMITTED');
    expect(t.statements()).toEqual([INSERT_RATING_SQL, READ_RATING_SQL]);
    expect(
      t.em.queries.find((q) => q.sql === INSERT_RATING_SQL)?.params,
    ).toEqual(['900', 4, 'Tốt\nlắm', NOW]);
    expect(view).toEqual({
      soSao: 4,
      nhanXet: 'Tốt\nlắm',
      thoiDiemTao: NOW.toISOString(),
    });
  });

  it('nhận xét bỏ trống hoặc chỉ khoảng trắng ⇒ INSERT tham số null và phản hồi nhanXet null (không chuỗi rỗng)', async () => {
    for (const nhanXet of [undefined, null, '', '   \n  ']) {
      const t = setup();
      const view = await t.service.submit(PATIENT, CODE, body({ nhanXet }));
      expect(
        t.em.queries.find((q) => q.sql === INSERT_RATING_SQL)?.params[2],
      ).toBeNull();
      expect(view.nhanXet).toBeNull();
    }
  });

  it('mốc now là giây tròn (toSecond) kể cả khi đồng hồ ở :59.999: không làm tròn sang ngày sau (DGB-01, X1 M11)', async () => {
    vi.setSystemTime(new Date('2026-11-30T23:59:59.999+07:00'));
    const t = setup();
    const view = await t.service.submit(PATIENT, CODE, body());
    const stamp = t.em.queries.find((q) => q.sql === INSERT_RATING_SQL)
      ?.params[3] as Date;
    expect(stamp.getTime()).toBe(
      new Date('2026-11-30T23:59:59.000+07:00').getTime(),
    );
    expect(view.thoiDiemTao).toBe('2026-11-30T16:59:59.000Z');
  });

  it('DGB-16 chỉ đụng danh_gia_bac_si: không bảng nào khác (nhật ký, thông báo, email, hồ sơ, lịch) trong thân giao dịch', async () => {
    const t = setup();
    await t.service.submit(PATIENT, CODE, body());
    expect(t.statements().every((sql) => /danh_gia_bac_si/.test(sql))).toBe(
      true,
    );
    expect(t.statements().join('\n')).not.toMatch(
      /nhat_ky|thong_bao|email|ho_so_kham|UPDATE|DELETE|FOR UPDATE/i,
    );
  });

  it('giao dịch đặt rồi khôi phục innodb_lock_wait_timeout quanh INSERT (trần chờ khoá 3 giây của withBookingTransaction)', async () => {
    const t = setup();
    await t.service.submit(PATIENT, CODE, body());
    const sqls = t.em.queries.map(({ sql }) => sql);
    expect(sqls[0]).toMatch(/@@session\.innodb_lock_wait_timeout/);
    expect(t.em.queries[1]).toMatchObject({
      sql: 'SET SESSION innodb_lock_wait_timeout = ?',
      params: [3],
    });
    expect(sqls[2]).toBe(INSERT_RATING_SQL);
    expect(t.em.queries.at(-1)).toMatchObject({
      sql: 'SET SESSION innodb_lock_wait_timeout = ?',
      params: [50],
    });
  });
});

describe('DGB-02 dữ liệu vào sai ⇒ 400 loi[] và KHÔNG chạm DB (không đọc, không giao dịch)', () => {
  it('số sao sai ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[{ soSao, mã }]; nhận xét quá dài ⇒ QUA_DAI; cả hai ⇒ hai lỗi', async () => {
    const t = setup();
    const bad = await appException(
      t.service.submit(PATIENT, CODE, body({ soSao: 3.5 })),
    );
    expect(bad.getStatus()).toBe(400);
    expect(bad.getResponse()).toMatchObject({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'soSao', ma: 'SO_SAO_KHONG_HOP_LE' }],
    });
    const both = await appException(
      t.service.submit(
        PATIENT,
        CODE,
        body({ soSao: undefined, nhanXet: 'a'.repeat(1001) }),
      ),
    );
    expect(both.getResponse()).toMatchObject({
      loi: [
        { truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' },
        { truong: 'nhanXet', ma: 'QUA_DAI' },
      ],
    });
    expect(t.query).not.toHaveBeenCalled();
    expect(t.transaction).not.toHaveBeenCalled();
  });
});

describe('DGB-06 sở hữu TRƯỚC trạng thái: lịch không phải của mình (hay không có) ⇒ 404 CÙNG thân, không giao dịch', () => {
  it('không có dòng ⇒ 404 KHONG_TIM_THAY, thân đúng như mã không tồn tại; không mở giao dịch', async () => {
    const t = setup({ owned: null });
    const error = await appException(t.service.submit(PATIENT, CODE, body()));
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual(NOT_FOUND_BODY);
    expect(t.transaction).not.toHaveBeenCalled();
    expect(t.em.queries).toEqual([]);
  });

  it('chủ sở hữu là điều kiện CỦA CHÍNH câu đọc (Bệnh nhân từ token đứng trước mã) nên lịch người khác ở mọi trạng thái cho "không dòng" ⇒ 404, không bao giờ tới nhánh 409 để lộ trạng thái (kiểm với MySQL thật ở DGB-06, rating.int-spec)', async () => {
    const t = setup({ owned: null });
    const error = await appException(t.service.submit('99', CODE, body()));
    expect(error.getResponse()).toEqual(NOT_FOUND_BODY);
    expect(t.query.mock.calls).toEqual([
      [READ_OWNED_FOR_RATING_SQL, ['99', CODE]],
    ]);
  });
});

describe('DGB-04 lịch chưa HoanThanh ⇒ 409 LICH_HEN_CHUA_HOAN_THANH kèm chiTiet.trangThai; không giao dịch, không ghi', () => {
  it.each([
    'ChoThanhToan',
    'DaXacNhan',
    'DaTiepDon',
    'DaHuy',
    'VangMat',
    'DaDoiLich',
  ])('%s', async (trangThai) => {
    const t = setup({ owned: { lichHenId: '900', trangThai } });
    const error = await appException(t.service.submit(PATIENT, CODE, body()));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      maLoi: 'LICH_HEN_CHUA_HOAN_THANH',
      chiTiet: { trangThai },
    });
    expect(t.transaction).not.toHaveBeenCalled();
    expect(t.em.queries).toEqual([]);
  });
});

describe('DGB-05, DGB-09 UNIQUE lich_hen_id: 1062 ⇒ 409 DA_DANH_GIA; lỗi khác đi nguyên ra; 1062 không được thử lại', () => {
  it('1062 ở INSERT ⇒ 409 DA_DANH_GIA (không 500), không có chiTiet, KHÔNG đọc lại; INSERT chỉ một lần (1062 không phải lỗi thử lại)', async () => {
    const t = setup({ insertFails: [mysqlFailure(1062)] });
    const error = await appException(t.service.submit(PATIENT, CODE, body()));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      maLoi: 'DA_DANH_GIA',
      thongBao: expect.any(String) as string,
    });
    expect(t.statements()).toEqual([INSERT_RATING_SQL]);
    expect(t.transaction).toHaveBeenCalledTimes(1);
    expect(warnings).toEqual([]);
  });

  it('lỗi khác 1062 (ví dụ 1452 khoá ngoại) đi NGUYÊN RA, không bị đổi thành DA_DANH_GIA hay AppException', async () => {
    const failure = mysqlFailure(1452);
    const t = setup({ insertFails: [failure] });
    await expect(t.service.submit(PATIENT, CODE, body())).rejects.toBe(failure);
  });

  it('đọc lại không thấy dòng vừa ghi ⇒ lỗi thường (500), không AppException', async () => {
    const t = setup({ noReadBack: true });
    const error = await t.service.submit(PATIENT, CODE, body()).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
  });
});

describe('thử lại của withBookingTransaction (1213, 1205): chạy lại thân an toàn, hết lượt ⇒ 503', () => {
  it('1213 ở lần chạy đầu ⇒ chạy lại và 201; cảnh báo mang nhãn exam-rating', async () => {
    const t = setup({ insertFails: [mysqlFailure(1213)] });
    const view = await t.service.submit(PATIENT, CODE, body());
    expect(view.soSao).toBe(4);
    expect(t.transaction).toHaveBeenCalledTimes(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^exam-rating: MySQL 1213 ở lần chạy 1\/3/);
  });

  it('1213 ở cả ba lần chạy ⇒ 503 HE_THONG_DANG_BAN (không 500, không 201)', async () => {
    const t = setup({
      insertFails: [mysqlFailure(1213), mysqlFailure(1213), mysqlFailure(1213)],
    });
    const error = await appException(t.service.submit(PATIENT, CODE, body()));
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ maLoi: 'HE_THONG_DANG_BAN' });
    expect(t.transaction).toHaveBeenCalledTimes(3);
  });
});

describe('DGB-10 chủ sở hữu và lịch KHÔNG bao giờ lấy từ thân', () => {
  it('thân mang lichHenId, benhNhanId, bacSiId, biAn (DTO đã chặn ở HTTP; ở đây ép qua kiểu): đọc thường vẫn dùng Bệnh nhân từ token và mã trên đường dẫn; INSERT dùng lịch đã đọc', async () => {
    const t = setup();
    const hostile = {
      soSao: 4,
      nhanXet: 'Bác sĩ tận tình',
      lichHenId: '1',
      benhNhanId: '2',
      bacSiId: '3',
      biAn: true,
      lyDoAn: 'x',
    } as RatingDto;
    await t.service.submit(PATIENT, CODE, hostile);
    expect(t.query.mock.calls[0]?.[1]).toEqual([PATIENT, CODE]);
    expect(
      t.em.queries.find((q) => q.sql === INSERT_RATING_SQL)?.params,
    ).toEqual(['900', 4, 'Bác sĩ tận tình', NOW]);
  });

  it('INSERT luôn do repository dựng: bi_an và ly_do_an là hằng trong câu (0 và NULL), không phải tham số', () => {
    expect(INSERT_RATING_SQL).toMatch(/VALUES \(\?, \?, \?, 0, NULL, \?\)/);
  });
});
