import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../../../appointments/testing/scripted-entity-manager.js';
import type { AuditService } from '../../../audit/audit.service.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { READ_OWNED_APPOINTMENT_SQL } from '../completion/exam-completion.repository.js';
import type { ExamRecordDto } from './exam-record.dto.js';
import type { StoredRecord } from './exam-record.repository.js';
import { ExamRecordService } from './exam-record.service.js';

// doctor-exam B2 — ExamRecordService, tầng ĐƠN VỊ (không DB): thứ tự câu lệnh, kiểm lại dưới khoá, token, nhật ký, ánh xạ lỗi, thử lại (PLAN 5.3, 5.5; HSK-01…HSK-05, HSK-07…HSK-10, HSK-12, HSK-13, HSK-18, HSK-20, HSK-23, HSK-24, HSK-25).
// `DataSource` giả chỉ có `query` (đọc thường) và `transaction` (chạy thân với một `EntityManager` giả có trạng thái hồ sơ); `withBookingTransaction` là mã THẬT. Phần MySQL thật (khoá, hoàn tác, UNIQUE, nhật ký thật):
// exam-record.int-spec.ts và exam-record.concurrency.int-spec.ts.
const CODE = 'CLX-20261110-7K3QD';
const DOCTOR = '41';
const OWNED = { lichHenId: '900', maLichHen: CODE, benhNhanId: '55' };
const LICH = {
  bacSiId: DOCTOR,
  trangThai: 'DaTiepDon',
  chiNhanhId: '3',
  ngayKham: '2026-11-10',
};
/** 09:00 ngày 10/11/2026 giờ VN = 02:00Z */
const NOW = new Date('2026-11-10T09:00:00+07:00');
const STORED: StoredRecord = {
  hoSoKhamId: '9',
  trieuChung: 'Ho cũ',
  chanDoanSoBo: 'Viêm họng cũ',
  huongXuLy: 'Nghỉ cũ',
  ngayTaiKhamDuKien: null,
  // 08:00 giờ VN, tức một giờ trước NOW
  capNhatLanCuoi: new Date('2026-11-10T08:00:00+07:00'),
};
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

const body = (overrides: Partial<ExamRecordDto> = {}): ExamRecordDto => ({
  trieuChung: 'Ho khan',
  chanDoanSoBo: 'Viêm họng',
  huongXuLy: 'Nghỉ ngơi',
  ngayTaiKhamDuKien: null,
  capNhatLanCuoi: null,
  ...overrides,
});

interface Options {
  owned?: typeof OWNED | null;
  /** Dòng lịch DƯỚI KHOÁ (ghi đè từng trường); `null` = không còn dòng */
  lich?: Partial<typeof LICH> | null;
  /** Dòng hồ sơ hiện có; `null` hoặc bỏ trống = chưa có */
  stored?: StoredRecord | null;
  auditFails?: Error;
}

