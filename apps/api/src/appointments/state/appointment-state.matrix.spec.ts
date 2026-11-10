import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import {
  TRANSITION_ACTORS,
  allowedTargets,
  canTransition,
  checkInWindowBounds,
  type TransitionActor,
  type TransitionContext,
} from './appointment-state.matrix.js';

// Task P1 — MT-01…MT-03 và phần ma trận của MT-04 (PLAN booking 7.5; TRACKING 3.3 P1-D, bảng 22 ô ở 3.4). Danh sách 22 ô viết RIÊNG ở đây theo chữ
// của 5.2, Q21, Q24 (không đọc lại từ bảng của mã), cộng các tính chất độc lập lấy từ chữ Q24. Số phút cửa sổ (30, 15) chỉ là ĐẦU VÀO của test,
// không phải quyết định (PLAN không đặt số, Q22).
type Cell = readonly [TransitionActor, TrangThaiLichHen, TrangThaiLichHen];

const EXPECTED_ALLOWED: readonly Cell[] = [
  ['BenhNhan', 'ChoThanhToan', 'DaHuy'],
  ['BenhNhan', 'DaXacNhan', 'DaHuy'],
  ['LeTan', 'ChoThanhToan', 'DaHuy'],
  ['LeTan', 'DaXacNhan', 'DaHuy'],
  ['LeTan', 'DaXacNhan', 'DaTiepDon'],
  ['LeTan', 'DaXacNhan', 'VangMat'],
  ['QuanTriVien', 'ChoThanhToan', 'DaHuy'],
  ['QuanTriVien', 'DaXacNhan', 'DaHuy'],
  ['QuanTriVien', 'DaXacNhan', 'DaTiepDon'],
  ['QuanTriVien', 'DaXacNhan', 'VangMat'],
  ['QuanTriVien', 'DaTiepDon', 'DaHuy'],
  ['QuanTriVien', 'DaTiepDon', 'DaXacNhan'],
  ['QuanTriVien', 'DaTiepDon', 'VangMat'],
  ['QuanTriVien', 'VangMat', 'DaHuy'],
  ['QuanTriVien', 'VangMat', 'DaXacNhan'],
  ['QuanTriVien', 'VangMat', 'DaTiepDon'],
  ['BacSi', 'DaTiepDon', 'HoanThanh'],
  ['HeThong', 'ChoThanhToan', 'DaHuy'],
  ['HeThong', 'DaXacNhan', 'DaHuy'],
  ['HeThong', 'DaXacNhan', 'VangMat'],
  ['ThanhToan', 'ChoThanhToan', 'DaXacNhan'],
  ['ThanhToan', 'DaXacNhan', 'DaTiepDon'],
];

const key = (cell: Cell) => cell.join('>');
const allowedKeys = new Set(EXPECTED_ALLOWED.map(key));

// Mốc giờ hẹn và các hàm dựng ngữ cảnh. `at(giây)` là thời điểm lệch `giây` so với giờ hẹn.
const THOI_GIAN = new Date('2026-11-10T08:00:00+07:00');
const at = (seconds: number) => new Date(THOI_GIAN.getTime() + seconds * 1000);
const ctxAt = (
  now: Date,
  conPhaiThu = '0.00',
  truocPhut = 30,
  sauPhut = 15,
): TransitionContext => ({
  window: { now, thoiGian: THOI_GIAN, truocPhut, sauPhut },
  conPhaiThu,
});
// Ngữ cảnh THOẢ điều kiện của ô: trong cửa sổ và đủ tiền cho `DaTiepDon`; sau hết cửa sổ 1 giây cho `VangMat`
const satisfying = (to: TrangThaiLichHen): TransitionContext =>
  ctxAt(to === 'VangMat' ? at(15 * 60 + 1) : at(0));

const ALL_CELLS: Cell[] = TRANSITION_ACTORS.flatMap((actor) =>
  TRANG_THAI_LICH_HEN.flatMap((from) =>
    TRANG_THAI_LICH_HEN.map((to): Cell => [actor, from, to]),
  ),
);

