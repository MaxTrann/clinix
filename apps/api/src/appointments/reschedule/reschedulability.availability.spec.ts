import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import { PATIENT_ERROR_CODES } from '../../patient/patient.constants.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { FACTS_NOW, deepFreeze } from '../testing/bookability-facts.js';
import {
  BRANCH_ID,
  OWNER_ID,
  reschedulabilityFacts,
  rescheduleSource,
} from '../testing/reschedulability-facts.js';
import {
  evaluateRescheduleAvailability,
  evaluateReschedulability,
  failureCode,
} from './reschedulability.rules.js';
import type {
  ReschedulabilityFacts,
  RescheduleActor,
  RescheduleSource,
} from './reschedule.types.js';

// reschedule B5 — DLH-40 và DLH-41 `[đề xuất]` (PLAN reschedule 5.8; hợp đồng web F1 mục 4, 7, 8): `evaluateRescheduleAvailability` = lịch này có đổi được KHÔNG KÈM khung giờ đích. Hàm THUẦN, không DB,
// không đồng hồ. DLH-40 từng bước và hình dạng kết quả (đủ cho `choPhepDoiLich` của chi tiết lịch VÀ cho preview không có `khungGioId` của B6); DLH-41 chứng minh MỘT bộ luật: trên ma trận điều kiện,
// khi khung giờ đích đạt thì `evaluateRescheduleAvailability` và `evaluateReschedulability` luôn cùng kết luận và cùng lý do.
const CODES = BOOKING_ERROR_CODES;
const OWNER: RescheduleActor = { via: 'TuDoi', accountId: OWNER_ID };
const DESK: RescheduleActor = { via: 'DoiHo', chiNhanhId: BRANCH_ID };
const MINUTE = 60_000;

type AvailabilityFacts = Omit<
  ReschedulabilityFacts,
  'bookability' | 'requestReasonGiven'
>;

/** `facts` không có khung giờ đích; `overrides` ghi đè từng nhóm khoá. */
function availabilityFacts(
  overrides: Partial<ReschedulabilityFacts> = {},
): AvailabilityFacts {
  const facts = reschedulabilityFacts(overrides);
  return {
    actor: facts.actor,
    now: facts.now,
    config: facts.config,
    source: facts.source,
    profileActive: facts.profileActive,
    chainLength: facts.chainLength,
    pendingRequest: facts.pendingRequest,
  };
}

const withSource = (
  overrides: Partial<RescheduleSource>,
  rest: Partial<ReschedulabilityFacts> = {},
) => availabilityFacts({ source: rescheduleSource(overrides), ...rest });

describe('DLH-40 evaluateRescheduleAvailability: hình dạng kết quả khi đổi được', () => {
  it('Bệnh nhân còn lần tự đổi: choPhep, loai TuDoi, số lần và tối đa, không lý do', () => {
    expect(
      evaluateRescheduleAvailability(withSource({ soLanTuDoiLich: 1 })),
    ).toStrictEqual({
      choPhep: true,
      failure: null,
      lyDoKhongDoi: null,
      loai: 'TuDoi',
      soLanDaDoi: 1,
      toiDa: 2,
      coYeuCauChoDuyet: false,
    });
  });

  it('Bệnh nhân HẾT lần tự đổi: vẫn choPhep (gửi yêu cầu được vì lý do được coi là có), loai GuiYeuCau', () => {
    expect(
      evaluateRescheduleAvailability(withSource({ soLanTuDoiLich: 2 })),
    ).toStrictEqual({
      choPhep: true,
      failure: null,
      lyDoKhongDoi: null,
      loai: 'GuiYeuCau',
      soLanDaDoi: 2,
      toiDa: 2,
      coYeuCauChoDuyet: false,
    });
  });

  it('Lễ tân đổi hộ (DoiHo): không có `loai`, số lần vẫn hiện, không bị hạn mức', () => {
    expect(
      evaluateRescheduleAvailability(
        withSource({ soLanTuDoiLich: 9 }, { actor: DESK }),
      ),
    ).toStrictEqual({
      choPhep: true,
      failure: null,
      lyDoKhongDoi: null,
      loai: null,
      soLanDaDoi: 9,
      toiDa: 2,
      coYeuCauChoDuyet: false,
    });
  });
});

