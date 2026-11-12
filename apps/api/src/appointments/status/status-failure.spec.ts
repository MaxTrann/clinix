import { describe, expect, it } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BOOKING_ERRORS } from '../appointments.constants.js';
import {
  invalidTransitionException,
  onlyDoctorCompletesException,
  statusFailureException,
  type StatusFailure,
} from './status-failure.js';

// Task B12 — RTS-05: MỘT hàm ánh xạ kết quả KHÔNG thành công của `checkIn` và `markNoShow` sang `AppException` (PLAN booking 5.14, 7.32 `[đề xuất]`; TRACKING 3.26 B12-E). CT-06, CT-07, CT-08, CT-09, CT-10 ở mức mã và `chiTiet`;
// mức route ở e2e (RTS-07).
const TU = new Date('2026-11-10T00:30:00.000Z');
const DEN = new Date('2026-11-10T01:15:00.000Z');

const bodyOf = (error: AppException) =>
  error.getResponse() as {
    maLoi: string;
    thongBao: string;
    chiTiet?: unknown;
  };

describe('RTS-05 statusFailureException: mỗi nhánh một mã, một HTTP, một chiTiet', () => {
  it.each<[string, StatusFailure, number, string, unknown]>([
    ['NotFound', { kind: 'NotFound' }, 404, 'KHONG_TIM_THAY', undefined],
    [
      'InvalidState',
      { kind: 'InvalidState', trangThai: 'DaHuy' },
      409,
      'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
      { tuTrangThai: 'DaHuy', denTrangThai: 'DaTiepDon' },
    ],
    [
      'ConfigMissing',
      { kind: 'ConfigMissing' },
      409,
      'HE_THONG_CHUA_CAU_HINH',
      undefined,
    ],
    [
      'OwedAmount',
      { kind: 'OwedAmount', conPhaiThu: '50000.00' },
      409,
      'CON_PHAN_CHUA_THANH_TOAN',
      { conPhaiThu: '50000.00' },
    ],
    [
      'OutsideWindow',
      { kind: 'OutsideWindow', tu: TU, den: DEN },
      409,
      'NGOAI_KHUNG_GIO_TIEP_DON',
      { tu: '2026-11-10T00:30:00.000Z', den: '2026-11-10T01:15:00.000Z' },
    ],
    ['NotDue', { kind: 'NotDue' }, 409, 'CHUA_QUA_GIO_HEN', undefined],
  ])('%s', (_ten, failure, status, maLoi, chiTiet) => {
    const error = statusFailureException(failure, 'DaTiepDon');
    expect(error).toBeInstanceOf(AppException);
    expect(error.getStatus()).toBe(status);
    const body = bodyOf(error);
    expect(body.maLoi).toBe(maLoi);
    if (chiTiet === undefined) expect(body).not.toHaveProperty('chiTiet');
    else expect(body.chiTiet).toEqual(chiTiet);
  });

  it('NotFound dùng ĐÚNG thân 404 chung của hệ thống (cùng từng ký tự với mã sai dạng, lịch ngoài chi nhánh, không tồn tại: H10, CT-09)', () => {
    expect(
      bodyOf(statusFailureException({ kind: 'NotFound' }, 'VangMat')),
    ).toEqual({ maLoi: 'KHONG_TIM_THAY', thongBao: 'Không tìm thấy dữ liệu.' });
  });

  it('ConfigMissing cùng mã và cùng câu với SystemConfigService.getOrThrow (mã chung của hệ thống, quy tắc 35)', () => {
    expect(
      bodyOf(statusFailureException({ kind: 'ConfigMissing' }, 'VangMat')),
    ).toEqual({
      maLoi: 'HE_THONG_CHUA_CAU_HINH',
      thongBao: 'Hệ thống chưa được cấu hình.',
    });
  });

  it('InvalidState ghi đúng đích Lễ tân chọn (tuTrangThai là nguồn đọc dưới khoá, denTrangThai là đích)', () => {
    for (const to of ['DaTiepDon', 'VangMat'] as const) {
      expect(
        bodyOf(
          statusFailureException(
            { kind: 'InvalidState', trangThai: 'VangMat' },
            to,
          ),
        ).chiTiet,
      ).toEqual({ tuTrangThai: 'VangMat', denTrangThai: to });
    }
  });

  it('mã và HTTP lấy từ BOOKING_ERRORS (một nơi định nghĩa; không mã lỗi mới ở B12)', () => {
    for (const code of [
      'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
      'CHI_BAC_SI_HOAN_THANH',
      'CON_PHAN_CHUA_THANH_TOAN',
      'NGOAI_KHUNG_GIO_TIEP_DON',
      'CHUA_QUA_GIO_HEN',
    ] as const)
      expect(BOOKING_ERRORS[code].status).toBe(409);
  });
});

describe('RTS-05 hai hàm cho đường chỉ-từ-chối (đích HoanThanh và các đích Lễ tân không làm được; MT-03, CT-08)', () => {
  it('HoanThanh ⇒ 409 CHI_BAC_SI_HOAN_THANH, không chiTiet', () => {
    const error = onlyDoctorCompletesException();
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).maLoi).toBe('CHI_BAC_SI_HOAN_THANH');
    expect(bodyOf(error)).not.toHaveProperty('chiTiet');
  });

  it.each<[TrangThaiLichHen, TrangThaiLichHen]>([
    ['DaXacNhan', 'ChoThanhToan'],
    ['ChoThanhToan', 'DaXacNhan'],
    ['DaTiepDon', 'DaDoiLich'],
  ])(
    '%s sang %s ⇒ 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE kèm cặp trạng thái',
    (from, to) => {
      const error = invalidTransitionException(from, to);
      expect(error.getStatus()).toBe(409);
      expect(bodyOf(error).maLoi).toBe('CHUYEN_TRANG_THAI_KHONG_HOP_LE');
      expect(bodyOf(error).chiTiet).toEqual({
        tuTrangThai: from,
        denTrangThai: to,
      });
    },
  );
});
