import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { ActiveAppointment } from '../../appointments/active-appointment.query.js';
import type { VisitProfileState } from '../../appointments/visit-profile.query.js';
import { AppException } from '../../common/errors/app.exception.js';
import { isDeadlockError } from '../../database/mysql-errors.js';
import {
  PATIENT_ERROR_CODES,
  PATIENT_ERROR_MESSAGES,
} from '../patient.constants.js';
import { RelativesRepository } from './relatives.repository.js';
import { RelativesService } from './relatives.service.js';

// Task B5 — POST …/deactivate ở tầng dịch vụ: một giao dịch REPEATABLE READ, năm câu theo thứ tự cố định, 409 trả kết quả có kiểu rồi mới ném sau khi giao dịch xong,
// idempotent, lỗi DB đi nguyên. MySQL thật: relatives.service.deactivate.int-spec.ts và ...concurrency.int-spec.ts; HTTP thật: test/patient-relatives-deactivate.e2e-spec.ts.
// Mã ca RDS-nn là [đề xuất] (TRACKING patient B5-G). Kho giả; `tx` là em của giao dịch, `manager` là em ngoài giao dịch.
const tx = { name: 'tx' } as unknown as EntityManager;
const manager = { name: 'manager' } as unknown as EntityManager;
const ACCOUNT = '5';
const ID = '9007199254740993';
const BLOCKING: ActiveAppointment[] = [
  {
    maLichHen: 'LH-1',
    thoiGian: '2026-11-02T01:00:00.000Z',
    trangThai: 'DaXacNhan',
    bacSi: 'Bác Sĩ Giả',
    chiNhanh: 'Chi nhánh giả',
  },
];

type Step = 'lockPatient' | 'lockRelative' | 'findBlocking' | 'deactivate';

interface Setup {
  patientExists?: boolean;
  state?: VisitProfileState;
  blocking?: ActiveAppointment[];
  matched?: number;
  failAt?: Step;
  failure?: Error;
}

function build({
  patientExists = true,
  state = 'active',
  blocking = [],
  matched = 1,
  failAt,
  failure,
}: Setup = {}) {
  const order: Step[] = [];
  const step = <T>(name: Step, value: T): Promise<T> => {
    order.push(name);
    return failAt === name && failure
      ? Promise.reject(failure)
      : Promise.resolve(value);
  };
  const lockPatient = vi.fn((_em: EntityManager, _owner: string) =>
    step('lockPatient', patientExists),
  );
  const lockRelative = vi.fn(
    (_em: EntityManager, _owner: string, _id: string) =>
      step('lockRelative', state),
  );
  const findBlockingAppointments = vi.fn(
    (_em: EntityManager, _owner: string, _id: string) =>
      step('findBlocking', blocking),
  );
  const deactivateRelative = vi.fn(
    (_em: EntityManager, _owner: string, _id: string) =>
      step('deactivate', matched),
  );
  // Giữ lại lời hứa của callback để kiểm "giao dịch TRẢ kết quả chứ không ném"
  let callback: Promise<unknown> = Promise.resolve();
  const transaction = vi.fn(
    (_level: string, work: (em: EntityManager) => Promise<unknown>) => {
      callback = work(tx);
      return callback;
    },
  );
  const repository = {
    lockPatient,
    lockRelative,
    findBlockingAppointments,
    deactivateRelative,
  } as unknown as RelativesRepository;
  const dataSource = { transaction, manager } as unknown as DataSource;
  return {
    service: new RelativesService(dataSource, repository),
    lockPatient,
    lockRelative,
    findBlockingAppointments,
    deactivateRelative,
    transaction,
    order,
    callback: () => callback,
  };
}

async function rejectionOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error('lẽ ra phải bị từ chối');
}

const DONE = { trangThaiHieuLuc: false };

