import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  PATIENT_ERROR_CODES,
  PATIENT_ERROR_MESSAGES,
} from '../patient.constants.js';
import type { RelativeResponse } from './relatives.dto.js';
import type {
  NewRelative,
  RelativesRepository,
} from './relatives.repository.js';
import { RelativesService } from './relatives.service.js';

// Task B4 — PUT ở tầng dịch vụ: UPDATE rồi đọc lại trong CÙNG giao dịch READ COMMITTED; 0 hàng thì đọc lại để phân 404 với 409; lỗi DB đi nguyên.
// MySQL thật: relatives.service.update.int-spec.ts; HTTP thật: test/patient-relatives-update.e2e-spec.ts. Mã ca RUS-nn là [đề xuất] (TRACKING patient B4-G).
// Kho giả; `tx` là em của giao dịch, `manager` là em ngoài giao dịch.
const tx = { name: 'tx' } as unknown as EntityManager;
const manager = { name: 'manager' } as unknown as EntityManager;
const ACCOUNT = '5';
const ID = '9007199254740993';
// Bộ gửi lên, cố ý KHÁC hồ sơ kho trả về để chứng minh phản hồi là bản đọc lại chứ không phản chiếu thân
const SENT: NewRelative = {
  hoTen: 'Tên Gửi Lên',
  moiQuanHe: 'Con',
  gioiTinh: 'Khac',
  ngaySinh: '2001-01-01',
  soDienThoai: '0900000001',
};
const STORED: RelativeResponse = {
  hoSoNguoiThanId: ID,
  hoTen: 'Tên Đã Lưu',
  moiQuanHe: 'Me',
  gioiTinh: 'Nu',
  ngaySinh: '1999-09-09',
  soDienThoai: null,
  trangThaiHieuLuc: true,
};

interface Setup {
  matched?: number;
  found?: RelativeResponse | null;
  updateFails?: Error;
  findFails?: Error;
}

