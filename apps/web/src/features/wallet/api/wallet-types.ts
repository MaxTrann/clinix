// Hình dạng dữ liệu ví mà web dùng (payment F1; hợp đồng `GET /patient/wallet` và `GET /patient/wallet/transactions` của B1, PLAN 5.11 #1, #2).
// Tiền là CHUỖI decimal, id là chuỗi: không đổi sang `number` ở bất kỳ đâu (H4, WVI-04).

export const WALLET_TRANSACTION_TYPES = [
  'Nap',
  'ThanhToan',
  'HoanTien',
  'Rut',
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const WITHDRAWAL_STATUSES = ['ChoDuyet', 'DaDuyet', 'TuChoi'] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

// Trạng thái một dòng lịch sử: sổ cái luôn `ThanhCong`; nạp chưa ra sổ `DangXuLy`/`ThatBai`; yêu cầu rút chưa ra sổ `ChoDuyet`/`TuChoi`
export const WALLET_TRANSACTION_STATUSES = [
  'ThanhCong',
  'DangXuLy',
  'ThatBai',
  ...WITHDRAWAL_STATUSES,
] as const;
export type WalletTransactionStatus =
  (typeof WALLET_TRANSACTION_STATUSES)[number];

export interface LatestWithdrawal {
  maYeuCau: string;
  soTien: string;
  trangThai: WithdrawalStatus;
  thoiDiemYeuCau: string;
}

/** Hạn mức một lần nạp (Q20), chuỗi decimal như mọi số tiền. */
export interface TopupLimits {
  toiThieu: string;
  toiDa: string;
}

// Các khoá trang ví dùng. `hanMucNap`, `congThanhToan` chỉ CHUYỂN TIẾP cho tab Nạp tiền (payment F2): ví không tự hiểu tên cổng (`congThanhToan` là chuỗi thô,
// payment lọc theo danh sách cổng nó biết), nên `wallet` không phụ thuộc kiểu của `payment`.
export interface WalletOverview {
  soDuKhaDung: string;
  soTienDangGiu: string;
  napChoXacNhan: string;
  yeuCauRutGanNhat: LatestWithdrawal | null;
  hanMucNap: TopupLimits;
  congThanhToan: string[];
}

/** Kết quả 201 của `POST /patient/wallet/withdrawals` (payment B11; PLAN 5.11 #9): số do MÁY CHỦ tính dưới khoá ví. */
export interface CreatedWithdrawal {
  maYeuCau: string;
  soTien: string;
  soDuKhaDung: string;
  soTienDangGiu: string;
}

export interface WalletTransaction {
  id: string;
  thoiDiem: string;
  loai: WalletTransactionType;
  noiDung: string;
  // CÓ DẤU: tiền vào dương, tiền ra âm
  soTien: string;
  trangThai: WalletTransactionStatus;
  // Nạp `DangXuLy` quá cửa sổ chờ: hiện "Chưa nhận kết quả" (PLAN 4.7 #2). Máy chủ tính, web không tự lọc.
  quaCuaSo: boolean;
}

export interface WalletTransactionPage {
  items: WalletTransaction[];
  total: number;
  trang: number;
  kichThuoc: number;
}