describe('MT-01 bảng 6 vai trò × 7 nguồn × 7 đích', () => {
  it('có đúng 294 ô và đúng 22 ô được phép (danh sách viết riêng), 272 ô còn lại bị từ chối', () => {
    expect(ALL_CELLS).toHaveLength(294);
    expect(EXPECTED_ALLOWED).toHaveLength(22);
    expect(allowedKeys.size).toBe(22);
  });

  it.each(ALL_CELLS.map((cell) => [key(cell), cell] as const))(
    'ô %s khớp danh sách (kèm lý do từ chối đúng loại)',
    (_name, [actor, from, to]) => {
      const decision = canTransition({
        actor,
        from,
        to,
        ctx: satisfying(to),
      });
      if (allowedKeys.has(key([actor, from, to]))) {
        expect(decision).toEqual({ ok: true });
      } else if (to === 'HoanThanh' && actor !== 'BacSi') {
        expect(decision).toEqual({ ok: false, reason: 'ChiBacSiHoanThanh' });
      } else {
        expect(decision).toEqual({ ok: false, reason: 'KhongHopLe' });
      }
    },
  );

  it('allowedTargets khớp từng cặp (vai trò, nguồn), theo thứ tự TRANG_THAI_LICH_HEN', () => {
    for (const actor of TRANSITION_ACTORS) {
      for (const from of TRANG_THAI_LICH_HEN) {
        const table = TRANG_THAI_LICH_HEN.filter((to) =>
          allowedKeys.has(key([actor, from, to])),
        );
        // Trong cửa sổ và đủ tiền: đích "sau hết cửa sổ" (VangMat của Lễ tân) chưa được
        const inWindow = table.filter(
          (to) => !(actor === 'LeTan' && to === 'VangMat'),
        );
        // Sau hết cửa sổ 1 giây: đích cần "trong cửa sổ" (DaTiepDon của Lễ tân và của thanh toán offline) hết được
        const afterWindow = table.filter(
          (to) =>
            !(
              to === 'DaTiepDon' &&
              (actor === 'LeTan' || actor === 'ThanhToan')
            ),
        );
        expect(
          allowedTargets(actor, from, ctxAt(at(0))),
          `${actor} từ ${from} (trong cửa sổ)`,
        ).toEqual(inWindow);
        expect(
          allowedTargets(actor, from, ctxAt(at(15 * 60 + 1))),
          `${actor} từ ${from} (sau cửa sổ)`,
        ).toEqual(afterWindow);
      }
    }
  });

  it('tính chất độc lập lấy từ chữ Q24 và 5.2: không ai rời HoanThanh, DaHuy, DaDoiLich; không ai tới DaDoiLich hay ChoThanhToan; chỉ BacSi tới HoanThanh; không ô nào trỏ về chính nó', () => {
    for (const [actor, from, to] of EXPECTED_ALLOWED) {
      expect(['HoanThanh', 'DaHuy', 'DaDoiLich']).not.toContain(from);
      expect(['DaDoiLich', 'ChoThanhToan']).not.toContain(to);
      expect(from).not.toBe(to);
      if (to === 'HoanThanh') expect(actor).toBe('BacSi');
    }
    // Từ `ChoThanhToan` Quản trị viên chỉ tới `DaHuy` (Q24); từ `VangMat` về `DaXacNhan` được (CNTT A3)
    expect(
      EXPECTED_ALLOWED.filter(
        ([actor, from]) => actor === 'QuanTriVien' && from === 'ChoThanhToan',
      ).map(([, , to]) => to),
    ).toEqual(['DaHuy']);
    expect(allowedKeys.has(key(['QuanTriVien', 'VangMat', 'DaXacNhan']))).toBe(
      true,
    );
  });

  it('Q21: Lễ tân KHÔNG huỷ lịch DaTiepDon; HLH A1: Bệnh nhân cũng không', () => {
    for (const actor of ['LeTan', 'BenhNhan'] as const) {
      expect(canTransition({ actor, from: 'DaTiepDon', to: 'DaHuy' })).toEqual({
        ok: false,
        reason: 'KhongHopLe',
      });
    }
    expect(
      canTransition({
        actor: 'QuanTriVien',
        from: 'DaTiepDon',
        to: 'DaHuy',
      }),
    ).toEqual({ ok: true });
  });
});