function build({ matched = 1, found = STORED, ...fails }: Setup = {}) {
  const order: string[] = [];
  const updateRelative = vi.fn(
    (
      _em: EntityManager,
      _owner: string,
      _id: string,
      _input: NewRelative,
    ): Promise<number> => {
      order.push('update');
      return fails.updateFails
        ? Promise.reject(fails.updateFails)
        : Promise.resolve(matched);
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
  const transaction = vi.fn(
    (_level: string, work: (em: EntityManager) => Promise<unknown>) => work(tx),
  );
  const repository = {
    updateRelative,
    findRelativeById,
  } as unknown as RelativesRepository;
  const dataSource = { transaction, manager } as unknown as DataSource;
  return {
    service: new RelativesService(dataSource, repository),
    updateRelative,
    findRelativeById,
    transaction,
    order,
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

describe('RelativesService.update', () => {
  it('RUS-01 (NT-07) thành công: chạy trong dataSource.transaction mức READ COMMITTED; updateRelative rồi findRelativeById với CÙNG em của giao dịch (không dataSource.manager); trả hồ sơ KHO trả, không phản chiếu thân', async () => {
    const { service, updateRelative, findRelativeById, transaction, order } =
      build();

    const result = await service.update(ACCOUNT, ID, SENT);

    expect(result).toBe(STORED);
    expect(result).not.toEqual(expect.objectContaining({ hoTen: SENT.hoTen }));
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).toBe('READ COMMITTED');
    expect(order).toEqual(['update', 'find']);
    expect(updateRelative.mock.calls[0]).toStrictEqual([tx, ACCOUNT, ID, SENT]);
    expect(findRelativeById.mock.calls[0]).toStrictEqual([tx, ACCOUNT, ID]);
  });

  it('RUS-02 (NT-08, H3) 0 hàng và đọc lại null (không có hoặc của người khác) ⇒ AppException 404 KHONG_TIM_THAY với thân mặc định', async () => {
    const { service } = build({ matched: 0, found: null });

    const error = await rejectionOf(service.update(ACCOUNT, ID, SENT));

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
    expect((error as AppException).getResponse()).toStrictEqual({
      maLoi: 'KHONG_TIM_THAY',
      thongBao: 'Không tìm thấy dữ liệu.',
    });
  });

  it('RUS-03 (NT-09) 0 hàng và đọc lại thấy hồ sơ của mình đã ngừng ⇒ AppException 409 HO_SO_NGUOI_THAN_DA_NGUNG với thongBao từ PATIENT_ERROR_MESSAGES', async () => {
    const { service, findRelativeById } = build({
      matched: 0,
      found: { ...STORED, trangThaiHieuLuc: false },
    });

    const error = await rejectionOf(service.update(ACCOUNT, ID, SENT));

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect((error as AppException).getResponse()).toStrictEqual({
      maLoi: PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED,
      thongBao:
        PATIENT_ERROR_MESSAGES[PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED],
    });
    expect(findRelativeById).toHaveBeenCalledTimes(1);
  });

  it('RUS-04 (bẫy 5) 0 hàng mà đọc lại thấy hồ sơ đang hiệu lực (không thể xảy ra) ⇒ Error thường (500), không AppException; thông điệp có mã tài khoản và hồ sơ, không dữ liệu cá nhân', async () => {
    const { service } = build({ matched: 0, found: STORED });

    const error = await rejectionOf(service.update(ACCOUNT, ID, SENT));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    const message = (error as Error).message;
    expect(message).toContain(ACCOUNT);
    expect(message).toContain(ID);
    for (const personal of [SENT.hoTen, STORED.hoTen, SENT.ngaySinh]) {
      expect(message).not.toContain(personal);
    }
  });

  it('RUS-05 ≥ 1 hàng khớp mà đọc lại null (phòng thủ) ⇒ Error thường, không AppException', async () => {
    const { service } = build({ matched: 1, found: null });

    const error = await rejectionOf(service.update(ACCOUNT, ID, SENT));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect((error as Error).message).toContain(ID);
  });

  it('RUS-06 (BM-02) lỗi DB ở updateRelative và ở findRelativeById đi nguyên (không bị che thành 404 hay 409); updateRelative ném thì KHÔNG đọc lại', async () => {
    const updateFailure = new Error('mất kết nối khi ghi');
    const first = build({ updateFails: updateFailure });
    await expect(first.service.update(ACCOUNT, ID, SENT)).rejects.toBe(
      updateFailure,
    );
    expect(first.findRelativeById).not.toHaveBeenCalled();

    const findFailure = new Error('mất kết nối khi đọc lại');
    for (const matched of [1, 0]) {
      const second = build({ matched, findFails: findFailure });
      await expect(second.service.update(ACCOUNT, ID, SENT)).rejects.toBe(
        findFailure,
      );
    }
  });

  it('RUS-07 (QP-06) tài khoản và id chỉ là tham số hàm, truyền vào cả hai lời gọi của kho (hàm kho không tự lấy chủ sở hữu từ đâu khác)', async () => {
    const { service, updateRelative, findRelativeById } = build();

    await service.update('123', '456', SENT);

    expect(updateRelative.mock.calls[0]?.slice(1)).toStrictEqual([
      '123',
      '456',
      SENT,
    ]);
    expect(findRelativeById.mock.calls[0]?.slice(1)).toStrictEqual([
      '123',
      '456',
    ]);
  });

  it('RUS-08 (Q9) dịch vụ chỉ gọi hai hàm của kho, mỗi hàm một lần: không hàm đếm hay kiểm lịch hẹn nào (được sửa khi có lịch hẹn)', async () => {
    const { service, updateRelative, findRelativeById } = build();

    await service.update(ACCOUNT, ID, SENT);

    expect(updateRelative).toHaveBeenCalledTimes(1);
    expect(findRelativeById).toHaveBeenCalledTimes(1);
  });
});
