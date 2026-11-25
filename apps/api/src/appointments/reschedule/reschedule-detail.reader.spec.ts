import 'reflect-metadata';
import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  BRANCH_ID,
  OWNER_ID,
  reschedulabilityFacts,
  rescheduleSource,
} from '../testing/reschedulability-facts.js';
import { RescheduleDetailReader } from './reschedule-detail.reader.js';
import type { RescheduleRequestRepository } from './reschedule-request.repository.js';
import type { RescheduleReader } from './reschedule.reader.js';
import type { ReschedulabilityFacts } from './reschedule.types.js';

// reschedule B5 — DLH-40, DLH-42, DLH-43, DLH-44, DLH-45 phần U `[đề xuất]`: `RescheduleDetailReader` với reader và repository GIẢ, bộ luật THẬT (`evaluateRescheduleAvailability`): hai khoá đổi lịch của chi tiết
// lịch Bệnh nhân và Lễ tân. SQL và dữ liệu thật ở `patient-appointment-detail.int-spec.ts`, `reception-appointments.int-spec.ts`.
const EM = { id: 'manager-doc-thuong' } as unknown as EntityManager;
const NOW = new Date('2026-11-02T01:00:00.000Z');
const CONFIG = {
  soLanTuDoiLichToiDa: 2,
  checkInSauPhut: 15,
  soLichHenToiDaMoiHoSo: 3,
};
const REQUEST = {
  trangThai: 'TuChoi' as const,
  thoiGianMongMuon: new Date('2026-11-20T01:30:00.000Z'),
  ghiChuXuLy: 'Bác sĩ nghỉ phép hôm đó',
  thoiDiemTao: new Date('2026-11-10T02:15:30.789Z'),
};

let reader: {
  tryConfig: ReturnType<typeof vi.fn>;
  readAvailability: ReturnType<typeof vi.fn>;
};
let requests: { findLatest: ReturnType<typeof vi.fn> };
let detail: RescheduleDetailReader;

/** Dữ kiện không khung giờ đích (cùng hình dạng với `RescheduleReader.readAvailability`) */
const facts = (overrides: Partial<ReschedulabilityFacts> = {}) => {
  const f = reschedulabilityFacts(overrides);
  return {
    actor: f.actor,
    now: f.now,
    config: f.config,
    source: f.source,
    profileActive: f.profileActive,
    chainLength: f.chainLength,
    pendingRequest: f.pendingRequest,
  };
};

beforeEach(() => {
  reader = {
    tryConfig: vi.fn().mockResolvedValue(CONFIG),
    readAvailability: vi.fn().mockResolvedValue(facts()),
  };
  requests = { findLatest: vi.fn().mockResolvedValue(null) };
  detail = new RescheduleDetailReader(
    reader as unknown as RescheduleReader,
    requests as unknown as RescheduleRequestRepository,
  );
});

const patient = () =>
  detail.forPatient(EM, {
    accountId: OWNER_ID,
    maLichHen: 'CLX-20261109-OLDAP',
    lichHenId: '100',
    now: NOW,
  });
const reception = () =>
  detail.forReception(EM, {
    chiNhanhId: BRANCH_ID,
    maLichHen: 'CLX-20261109-OLDAP',
    now: NOW,
  });