describe('RelativesService.deactivate', () => {
  it('RDS-01 (bất biến, H1) mở giao dịch ĐÚNG MỘT lần ở mức REPEATABLE READ ghi tường minh; mọi lời gọi kho dùng em của giao dịch, không bao giờ dataSource.manager', async () => {
    const b = build();

    await b.service.deactivate(ACCOUNT, ID);

    expect(b.transaction).toHaveBeenCalledTimes(1);
    expect(b.transaction.mock.calls[0]?.[0]).toBe('REPEATABLE READ');
    for (const call of [
      b.lockPatient,
      b.lockRelative,
      b.findBlockingAppointments,
      b.deactivateRelative,
    ]) {
      expect(call.mock.calls[0]?.[0]).toBe(tx);
      expect(call.mock.calls[0]?.[0]).not.toBe(manager);
    }
  });

  it('RDS-02 (NT-10) không lịch ⇒ lockPatient, lockRelative, findBlocking, deactivate theo đúng thứ tự, mỗi hàm một lần với (em, tài khoản, id); trả { trangThaiHieuLuc: false }', async () => {
    const b = build();

    const result = await b.service.deactivate(ACCOUNT, ID);

    expect(result).toStrictEqual(DONE);
    expect(b.order).toEqual([
      'lockPatient',
      'lockRelative',
      'findBlocking',
      'deactivate',
    ]);
    expect(b.lockPatient.mock.calls[0]).toStrictEqual([tx, ACCOUNT]);
    expect(b.lockRelative.mock.calls[0]).toStrictEqual([tx, ACCOUNT, ID]);
    expect(b.findBlockingAppointments.mock.calls[0]).toStrictEqual([
      tx,
      ACCOUNT,
      ID,
    ]);
    expect(b.deactivateRelative.mock.calls[0]).toStrictEqual([tx, ACCOUNT, ID]);
  });

  it('RDS-03 (NT-08, H13) tài khoản không có dòng benh_nhan ⇒ AppException 404 KHONG_TIM_THAY thân mặc định; không khoá hồ sơ, không đọc lịch, không ghi', async () => {
    const b = build({ patientExists: false });

    const error = await rejectionOf(b.service.deactivate(ACCOUNT, ID));

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
    expect((error as AppException).getResponse()).toStrictEqual({
      maLoi: 'KHONG_TIM_THAY',
      thongBao: 'Không tìm thấy dữ liệu.',
    });
    expect(b.order).toEqual(['lockPatient']);
  });

  it('RDS-04 (NT-08, H3) hồ sơ không có hoặc của người khác (missing) ⇒ cùng 404; không đọc lịch, không ghi', async () => {
    const b = build({ state: 'missing' });

    const error = await rejectionOf(b.service.deactivate(ACCOUNT, ID));

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
    expect(b.order).toEqual(['lockPatient', 'lockRelative']);
  });

  it('RDS-05 (NT-15, Q10) hồ sơ của mình đã ngừng (inactive) ⇒ 200 { trangThaiHieuLuc: false }; KHÔNG đọc lịch hẹn, KHÔNG UPDATE (idempotent)', async () => {
    const b = build({ state: 'inactive' });

    const result = await b.service.deactivate(ACCOUNT, ID);

    expect(result).toStrictEqual(DONE);
    expect(b.order).toEqual(['lockPatient', 'lockRelative']);
    expect(b.findBlockingAppointments).not.toHaveBeenCalled();
    expect(b.deactivateRelative).not.toHaveBeenCalled();
  });

  it('RDS-06 (NT-12, Q11, A8) còn lịch chặn ⇒ AppException 409 HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN, thongBao từ hằng, chiTiet đúng mảng; KHÔNG UPDATE; giao dịch TRẢ kết quả (callback không ném), lỗi chỉ ném SAU khi giao dịch xong', async () => {
    const b = build({ blocking: BLOCKING });

    const error = await rejectionOf(b.service.deactivate(ACCOUNT, ID));

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).maLoi).toBe(
      PATIENT_ERROR_CODES.RELATIVE_HAS_ACTIVE_APPOINTMENTS,
    );
    expect((error as AppException).getResponse()).toStrictEqual({
      maLoi: 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN',
      thongBao:
        PATIENT_ERROR_MESSAGES[
          PATIENT_ERROR_CODES.RELATIVE_HAS_ACTIVE_APPOINTMENTS
        ],
      chiTiet: BLOCKING,
    });
    expect(b.order).toEqual(['lockPatient', 'lockRelative', 'findBlocking']);
    expect(b.deactivateRelative).not.toHaveBeenCalled();
    // Ném trong callback sẽ làm lời hứa này bị từ chối
    await expect(b.callback()).resolves.toMatchObject({ kind: 'blocked' });
  });

  it.each([0, 2])(
    'RDS-07 UPDATE khớp %i hàng (khác 1) dù đang giữ khoá ⇒ Error thường (không AppException), thông điệp nêu id và tài khoản, không có dữ liệu cá nhân',
    async (matched) => {
      const b = build({ matched });

      const error = await rejectionOf(b.service.deactivate(ACCOUNT, ID));

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppException);
      expect((error as Error).message).toContain(ID);
      expect((error as Error).message).toContain(ACCOUNT);
    },
  );

  it.each<Step>(['lockPatient', 'lockRelative', 'findBlocking', 'deactivate'])(
    'RDS-08 (NT-16, BM-02) lỗi deadlock (errno 1213) ở bước %s đi NGUYÊN (không bọc, không đổi thành 409/404), các bước sau không chạy, không thử lại',
    async (failAt) => {
      const failure = Object.assign(new Error('Deadlock found'), {
        errno: 1213,
        code: 'ER_LOCK_DEADLOCK',
      });
      expect(isDeadlockError(failure)).toBe(true);
      const b = build({ failAt, failure });

      const error = await rejectionOf(b.service.deactivate(ACCOUNT, ID));

      expect(error).toBe(failure);
      expect(b.transaction).toHaveBeenCalledTimes(1);
      const steps: Step[] = [
        'lockPatient',
        'lockRelative',
        'findBlocking',
        'deactivate',
      ];
      expect(b.order).toEqual(steps.slice(0, steps.indexOf(failAt) + 1));
    },
  );

  it('RDS-10 (NT-08) id BIGINT lớn hơn 2^53 đi NGUYÊN là chuỗi vào mọi lời gọi kho (không bao giờ qua Number)', async () => {
    const b = build();

    await b.service.deactivate(ACCOUNT, ID);

    for (const call of [
      b.lockRelative,
      b.findBlockingAppointments,
      b.deactivateRelative,
    ]) {
      expect(call.mock.calls[0]?.[2]).toBe('9007199254740993');
    }
  });
});

