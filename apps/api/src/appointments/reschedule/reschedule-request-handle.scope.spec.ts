import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import {
  handlerActorOf,
  loadHandlingRow,
} from './reschedule-request-handle.scope.js';
import type { RescheduleRequestHandlingRow } from './reschedule-request-handle.types.js';
import type { RescheduleRequestRepository } from './reschedule-request.repository.js';

// reschedule B9 — QDL-13 (phạm vi: Quản trị viên Chi nhánh KHÔNG bị coi là Toàn hệ thống; phạm vi hỏng ⇒ 403; id sai dạng ⇒ cùng 404 và KHÔNG chạm DB) và M4/M5/M21 ở mức đơn vị. Không DB.
const EM = { id: 'em-doc-thuong' } as unknown as EntityManager;
const ROW: RescheduleRequestHandlingRow = {
  yeuCauId: '9007199254740993',
  trangThai: 'ChoDuyet',
  lichHenId: '31',
  maLichHen: 'CLX-20261110-AAA01',
  benhNhanId: '41',
  chiNhanhId: '5',
  khungGioMongMuonId: '61',
  thoiGianMongMuon: new Date('2026-11-20T01:30:00.000Z'),
};

describe('QDL-13 handlerActorOf: phạm vi người xử lý ⇒ actor của lõi B4', () => {
  it('Chi nhánh ⇒ chi nhánh được gán (KHÔNG null: không bao giờ bị coi là Toàn hệ thống); Toàn hệ thống ⇒ null', () => {
    expect(handlerActorOf({ kind: 'ChiNhanh', chiNhanhId: '5' })).toStrictEqual(
      {
        via: 'DuyetYeuCau',
        chiNhanhId: '5',
      },
    );
    expect(handlerActorOf({ kind: 'ToanHeThong' })).toStrictEqual({
      via: 'DuyetYeuCau',
      chiNhanhId: null,
    });
  });

  it.each([
    ['kind lạ', { kind: 'Khac' }],
    ['ChiNhanh thiếu chiNhanhId', { kind: 'ChiNhanh' }],
    ['ChiNhanh có chiNhanhId là số', { kind: 'ChiNhanh', chiNhanhId: 5 }],
    ['ChiNhanh có chiNhanhId null', { kind: 'ChiNhanh', chiNhanhId: null }],
    ['không có kind', {}],
  ])(
    'phạm vi hỏng (%s) ⇒ 403 KHONG_DU_QUYEN, không bao giờ mở ra Toàn hệ thống',
    (_case, scope) => {
      try {
        handlerActorOf(scope as unknown as AdminScope);
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getStatus()).toBe(403);
        expect((error as AppException).maLoi).toBe('KHONG_DU_QUYEN');
        return;
      }
      throw new Error('phạm vi hỏng lẽ ra phải bị từ chối');
    },
  );
});

describe('QDL-13 loadHandlingRow: id, phạm vi trong SQL, cùng một 404', () => {
  const repo = (row: RescheduleRequestHandlingRow | null) => {
    const findForHandling = vi.fn(
      (
        _em: EntityManager,
        _chiNhanhId: string | undefined,
        _yeuCauId: string,
      ) => Promise.resolve(row),
    );
    return {
      repository: { findForHandling } as unknown as RescheduleRequestRepository,
      findForHandling,
    };
  };
  const NOT_FOUND = {
    status: 404,
    body: {
      maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
      thongBao: 'Không tìm thấy yêu cầu đổi lịch.',
    },
  };
  async function failureOf(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      if (!(error instanceof AppException)) throw error;
      return { status: error.getStatus(), body: error.getResponse() };
    }
    throw new Error('lẽ ra phải ném AppException');
  }

  it('Quản trị viên Chi nhánh: truyền chi nhánh được gán vào SQL; id lớn hơn 2^53 đi NGUYÊN (không ép số); trả đúng hàng', async () => {
    const { repository, findForHandling } = repo(ROW);
    const actor = handlerActorOf({ kind: 'ChiNhanh', chiNhanhId: '5' });
    await expect(
      loadHandlingRow(repository, EM, actor, '9007199254740993'),
    ).resolves.toBe(ROW);
    expect(findForHandling).toHaveBeenCalledTimes(1);
    expect(findForHandling.mock.calls[0]).toStrictEqual([
      EM,
      '5',
      '9007199254740993',
    ]);
  });

  it('Toàn hệ thống: chi nhánh là undefined (không lọc); phạm vi Chi nhánh KHÔNG bao giờ ra undefined (M4, M5)', async () => {
    const { repository, findForHandling } = repo(ROW);
    await loadHandlingRow(
      repository,
      EM,
      handlerActorOf({ kind: 'ToanHeThong' }),
      '12',
    );
    expect(findForHandling.mock.calls[0]?.[1]).toBeUndefined();
    await loadHandlingRow(
      repository,
      EM,
      handlerActorOf({ kind: 'ChiNhanh', chiNhanhId: '7' }),
      '12',
    );
    expect(findForHandling.mock.calls[1]?.[1]).toBe('7');
  });

  it.each([
    ['chữ', 'abc'],
    ['0', '0'],
    ['số 0 đứng đầu', '012'],
    ['rỗng', ''],
    ['có khoảng trắng', ' 12'],
    ['số âm', '-1'],
    ['vượt BIGINT', '9223372036854775808'],
    ['số JSON', 12],
    ['null', null],
    ['undefined', undefined],
  ])(
    'id %s ⇒ 404 YEU_CAU_DOI_LICH_KHONG_TON_TAI và KHÔNG chạm DB',
    async (_case, raw) => {
      const { repository, findForHandling } = repo(ROW);
      const actor = handlerActorOf({ kind: 'ToanHeThong' });
      expect(
        await failureOf(loadHandlingRow(repository, EM, actor, raw)),
      ).toStrictEqual(NOT_FOUND);
      expect(findForHandling).not.toHaveBeenCalled();
    },
  );

  it('không có hàng (không tồn tại HOẶC ngoài phạm vi: SQL không phân biệt) ⇒ CÙNG 404 với id sai dạng, từng ký tự', async () => {
    const { repository } = repo(null);
    const actor = handlerActorOf({ kind: 'ChiNhanh', chiNhanhId: '5' });
    const missing = await failureOf(
      loadHandlingRow(repository, EM, actor, '12'),
    );
    const malformed = await failureOf(
      loadHandlingRow(repository, EM, actor, 'abc'),
    );
    expect(missing).toStrictEqual(NOT_FOUND);
    expect(JSON.stringify(missing)).toBe(JSON.stringify(malformed));
  });

  it('M21 loadHandlingRow KHÔNG xét trạng thái: yêu cầu đã xử lý vẫn được trả (404 của phạm vi đứng TRƯỚC 409 của trạng thái, quyết định ở dịch vụ)', async () => {
    const handled = { ...ROW, trangThai: 'DaDuyet' as const };
    const { repository } = repo(handled);
    const actor = handlerActorOf({ kind: 'ToanHeThong' });
    await expect(loadHandlingRow(repository, EM, actor, '12')).resolves.toBe(
      handled,
    );
  });
});