function setup(options: Options = {}) {
  const lich = options.lich === null ? null : { ...LICH, ...options.lich };
  let stored: StoredRecord | null = options.stored ?? null;
  const em = new ScriptedEntityManager((sql, params) => {
    if (/@@session/.test(sql)) return [{ value: '50' }];
    if (/FROM lich_hen WHERE lich_hen_id = \? FOR UPDATE/.test(sql))
      return lich === null ? [] : [lich];
    if (/FROM ho_so_kham WHERE lich_hen_id = \? FOR UPDATE/.test(sql))
      return stored === null ? [] : [stored];
    if (sql.startsWith('INSERT INTO ho_so_kham')) {
      const [, trieuChung, chanDoanSoBo, huongXuLy, ngay, stamp] = params as [
        string,
        string,
        string,
        string,
        string | null,
        Date,
      ];
      stored = {
        hoSoKhamId: '9',
        trieuChung,
        chanDoanSoBo,
        huongXuLy,
        ngayTaiKhamDuKien: ngay,
        capNhatLanCuoi: stamp,
      };
      return { insertId: '9' };
    }
    if (sql.startsWith('UPDATE ho_so_kham')) {
      const [trieuChung, chanDoanSoBo, huongXuLy, ngay, stamp, id] = params as [
        string,
        string,
        string,
        string | null,
        Date,
        string,
      ];
      stored = {
        hoSoKhamId: id,
        trieuChung,
        chanDoanSoBo,
        huongXuLy,
        ngayTaiKhamDuKien: ngay,
        capNhatLanCuoi: stamp,
      };
      return { affectedRows: 1 };
    }
    if (/FROM ho_so_kham WHERE lich_hen_id = \?\s*$/.test(sql))
      return stored === null ? [] : [stored];
    return [];
  });
  const query = vi.fn((..._args: unknown[]) =>
    Promise.resolve(options.owned === null ? [] : [options.owned ?? OWNED]),
  );
  const transaction = vi.fn(
    (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
      work(em.em),
  );
  const record = vi.fn((..._args: unknown[]) =>
    options.auditFails === undefined
      ? Promise.resolve()
      : Promise.reject(options.auditFails),
  );
  const service = new ExamRecordService(
    { query, transaction } as unknown as DataSource,
    { record } as unknown as AuditService,
  );
  /** Câu của THÂN giao dịch (bỏ câu đặt phiên) */
  const statements = () =>
    em.queries
      .map(({ sql }) => sql)
      .filter((sql) => !/^\s*SET SESSION|@@session/i.test(sql));
  return { service, em, query, transaction, record, statements };
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

/** Các dòng cảnh báo thử lại của `withBookingTransaction` (`<nhãn>: MySQL 1213 ở lần chạy n/3, thử lại`) */
let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  // Đồng hồ giả đứng yên ở NOW; log cảnh báo thử lại của `withBookingTransaction` được bắt để kiểm nhãn
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

describe('HSK-01, HSK-02 ghi lần đầu', () => {
  it('HSK-01 lịch DaTiepDon, chưa có hồ sơ: đọc thường NGOÀI giao dịch; trong giao dịch đúng chuỗi khoá lich_hen → khoá ho_so_kham → INSERT → đọc lại; INSERT nhận nội dung ĐÃ CHUẨN HOÁ và mốc now; KHÔNG nhật ký', async () => {
    const t = setup();
    const view = await t.service.save(
      DOCTOR,
      CODE,
      body({
        trieuChung: '  Ho khan\r\nsốt \u0001',
        ngayTaiKhamDuKien: '2026-11-20',
      }),
    );
    expect(t.query.mock.calls).toEqual([
      [READ_OWNED_APPOINTMENT_SQL, [CODE, DOCTOR]],
    ]);
    expect(t.transaction).toHaveBeenCalledTimes(1);
    const sql = t.statements();
    expect(sql).toHaveLength(4);
    expect(sql[0]).toMatch(/FROM lich_hen WHERE lich_hen_id = \? FOR UPDATE/);
    expect(sql[1]).toMatch(/FROM ho_so_kham WHERE lich_hen_id = \? FOR UPDATE/);
    expect(sql[2]).toMatch(/^INSERT INTO ho_so_kham/);
    expect(sql[3]).toMatch(/FROM ho_so_kham WHERE lich_hen_id = \?\s*$/);
    expect(
      t.em.queries.find((q) => q.sql.startsWith('INSERT'))?.params,
    ).toEqual([
      '900',
      'Ho khan\nsốt',
      'Viêm họng',
      'Nghỉ ngơi',
      '2026-11-20',
      NOW,
    ]);
    expect(t.record).not.toHaveBeenCalled();
    expect(view).toEqual({
      trieuChung: 'Ho khan\nsốt',
      chanDoanSoBo: 'Viêm họng',
      huongXuLy: 'Nghỉ ngơi',
      ngayTaiKhamDuKien: '2026-11-20',
      capNhatLanCuoi: NOW.toISOString(),
    });
  });

  it('HSK-02 lịch HoanThanh, chưa có hồ sơ (ghi lần đầu sau Hoàn thành): INSERT, KHÔNG nhật ký (Q3)', async () => {
    const t = setup({ lich: { trangThai: 'HoanThanh' } });
    await t.service.save(DOCTOR, CODE, body());
    expect(
      t.statements().some((sql) => sql.startsWith('INSERT INTO ho_so_kham')),
    ).toBe(true);
    expect(t.record).not.toHaveBeenCalled();
  });

  it('mốc now là giây tròn theo giờ VN (toSecond) kể cả khi đồng hồ ở :59.999 (HSK-19, X1 M11)', async () => {
    vi.setSystemTime(new Date('2026-11-30T23:59:59.999+07:00'));
    const t = setup();
    await t.service.save(DOCTOR, CODE, body());
    expect(
      t.em.queries.find((q) => q.sql.startsWith('INSERT'))?.params.at(-1),
    ).toEqual(new Date('2026-11-30T23:59:59.000+07:00'));
  });
});

describe('HSK-03, HSK-04 sửa; Q3 nhật ký khi và chỉ khi HoanThanh và đã có hồ sơ', () => {
  it('HSK-03 sửa khi HoanThanh và đã có hồ sơ: UPDATE rồi AuditService.record SuaGhiChuKham bằng ĐÚNG em của giao dịch, SAU UPDATE; chỉ trường đổi; branchId của LỊCH; targetId = ho_so_kham_id; mốc mới', async () => {
    const t = setup({ lich: { trangThai: 'HoanThanh' }, stored: STORED });
    let queriesAtAudit: string[] = [];
    t.record.mockImplementation(() => {
      queriesAtAudit = t.statements();
      return Promise.resolve();
    });
    const view = await t.service.save(
      DOCTOR,
      CODE,
      body({
        trieuChung: STORED.trieuChung ?? '',
        chanDoanSoBo: STORED.chanDoanSoBo ?? '',
        huongXuLy: 'Nghỉ ngơi mới',
        capNhatLanCuoi: STORED.capNhatLanCuoi.toISOString(),
      }),
    );
    expect(t.record).toHaveBeenCalledTimes(1);
    expect(t.record.mock.calls[0]).toEqual([
      t.em.em,
      {
        actorId: DOCTOR,
        branchId: '3',
        action: 'SuaGhiChuKham',
        targetType: 'ho_so_kham',
        targetId: '9',
        result: 'ThanhCong',
        changes: {
          truoc: { huong_xu_ly: 'Nghỉ cũ' },
          sau: { huong_xu_ly: 'Nghỉ ngơi mới' },
        },
      },
    ]);
    expect(queriesAtAudit.at(-1)).toMatch(/^UPDATE ho_so_kham/);
    expect(view.huongXuLy).toBe('Nghỉ ngơi mới');
    expect(view.capNhatLanCuoi).toBe(NOW.toISOString());
  });

  it('HSK-04 sửa khi lịch còn DaTiepDon: UPDATE, KHÔNG nhật ký', async () => {
    const t = setup({ stored: STORED });
    await t.service.save(
      DOCTOR,
      CODE,
      body({ capNhatLanCuoi: STORED.capNhatLanCuoi.toISOString() }),
    );
    expect(
      t.statements().some((sql) => sql.startsWith('UPDATE ho_so_kham')),
    ).toBe(true);
    expect(t.record).not.toHaveBeenCalled();
  });

  it('HSK-12 gửi y hệt nội dung hiện có (token đúng): 200, KHÔNG ghi, KHÔNG nhật ký, trả bản cũ với capNhatLanCuoi cũ', async () => {
    const t = setup({ lich: { trangThai: 'HoanThanh' }, stored: STORED });
    const view = await t.service.save(
      DOCTOR,
      CODE,
      body({
        trieuChung: 'Ho cũ',
        chanDoanSoBo: 'Viêm họng cũ',
        huongXuLy: 'Nghỉ cũ',
        capNhatLanCuoi: STORED.capNhatLanCuoi.toISOString(),
      }),
    );
    expect(t.statements()).toHaveLength(2);
    expect(t.record).not.toHaveBeenCalled();
    expect(view.capNhatLanCuoi).toBe(STORED.capNhatLanCuoi.toISOString());
  });

  it('HSK-12 khác chỉ hoa/thường ⇒ được coi là ĐỔI (so `===`, không theo collation): có UPDATE và nhật ký', async () => {
    const t = setup({ lich: { trangThai: 'HoanThanh' }, stored: STORED });
    await t.service.save(
      DOCTOR,
      CODE,
      body({
        trieuChung: 'HO CŨ',
        chanDoanSoBo: 'Viêm họng cũ',
        huongXuLy: 'Nghỉ cũ',
        capNhatLanCuoi: STORED.capNhatLanCuoi.toISOString(),
      }),
    );
    expect(
      t.statements().some((sql) => sql.startsWith('UPDATE ho_so_kham')),
    ).toBe(true);
    expect(t.record).toHaveBeenCalledTimes(1);
  });

  it('HSK-25 hai lần ghi CÙNG một giây: lần sau lấy bản cũ + 1 giây (token KHÁC nhau), không phải now', async () => {
    const sameSecond = { ...STORED, capNhatLanCuoi: NOW };
    const t = setup({ stored: sameSecond });
    const view = await t.service.save(
      DOCTOR,
      CODE,
      body({ capNhatLanCuoi: NOW.toISOString() }),
    );
    const stamp = new Date(NOW.getTime() + 1000);
    expect(
      t.em.queries.find((q) => q.sql.startsWith('UPDATE'))?.params.at(-2),
    ).toEqual(stamp);
    expect(view.capNhatLanCuoi).toBe(stamp.toISOString());
    expect(view.capNhatLanCuoi).not.toBe(NOW.toISOString());
  });
});

describe('HSK-13 sửa chồng theo token capNhatLanCuoi ⇒ 409 HO_SO_KHAM_DA_THAY_DOI, không ghi', () => {
  it.each([
    ['token null khi ĐÃ có hồ sơ', STORED, null],
    ['token cũ (khác bản hiện có)', STORED, '2026-11-10T00:00:00.000Z'],
    [
      'token khác null khi CHƯA có hồ sơ',
      null,
      STORED.capNhatLanCuoi.toISOString(),
    ],
  ])('%s', async (_name, stored, token) => {
    const t = setup({ stored });
    const error = await appException(
      t.service.save(DOCTOR, CODE, body({ capNhatLanCuoi: token })),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      maLoi: 'HO_SO_KHAM_DA_THAY_DOI',
    });
    expect(
      t.statements().filter((sql) => /^(INSERT|UPDATE)/.test(sql)),
    ).toEqual([]);
    expect(t.record).not.toHaveBeenCalled();
  });

  it('token khớp ⇒ ghi được', async () => {
    const t = setup({ stored: STORED });
    await expect(
      t.service.save(
        DOCTOR,
        CODE,
        body({ capNhatLanCuoi: STORED.capNhatLanCuoi.toISOString() }),
      ),
    ).resolves.toMatchObject({ trieuChung: 'Ho khan' });
  });
});

describe('HSK-09, HSK-10 sở hữu TRƯỚC trạng thái; kiểm LẠI dưới khoá', () => {
  it('HSK-10 không có lịch của bác sĩ này (của bác sĩ khác, không tồn tại, mã sai dạng) ⇒ 404 KHONG_TIM_THAY cùng thân; KHÔNG mở giao dịch', async () => {
    const t = setup({ owned: null });
    const error = await appException(t.service.save(DOCTOR, CODE, body()));
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual(NOT_FOUND_BODY);
    expect(t.transaction).not.toHaveBeenCalled();
    expect(t.em.queries).toEqual([]);
  });

  it('HSK-10 lịch đổi chủ hay biến mất giữa lần đọc thường và khoá ⇒ 404 cùng thân; chỉ MỘT câu khoá lich_hen đã chạy', async () => {
    for (const lich of [{ bacSiId: '99' }, null]) {
      const t = setup({ lich });
      const error = await appException(t.service.save(DOCTOR, CODE, body()));
      expect(error.getResponse()).toEqual(NOT_FOUND_BODY);
      expect(t.statements()).toHaveLength(1);
    }
  });

  it.each(['ChoThanhToan', 'DaXacNhan', 'DaHuy', 'VangMat', 'DaDoiLich'])(
    'HSK-09 lịch %s ⇒ 409 KHONG_THE_GHI_HO_SO_KHAM kèm chiTiet { trangThai }; không khoá hồ sơ, không ghi',
    async (trangThai) => {
      const t = setup({ lich: { trangThai }, stored: STORED });
      const error = await appException(t.service.save(DOCTOR, CODE, body()));
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'KHONG_THE_GHI_HO_SO_KHAM',
        chiTiet: { trangThai },
      });
      expect(t.statements()).toHaveLength(1);
      expect(t.record).not.toHaveBeenCalled();
    },
  );
});