describe('MT-02 Lễ tân theo thời điểm và tiền (Q22, quy tắc 40, 47)', () => {
  const checkIn = (ctx?: TransitionContext) =>
    canTransition({
      actor: 'LeTan',
      from: 'DaXacNhan',
      to: 'DaTiepDon',
      ctx,
    });
  const noShow = (ctx?: TransitionContext) =>
    canTransition({ actor: 'LeTan', from: 'DaXacNhan', to: 'VangMat', ctx });
  const TU = at(-30 * 60);
  const DEN = at(15 * 60);

  it('cửa sổ tiếp đón đóng hai đầu: −1 giây bị từ chối kèm khoảng (tu, den); đúng mốc đầu và đúng mốc cuối được; +1 giây bị từ chối', () => {
    expect(checkIn(ctxAt(at(-30 * 60 - 1)))).toEqual({
      ok: false,
      reason: 'NgoaiKhungGioTiepDon',
      tu: TU,
      den: DEN,
    });
    expect(checkIn(ctxAt(TU))).toEqual({ ok: true });
    expect(checkIn(ctxAt(THOI_GIAN))).toEqual({ ok: true });
    expect(checkIn(ctxAt(DEN))).toEqual({ ok: true });
    expect(checkIn(ctxAt(at(15 * 60 + 1)))).toEqual({
      ok: false,
      reason: 'NgoaiKhungGioTiepDon',
      tu: TU,
      den: DEN,
    });
  });

  it('còn phải thu: 0, 0.0, 0.00 đều là đủ; 0.01 bị từ chối kèm số tiền; thiếu tiền được báo TRƯỚC cửa sổ', () => {
    for (const paid of ['0', '0.0', '0.00'])
      expect(checkIn(ctxAt(at(0), paid)), paid).toEqual({ ok: true });
    expect(checkIn(ctxAt(at(0), '0.01'))).toEqual({
      ok: false,
      reason: 'ConPhanChuaThanhToan',
      conPhaiThu: '0.01',
    });
    expect(checkIn(ctxAt(at(-3600), '200000.00'))).toEqual({
      ok: false,
      reason: 'ConPhanChuaThanhToan',
      conPhaiThu: '200000.00',
    });
  });

  it('Vắng mặt chỉ SAU hết cửa sổ: trước cửa sổ, trong cửa sổ và đúng mốc cuối bị CHUA_QUA_GIO_HEN; +1 giây được (bất kể còn phải thu)', () => {
    for (const second of [-3600, -30 * 60, 0, 15 * 60])
      expect(noShow(ctxAt(at(second))), String(second)).toEqual({
        ok: false,
        reason: 'ChuaQuaGioHen',
      });
    expect(noShow(ctxAt(at(15 * 60 + 1)))).toEqual({ ok: true });
    expect(noShow(ctxAt(at(15 * 60 + 1), '500000.00'))).toEqual({ ok: true });
  });

  it('biên truocPhut = sauPhut = 0: cửa sổ chỉ là đúng một khoảnh khắc', () => {
    expect(checkIn(ctxAt(at(0), '0.00', 0, 0))).toEqual({ ok: true });
    expect(checkIn(ctxAt(at(-1), '0.00', 0, 0)).ok).toBe(false);
    expect(checkIn(ctxAt(at(1), '0.00', 0, 0)).ok).toBe(false);
    expect(noShow(ctxAt(at(0), '0.00', 0, 0))).toEqual({
      ok: false,
      reason: 'ChuaQuaGioHen',
    });
    expect(noShow(ctxAt(at(1), '0.00', 0, 0))).toEqual({ ok: true });
  });

  it('thiếu ngữ cảnh: DaTiepDon và VangMat bị ThieuDuLieu (CT-10: chưa có cấu hình), DaHuy vẫn chạy', () => {
    expect(checkIn()).toEqual({ ok: false, reason: 'ThieuDuLieu' });
    expect(noShow()).toEqual({ ok: false, reason: 'ThieuDuLieu' });
    expect(checkIn({ conPhaiThu: '0.00' })).toEqual({
      ok: false,
      reason: 'ThieuDuLieu',
    });
    expect(checkIn({ window: ctxAt(at(0)).window })).toEqual({
      ok: false,
      reason: 'ThieuDuLieu',
    });
    expect(
      canTransition({ actor: 'LeTan', from: 'DaXacNhan', to: 'DaHuy' }),
    ).toEqual({ ok: true });
  });

  it('allowedTargets của Lễ tân từ DaXacNhan: trước cửa sổ, trong cửa sổ chưa đủ tiền, trong cửa sổ đủ tiền, đúng mốc cuối, sau cửa sổ, không ngữ cảnh', () => {
    const targets = (ctx?: TransitionContext) =>
      allowedTargets('LeTan', 'DaXacNhan', ctx);
    expect(targets(ctxAt(at(-3600)))).toEqual(['DaHuy']);
    expect(targets(ctxAt(at(0), '100000.00'))).toEqual(['DaHuy']);
    expect(targets(ctxAt(at(0)))).toEqual(['DaTiepDon', 'DaHuy']);
    expect(targets(ctxAt(DEN))).toEqual(['DaTiepDon', 'DaHuy']);
    expect(targets(ctxAt(at(15 * 60 + 1)))).toEqual(['DaHuy', 'VangMat']);
    expect(targets(ctxAt(at(15 * 60 + 1), '100000.00'))).toEqual([
      'DaHuy',
      'VangMat',
    ]);
    expect(targets()).toEqual(['DaHuy']);
    // Từ ChoThanhToan: luôn chỉ DaHuy, kể cả khi ngữ cảnh thoả mọi điều kiện
    expect(allowedTargets('LeTan', 'ChoThanhToan', ctxAt(at(0)))).toEqual([
      'DaHuy',
    ]);
  });

  it('thanh toán offline (ThanhToan): chịu cửa sổ nhưng KHÔNG cần còn phải thu bằng 0 (nó tự ghi tiền, quy tắc 46)', () => {
    const offline = (ctx?: TransitionContext) =>
      canTransition({
        actor: 'ThanhToan',
        from: 'DaXacNhan',
        to: 'DaTiepDon',
        ctx,
      });
    expect(offline(ctxAt(at(0), '500000.00'))).toEqual({ ok: true });
    expect(offline({ window: ctxAt(at(0)).window })).toEqual({ ok: true });
    expect(offline(ctxAt(at(15 * 60 + 1), '0.00'))).toMatchObject({
      ok: false,
      reason: 'NgoaiKhungGioTiepDon',
    });
    expect(offline()).toEqual({ ok: false, reason: 'ThieuDuLieu' });
    // confirmPaid không có điều kiện thời gian (Q4: lịch còn ChoThanhToan thì vẫn xác nhận dù quá hạn)
    expect(
      canTransition({
        actor: 'ThanhToan',
        from: 'ChoThanhToan',
        to: 'DaXacNhan',
      }),
    ).toEqual({ ok: true });
  });

  it('Quản trị viên và hệ thống KHÔNG bị cửa sổ hay tiền (CT-21, quy tắc 40, 47)', () => {
    const far = ctxAt(at(-86_400), '999999.00');
    expect(
      canTransition({
        actor: 'QuanTriVien',
        from: 'DaXacNhan',
        to: 'DaTiepDon',
        ctx: far,
      }),
    ).toEqual({ ok: true });
    expect(
      canTransition({
        actor: 'QuanTriVien',
        from: 'DaXacNhan',
        to: 'VangMat',
        ctx: far,
      }),
    ).toEqual({ ok: true });
    expect(
      canTransition({
        actor: 'HeThong',
        from: 'DaXacNhan',
        to: 'VangMat',
        ctx: far,
      }),
    ).toEqual({ ok: true });
  });

  it('hàm thuần: không sửa Date đầu vào; checkInWindowBounds trả Date mới', () => {
    const thoiGian = new Date(THOI_GIAN.getTime());
    const now = new Date(THOI_GIAN.getTime());
    const bounds = checkInWindowBounds({
      now,
      thoiGian,
      truocPhut: 30,
      sauPhut: 15,
    });
    expect(bounds.tu).toEqual(TU);
    expect(bounds.den).toEqual(DEN);
    expect(bounds.tu).not.toBe(thoiGian);
    expect(thoiGian.getTime()).toBe(THOI_GIAN.getTime());
    expect(now.getTime()).toBe(THOI_GIAN.getTime());
  });
});