describe('DLH-40 forPatient: vai TuDoi, một lần đọc, cùng em', () => {
  it('đọc dữ kiện với vai TuDoi của tài khoản trong token, mã lịch, mốc `now` và cấu hình; cùng em', async () => {
    await patient();
    expect(reader.readAvailability).toHaveBeenCalledTimes(1);
    expect(reader.readAvailability).toHaveBeenCalledWith(EM, {
      actor: { via: 'TuDoi', accountId: OWNER_ID },
      maLichHen: 'CLX-20261109-OLDAP',
      now: NOW,
      config: CONFIG,
    });
    expect(requests.findLatest).toHaveBeenCalledWith(EM, '100');
  });

  it('còn lần tự đổi, chưa có yêu cầu ⇒ choPhepDoiLich true, yeuCauDoiLich null; kết quả chỉ có hai khoá', async () => {
    const view = await patient();
    expect(view).toStrictEqual({ choPhepDoiLich: true, yeuCauDoiLich: null });
  });

  it('hết lần tự đổi mà đã có yêu cầu chờ ⇒ choPhepDoiLich FALSE (luật bước 14), yeuCauDoiLich là yêu cầu đó', async () => {
    reader.readAvailability.mockResolvedValue(
      facts({
        source: rescheduleSource({ soLanTuDoiLich: 2 }),
        pendingRequest: true,
      }),
    );
    requests.findLatest.mockResolvedValue({
      ...REQUEST,
      trangThai: 'ChoDuyet',
      ghiChuXuLy: null,
    });
    const view = await patient();
    expect(view.choPhepDoiLich).toBe(false);
    expect(view.yeuCauDoiLich?.trangThai).toBe('ChoDuyet');
  });

  it('hết lần tự đổi, KHÔNG có yêu cầu chờ (yêu cầu cũ đã TuChoi) ⇒ choPhepDoiLich true: gửi lại được (XDL-02)', async () => {
    reader.readAvailability.mockResolvedValue(
      facts({ source: rescheduleSource({ soLanTuDoiLich: 2 }) }),
    );
    requests.findLatest.mockResolvedValue(REQUEST);
    const view = await patient();
    expect(view.choPhepDoiLich).toBe(true);
    expect(view.yeuCauDoiLich?.trangThai).toBe('TuChoi');
  });

  it('lịch không đổi được theo luật (ChoThanhToan, đã qua giờ, hồ sơ ngừng, chuỗi dài) ⇒ false', async () => {
    for (const overrides of [
      { source: rescheduleSource({ trangThai: 'ChoThanhToan' as const }) },
      {
        source: rescheduleSource({
          thoiGian: new Date('2026-11-01T00:00:00Z'),
        }),
      },
      { profileActive: false },
      { chainLength: 19 },
      { source: null },
    ] as const) {
      reader.readAvailability.mockResolvedValue(facts(overrides));
      expect((await patient()).choPhepDoiLich).toBe(false);
    }
  });
});

describe('DLH-43, DLH-44 yeuCauDoiLich: ánh xạ và danh sách trắng', () => {
  it('bốn khoá: trạng thái, hai thời điểm ISO UTC GIỮ mili giây, ghi chú; không khoá nào khác', async () => {
    requests.findLatest.mockResolvedValue({
      ...REQUEST,
      lyDoYeuCau: 'LY-DO-RIENG-TU',
      yeuCauId: '777',
      nguoiXuLyId: '888',
    });
    const { yeuCauDoiLich } = await patient();
    expect(yeuCauDoiLich).toStrictEqual({
      trangThai: 'TuChoi',
      thoiGianMongMuon: '2026-11-20T01:30:00.000Z',
      ghiChuXuLy: 'Bác sĩ nghỉ phép hôm đó',
      thoiDiemTao: '2026-11-10T02:15:30.789Z',
    });
  });

  it('ghiChuXuLy null được giữ null', async () => {
    requests.findLatest.mockResolvedValue({
      ...REQUEST,
      trangThai: 'ChoDuyet',
      ghiChuXuLy: null,
    });
    expect((await patient()).yeuCauDoiLich?.ghiChuXuLy).toBeNull();
  });

  it('lỗi của repository hay reader lan ra nguyên vẹn (không nuốt thành false hay null)', async () => {
    const failure = new Error('DB hỏng');
    requests.findLatest.mockRejectedValue(failure);
    await expect(patient()).rejects.toBe(failure);
    requests.findLatest.mockResolvedValue(null);
    reader.readAvailability.mockRejectedValue(failure);
    await expect(patient()).rejects.toBe(failure);
  });
});

