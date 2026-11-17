import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  addMoney,
  compareMoney,
  subtractMoney,
  toCents,
} from '../../pricing/money.js';

// `WalletLedger` — NƠI DUY NHẤT đổi `vi_noi_bo.so_du` và `so_tien_dang_giu`, và NƠI DUY NHẤT ghi sổ cái `giao_dich_vi` (payment P3; PLAN payment 5.2, 5.3; Q2, Q22). Mọi luồng tiền (nạp, thanh toán cọc,
// hoàn cọc, rút) của `payment/` và `wallet/` đi qua đây, nên bất biến IVT-01…IVT-07 chỉ phải canh một chỗ.
//
// Hợp đồng:
//  - Chạy TRONG giao dịch của người gọi (nhận `em`, không mở giao dịch); người gọi chịu trách nhiệm commit và thử lại 1213/1205 (`withBookingTransaction`).
//  - KHOÁ VÍ MỘT CHỖ (hạng 7b của lock-order): người gọi PHẢI gọi `lockWallet` (hay `lockWalletById`) trước, rồi truyền `LockedWallet` vào các phép bên dưới. Kiểu `LockedWallet` chỉ do hai hàm khoá tạo ra, nên
//    không phép nào chạy trên số dư chưa khoá. Mỗi phép TRẢ ví mới: dùng ví đó cho phép kế tiếp (ảnh chụp cũ không còn đúng sau khi ghi).
//  - Mọi phép tiền qua `pricing/money.ts` (BigInt theo đơn vị 0,01), không số thực.
//  - Trả KẾT QUẢ CÓ KIỂU cho tình huống nghiệp vụ "không đủ số dư" (booking 5.3 quy tắc 4: không ném `AppException` trong giao dịch, vì ném thì lần ghi đã làm bị hoàn tác theo). Lỗi LẬP TRÌNH (số tiền không
//    dương, tham chiếu sai loại, nhả quá số đang giữ, rút quá số đang giữ) thì ném `Error`: đó là dữ liệu hỏng hay gọi sai, không phải lỗi của người dùng.
//  - Giờ do người gọi truyền (`now`, từ `nowVN()` rồi `toSecond()`); không dùng `NOW()` (QTT-08, H8).
//  - KHÔNG kiểm hạn mức nạp, rút (Q20) hay quyền: việc của service nạp và rút.
//
// Giữ và nhả tiền (`hold`, `release`) KHÔNG có dòng sổ cái: `so_du` không đổi. Giao dịch 0đ cũng không đi qua đây.

/** Ví đã KHOÁ `FOR UPDATE` trong giao dịch hiện tại, với số dư đọc dưới khoá. Số tiền là chuỗi decimal hai chữ số. */
export interface LockedWallet {
  viNoiBoId: string;
  benhNhanId: string;
  soDu: string;
  soTienDangGiu: string;
}

/** Nguồn của một dòng sổ cái: đúng MỘT id, khớp loại (CHECK `chk_gd_vi_tham_chieu`). */
export type LedgerRef =
  | { giaoDichThanhToanId: string }
  | { lichSuHoanTienId: string }
  | { yeuCauRutTienId: string };

export type CreditKind = 'Nap' | 'HoanTien';
export type DebitKind = 'ThanhToan' | 'Rut';

export type LedgerOutcome =
  | { kind: 'Ok'; wallet: LockedWallet }
  | { kind: 'InsufficientBalance'; soDuKhaDung: string };

interface RawWallet {
  viNoiBoId: string;
  benhNhanId: string;
  soDu: string;
  soTienDangGiu: string;
}

const SELECT_WALLET = `SELECT CAST(vi_noi_bo_id AS CHAR) AS viNoiBoId, CAST(benh_nhan_id AS CHAR) AS benhNhanId, so_du AS soDu, so_tien_dang_giu AS soTienDangGiu FROM vi_noi_bo`;

/** Số khả dụng = số dư − số đang giữ (số đang giữ cho yêu cầu rút chờ duyệt không được tiêu). `chk_vi_so_du` đảm bảo không âm. */
export function availableOf(wallet: LockedWallet): string {
  return subtractMoney(wallet.soDu, wallet.soTienDangGiu);
}

