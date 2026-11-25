import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import {
  approveBody,
  parseApproveResult,
  parseRejectResult,
  rejectBody,
} from './request-handle-readers';

// reschedule F4 Pha B1, WXD-83 `[đề xuất]`: HỢP ĐỒNG GHI (chỉ trên giấy cho tới khi B9 merge: PLAN reschedule 5.7, 5.8 và kế hoạch B9 `1.13` mục 2.2 đến 2.7), khoá ở MỘT file `request-handle-readers.ts`.
// Thân: duyệt `{ ghiChu }` hoặc `{ ghiChu, khungGioId }` (khoá `khungGioId` VẮNG khi không chọn, không bao giờ `null`); từ chối `{ ghiChu }`. 200 duyệt đúng ba khoá, 200 từ chối đúng hai khoá; thiếu khoá, sai kiểu,
// trạng thái ngược (duyệt trả `TuChoi`) ⇒ `UnexpectedResponseError` (pha gửi coi là "chưa rõ"). Khoá thừa không chép.
const NOW = '2026-11-25T03:00:00.000Z';
const approved = () => ({
  yeuCau: { trangThai: 'DaDuyet' },
  lichHenMoi: {
    maLichHen: 'CLX-20261127-NEW01',
    thoiGian: '2026-11-27T03:30:00.000Z',
    trangThai: 'DaXacNhan',
  },
  thoiGianMayChu: NOW,
});
const rejected = () => ({
  yeuCau: { trangThai: 'TuChoi' },
  thoiGianMayChu: NOW,
});

describe('thân gửi lên', () => {
  it('WXD-83 duyệt không chọn khung giờ thay thế ⇒ thân CHỈ có `ghiChu` (khoá `khungGioId` vắng, không `null`)', () => {
    const body = approveBody('Đã xác nhận với bệnh nhân.');
    expect(body).toEqual({ ghiChu: 'Đã xác nhận với bệnh nhân.' });
    expect(Object.keys(body)).toEqual(['ghiChu']);
    expect(JSON.stringify(body)).not.toContain('khungGioId');
  });

  it('WXD-83 duyệt kèm khung giờ thay thế ⇒ thêm `khungGioId` là CHUỖI id (lớn hơn 2^53 giữ nguyên)', () => {
    expect(approveBody('ok', '9007199254740993')).toEqual({
      ghiChu: 'ok',
      khungGioId: '9007199254740993',
    });
  });

  it('WXD-83 `khungGioId` không phải id BIGINT dạng chuỗi ⇒ ném lỗi lập trình (không bao giờ gửi chữ sai lên máy chủ)', () => {
    for (const id of ['', '0', '012', 'abc', '1.5', ' 7']) {
      expect(() => approveBody('ok', id), JSON.stringify(id)).toThrow(
        RangeError,
      );
    }
  });

  it('WXD-83 từ chối ⇒ thân CHỈ có `ghiChu`', () => {
    expect(rejectBody('Không còn chỗ.')).toEqual({ ghiChu: 'Không còn chỗ.' });
  });
});

describe('200 của duyệt', () => {
  it('WXD-83 đúng hợp đồng: lịch mới và giờ máy chủ; khoá thừa (lịch cũ, id) không được chép', () => {
    const parsed = parseApproveResult({
      ...approved(),
      lichHenCu: { maLichHen: 'CLX-20261120-7K3M9' },
      yeuCauId: '101',
      lichHenId: '9',
    });
    expect(parsed).toEqual({
      lichHenMoi: {
        maLichHen: 'CLX-20261127-NEW01',
        thoiGian: '2026-11-27T03:30:00.000Z',
        trangThai: 'DaXacNhan',
      },
      thoiGianMayChu: NOW,
    });
  });

  it.each([
    ['yeuCau', undefined],
    ['lichHenMoi', undefined],
    ['thoiGianMayChu', undefined],
    ['yeuCau', { trangThai: 'TuChoi' }],
    ['yeuCau', { trangThai: 'ChoDuyet' }],
    ['yeuCau', {}],
    ['lichHenMoi', null],
    [
      'lichHenMoi',
      {
        maLichHen: '',
        thoiGian: '2026-11-27T03:30:00.000Z',
        trangThai: 'DaXacNhan',
      },
    ],
    [
      'lichHenMoi',
      { maLichHen: 'CLX-1', thoiGian: '27/11/2026', trangThai: 'DaXacNhan' },
    ],
    [
      'lichHenMoi',
      {
        maLichHen: 'CLX-1',
        thoiGian: '2026-11-27T10:30:00',
        trangThai: 'DaXacNhan',
      },
    ],
    [
      'lichHenMoi',
      { maLichHen: 'CLX-1', thoiGian: '2026-11-27T03:30:00.000Z' },
    ],
    // B9 (đã merge, d6f0fd6): `trangThai` của lịch mới LUÔN `DaXacNhan` (B4 chèn thẳng `DaXacNhan`)
    [
      'lichHenMoi',
      {
        maLichHen: 'CLX-1',
        thoiGian: '2026-11-27T03:30:00.000Z',
        trangThai: 'ChoThanhToan',
      },
    ],
    [
      'lichHenMoi',
      {
        maLichHen: 'CLX-1',
        thoiGian: '2026-11-27T03:30:00.000Z',
        trangThai: null,
      },
    ],
    ['thoiGianMayChu', '2026-11-25T10:00:00'],
    ['thoiGianMayChu', 5],
  ] as const)('WXD-83 `%s` = %j ⇒ không dùng được', (key, value) => {
    const body: Record<string, unknown> = { ...approved() };
    if (value === undefined) delete body[key];
    else body[key] = value;
    expect(() => parseApproveResult(body)).toThrow(UnexpectedResponseError);
  });

  it.each([null, undefined, [], 'ok', 200])(
    'WXD-83 thân %j không phải đối tượng ⇒ không dùng được',
    (body) => {
      expect(() => parseApproveResult(body)).toThrow(UnexpectedResponseError);
      expect(() => parseRejectResult(body)).toThrow(UnexpectedResponseError);
    },
  );
});

describe('200 của từ chối', () => {
  it('WXD-83 đúng hợp đồng: chỉ giờ máy chủ; KHÔNG lịch mới (từ chối không tạo lịch); khoá thừa không được chép', () => {
    expect(
      parseRejectResult({ ...rejected(), lichHenMoi: approved().lichHenMoi }),
    ).toEqual({
      thoiGianMayChu: NOW,
    });
  });

  it.each([
    ['yeuCau', undefined],
    ['thoiGianMayChu', undefined],
    ['yeuCau', { trangThai: 'DaDuyet' }],
    ['yeuCau', { trangThai: 'ChoDuyet' }],
    ['yeuCau', null],
    ['thoiGianMayChu', 'hôm nay'],
  ] as const)(
    'WXD-83 `%s` = %j ⇒ không dùng được (từ chối mà trả `DaDuyet` là sai)',
    (key, value) => {
      const body: Record<string, unknown> = { ...rejected() };
      if (value === undefined) delete body[key];
      else body[key] = value;
      expect(() => parseRejectResult(body)).toThrow(UnexpectedResponseError);
    },
  );
});