describe('DLH-40 từng bước (cùng thứ tự với evaluateReschedulability)', () => {
  it('không có lịch, của người khác, ngoài chi nhánh ⇒ NotFound, không lộ số lần hay yêu cầu chờ', () => {
    const base = {
      choPhep: false,
      failure: { kind: 'NotFound' },
      lyDoKhongDoi: null,
      loai: null,
      soLanDaDoi: null,
      toiDa: 2,
      coYeuCauChoDuyet: false,
    };
    const none = availabilityFacts({ source: null, pendingRequest: true });
    expect(evaluateRescheduleAvailability(none)).toStrictEqual(base);
    const other = withSource(
      { benhNhanId: '999', soLanTuDoiLich: 2 },
      { pendingRequest: true },
    );
    expect(evaluateRescheduleAvailability(other)).toStrictEqual(base);
    const elsewhere = withSource(
      { chiNhanhId: '77' },
      { actor: DESK, pendingRequest: true },
    );
    expect(evaluateRescheduleAvailability(elsewhere)).toStrictEqual(base);
  });

  it('lịch DaDoiLich: Bệnh nhân NotFound (cùng thân 404), Lễ tân LICH_HEN_KHONG_CHO_DOI', () => {
    const patient = evaluateRescheduleAvailability(
      withSource({ trangThai: 'DaDoiLich' }),
    );
    expect(patient.failure).toStrictEqual({ kind: 'NotFound' });
    const desk = evaluateRescheduleAvailability(
      withSource({ trangThai: 'DaDoiLich' }, { actor: DESK }),
    );
    expect(desk.lyDoKhongDoi).toBe(CODES.NOT_RESCHEDULABLE);
  });

  it.each([
    'ChoThanhToan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'VangMat',
  ] as const)(
    'trạng thái %s ⇒ LICH_HEN_KHONG_CHO_DOI kèm trạng thái, không choPhep',
    (trangThai) => {
      const result = evaluateRescheduleAvailability(withSource({ trangThai }));
      expect(result.choPhep).toBe(false);
      expect(result.lyDoKhongDoi).toBe(CODES.NOT_RESCHEDULABLE);
      expect(result.failure).toStrictEqual({
        kind: 'Rule',
        code: CODES.NOT_RESCHEDULABLE,
        chiTiet: { trangThai },
      });
    },
  );

  it('hạn đổi của Bệnh nhân: đúng giờ hẹn là ĐÃ qua (nửa mở), một giây trước thì còn', () => {
    const at = (offsetSeconds: number) =>
      withSource({
        thoiGian: new Date(FACTS_NOW.getTime() + offsetSeconds * 1000),
      });
    expect(evaluateRescheduleAvailability(at(0)).lyDoKhongDoi).toBe(
      CODES.RESCHEDULE_TOO_LATE,
    );
    expect(evaluateRescheduleAvailability(at(1)).choPhep).toBe(true);
  });

  it('hạn đổi hộ: giờ hẹn cộng check_in_sau_phut (15 phút) rồi mới quá hạn', () => {
    const desk = (offsetMinutes: number) =>
      withSource(
        { thoiGian: new Date(FACTS_NOW.getTime() + offsetMinutes * MINUTE) },
        { actor: DESK },
      );
    expect(evaluateRescheduleAvailability(desk(-15)).lyDoKhongDoi).toBe(
      CODES.RESCHEDULE_TOO_LATE,
    );
    expect(evaluateRescheduleAvailability(desk(-14)).choPhep).toBe(true);
  });

  it('hồ sơ người thân đã ngừng ⇒ ProfileInactive với mã HO_SO_NGUOI_THAN_DA_NGUNG', () => {
    const result = evaluateRescheduleAvailability(
      availabilityFacts({ profileActive: false }),
    );
    expect(result.failure).toStrictEqual({ kind: 'ProfileInactive' });
    expect(result.lyDoKhongDoi).toBe(PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED);
  });

  it('chuỗi đổi lịch: 18 lịch còn đổi được, 19 lịch (MAX_CHAIN_DEPTH - 1) bị CHUOI_DOI_LICH_QUA_DAI', () => {
    const chain = (chainLength: number) => availabilityFacts({ chainLength });
    expect(
      evaluateRescheduleAvailability(chain(MAX_CHAIN_DEPTH - 2)).choPhep,
    ).toBe(true);
    expect(
      evaluateRescheduleAvailability(chain(MAX_CHAIN_DEPTH - 1)).lyDoKhongDoi,
    ).toBe(CODES.RESCHEDULE_CHAIN_TOO_LONG);
    // Cả Lễ tân cũng bị chặn: PaymentChain ném quá độ sâu
    expect(
      evaluateRescheduleAvailability(
        availabilityFacts({ actor: DESK, chainLength: MAX_CHAIN_DEPTH - 1 }),
      ).lyDoKhongDoi,
    ).toBe(CODES.RESCHEDULE_CHAIN_TOO_LONG);
  });

  it('thứ tự lỗi: trạng thái đứng trước hạn, hồ sơ và chuỗi; hồ sơ đứng trước chuỗi', () => {
    const everythingWrong = withSource(
      { trangThai: 'DaHuy', thoiGian: FACTS_NOW },
      { profileActive: false, chainLength: MAX_CHAIN_DEPTH },
    );
    expect(evaluateRescheduleAvailability(everythingWrong).lyDoKhongDoi).toBe(
      CODES.NOT_RESCHEDULABLE,
    );
    const lateAndInactive = withSource(
      { thoiGian: FACTS_NOW },
      { profileActive: false, chainLength: MAX_CHAIN_DEPTH },
    );
    expect(evaluateRescheduleAvailability(lateAndInactive).lyDoKhongDoi).toBe(
      CODES.RESCHEDULE_TOO_LATE,
    );
    const inactiveAndLong = availabilityFacts({
      profileActive: false,
      chainLength: MAX_CHAIN_DEPTH,
    });
    expect(evaluateRescheduleAvailability(inactiveAndLong).lyDoKhongDoi).toBe(
      PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED,
    );
  });
});