/** Số tiền của một phép phải là số dương dạng chuỗi decimal; không thì ném lỗi (lỗi lập trình). */
function assertPositive(soTien: string): void {
  let positive: boolean;
  try {
    positive = toCents(soTien) > 0n;
  } catch {
    positive = false;
  }
  if (!positive) throw new Error('Số tiền của phép ví phải là số dương');
}

function refColumn(ref: LedgerRef): { column: string; id: string } {
  if ('giaoDichThanhToanId' in ref)
    return { column: 'giao_dich_thanh_toan_id', id: ref.giaoDichThanhToanId };
  if ('lichSuHoanTienId' in ref)
    return { column: 'lich_su_hoan_tien_id', id: ref.lichSuHoanTienId };
  return { column: 'yeu_cau_rut_tien_id', id: ref.yeuCauRutTienId };
}

const REF_FOR_KIND: Record<CreditKind | DebitKind, string> = {
  Nap: 'giaoDichThanhToanId',
  ThanhToan: 'giaoDichThanhToanId',
  HoanTien: 'lichSuHoanTienId',
  Rut: 'yeuCauRutTienId',
};

function assertRefMatches(kind: CreditKind | DebitKind, ref: LedgerRef): void {
  if (!(REF_FOR_KIND[kind] in ref))
    throw new Error(
      `Loại ${kind} phải có tham chiếu ${REF_FOR_KIND[kind]} (chk_gd_vi_tham_chieu)`,
    );
}

@Injectable()
export class WalletLedger {
  /** Khoá ví của một Bệnh nhân (`FOR UPDATE` theo `benh_nhan_id`, UNIQUE). Không có ví ⇒ `null`. Hạng 7b: sau mọi khoá 7a, trước mọi `INSERT` vào bảng con của ví. */
  lockWallet(
    em: EntityManager,
    benhNhanId: string,
  ): Promise<LockedWallet | null> {
    return this.lock(em, 'benh_nhan_id', benhNhanId);
  }

  /** Như `lockWallet` nhưng theo khoá chính `vi_noi_bo_id` (luồng chỉ biết ví, ví dụ duyệt rút, hoàn tiền). */
  lockWalletById(
    em: EntityManager,
    viNoiBoId: string,
  ): Promise<LockedWallet | null> {
    return this.lock(em, 'vi_noi_bo_id', viNoiBoId);
  }