// RDS-09 — BẤT BIẾN ở tầng đơn vị: dùng RelativesRepository THẬT và một EntityManager giả ghi lại MỌI câu `query` theo thứ tự. Ai chèn một lời gọi đọc thường
// (findRelativeById, em.query…) phía trên hai câu khoá, hoặc đổi thứ tự khoá, làm ca này đỏ ngay mà không cần MySQL.
interface Scenario {
  patient: boolean;
  profile?: 0 | 1;
  appointments?: unknown[];
}

function recordingBuild(scenario: Scenario) {
  const statements: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn((sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (/FROM benh_nhan\b/.test(sql)) {
      return Promise.resolve(scenario.patient ? [{ id: ACCOUNT }] : []);
    }
    if (/FROM ho_so_nguoi_than\b/.test(sql)) {
      return Promise.resolve(
        scenario.profile === undefined
          ? []
          : [{ trangThaiHieuLuc: scenario.profile }],
      );
    }
    if (/FROM lich_hen\b/.test(sql)) {
      return Promise.resolve(scenario.appointments ?? []);
    }
    if (/^\s*UPDATE ho_so_nguoi_than\b/.test(sql)) {
      return Promise.resolve({ affectedRows: 1 });
    }
    return Promise.reject(new Error(`Câu SQL không lường trước: ${sql}`));
  });
  const em = { query } as unknown as EntityManager;
  const dataSource = {
    transaction: (
      _level: string,
      work: (e: EntityManager) => Promise<unknown>,
    ) => work(em),
  } as unknown as DataSource;
  return {
    service: new RelativesService(dataSource, new RelativesRepository()),
    statements,
  };
}

const kindOf = (sql: string): string => {
  if (/FROM benh_nhan\b/.test(sql)) return 'khoá benh_nhan';
  if (/FROM ho_so_nguoi_than\b/.test(sql)) return 'khoá hồ sơ';
  if (/FROM lich_hen\b/.test(sql)) return 'đọc lịch hẹn';
  if (/^\s*UPDATE ho_so_nguoi_than\b/.test(sql)) return 'UPDATE hồ sơ';
  return 'khác';
};
const isLockingRead = (sql: string) =>
  /^\s*SELECT\b/.test(sql) && /FOR UPDATE\s*$/.test(sql);