describe('HSK-07 ngày tái khám so với ngày khám DƯỚI khoá', () => {
  it('trước ngày khám hoặc sau +365 ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[{ ngayTaiKhamDuKien, NGAY_KHONG_HOP_LE }]; không khoá hồ sơ', async () => {
    for (const ngay of ['2026-11-09', '2027-11-11']) {
      const t = setup();
      const error = await appException(
        t.service.save(DOCTOR, CODE, body({ ngayTaiKhamDuKien: ngay })),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        loi: [{ truong: 'ngayTaiKhamDuKien', ma: 'NGAY_KHONG_HOP_LE' }],
      });
      expect(t.statements()).toHaveLength(1);
    }
  });

  it('hai biên (ngày khám và ngày khám + 365) được', async () => {
    for (const ngay of ['2026-11-10', '2027-11-10']) {
      const t = setup();
      await expect(
        t.service.save(DOCTOR, CODE, body({ ngayTaiKhamDuKien: ngay })),
      ).resolves.toMatchObject({ ngayTaiKhamDuKien: ngay });
    }
  });
});

describe('HSK-05, HSK-08, HSK-23 dữ liệu vào xấu ⇒ 400 TRƯỚC mọi truy cập DB', () => {
  it.each([
    ['thiếu trường', body({ huongXuLy: '   ' }), 'BAT_BUOC'],
    ['quá dài', body({ trieuChung: 'a'.repeat(2001) }), 'QUA_DAI'],
    [
      'nội dung dạng bí mật',
      body({ chanDoanSoBo: 'token=abc123' }),
      'NOI_DUNG_KHONG_HOP_LE',
    ],
    [
      'ngày sai dạng',
      body({ ngayTaiKhamDuKien: '2026-02-30' }),
      'NGAY_KHONG_HOP_LE',
    ],
  ])('%s', async (_name, input, ma) => {
    const t = setup();
    const error = await appException(t.service.save(DOCTOR, CODE, input));
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
    });
    const loi = (error.getResponse() as { loi: { ma: string }[] }).loi;
    expect(loi.map((entry) => entry.ma)).toEqual([ma]);
    expect(JSON.stringify(error.getResponse())).not.toContain('abc123');
    expect(t.query).not.toHaveBeenCalled();
    expect(t.transaction).not.toHaveBeenCalled();
  });
});

