import type { EntityManager } from 'typeorm';
import type { AppException } from '../../common/errors/app.exception.js';
import type { LoaiDanhGiaBaiViet } from '../entities/enums.js';
import { PatientRatingRepository } from './patient-rating.repository.js';
import { PatientRatingService } from './patient-rating.service.js';

// article B3: service đánh giá với repository GIẢ (không DB): 404 cùng thân cho mọi lý do mà KHÔNG chạm repository khi id sai dạng và KHÔNG ghi khi bài không công khai (ABR-06), thứ tự
// khoá → ghi → đếm trong MỘT giao dịch (ABR-02 đến ABR-05, T11), số đếm lấy nguyên từ máy chủ (ABR-02, ABR-04), mã Bệnh nhân là tham số của người gọi (ABR-10). Truy vấn thật nằm ở `article-rating.int-spec.ts`.
const PATIENT = '11';
const ARTICLE = '7';
const MANAGER = { nhan: 'manager-gia' } as unknown as EntityManager;

interface Setup {
  service: PatientRatingService;
  repository: Record<
    | 'transaction'
    | 'lockPublished'
    | 'upsert'
    | 'remove'
    | 'counts'
    | 'readOwn',
    ReturnType<typeof vi.fn>
  >;
  /** Thứ tự các bước đã chạy, kèm `commit` hay `rollback` của giao dịch. */
  steps: string[];
}

function setup(published = true): Setup {
  const steps: string[] = [];
  const repository = {
    transaction: vi.fn(async (work: (m: EntityManager) => Promise<unknown>) => {
      steps.push('begin');
      try {
        const result = await work(MANAGER);
        steps.push('commit');
        return result;
      } catch (error) {
        steps.push('rollback');
        throw error;
      }
    }),
    lockPublished: vi.fn(async () => {
      steps.push('lock');
      return published;
    }),
    upsert: vi.fn(async () => {
      steps.push('upsert');
    }),
    remove: vi.fn(async () => {
      steps.push('remove');
    }),
    counts: vi.fn(async () => {
      steps.push('counts');
      return { luotThich: 5, luotKhongThich: 2 };
    }),
    readOwn: vi.fn(
      async (): Promise<{ loai: LoaiDanhGiaBaiViet | null } | null> => ({
        loai: 'Thich',
      }),
    ),
  };
  const service = new PatientRatingService(
    repository as unknown as PatientRatingRepository,
  );
  return { service, repository, steps };
}

async function rejection(work: Promise<unknown>): Promise<AppException> {
  const error: unknown = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'phải bị từ chối').toBeDefined();
  return error as AppException;
}

const BAD_IDS = [
  'abc',
  '',
  ' 7',
  '7 ',
  '0',
  '-1',
  '07',
  '1.5',
  '12345678901234567890',
  '9999999999999999999',
  '7-sot-xuat-huyet',
  '7;DROP TABLE bai_viet',
];

describe('article B3 — service đánh giá: 404 cùng thân (ABR-06)', () => {
  it.each(BAD_IDS)(
    'id sai dạng %j ⇒ 404 KHONG_TIM_THAY ở cả ba hàm mà KHÔNG chạm repository',
    async (id) => {
      const { service, repository } = setup();
      for (const work of [
        service.get(PATIENT, id),
        service.put(PATIENT, id, 'Thich'),
        service.remove(PATIENT, id),
      ]) {
        const error = await rejection(work);
        expect(error.getStatus()).toBe(404);
        expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
      }
      for (const fn of Object.values(repository))
        expect(fn, 'không được chạm repository').not.toHaveBeenCalled();
    },
  );

  it('bài không công khai (lock không có dòng) ⇒ PUT và DELETE 404, đã mở giao dịch nhưng KHÔNG ghi và KHÔNG đếm; giao dịch hoàn tác', async () => {
    const { service, repository, steps } = setup(false);
    const put = await rejection(service.put(PATIENT, ARTICLE, 'Thich'));
    const remove = await rejection(service.remove(PATIENT, ARTICLE));
    for (const error of [put, remove]) {
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    }
    expect(repository.upsert).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
    expect(repository.counts).not.toHaveBeenCalled();
    expect(steps).toEqual([
      'begin',
      'lock',
      'rollback',
      'begin',
      'lock',
      'rollback',
    ]);
  });

  it('GET: bài không công khai (repository trả null) ⇒ 404 cùng thân với id sai dạng', async () => {
    const { service, repository } = setup();
    repository.readOwn.mockResolvedValue(null);
    const missing = await rejection(service.get(PATIENT, ARTICLE));
    const malformed = await rejection(service.get(PATIENT, 'abc'));
    expect(missing.getStatus()).toBe(404);
    expect(missing.getResponse()).toEqual(malformed.getResponse());
  });
});