describe('MT-03 chọn HoanThanh (A1/2a–2b, Q21)', () => {
  it('mọi vai trò khác BacSi (kể cả Quản trị viên override), từ mọi nguồn ⇒ ChiBacSiHoanThanh', () => {
    for (const actor of TRANSITION_ACTORS) {
      if (actor === 'BacSi') continue;
      for (const from of TRANG_THAI_LICH_HEN) {
        expect(
          canTransition({ actor, from, to: 'HoanThanh' }),
          `${actor} từ ${from}`,
        ).toEqual({ ok: false, reason: 'ChiBacSiHoanThanh' });
      }
    }
  });

  it('BacSi chỉ DaTiepDon → HoanThanh; từ nguồn khác bị KhongHopLe (phần ma trận của MT-04: sai trạng thái)', () => {
    for (const from of TRANG_THAI_LICH_HEN) {
      const decision = canTransition({
        actor: 'BacSi',
        from,
        to: 'HoanThanh',
      });
      expect(decision, from).toEqual(
        from === 'DaTiepDon'
          ? { ok: true }
          : { ok: false, reason: 'KhongHopLe' },
      );
    }
  });

  it('BacSi không chuyển sang đích nào khác', () => {
    for (const from of TRANG_THAI_LICH_HEN)
      for (const to of TRANG_THAI_LICH_HEN) {
        if (to === 'HoanThanh') continue;
        expect(canTransition({ actor: 'BacSi', from, to }).ok).toBe(false);
      }
    expect(allowedTargets('BacSi', 'DaTiepDon')).toEqual(['HoanThanh']);
  });
});
