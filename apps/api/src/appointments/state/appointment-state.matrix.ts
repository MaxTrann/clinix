import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import { toCents } from '../../pricing/money.js';

// Ma trận chuyển trạng thái lịch hẹn (PLAN booking 5.2, Q21, Q22, Q24; TRACKING 3.3 P1-D và bảng 22 ô ở 3.4). Hàm THUẦN: không DB, không Nest,
// không tự lấy giờ (H8: `now` do người gọi truyền, đã `toSecond(nowVN())`). MỘT định nghĩa cho API (huỷ, tiếp đón, Vắng mặt, override,
// `complete`) và cho `chuyenDuoc[]` của chi tiết Lễ tân. Ma trận chỉ trả lời "VAI TRÒ NÀY có được đi từ A sang B không (và điều kiện thời gian,
// tiền có thoả không)"; sở hữu, phạm vi chi nhánh và bác sĩ phụ trách là DỮ LIỆU, service kiểm DƯỚI KHOÁ (404), không ở đây.

export const TRANSITION_ACTORS = [
  'BenhNhan',
  'LeTan',
  'QuanTriVien', // override (CNTT b6, Q24)
  'BacSi', // chỉ `complete`
  'HeThong', // hết hạn giữ chỗ, duyệt nghỉ phép, job Vắng mặt: điều kiện thời gian/ca của từng luồng kiểm DƯỚI KHOÁ ở B9, B11, B13
  'ThanhToan', // đường `confirmPaid` của payment (B11) và `checkIn` của thanh toán offline; cọc 0đ KHÔNG đi đường này: `create` INSERT thẳng `DaXacNhan` (B8, TRACKING 3.21 câu (a))
] as const;
export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

type TransitionTable = Record<
  TransitionActor,
  Partial<Record<TrangThaiLichHen, readonly TrangThaiLichHen[]>>
>;

// 22 ô được phép trên 6 × 7 × 7 = 294 ô; mọi ô còn lại bị từ chối. Không có actor cho "tạo" (INSERT, không có trạng thái nguồn) và cho `DaDoiLich`
// (module đổi lịch làm sau: nó sẽ thêm actor riêng cùng `markReplaced`, PLAN 5.2). `HoanThanh` chỉ `BacSi` tới được.
const TRANSITIONS: TransitionTable = {
  BenhNhan: {
    ChoThanhToan: ['DaHuy'],
    DaXacNhan: ['DaHuy'], // HLH A1: lịch `DaTiepDon` KHÔNG huỷ được
  },
  LeTan: {
    ChoThanhToan: ['DaHuy'],
    DaXacNhan: ['DaHuy', 'DaTiepDon', 'VangMat'], // Q21: Lễ tân KHÔNG huỷ `DaTiepDon`; `DaTiepDon` và `VangMat` có điều kiện (Q22)
  },
  QuanTriVien: {
    // Q24: nguồn ∈ {ChoThanhToan, DaXacNhan, DaTiepDon, VangMat}, đích ∈ {DaHuy, VangMat, DaTiepDon, DaXacNhan}; từ `ChoThanhToan` chỉ tới `DaHuy`;
    // không khôi phục từ `DaHuy`; không tới `HoanThanh`, `DaDoiLich`, `ChoThanhToan`
    ChoThanhToan: ['DaHuy'],
    DaXacNhan: ['DaHuy', 'DaTiepDon', 'VangMat'],
    DaTiepDon: ['DaHuy', 'DaXacNhan', 'VangMat'],
    VangMat: ['DaHuy', 'DaXacNhan', 'DaTiepDon'],
  },
  BacSi: {
    DaTiepDon: ['HoanThanh'],
  },
  HeThong: {
    ChoThanhToan: ['DaHuy'], // hết hạn giữ chỗ; duyệt nghỉ phép (lịch bị ảnh hưởng gồm cả `ChoThanhToan`)
    DaXacNhan: ['DaHuy', 'VangMat'], // duyệt nghỉ phép; job tự Vắng mặt (không giải phóng khung giờ, không mời danh sách chờ)
  },
  ThanhToan: {
    ChoThanhToan: ['DaXacNhan'], // Q4
    DaXacNhan: ['DaTiepDon'], // thanh toán offline: tự ghi tiền nên không cần `conPhaiThu = 0`, nhưng vẫn phải trong cửa sổ (quy tắc 40, 46, 47)
  },
};

/** Dữ liệu để kiểm cửa sổ tiếp đón (Q22). Số phút lấy từ `cau_hinh_he_thong`, PLAN không đặt số; cả hai >= 0. */
export interface CheckInWindowInput {
  /** Đã `toSecond(nowVN())` */
  now: Date;
  /** `lich_hen.thoi_gian` */
  thoiGian: Date;
  truocPhut: number;
  sauPhut: number;
}

/** Ngữ cảnh cho điều kiện của `DaTiepDon` và `VangMat`. Thiếu phần cần thiết ⇒ `ThieuDuLieu`. */
export interface TransitionContext {
  /** Thiếu khi chưa có `cau_hinh_he_thong` (service đổi `ThieuDuLieu` thành `HE_THONG_CHUA_CAU_HINH`, CT-10) */
  window?: CheckInWindowInput;
  /** "Còn phải thu" dạng chuỗi decimal (`PaymentSummaryPort.remainingToCollect`); chỉ `LeTan` + `DaTiepDon` cần */
  conPhaiThu?: string;
}