describe('article B3 — service đánh giá: ghi trong MỘT giao dịch (ABR-02 đến ABR-05, T11)', () => {
  it('ABR-02: PUT ⇒ khoá bài → ghi phiếu → đếm, cùng MỘT manager, rồi commit; trả loại và số đếm của máy chủ NGUYÊN VĂN (không cộng thêm)', async () => {
    const { service, repository, steps } = setup();
    const result = await service.put(PATIENT, ARTICLE, 'KhongThich');
    expect(result).toEqual({
      loai: 'KhongThich',
      luotThich: 5,
      luotKhongThich: 2,
    });
    expect(steps).toEqual(['begin', 'lock', 'upsert', 'counts', 'commit']);
    expect(repository.lockPublished).toHaveBeenCalledWith(MANAGER, ARTICLE);
    // Chủ phiếu là tham số của người gọi (access token), không từ nơi nào khác
    expect(repository.upsert).toHaveBeenCalledWith(
      MANAGER,
      PATIENT,
      ARTICLE,
      'KhongThich',
    );
    expect(repository.counts).toHaveBeenCalledWith(MANAGER, ARTICLE);
  });

  it('ABR-04: PUT cùng loại hai lần ⇒ cùng kết quả (idempotent), số đếm không cộng dồn qua các lần gọi', async () => {
    const { service } = setup();
    const first = await service.put(PATIENT, ARTICLE, 'Thich');
    const second = await service.put(PATIENT, ARTICLE, 'Thich');
    expect(second).toEqual(first);
    expect(second.luotThich).toBe(5);
  });

  it('ABR-05: DELETE ⇒ khoá bài → xoá phiếu của CHÍNH người gọi → đếm, loai null; số đếm nguyên văn', async () => {
    const { service, repository, steps } = setup();
    const result = await service.remove(PATIENT, ARTICLE);
    expect(result).toEqual({ loai: null, luotThich: 5, luotKhongThich: 2 });
    expect(steps).toEqual(['begin', 'lock', 'remove', 'counts', 'commit']);
    expect(repository.remove).toHaveBeenCalledWith(MANAGER, PATIENT, ARTICLE);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('T11: đếm lỗi giữa chừng ⇒ lỗi lan ra và giao dịch hoàn tác (không commit phiếu dở)', async () => {
    const { service, repository, steps } = setup();
    repository.counts.mockRejectedValue(new Error('ép lỗi giữa chừng'));
    await expect(service.put(PATIENT, ARTICLE, 'Thich')).rejects.toThrow(
      'ép lỗi giữa chừng',
    );
    // `counts` đã được gọi (mock bị thay nên không ghi bước), rồi hoàn tác thay vì commit
    expect(repository.counts).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(['begin', 'lock', 'upsert', 'rollback']);
  });
});

describe('article B3 — service đánh giá: đọc phiếu của chính mình (ABR-10, T12)', () => {
  it('chưa đánh giá ⇒ { loai: null }; đã đánh giá ⇒ { loai }; đúng MỘT khoá, truyền mã Bệnh nhân của người gọi', async () => {
    const { service, repository } = setup();
    repository.readOwn.mockResolvedValueOnce({ loai: null });
    expect(await service.get(PATIENT, ARTICLE)).toEqual({ loai: null });
    repository.readOwn.mockResolvedValueOnce({ loai: 'KhongThich' });
    const own = await service.get('12', ARTICLE);
    expect(own).toEqual({ loai: 'KhongThich' });
    expect(Object.keys(own)).toEqual(['loai']);
    expect(repository.readOwn.mock.calls).toEqual([
      [PATIENT, ARTICLE],
      ['12', ARTICLE],
    ]);
  });
});