describe('RelativesService.deactivate — thứ tự câu SQL (RDS-09)', () => {
  const stopped = { patient: true, profile: 1 } as const;

  it('RDS-09 (NT-10, NT-24 tầng đơn vị) không lịch ⇒ đúng bốn câu: khoá benh_nhan, khoá hồ sơ, đọc lịch hẹn, UPDATE; hai câu đầu là đọc CÓ KHOÁ; câu SELECT THƯỜNG đầu tiên là câu lịch hẹn', async () => {
    const { service, statements } = recordingBuild(stopped);

    await service.deactivate(ACCOUNT, ID);

    expect(statements.map((s) => kindOf(s.sql))).toEqual([
      'khoá benh_nhan',
      'khoá hồ sơ',
      'đọc lịch hẹn',
      'UPDATE hồ sơ',
    ]);
    expect(isLockingRead(statements[0]?.sql ?? '')).toBe(true);
    expect(isLockingRead(statements[1]?.sql ?? '')).toBe(true);
    const firstPlainSelect = statements.findIndex(
      (s) => /^\s*SELECT\b/.test(s.sql) && !isLockingRead(s.sql),
    );
    expect(firstPlainSelect).toBe(2);
    expect(kindOf(statements[firstPlainSelect]?.sql ?? '')).toBe(
      'đọc lịch hẹn',
    );
    // Câu lịch hẹn cũng là SELECT thường thật sự: không khoá
    expect(statements[2]?.sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
  });

  it('RDS-09 (NT-15) hồ sơ đã ngừng ⇒ đúng hai câu (hai câu khoá), không đọc lịch, không UPDATE', async () => {
    const { service, statements } = recordingBuild({
      patient: true,
      profile: 0,
    });

    await service.deactivate(ACCOUNT, ID);

    expect(statements.map((s) => kindOf(s.sql))).toEqual([
      'khoá benh_nhan',
      'khoá hồ sơ',
    ]);
  });

  it('RDS-09 (NT-12) có lịch chặn ⇒ đúng ba câu, không UPDATE, rồi 409', async () => {
    const { service, statements } = recordingBuild({
      patient: true,
      profile: 1,
      appointments: [
        {
          maLichHen: 'LH-1',
          thoiGian: new Date('2026-11-02T01:00:00.000Z'),
          trangThai: 'DaXacNhan',
          bacSi: 'Bác Sĩ Giả',
          chiNhanh: 'Chi nhánh giả',
        },
      ],
    });

    const error = await rejectionOf(service.deactivate(ACCOUNT, ID));

    expect((error as AppException).getStatus()).toBe(409);
    expect(statements.map((s) => kindOf(s.sql))).toEqual([
      'khoá benh_nhan',
      'khoá hồ sơ',
      'đọc lịch hẹn',
    ]);
  });

  it('RDS-09 (NT-08) hồ sơ không có hoặc của người khác ⇒ đúng hai câu rồi 404; thiếu dòng benh_nhan ⇒ đúng MỘT câu rồi 404', async () => {
    const missingProfile = recordingBuild({ patient: true });
    const missingPatient = recordingBuild({ patient: false });

    const first = await rejectionOf(
      missingProfile.service.deactivate(ACCOUNT, ID),
    );
    const second = await rejectionOf(
      missingPatient.service.deactivate(ACCOUNT, ID),
    );

    expect((first as AppException).getStatus()).toBe(404);
    expect((second as AppException).getStatus()).toBe(404);
    expect(missingProfile.statements.map((s) => kindOf(s.sql))).toEqual([
      'khoá benh_nhan',
      'khoá hồ sơ',
    ]);
    expect(missingPatient.statements.map((s) => kindOf(s.sql))).toEqual([
      'khoá benh_nhan',
    ]);
  });

  it('RDS-09 (H3, bất biến) MỌI câu đều có chủ sở hữu trong tham số; id hồ sơ đi nguyên là chuỗi ở ba câu cuối; UPDATE có benh_nhan_id và chỉ đặt MỘT cột', async () => {
    const { service, statements } = recordingBuild(stopped);

    await service.deactivate(ACCOUNT, ID);

    for (const statement of statements) {
      expect(statement.params).toContain(ACCOUNT);
    }
    for (const statement of statements.slice(1)) {
      expect(statement.params).toContain(ID);
    }
    const update = statements[3];
    expect(update?.sql).toContain('benh_nhan_id = ?');
    expect(update?.sql).toContain('trang_thai_hieu_luc = TRUE');
    expect(update?.sql.match(/SET\s+([^\n]*)/)?.[1]).toBe(
      'trang_thai_hieu_luc = FALSE',
    );
    expect(update?.params).toStrictEqual([ID, ACCOUNT]);
  });
});