describe('DLH-40 hạn mức và yêu cầu chờ', () => {
  it('hết lần mà ĐÃ có yêu cầu chờ ⇒ không choPhep, DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET, loai vẫn GuiYeuCau, coYeuCauChoDuyet true', () => {
    const result = evaluateRescheduleAvailability(
      withSource({ soLanTuDoiLich: 2 }, { pendingRequest: true }),
    );
    expect(result.choPhep).toBe(false);
    expect(result.lyDoKhongDoi).toBe(CODES.RESCHEDULE_REQUEST_PENDING);
    expect(result.loai).toBe('GuiYeuCau');
    expect(result.coYeuCauChoDuyet).toBe(true);
  });

  it('còn lần tự đổi mà vẫn có yêu cầu chờ (cấu hình tăng toiDa sau khi gửi) ⇒ luật cho phép, coYeuCauChoDuyet true', () => {
    const result = evaluateRescheduleAvailability(
      withSource({ soLanTuDoiLich: 1 }, { pendingRequest: true }),
    );
    expect(result.choPhep).toBe(true);
    expect(result.loai).toBe('TuDoi');
    expect(result.coYeuCauChoDuyet).toBe(true);
  });

  it('Lễ tân đổi hộ được phép khi lịch có yêu cầu chờ (KDL-19); coYeuCauChoDuyet vẫn true', () => {
    const result = evaluateRescheduleAvailability(
      withSource({ soLanTuDoiLich: 9 }, { actor: DESK, pendingRequest: true }),
    );
    expect(result.choPhep).toBe(true);
    expect(result.coYeuCauChoDuyet).toBe(true);
  });

  it.each([
    [0, 0, 'GuiYeuCau'],
    [0, 1, 'TuDoi'],
    [1, 1, 'GuiYeuCau'],
    [1, 2, 'TuDoi'],
    [2, 2, 'GuiYeuCau'],
    [3, 2, 'GuiYeuCau'],
  ] as const)(
    'biên hạn mức: đã đổi %i lần, tối đa %i ⇒ loai %s (đúng bằng tối đa là HẾT lần)',
    (soLanTuDoiLich, toiDa, loai) => {
      const result = evaluateRescheduleAvailability(
        withSource(
          { soLanTuDoiLich },
          { config: { soLanTuDoiLichToiDa: toiDa, checkInSauPhut: 15 } },
        ),
      );
      expect(result.loai).toBe(loai);
      expect(result.soLanDaDoi).toBe(soLanTuDoiLich);
      expect(result.toiDa).toBe(toiDa);
      expect(result.choPhep).toBe(true);
    },
  );

  it('lý do yêu cầu được ÉP là có: dù người gọi truyền requestReasonGiven false, hết lần vẫn choPhep (không VUOT_SO_LAN_TU_DOI)', () => {
    const facts = {
      ...withSource({ soLanTuDoiLich: 2 }),
      requestReasonGiven: false,
    };
    expect(evaluateRescheduleAvailability(facts).choPhep).toBe(true);
  });
});

