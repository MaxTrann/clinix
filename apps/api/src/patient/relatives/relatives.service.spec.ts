import type { DataSource, EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { RelativeResponse } from './relatives.dto.js';
import type {
  NewRelative,
  RelativesRepository,
} from './relatives.repository.js';
import { RelativesService } from './relatives.service.js';

// Task B3 — thứ tự INSERT rồi đọc lại trong CÙNG giao dịch, lỗi khoá ngoại thành 403, mọi lỗi khác đi nguyên, không đếm/kiểm trùng (Q14).
// MySQL thật: relatives.service.int-spec.ts; HTTP thật: test/patient-relatives.e2e-spec.ts. Mã ca RLS-nn là [đề xuất] (TRACKING patient B3-G).
// Kho giả; `tx` là em của giao dịch, `manager` là em ngoài giao dịch.
const tx = { name: 'tx' } as unknown as EntityManager;
const manager = { name: 'manager' } as unknown as EntityManager;
const ACCOUNT = '5';
const NEW_ID = '9007199254740993';
// Bộ gửi lên, cố ý KHÁC hồ sơ kho trả về để chứng minh phản hồi là bản đọc lại chứ không phản chiếu thân
const SENT: NewRelative = {
  hoTen: 'Tên Gửi Lên',
  moiQuanHe: 'Con',
  gioiTinh: 'Khac',
  ngaySinh: '2001-01-01',
  soDienThoai: '0900000001',
};
const STORED: RelativeResponse = {
  hoSoNguoiThanId: NEW_ID,
  hoTen: 'Tên Đã Lưu',
  moiQuanHe: 'Me',
  gioiTinh: 'Nu',
  ngaySinh: '1999-09-09',
  soDienThoai: null,
  trangThaiHieuLuc: true,
};

// QueryFailedError thật của TypeORM bọc lỗi mysql2 (isForeignKeyError đọc driverError.errno)
const mysqlError = (errno: number, code: string) =>
  new QueryFailedError(
    'INSERT …',
    [],
    Object.assign(new Error('x'), { errno, code }),
  );

interface Setup {
  found?: RelativeResponse | null;
  insertFails?: Error;
  findFails?: Error;
  list?: RelativeResponse[];
}

function build({ found = STORED, list = [STORED], ...fails }: Setup = {}) {
  const order: string[] = [];
  const insertRelative = vi.fn(
    (_em: EntityManager, _owner: string, _input: NewRelative) => {
      order.push('insert');
      return fails.insertFails
        ? Promise.reject(fails.insertFails)
        : Promise.resolve(NEW_ID);
    },
  );
  const findRelativeById = vi.fn(
    (_em: EntityManager, _owner: string, _id: string) => {
      order.push('find');
      return fails.findFails
        ? Promise.reject(fails.findFails)
        : Promise.resolve(found);
    },
  );
  const findRelatives = vi.fn((_em: EntityManager, _owner: string) =>
    Promise.resolve(list),
  );
  const transaction = vi.fn((work: (em: EntityManager) => Promise<unknown>) =>
    work(tx),
  );
  const dataSource = { manager, transaction } as unknown as DataSource;
  const service = new RelativesService(dataSource, {
    insertRelative,
    findRelativeById,
    findRelatives,
  } as unknown as RelativesRepository);
  return {
    service,
    insertRelative,
    findRelativeById,
    findRelatives,
    transaction,
    order,
  };
}

describe('RelativesService', () => {
  it('RLS-01 (NT-06) list gọi findRelatives(dataSource.manager, accountId) đúng một lần và trả { items } đúng kho trả; kho rỗng ⇒ { items: [] }', async () => {
    const { service, findRelatives, transaction } = build();

    await expect(service.list(ACCOUNT)).resolves.toStrictEqual({
      items: [STORED],
    });
    expect(findRelatives).toHaveBeenCalledExactlyOnceWith(manager, ACCOUNT);
    // chỉ đọc: không giao dịch
    expect(transaction).not.toHaveBeenCalled();

    const empty = build({ list: [] });
    await expect(empty.service.list(ACCOUNT)).resolves.toStrictEqual({
      items: [],
    });
  });

  it('RLS-02 (NT-01) create chạy trong dataSource.transaction: insertRelative rồi findRelativeById với CÙNG em của giao dịch (không dataSource.manager), id lấy từ insertRelative; phản hồi là hồ sơ KHO trả (khác thân gửi lên)', async () => {
    const { service, insertRelative, findRelativeById, transaction, order } =
      build();

    const result = await service.create(ACCOUNT, SENT);

    expect(transaction).toHaveBeenCalledOnce();
    expect(order).toEqual(['insert', 'find']);
    expect(insertRelative).toHaveBeenCalledExactlyOnceWith(tx, ACCOUNT, SENT);
    expect(findRelativeById).toHaveBeenCalledExactlyOnceWith(
      tx,
      ACCOUNT,
      NEW_ID,
    );
    expect(result).toBe(STORED);
    expect(result).not.toMatchObject({ hoTen: SENT.hoTen });
  });

  it('RLS-03 (QP-06) mã tài khoản chỉ là tham số hàm và được truyền vào CẢ HAI lời gọi; giá trị trong thân không đổi được chủ sở hữu', async () => {
    const { service, insertRelative, findRelativeById } = build();

    await service.create('42', {
      ...SENT,
      benhNhanId: '999',
    } as NewRelative);

    expect(insertRelative.mock.calls[0]?.[1]).toBe('42');
    expect(findRelativeById.mock.calls[0]?.[1]).toBe('42');
  });

  it('RLS-04 (H13, BM-03) INSERT báo khoá ngoại (1452) ⇒ AppException 403 KHONG_DU_QUYEN và findRelativeById KHÔNG được gọi', async () => {
    const { service, findRelativeById } = build({
      insertFails: mysqlError(1452, 'ER_NO_REFERENCED_ROW_2'),
    });

    const error: unknown = await service.create(ACCOUNT, SENT).catch((e) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(403);
    expect((error as AppException).maLoi).toBe('KHONG_DU_QUYEN');
    expect(findRelativeById).not.toHaveBeenCalled();
  });

  it.each([
    ['INSERT', { insertFails: mysqlError(1146, 'ER_NO_SUCH_TABLE') }],
    ['INSERT', { insertFails: new Error('mất kết nối') }],
    ['đọc lại', { findFails: mysqlError(1146, 'ER_NO_SUCH_TABLE') }],
    ['đọc lại', { findFails: mysqlError(1452, 'ER_NO_REFERENCED_ROW_2') }],
  ] as [string, Setup][])(
    'RLS-05 (BM-02) lỗi DB khác khoá ngoại ở %s đi NGUYÊN (không bị che thành 403): %#',
    async (_where, setup) => {
      const { service } = build(setup);
      const expected = setup.insertFails ?? setup.findFails;

      await expect(service.create(ACCOUNT, SENT)).rejects.toBe(expected);
    },
  );

  it('RLS-06 đọc lại không thấy (phòng thủ) ⇒ Error thường, thông điệp có mã tài khoản và không có dữ liệu cá nhân của thân', async () => {
    const { service } = build({ found: null });

    const error: unknown = await service.create(ACCOUNT, SENT).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    const message = (error as Error).message;
    expect(message).toContain(ACCOUNT);
    for (const secret of [SENT.hoTen, SENT.ngaySinh, SENT.soDienThoai ?? '']) {
      expect(message).not.toContain(secret);
    }
  });

  it('RLS-07 (NT-19, Q14) create chỉ dùng insertRelative và findRelativeById: không hàm đếm hay kiểm trùng nào; tạo hai lần cùng thân đều thành công', async () => {
    const { service, insertRelative, findRelativeById, findRelatives } =
      build();

    await service.create(ACCOUNT, SENT);
    await service.create(ACCOUNT, SENT);

    expect(insertRelative).toHaveBeenCalledTimes(2);
    expect(findRelativeById).toHaveBeenCalledTimes(2);
    expect(findRelatives).not.toHaveBeenCalled();
  });
});
