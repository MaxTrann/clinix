import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import type { BookabilityReader } from '../slots/bookability.reader.js';
import { BookingEligibilityService } from './booking-eligibility.service.js';

// Task B7 — BookingEligibilityService với cấu hình và bộ đọc GIẢ (không DB; DL-13, DL-19, BCK-10 mức đơn vị; TRACKING booking 3.18 B7-C). `DataSource` giả CHỈ có `manager` (không
// `createQueryRunner`): nếu dịch vụ mở giao dịch thì test này vỡ. MySQL thật: booking-eligibility.service.int-spec.ts. Mã BCK-nn là [đề xuất].
const MANAGER = { id: 'manager-khong-giao-dich' };
const DB = { manager: MANAGER } as unknown as DataSource;
const ACCOUNT = '77';

let config: { soLichHenToiDaMoiHoSo: number };
let getOrThrow: ReturnType<typeof vi.fn>;
let readNoShowLock: ReturnType<typeof vi.fn>;
let service: BookingEligibilityService;

beforeEach(() => {
  config = { soLichHenToiDaMoiHoSo: 3 };
  getOrThrow = vi.fn(() => Promise.resolve(config));
  readNoShowLock = vi.fn(() => Promise.resolve(false));
  service = new BookingEligibilityService(
    DB,
    { getOrThrow } as unknown as SystemConfigService,
    { readNoShowLock } as unknown as BookabilityReader,
  );
});

describe('BookingEligibilityService (A4, Q26, DL-13)', () => {
  it('BCK-10 không bị khoá ⇒ choPhepDatLich = true, KHÔNG có khoá lyDo, kèm số lịch tối đa của cấu hình', async () => {
    const result = await service.check(ACCOUNT);

    expect(result).toStrictEqual({
      choPhepDatLich: true,
      soLichHenToiDaMoiHoSo: 3,
    });
    expect('lyDo' in result).toBe(false);
  });

  it('BCK-10 bị khoá no-show ⇒ choPhepDatLich = false và lyDo là MÃ của checks và tạo lịch (một bảng thông báo theo mã)', async () => {
    readNoShowLock.mockResolvedValue(true);

    const result = await service.check(ACCOUNT);

    expect(result).toStrictEqual({
      choPhepDatLich: false,
      lyDo: 'DAT_LICH_BI_KHOA_NO_SHOW',
      soLichHenToiDaMoiHoSo: 3,
    });
    expect(result.lyDo).toBe(BOOKING_ERROR_CODES.BOOKING_LOCKED_NO_SHOW);
  });

  it('BCK-10 không hàng benh_nhan ⇒ 403 KHONG_DU_QUYEN, thân GIỐNG HỆT 403 chung', async () => {
    readNoShowLock.mockResolvedValue(null);

    const error = await service.check(ACCOUNT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(403);
    expect((error as AppException).getResponse()).toStrictEqual(
      new AppException(403, COMMON_ERROR_CODES.FORBIDDEN).getResponse(),
    );
  });

  it('DL-19 chưa có cấu hình hệ thống ⇒ lỗi của getOrThrow (409 HE_THONG_CHUA_CAU_HINH) đi ra nguyên vẹn, không đọc hàng benh_nhan', async () => {
    const failure = new AppException(409, 'HE_THONG_CHUA_CAU_HINH');
    getOrThrow.mockRejectedValue(failure);

    await expect(service.check(ACCOUNT)).rejects.toBe(failure);
    expect(readNoShowLock).not.toHaveBeenCalled();
  });

  it('BCK-10 đọc MỘT lần, không khoá ("none"), bằng manager thường (không giao dịch), với accountId của token', async () => {
    await service.check(ACCOUNT);

    expect(readNoShowLock).toHaveBeenCalledTimes(1);
    expect(readNoShowLock).toHaveBeenCalledWith(MANAGER, ACCOUNT, 'none');
    expect(getOrThrow).toHaveBeenCalledTimes(1);
  });

  it('DL-13 mỗi lần gọi đọc LẠI cả cờ và cấu hình: cờ bật giữa hai lần gọi thì lần sau thấy ngay; đổi cấu hình thì số đổi theo', async () => {
    const first = await service.check(ACCOUNT);
    readNoShowLock.mockResolvedValue(true);
    config.soLichHenToiDaMoiHoSo = 5;
    const second = await service.check(ACCOUNT);

    expect(first.choPhepDatLich).toBe(true);
    expect(first.soLichHenToiDaMoiHoSo).toBe(3);
    expect(second.choPhepDatLich).toBe(false);
    expect(second.soLichHenToiDaMoiHoSo).toBe(5);
  });

  it('BCK-10 không lộ số lần no-show hay ngưỡng (FE không cần): đúng ba khoá khi bị khoá, hai khoá khi không', async () => {
    const free = await service.check(ACCOUNT);
    readNoShowLock.mockResolvedValue(true);
    const locked = await service.check(ACCOUNT);

    expect(Object.keys(free).sort()).toStrictEqual([
      'choPhepDatLich',
      'soLichHenToiDaMoiHoSo',
    ]);
    expect(Object.keys(locked).sort()).toStrictEqual([
      'choPhepDatLich',
      'lyDo',
      'soLichHenToiDaMoiHoSo',
    ]);
  });
});