describe('DLH-42 thiếu cấu hình: false, KHÔNG ném', () => {
  it('Bệnh nhân: choPhepDoiLich false dù dữ kiện cho phép; vẫn đọc dữ kiện và yêu cầu mới nhất; không ném', async () => {
    reader.tryConfig.mockResolvedValue(null);
    requests.findLatest.mockResolvedValue(REQUEST);
    const view = await patient();
    expect(view.choPhepDoiLich).toBe(false);
    expect(view.yeuCauDoiLich?.trangThai).toBe('TuChoi');
    expect(reader.readAvailability).toHaveBeenCalledTimes(1);
  });

  it('Lễ tân: choPhepDoiLich false nhưng coYeuCauChoDuyet vẫn đúng (không phụ thuộc cấu hình)', async () => {
    reader.tryConfig.mockResolvedValue(null);
    reader.readAvailability.mockResolvedValue(facts({ pendingRequest: true }));
    expect(await reception()).toStrictEqual({
      choPhepDoiLich: false,
      coYeuCauChoDuyet: true,
    });
  });
});

describe('DLH-45 forReception: vai DoiHo trong chi nhánh của Lễ tân', () => {
  it('đọc dữ kiện với vai DoiHo và chi nhánh của PHẠM VI; KHÔNG đọc yêu cầu mới nhất; kết quả chỉ có hai khoá', async () => {
    reader.readAvailability.mockResolvedValue(
      facts({ actor: { via: 'DoiHo', chiNhanhId: BRANCH_ID } }),
    );
    const view = await reception();
    expect(reader.readAvailability).toHaveBeenCalledWith(EM, {
      actor: { via: 'DoiHo', chiNhanhId: BRANCH_ID },
      maLichHen: 'CLX-20261109-OLDAP',
      now: NOW,
      config: CONFIG,
    });
    expect(requests.findLatest).not.toHaveBeenCalled();
    expect(view).toStrictEqual({
      choPhepDoiLich: true,
      coYeuCauChoDuyet: false,
    });
  });

  it('hết lần tự đổi và có yêu cầu chờ ⇒ Lễ tân VẪN đổi hộ được (KDL-19), coYeuCauChoDuyet true', async () => {
    reader.readAvailability.mockResolvedValue(
      facts({
        actor: { via: 'DoiHo', chiNhanhId: BRANCH_ID },
        source: rescheduleSource({ soLanTuDoiLich: 9 }),
        pendingRequest: true,
      }),
    );
    expect(await reception()).toStrictEqual({
      choPhepDoiLich: true,
      coYeuCauChoDuyet: true,
    });
  });

  it('lịch tồn (đã huỷ) mà còn yêu cầu chờ ⇒ không đổi hộ được nhưng coYeuCauChoDuyet true (R6)', async () => {
    reader.readAvailability.mockResolvedValue(
      facts({
        actor: { via: 'DoiHo', chiNhanhId: BRANCH_ID },
        source: rescheduleSource({ trangThai: 'DaHuy' }),
        pendingRequest: true,
      }),
    );
    expect(await reception()).toStrictEqual({
      choPhepDoiLich: false,
      coYeuCauChoDuyet: true,
    });
  });

  it('hạn đổi hộ là giờ hẹn + check_in_sau_phut: quá giờ hẹn 10 phút vẫn đổi hộ được, 16 phút thì không', async () => {
    const at = (offsetMinutes: number) =>
      facts({
        actor: { via: 'DoiHo', chiNhanhId: BRANCH_ID },
        now: NOW,
        source: rescheduleSource({
          thoiGian: new Date(NOW.getTime() - offsetMinutes * 60_000),
        }),
      });
    reader.readAvailability.mockResolvedValue(at(10));
    expect((await reception()).choPhepDoiLich).toBe(true);
    reader.readAvailability.mockResolvedValue(at(16));
    expect((await reception()).choPhepDoiLich).toBe(false);
  });
});
