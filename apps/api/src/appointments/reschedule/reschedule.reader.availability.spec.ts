import { vi } from 'vitest';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import type { BookabilityReader } from '../slots/bookability.reader.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import { RescheduleReader } from './reschedule.reader.js';
import type { RescheduleActor } from './reschedule.types.js';

// reschedule B5 — DLH-40 và DLH-46 phần U `[đề xuất]`: hai phương thức mới của `RescheduleReader`. `tryConfig()` như `config()` nhưng KHÔNG ném (chi tiết lịch đọc được dù chưa cấu hình);
// `readAvailability()` đọc dữ kiện KHÔNG cần khung giờ đích: chỉ đọc thường, không khoá, không đọc khung giờ nào. Em giả ghi lại từng câu SQL; phần MySQL thật ở `patient-appointment-detail.int-spec.ts`.
const NOW = new Date('2026-11-02T08:00:00.000+07:00');
const OWNER: RescheduleActor = { via: 'TuDoi', accountId: '9' };
const CONFIG = { soLanTuDoiLichToiDa: 2, checkInSauPhut: 15 };

const sourceRow = (overrides: Record<string, unknown> = {}) => ({
  lichHenId: '100',
  maLichHen: 'CLX-20261109-OLDAP',
  benhNhanId: '9',
  hoSoNguoiThanId: null,
  bacSiId: '5',
  chiNhanhId: '1',
  dichVuKhamId: '7',
  khungGioId: '11',
  trangThai: 'DaXacNhan',
  thoiGian: '2026-11-09 08:00:00',
  soLanTuDoiLich: '1',
  ...overrides,
});

interface World {
  source?: Record<string, unknown> | null;
  profile?: { trangThaiHieuLuc: number }[];
  chain?: number;
  pending?: boolean;
}

function scripted(world: World = {}): ScriptedEntityManager {
  return new ScriptedEntityManager((sql) => {
    if (sql.includes('FROM lich_hen WHERE ma_lich_hen'))
      return world.source === null ? [] : [world.source ?? sourceRow()];
    if (sql.includes('FROM ho_so_nguoi_than')) return world.profile ?? [];
    if (sql.includes('WITH RECURSIVE')) return [{ soLich: world.chain ?? 1 }];
    if (sql.includes('FROM yeu_cau_doi_lich_ngoai_chinh_sach'))
      return world.pending === true ? [{ co: 1 }] : [];
    throw new Error(`câu SQL ngoài dự kiến: ${sql.slice(0, 60)}`);
  });
}

const readerWith = (
  systemConfig: Partial<Pick<SystemConfigService, 'get' | 'getOrThrow'>> = {},
) =>
  new RescheduleReader(
    {} as BookabilityReader,
    systemConfig as unknown as SystemConfigService,
  );

const read = (
  em: ScriptedEntityManager,
  overrides: { actor?: RescheduleActor; now?: Date } = {},
) =>
  readerWith().readAvailability(em.em, {
    actor: overrides.actor ?? OWNER,
    maLichHen: 'CLX-20261109-OLDAP',
    now: overrides.now ?? NOW,
    config: CONFIG,
  });

describe('DLH-42 tryConfig: không ném, null khi thiếu hay giá trị lạ', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    soLanTuDoiLichToiDa: 2,
    checkInSauPhut: 15,
    soLichHenToiDaMoiHoSo: 3,
    ...overrides,
  });

  it('có cấu hình hợp lệ ⇒ đúng ba giá trị (cùng kết quả với config())', async () => {
    const get = vi.fn().mockResolvedValue(row());
    const getOrThrow = vi.fn().mockResolvedValue(row());
    const reader = readerWith({ get, getOrThrow });
    const expected = {
      soLanTuDoiLichToiDa: 2,
      checkInSauPhut: 15,
      soLichHenToiDaMoiHoSo: 3,
    };
    await expect(reader.tryConfig()).resolves.toStrictEqual(expected);
    await expect(reader.config()).resolves.toStrictEqual(expected);
  });

  it('không có dòng cấu hình ⇒ null, KHÔNG ném (config() thì ném 409)', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const getOrThrow = vi
      .fn()
      .mockRejectedValue(new AppException(409, 'HE_THONG_CHUA_CAU_HINH'));
    const reader = readerWith({ get, getOrThrow });
    await expect(reader.tryConfig()).resolves.toBeNull();
    await expect(reader.config()).rejects.toBeInstanceOf(AppException);
  });

  it.each([
    ['âm', -1],
    ['số thực', 1.5],
    ['NaN', Number.NaN],
    ['không phải số', undefined],
  ])('giá trị %s ở check_in_sau_phut ⇒ null (không số ngầm)', async (_n, v) => {
    const get = vi.fn().mockResolvedValue(row({ checkInSauPhut: v }));
    await expect(readerWith({ get }).tryConfig()).resolves.toBeNull();
  });

  it('số lần tự đổi tối đa = 0 và check_in_sau_phut = 0 là HỢP LỆ ⇒ không null', async () => {
    const get = vi
      .fn()
      .mockResolvedValue(row({ soLanTuDoiLichToiDa: 0, checkInSauPhut: 0 }));
    await expect(readerWith({ get }).tryConfig()).resolves.toMatchObject({
      soLanTuDoiLichToiDa: 0,
      checkInSauPhut: 0,
    });
  });

  it('lỗi của kho cấu hình lan ra nguyên (không nuốt thành null)', async () => {
    const failure = new Error('kho cấu hình hỏng');
    const get = vi.fn().mockRejectedValue(failure);
    await expect(readerWith({ get }).tryConfig()).rejects.toBe(failure);
  });
});