describe('HSK-18, HSK-20, HSK-24 lỗi, 1062 và thử lại', () => {
  it('HSK-18 AuditService lỗi ⇒ lỗi đi nguyên ra ngoài (không phải AppException, không thử lại): giao dịch bị hoàn tác (ca MySQL thật ở int-spec)', async () => {
    const failure = new Error('AUDIT_WRITE_FAILED');
    const t = setup({
      lich: { trangThai: 'HoanThanh' },
      stored: STORED,
      auditFails: failure,
    });
    await expect(
      t.service.save(
        DOCTOR,
        CODE,
        body({ capNhatLanCuoi: STORED.capNhatLanCuoi.toISOString() }),
      ),
    ).rejects.toBe(failure);
    expect(t.transaction).toHaveBeenCalledTimes(1);
  });

  it('HSK-20 1062 ở INSERT (lưới an toàn) ⇒ 409 HO_SO_KHAM_DA_THAY_DOI, không 500; lỗi khác ở INSERT (khoá ngoại) nổi lên nguyên', async () => {
    const t = setup();
    t.em.failQuery = (sql) =>
      sql.startsWith('INSERT INTO ho_so_kham')
        ? Object.assign(new Error('trùng'), {
            errno: 1062,
            code: 'ER_DUP_ENTRY',
          })
        : undefined;
    const error = await appException(t.service.save(DOCTOR, CODE, body()));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      maLoi: 'HO_SO_KHAM_DA_THAY_DOI',
    });

    const other = setup();
    const foreignKey = Object.assign(new Error('fk'), { errno: 1452 });
    other.em.failQuery = (sql) =>
      sql.startsWith('INSERT INTO ho_so_kham') ? foreignKey : undefined;
    await expect(other.service.save(DOCTOR, CODE, body())).rejects.toBe(
      foreignKey,
    );
  });

  it('giao dịch là READ COMMITTED (qua withBookingTransaction), mở ĐÚNG MỘT lần khi không tranh chấp', async () => {
    const t = setup();
    await t.service.save(DOCTOR, CODE, body());
    expect(t.transaction).toHaveBeenCalledTimes(1);
    expect(t.transaction.mock.calls[0]?.[0]).toBe('READ COMMITTED');
  });

  it('HSK-24 1213 ở UPDATE lần đầu ⇒ thân chạy lại từ đầu; kết quả đúng; nhật ký chỉ ghi ở lần chạy thành công; cảnh báo mang nhãn exam-record', async () => {
    const t = setup({ lich: { trangThai: 'HoanThanh' }, stored: STORED });
    let failed = false;
    t.em.failQuery = (sql) => {
      if (!failed && sql.startsWith('UPDATE ho_so_kham')) {
        failed = true;
        return mysqlError(1213);
      }
      return undefined;
    };
    await expect(
      t.service.save(
        DOCTOR,
        CODE,
        body({ capNhatLanCuoi: STORED.capNhatLanCuoi.toISOString() }),
      ),
    ).resolves.toMatchObject({ trieuChung: 'Ho khan' });
    expect(t.transaction).toHaveBeenCalledTimes(2);
    expect(t.record).toHaveBeenCalledTimes(1);
    expect(
      warnings.filter((m) =>
        /^exam-record: MySQL 1213 ở lần chạy 1\/3, thử lại$/.test(m),
      ),
    ).toHaveLength(1);
  });

  it('HSK-24 hết lượt thử lại (1213 liên tục) ⇒ 503 HE_THONG_DANG_BAN, không bao giờ 500; không nhật ký', async () => {
    const t = setup({ lich: { trangThai: 'HoanThanh' }, stored: STORED });
    t.em.failQuery = (sql) =>
      sql.startsWith('UPDATE ho_so_kham') ? mysqlError(1213) : undefined;
    const error = await appException(
      t.service.save(
        DOCTOR,
        CODE,
        body({ capNhatLanCuoi: STORED.capNhatLanCuoi.toISOString() }),
      ),
    );
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ maLoi: 'HE_THONG_DANG_BAN' });
    expect(t.transaction).toHaveBeenCalledTimes(3);
    expect(t.record).not.toHaveBeenCalled();
  });
});