describe('DLH-40 tính chất của hàm', () => {
  it('không đổi facts (đóng băng sâu) và KHÔNG đọc khung giờ đích: truyền thêm bookability bị bỏ qua', () => {
    const facts = deepFreeze(withSource({ soLanTuDoiLich: 2 }));
    expect(() => evaluateRescheduleAvailability(facts)).not.toThrow();
    const withSlot = reschedulabilityFacts({
      source: rescheduleSource({ soLanTuDoiLich: 2 }),
    });
    expect(evaluateRescheduleAvailability(withSlot)).toStrictEqual(
      evaluateRescheduleAvailability(facts),
    );
  });

  it('failureCode: mã của từng loại lý do; NotFound không có mã (người gọi trả 404 KHONG_TIM_THAY)', () => {
    expect(failureCode({ kind: 'Rule', code: CODES.RESCHEDULE_TOO_LATE })).toBe(
      CODES.RESCHEDULE_TOO_LATE,
    );
    expect(failureCode({ kind: 'ProfileInactive' })).toBe(
      PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED,
    );
    expect(failureCode({ kind: 'SlotNotFound' })).toBe(CODES.SLOT_NOT_FOUND);
    expect(failureCode({ kind: 'NotFound' })).toBeNull();
  });
});

describe('DLH-41 MỘT bộ luật: availability và evaluateReschedulability cùng kết luận khi khung giờ đích đạt', () => {
  const TRANG_THAI = [
    'DaXacNhan',
    'ChoThanhToan',
    'DaDoiLich',
    'DaHuy',
  ] as const;
  const GIO = [-3600, 0, 3600] as const; // giây so với `now`: quá, đúng mốc, còn
  const SO_LAN = [0, 1, 2, 3] as const;
  const CHUOI = [1, MAX_CHAIN_DEPTH - 2, MAX_CHAIN_DEPTH - 1] as const;

  it('1.152 tổ hợp (vai × trạng thái × giờ × số lần × yêu cầu chờ × chuỗi × hồ sơ): cùng ok, cùng mã lý do; nhánh Request ⇔ loai GuiYeuCau', () => {
    let compared = 0;
    for (const actor of [OWNER, DESK])
      for (const trangThai of TRANG_THAI)
        for (const gio of GIO)
          for (const soLanTuDoiLich of SO_LAN)
            for (const pendingRequest of [false, true])
              for (const chainLength of CHUOI)
                for (const profileActive of [true, false]) {
                  const facts = reschedulabilityFacts({
                    actor,
                    source: rescheduleSource({
                      trangThai,
                      soLanTuDoiLich,
                      thoiGian: new Date(FACTS_NOW.getTime() + gio * 1000),
                    }),
                    pendingRequest,
                    chainLength,
                    profileActive,
                    requestReasonGiven: true,
                  });
                  const full = evaluateReschedulability(facts);
                  const part = evaluateRescheduleAvailability(facts);
                  const label = JSON.stringify({
                    via: actor.via,
                    trangThai,
                    gio,
                    soLanTuDoiLich,
                    pendingRequest,
                    chainLength,
                    profileActive,
                  });
                  expect(part.choPhep, label).toBe(full.ok);
                  if (full.ok) {
                    expect(part.failure, label).toBeNull();
                    if (actor.via === 'TuDoi')
                      expect(part.loai === 'GuiYeuCau', label).toBe(
                        full.branch === 'Request',
                      );
                  } else {
                    expect(part.failure, label).toStrictEqual(full.failure);
                  }
                  compared += 1;
                }
    expect(compared).toBe(2 * 4 * 3 * 4 * 2 * 3 * 2);
  });
});
