import { vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { BookabilityReader } from '../slots/bookability.reader.js';
import { RescheduleReader } from './reschedule.reader.js';

// reschedule B2 — KDL-15 phần U (PLAN reschedule 7.1): `RescheduleReader.config()` đọc ba giá trị của `cau_hinh_he_thong`; thiếu hay không đọc được là 409 `HE_THONG_CHUA_CAU_HINH`,
// KHÔNG có số ngầm (quy tắc 35). Phần I (MySQL thật, không có dòng cấu hình) ở `reschedule.reader.int-spec.ts`.
const row = (overrides: Record<string, unknown> = {}) => ({
  soLanTuDoiLichToiDa: 2,
  checkInSauPhut: 15,
  soLichHenToiDaMoiHoSo: 3,
  ...overrides,
});

const readerWith = (getOrThrow: () => Promise<unknown>) =>
  new RescheduleReader(
    {} as BookabilityReader,
    {
      getOrThrow,
    } as unknown as SystemConfigService,
  );

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  // Assertion thật (không phải lỗi thường): mã KHÔNG từ chối thì ca đỏ với thông báo của vitest
  return expect.fail('phải bị từ chối nhưng lời hứa đã được thực hiện');
}

const MISSING_BODY = { maLoi: 'HE_THONG_CHUA_CAU_HINH' };

describe('KDL-15 cấu hình của đổi lịch', () => {
  it('đọc đúng ba giá trị, đúng tên, không thêm khoá nào', async () => {
    const config = await readerWith(() =>
      Promise.resolve(row({ nguongNoShow: 9, thoiGianGiuCho: 99 })),
    ).config();
    expect(config).toStrictEqual({
      soLanTuDoiLichToiDa: 2,
      checkInSauPhut: 15,
      soLichHenToiDaMoiHoSo: 3,
    });
  });

  it('số lần tự đổi tối đa = 0 và check_in_sau_phut = 0 là HỢP LỆ (CHECK >= 0): không bị coi là thiếu cấu hình', async () => {
    await expect(
      readerWith(() =>
        Promise.resolve(row({ soLanTuDoiLichToiDa: 0, checkInSauPhut: 0 })),
      ).config(),
    ).resolves.toMatchObject({ soLanTuDoiLichToiDa: 0, checkInSauPhut: 0 });
  });

  it('không có dòng cấu hình (SystemConfigService ném 409) ⇒ lỗi đó lan ra NGUYÊN, không số mặc định', async () => {
    const original = new AppException(409, 'HE_THONG_CHUA_CAU_HINH', {
      thongBao: 'Hệ thống chưa được cấu hình.',
    });
    const error = await rejectionOf(
      readerWith(() => Promise.reject(original)).config(),
    );
    expect(error).toBe(original);
  });

  it.each([
    ['không phải số (undefined)', undefined],
    ['không phải số (null)', null],
    ['NaN', Number.NaN],
    ['số âm', -1],
    ['số thực', 1.5],
    ['vô cực', Number.POSITIVE_INFINITY],
    ['chuỗi số', '2'],
  ])(
    'giá trị so_lan_tu_doi_lich_toi_da %s ⇒ 409 HE_THONG_CHUA_CAU_HINH, không dùng số ngầm',
    async (_name, value) => {
      const error = await rejectionOf(
        readerWith(() =>
          Promise.resolve(row({ soLanTuDoiLichToiDa: value })),
        ).config(),
      );
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(409);
      expect((error as AppException).getResponse()).toMatchObject(MISSING_BODY);
    },
  );

  it.each(['checkInSauPhut', 'soLichHenToiDaMoiHoSo'])(
    'giá trị %s hỏng cũng ⇒ 409 (mỗi trong ba giá trị đều được kiểm)',
    async (key) => {
      const error = await rejectionOf(
        readerWith(() => Promise.resolve(row({ [key]: Number.NaN }))).config(),
      );
      expect((error as AppException).getResponse()).toMatchObject(MISSING_BODY);
    },
  );
});

// KDL-22 phần U: nhánh phòng thủ "hồ sơ người thân không thuộc chủ lịch". DB đã ép bằng khoá ngoại composite `fk_lich_hen_ho_so_chu_so_huu` (ho_so_nguoi_than_id, benh_nhan_id) nên KHÔNG dựng được
// bằng dữ liệu thật (ca tích hợp đã thử và bị MySQL từ chối); `readVisitProfile` vẫn có trạng thái `missing` nên reader phải xử lý: coi như không có lịch (cùng 404, không lộ gì).
describe('KDL-22 hồ sơ người thân không thuộc chủ lịch (em giả)', () => {
  const sourceRow = {
    lichHenId: '100',
    maLichHen: 'CLX-OLD',
    benhNhanId: '9',
    hoSoNguoiThanId: '5',
    bacSiId: '5',
    chiNhanhId: '1',
    dichVuKhamId: '7',
    khungGioId: '11',
    trangThai: 'DaXacNhan',
    thoiGian: '2026-11-10 08:00:00',
    soLanTuDoiLich: 0,
  };
  const input = {
    actor: { via: 'TuDoi', accountId: '9' } as const,
    maLichHen: 'CLX-OLD',
    khungGioMoiId: '10',
    now: new Date('2026-11-02T09:00:00+07:00'),
    config: {
      soLanTuDoiLichToiDa: 2,
      checkInSauPhut: 15,
      soLichHenToiDaMoiHoSo: 3,
    },
    requestReasonGiven: false,
  };

  it('readVisitProfile trả missing (không có hàng khớp chủ) ⇒ source = null, đọc đúng hai câu, không gọi BookabilityReader', async () => {
    // Mặc định các câu sau trả hợp lệ: nếu nhánh missing bị bỏ, reader đi tiếp và ca đỏ ở ASSERTION (source khác null), không phải TypeError của mock
    const query = vi
      .fn()
      .mockResolvedValueOnce([sourceRow])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    const bookability = {
      read: vi.fn().mockResolvedValue({ kind: 'SlotNotFound' }),
    };
    const reader = new RescheduleReader(
      bookability as unknown as BookabilityReader,
      {} as SystemConfigService,
    );
    const read = await reader.read(
      { query } as unknown as EntityManager,
      input,
      'none',
    );
    expect(read.facts.source).toBeNull();
    expect(read.facts.bookability).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
    expect(bookability.read).not.toHaveBeenCalled();
  });

  it('đối chứng: hồ sơ có hàng khớp nhưng đã ngừng ⇒ vẫn đọc tiếp, source có, profileActive = false', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([sourceRow])
      .mockResolvedValueOnce([{ trangThaiHieuLuc: 0 }])
      .mockResolvedValueOnce([{ soLich: 1 }])
      .mockResolvedValueOnce([]);
    const bookability = {
      read: vi.fn().mockResolvedValue({ kind: 'SlotNotFound' }),
    };
    const reader = new RescheduleReader(
      bookability as unknown as BookabilityReader,
      {} as SystemConfigService,
    );
    const read = await reader.read(
      { query } as unknown as EntityManager,
      input,
      'none',
    );
    expect(read.facts.source?.maLichHen).toBe('CLX-OLD');
    expect(read.facts.profileActive).toBe(false);
    expect(read.facts.chainLength).toBe(1);
    expect(bookability.read).toHaveBeenCalledTimes(1);
  });
});