  private async lock(
    em: EntityManager,
    column: 'benh_nhan_id' | 'vi_noi_bo_id',
    id: string,
  ): Promise<LockedWallet | null> {
    const rows: RawWallet[] = await em.query(
      `${SELECT_WALLET} WHERE ${column} = ? FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Cộng tiền vào ví (`Nap`, `HoanTien`): tăng `so_du` và ghi MỘT dòng sổ cái dương. Không có tình huống "không đủ" nên luôn trả ví mới. */
  async credit(
    em: EntityManager,
    wallet: LockedWallet,
    input: { loai: CreditKind; soTien: string; ref: LedgerRef; now: Date },
  ): Promise<LockedWallet> {
    assertPositive(input.soTien);
    assertRefMatches(input.loai, input.ref);
    const soDu = addMoney(wallet.soDu, input.soTien);
    await this.writeBalance(em, wallet, { soDu });
    await this.insertEntry(em, wallet, {
      loai: input.loai,
      soTienCoDau: input.soTien,
      soDuSau: soDu,
      ref: input.ref,
      now: input.now,
    });
    return { ...wallet, soDu };
  }

  /**
   * Trừ tiền khỏi ví: ghi MỘT dòng sổ cái ÂM.
   *  - `ThanhToan` (cọc lịch hẹn): tiêu từ số KHẢ DỤNG; vượt ⇒ `InsufficientBalance` (không ghi gì).
   *  - `Rut` (duyệt yêu cầu rút): tiêu từ số ĐANG GIỮ cho chính yêu cầu đó, nên giảm `so_du` và `so_tien_dang_giu` CÙNG số (số khả dụng không đổi); số đang giữ ít hơn ⇒ ném lỗi (dữ liệu hỏng).
   */
  async debit(
    em: EntityManager,
    wallet: LockedWallet,
    input: { loai: DebitKind; soTien: string; ref: LedgerRef; now: Date },
  ): Promise<LedgerOutcome> {
    assertPositive(input.soTien);
    assertRefMatches(input.loai, input.ref);
    let soTienDangGiu = wallet.soTienDangGiu;
    if (input.loai === 'Rut') {
      if (compareMoney(wallet.soTienDangGiu, input.soTien) < 0)
        throw new Error('Số tiền rút lớn hơn số tiền đang giữ của ví');
      soTienDangGiu = subtractMoney(wallet.soTienDangGiu, input.soTien);
    } else {
      const available = availableOf(wallet);
      if (compareMoney(available, input.soTien) < 0)
        return { kind: 'InsufficientBalance', soDuKhaDung: available };
    }
    const soDu = subtractMoney(wallet.soDu, input.soTien);
    await this.writeBalance(em, wallet, { soDu, soTienDangGiu });
    await this.insertEntry(em, wallet, {
      loai: input.loai,
      soTienCoDau: `-${input.soTien}`,
      soDuSau: soDu,
      ref: input.ref,
      now: input.now,
    });
    return { kind: 'Ok', wallet: { ...wallet, soDu, soTienDangGiu } };
  }

  /** Giữ tiền cho yêu cầu rút chờ duyệt: tăng `so_tien_dang_giu`, `so_du` không đổi, KHÔNG có dòng sổ cái. Vượt số khả dụng ⇒ `InsufficientBalance`. */
  async hold(
    em: EntityManager,
    wallet: LockedWallet,
    soTien: string,
  ): Promise<LedgerOutcome> {
    assertPositive(soTien);
    const available = availableOf(wallet);
    if (compareMoney(available, soTien) < 0)
      return { kind: 'InsufficientBalance', soDuKhaDung: available };
    const soTienDangGiu = addMoney(wallet.soTienDangGiu, soTien);
    await this.writeBalance(em, wallet, { soTienDangGiu });
    return { kind: 'Ok', wallet: { ...wallet, soTienDangGiu } };
  }

  /** Nhả tiền đang giữ (từ chối yêu cầu rút): giảm `so_tien_dang_giu`, KHÔNG có dòng sổ cái. Nhả nhiều hơn số đang giữ ⇒ ném lỗi (dữ liệu hỏng). */
  async release(
    em: EntityManager,
    wallet: LockedWallet,
    soTien: string,
  ): Promise<LockedWallet> {
    assertPositive(soTien);
    if (compareMoney(wallet.soTienDangGiu, soTien) < 0)
      throw new Error('Số tiền nhả lớn hơn số tiền đang giữ của ví');
    const soTienDangGiu = subtractMoney(wallet.soTienDangGiu, soTien);
    await this.writeBalance(em, wallet, { soTienDangGiu });
    return { ...wallet, soTienDangGiu };
  }

  /** Ghi số dư mới. Chỉ cột được truyền mới đổi; giá trị tuyệt đối tính từ ảnh chụp dưới khoá (không `so_du = so_du + ?`) để `chk_vi_so_du` kiểm đúng kết quả cuối. */
  private async writeBalance(
    em: EntityManager,
    wallet: LockedWallet,
    next: { soDu?: string; soTienDangGiu?: string },
  ): Promise<void> {
    await em.query(
      'UPDATE vi_noi_bo SET so_du = ?, so_tien_dang_giu = ? WHERE vi_noi_bo_id = ?',
      [
        next.soDu ?? wallet.soDu,
        next.soTienDangGiu ?? wallet.soTienDangGiu,
        wallet.viNoiBoId,
      ],
    );
  }

  private async insertEntry(
    em: EntityManager,
    wallet: LockedWallet,
    entry: {
      loai: CreditKind | DebitKind;
      soTienCoDau: string;
      soDuSau: string;
      ref: LedgerRef;
      now: Date;
    },
  ): Promise<void> {
    const { column, id } = refColumn(entry.ref);
    await em.query(
      `INSERT INTO giao_dich_vi (vi_noi_bo_id, loai, so_tien, so_du_sau, ${column}, thoi_diem) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        wallet.viNoiBoId,
        entry.loai,
        entry.soTienCoDau,
        entry.soDuSau,
        id,
        entry.now,
      ],
    );
  }
}