describe('DLH-40 readAvailability: dữ kiện không cần khung giờ đích', () => {
  it('lịch trong phạm vi: source đúng kiểu (id chuỗi, giờ là Date, số lần là số), chuỗi và yêu cầu chờ đọc đúng', async () => {
    const em = scripted({ chain: 4, pending: true });
    const facts = await read(em);
    expect(facts.source).toStrictEqual({
      lichHenId: '100',
      maLichHen: 'CLX-20261109-OLDAP',
      benhNhanId: '9',
      hoSoNguoiThanId: null,
      bacSiId: '5',
      chiNhanhId: '1',
      dichVuKhamId: '7',
      khungGioId: '11',
      trangThai: 'DaXacNhan',
      thoiGian: new Date('2026-11-09T08:00:00+07:00'),
      soLanTuDoiLich: 1,
    });
    expect(facts.profileActive).toBe(true);
    expect(facts.chainLength).toBe(4);
    expect(facts.pendingRequest).toBe(true);
    expect(facts.actor).toBe(OWNER);
    expect(facts.config).toStrictEqual(CONFIG);
    expect(facts).not.toHaveProperty('bookability');
    expect(facts).not.toHaveProperty('requestReasonGiven');
  });

  it('mốc `now` được cắt xuống giây (bỏ mili giây)', async () => {
    const facts = await read(scripted(), {
      now: new Date('2026-11-02T01:00:00.987Z'),
    });
    expect(facts.now).toStrictEqual(new Date('2026-11-02T01:00:00.000Z'));
  });

  it('CHỈ ĐỌC THƯỜNG: không `FOR UPDATE`/`FOR SHARE`, không `INSERT`/`UPDATE`, không chạm khung_gio, bac_si hay chi_nhanh', async () => {
    const em = scripted({
      source: sourceRow({ hoSoNguoiThanId: '55' }),
      profile: [{ trangThaiHieuLuc: 1 }],
    });
    await read(em);
    expect(em.queries).toHaveLength(4);
    for (const { sql } of em.queries) {
      expect(sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
      expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)/i);
      expect(sql).not.toMatch(
        /\b(?:FROM|JOIN)\s+(?:khung_gio|bac_si|chi_nhanh|lich_lam_viec)\b/i,
      );
    }
  });

  it('chuỗi đọc với lichHenId và trần MAX_CHAIN_DEPTH; yêu cầu chờ đọc theo lichHenId', async () => {
    const em = scripted();
    await read(em);
    const chain = em.queries.find(({ sql }) => sql.includes('WITH RECURSIVE'));
    expect(chain?.params).toStrictEqual(['100', MAX_CHAIN_DEPTH]);
    const pending = em.queries.find(({ sql }) =>
      sql.includes('FROM yeu_cau_doi_lich_ngoai_chinh_sach'),
    );
    expect(pending?.params).toStrictEqual(['100']);
  });

  it('không có lịch ⇒ source null, giá trị điền chỗ, và DỪNG ngay (đúng một câu: không đọc hồ sơ, chuỗi, yêu cầu)', async () => {
    const em = scripted({ source: null });
    const facts = await read(em);
    expect(facts.source).toBeNull();
    expect(facts.profileActive).toBe(true);
    expect(facts.chainLength).toBe(0);
    expect(facts.pendingRequest).toBe(false);
    expect(em.queries).toHaveLength(1);
  });

  it('lịch của người khác hay ngoài chi nhánh ⇒ cùng kết quả như không có lịch (không lộ gì)', async () => {
    const em = scripted({ source: sourceRow({ benhNhanId: '999' }) });
    expect((await read(em)).source).toBeNull();
    expect(em.queries).toHaveLength(1);
    const desk = scripted({ source: sourceRow({ chiNhanhId: '77' }) });
    const facts = await read(desk, {
      actor: { via: 'DoiHo', chiNhanhId: '1' },
    });
    expect(facts.source).toBeNull();
    expect(desk.queries).toHaveLength(1);
  });

  it('hồ sơ người thân đã ngừng ⇒ profileActive false; hồ sơ không thuộc chủ lịch (không có hàng) ⇒ coi như không có lịch', async () => {
    const inactive = scripted({
      source: sourceRow({ hoSoNguoiThanId: '55' }),
      profile: [{ trangThaiHieuLuc: 0 }],
    });
    expect((await read(inactive)).profileActive).toBe(false);
    const missing = scripted({
      source: sourceRow({ hoSoNguoiThanId: '55' }),
      profile: [],
    });
    const facts = await read(missing);
    expect(facts.source).toBeNull();
    expect(missing.queries).toHaveLength(2);
  });

  it('lỗi của câu SQL lan ra nguyên vẹn', async () => {
    const em = scripted();
    const failure = new Error('DB hỏng');
    em.failQuery = (sql) =>
      sql.includes('WITH RECURSIVE') ? failure : undefined;
    await expect(read(em)).rejects.toBe(failure);
  });
});