export type TransitionRefusal =
  | { reason: 'KhongHopLe' } // CHUYEN_TRANG_THAI_KHONG_HOP_LE
  | { reason: 'ChiBacSiHoanThanh' } // CHI_BAC_SI_HOAN_THANH
  | { reason: 'ConPhanChuaThanhToan'; conPhaiThu: string } // CON_PHAN_CHUA_THANH_TOAN
  | { reason: 'NgoaiKhungGioTiepDon'; tu: Date; den: Date } // NGOAI_KHUNG_GIO_TIEP_DON
  | { reason: 'ChuaQuaGioHen' } // CHUA_QUA_GIO_HEN
  | { reason: 'ThieuDuLieu' }; // thiếu `window` hay `conPhaiThu`

export type TransitionDecision =
  { ok: true } | ({ ok: false } & TransitionRefusal);

export interface TransitionInput {
  actor: TransitionActor;
  from: TrangThaiLichHen;
  to: TrangThaiLichHen;
  ctx?: TransitionContext;
}

const ALLOWED: TransitionDecision = { ok: true };
const refuse = (refusal: TransitionRefusal): TransitionDecision => ({
  ok: false,
  ...refusal,
});

const MINUTE_MS = 60_000;

/** Cửa sổ tiếp đón ĐÓNG HAI ĐẦU: `[thoi_gian − truoc, thoi_gian + sau]` (Q22, quy tắc 40). Trả `Date` MỚI, không sửa đầu vào. */
export function checkInWindowBounds(window: CheckInWindowInput): {
  tu: Date;
  den: Date;
} {
  const start = window.thoiGian.getTime();
  return {
    tu: new Date(start - window.truocPhut * MINUTE_MS),
    den: new Date(start + window.sauPhut * MINUTE_MS),
  };
}

// Điều kiện ngoài bảng 22 ô (chỉ chạy khi ô đã được phép). Thứ tự báo từ chối `[đề xuất]` theo câu chữ 5.7: thiếu dữ liệu, còn phải thu, rồi cửa sổ.
function checkCondition(
  actor: TransitionActor,
  to: TrangThaiLichHen,
  ctx: TransitionContext | undefined,
): TransitionDecision {
  const needsPaid = actor === 'LeTan' && to === 'DaTiepDon';
  const needsWindowToCheckIn =
    to === 'DaTiepDon' && (actor === 'LeTan' || actor === 'ThanhToan');
  const needsWindowToNoShow = actor === 'LeTan' && to === 'VangMat';
  if (!needsWindowToCheckIn && !needsWindowToNoShow) return ALLOWED;

  const window = ctx?.window;
  if (window === undefined) return refuse({ reason: 'ThieuDuLieu' });
  if (needsPaid) {
    const conPhaiThu = ctx?.conPhaiThu;
    if (conPhaiThu === undefined) return refuse({ reason: 'ThieuDuLieu' });
    // So bằng đơn vị 0,01 (BigInt), không so chuỗi: "0", "0.0" và "0.00" đều là không còn gì phải thu
    if (toCents(conPhaiThu) > 0n)
      return refuse({ reason: 'ConPhanChuaThanhToan', conPhaiThu });
  }

  const { tu, den } = checkInWindowBounds(window);
  const now = window.now.getTime();
  if (needsWindowToCheckIn) {
    return now >= tu.getTime() && now <= den.getTime()
      ? ALLOWED
      : refuse({ reason: 'NgoaiKhungGioTiepDon', tu, den });
  }
  // Vắng mặt (Lễ tân) chỉ SAU hết cửa sổ: nửa mở, đúng mốc `den` còn trong cửa sổ, +1 giây mới được (Q22)
  return now > den.getTime() ? ALLOWED : refuse({ reason: 'ChuaQuaGioHen' });
}

/**
 * Vai trò `actor` có được chuyển lịch hẹn từ `from` sang `to` không, kèm lý do từ chối. Thứ tự: (1) đích `HoanThanh` mà không phải `BacSi` ⇒
 * `ChiBacSiHoanThanh` bất kể nguồn (5.2, MT-03, 2.4 A1; kể cả Quản trị viên override, Q21); (2) ô không có trong bảng ⇒ `KhongHopLe`;
 * (3) điều kiện cửa sổ tiếp đón và còn phải thu (MT-02).
 */
export function canTransition(input: TransitionInput): TransitionDecision {
  const { actor, from, to, ctx } = input;
  if (to === 'HoanThanh' && actor !== 'BacSi')
    return refuse({ reason: 'ChiBacSiHoanThanh' });
  if (TRANSITIONS[actor][from]?.includes(to) !== true)
    return refuse({ reason: 'KhongHopLe' });
  return checkCondition(actor, to, ctx);
}

/**
 * Các đích mà `actor` đang được phép từ `from`, theo thứ tự `TRANG_THAI_LICH_HEN`: nguồn của `chuyenDuoc[]` (giao diện chỉ hiện đích hợp lệ,
 * backend vẫn kiểm lại bằng `canTransition` dưới khoá). Thiếu `ctx` thì hai đích có điều kiện (`DaTiepDon`, `VangMat` của Lễ tân) bị bỏ, `DaHuy` vẫn có.
 */
export function allowedTargets(
  actor: TransitionActor,
  from: TrangThaiLichHen,
  ctx?: TransitionContext,
): TrangThaiLichHen[] {
  return TRANG_THAI_LICH_HEN.filter(
    (to) => canTransition({ actor, from, to, ctx }).ok,
  );
}
