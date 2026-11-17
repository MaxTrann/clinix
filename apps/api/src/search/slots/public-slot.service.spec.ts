import 'reflect-metadata';
import type { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import type {
  AvailableSlotsReader,
  DoctorDaySlots,
} from '../../scheduling/slots/available-slots.reader.js';
import type { PublicSlotRepository } from './public-slot.repository.js';
import { PublicSlotService } from './public-slot.service.js';

// Search Slots PR-C1 — KGC-07, KGC-11, KGC-12: service với repository, reader và DataSource giả (không DB).
// `now` ghim ở năm 2031 để khác hẳn đồng hồ máy: service mà quay về `nowVN()` thì cửa sổ ngày và `now` của reader đều lệch.
const NOW = new Date('2031-05-04T10:00:00+07:00'); // hôm nay giờ VN: 2031-05-04
const NGAY = '2031-05-05';

function build(hidden: readonly string[] = []) {
  const manager = { tag: 'em-của-giao-dịch' } as unknown as EntityManager;
  const runner = {
    manager,
    connect: vi.fn(() => Promise.resolve()),
    query: vi.fn(() => Promise.resolve()),
    startTransaction: vi.fn(() => Promise.resolve()),
    commitTransaction: vi.fn(() => Promise.resolve()),
    rollbackTransaction: vi.fn(() => Promise.resolve()),
    release: vi.fn(() => Promise.resolve()),
  };
  const createQueryRunner = vi.fn(() => runner);
  const db = { createQueryRunner } as unknown as DataSource;
  const findPublicIds = vi.fn((_em: EntityManager, ids: readonly string[]) =>
    Promise.resolve(ids.filter((id) => !hidden.includes(id))),
  );
  const listMany = vi.fn(
    (input: { bacSiIds: readonly string[]; ngay: string; now?: Date }) =>
      Promise.resolve(
        input.bacSiIds.map((bacSiId): DoctorDaySlots => ({
          bacSiId,
          ngay: input.ngay,
          trangThaiNgay: 'CoLich',
          khungGio: [],
        })),
      ),
  );
  const service = new PublicSlotService(
    db,
    { findPublicIds } as unknown as PublicSlotRepository,
    { listMany } as unknown as AvailableSlotsReader,
  );
  return {
    service,
    createQueryRunner,
    runner,
    manager,
    findPublicIds,
    listMany,
  };
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

describe('KGC-11 service: chỉ id công khai vào reader, một mốc `now`, một giao dịch', () => {
  it('reader nhận id CÔNG KHAI (không có id ẩn), đúng ngày, đúng ĐỐI TƯỢNG `now`; kết quả đúng thứ tự đầu vào', async () => {
    const { service, listMany, findPublicIds, manager } = build(['9']);
    const out = await service.list({ bacSiIds: '5,9,7', ngay: NGAY }, NOW);

    expect(listMany).toHaveBeenCalledTimes(1);
    const [input, em] = listMany.mock.calls[0] as unknown as [
      { bacSiIds: string[]; ngay: string; now: Date },
      EntityManager,
    ];
    expect(input.bacSiIds).toEqual(['5', '7']);
    expect(input.ngay).toBe(NGAY);
    expect(input.now).toBe(NOW); // cùng đối tượng với mốc đã dùng để kiểm cửa sổ
    // Câu lọc và reader chạy trên CÙNG `em` của MỘT giao dịch chỉ đọc.
    expect(em).toBe(manager);
    expect(findPublicIds.mock.calls[0]?.[0]).toBe(manager);

    expect(out.ngay).toBe(NGAY);
    expect(out.items.map((item) => item.bacSiId)).toEqual(['5', '9', '7']);
    expect(out.items[1]).toEqual({
      bacSiId: '9',
      trangThaiNgay: 'KhongCoLich',
      khungGio: [],
    });
  });

  it('id lặp chỉ đi vào repository một lần và ra một phần tử', async () => {
    const { service, findPublicIds } = build();
    const out = await service.list({ bacSiIds: '5,5,7,5', ngay: NGAY }, NOW);
    expect(findPublicIds.mock.calls[0]?.[1]).toEqual(['5', '7']);
    expect(out.items.map((item) => item.bacSiId)).toEqual(['5', '7']);
  });

  it('không bác sĩ nào công khai ⇒ KHÔNG gọi reader, mọi id đều là "không có lịch"', async () => {
    const { service, listMany } = build(['5', '7']);
    const out = await service.list({ bacSiIds: '5,7', ngay: NGAY }, NOW);
    expect(listMany).not.toHaveBeenCalled();
    expect(out.items).toEqual([
      { bacSiId: '5', trangThaiNgay: 'KhongCoLich', khungGio: [] },
      { bacSiId: '7', trangThaiNgay: 'KhongCoLich', khungGio: [] },
    ]);
  });

  it('giao dịch chỉ đọc: mở, commit, trả kết nối', async () => {
    const { service, runner } = build();
    await service.list({ bacSiIds: '5', ngay: NGAY }, NOW);
    expect(runner.startTransaction).toHaveBeenCalledWith('REPEATABLE READ');
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
});

describe('KGC-12 tham số sai ⇒ 400 TRƯỚC khi chạm DB', () => {
  it.each([
    ['bacSiIds sai', { bacSiIds: 'abc', ngay: NGAY }],
    ['ngay sai dạng', { bacSiIds: '5', ngay: '5/5/2031' }],
    ['ngay ngoài cửa sổ', { bacSiIds: '5', ngay: '2031-05-11' }],
    ['thiếu hết', {}],
  ])('%s', async (_name, query) => {
    const { service, createQueryRunner, findPublicIds, listMany } = build();
    const exception = await failureOf(service.list(query, NOW));
    expect(exception.getStatus()).toBe(400);
    expect(createQueryRunner).not.toHaveBeenCalled();
    expect(findPublicIds).not.toHaveBeenCalled();
    expect(listMany).not.toHaveBeenCalled();
  });
});

describe('KGC-07 ranh "hôm nay" trượt đúng lúc nửa đêm giờ Việt Nam', () => {
  const run = (now: string, ngay: string) =>
    build().service.list({ bacSiIds: '5', ngay }, new Date(`${now}+07:00`));
  const outOfRange = async (now: string, ngay: string) => {
    const exception = await failureOf(run(now, ngay));
    expect(exception.getResponse()).toMatchObject({
      maLoi: 'BO_LOC_KHONG_HOP_LE',
      loi: [{ truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' }],
    });
  };

  it('23:59:59 ngày 18: ngày 18 và ngày 24 đạt, ngày 25 ngoài khoảng', async () => {
    const now = '2026-11-18T23:59:59';
    expect((await run(now, '2026-11-18')).ngay).toBe('2026-11-18');
    expect((await run(now, '2026-11-24')).ngay).toBe('2026-11-24');
    await outOfRange(now, '2026-11-25');
  });

  it('00:00:00 ngày 19: ngày 18 ngoài khoảng, ngày 19 và ngày 25 đạt, ngày 26 ngoài khoảng', async () => {
    const now = '2026-11-19T00:00:00';
    await outOfRange(now, '2026-11-18');
    expect((await run(now, '2026-11-19')).ngay).toBe('2026-11-19');
    expect((await run(now, '2026-11-25')).ngay).toBe('2026-11-25');
    await outOfRange(now, '2026-11-26');
  });
});
