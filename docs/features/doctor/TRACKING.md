# Tracking — module `doctor` (phần lịch làm việc của bác sĩ)

Nhật ký tiến độ riêng của module `doctor`, phần lịch làm việc (Phân công lịch làm việc cho bác sĩ, Xem lịch làm việc, Tạo yêu cầu xin nghỉ phép, Phê duyệt yêu cầu nghỉ phép).
Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass,
chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge. **Người làm module: Trung (`junUTE`)**; bản kế hoạch do Đại lập hộ (phiên Claude Code của Đại).

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`/`B*`/`F*`/`D*`/`X*` theo PLAN.md mục 6), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md (ví dụ `PC-01, PC-03`); "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối).
  Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Ca đồng thời (`DH-*`) ghi thêm số vòng chạy và số lỗi 1213/1205 đo được; sau mỗi ca đồng thời ghi kết quả IV-01…IV-04.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Câu hỏi Q1–Q42 (PLAN.md mục 4.2) được trả lời thì ghi vào mục 3 rồi bỏ thẻ `[CHỜ Qn]` trong PLAN.md. Q1, Q2, Q3 và các điểm chạm file của Trung ghi tên người xác nhận.
- Số đo thật (M1–M13, PLAN.md mục 5.15) ghi ở mục 6; việc còn chờ module khác ghi ở mục 7 cho tới khi module đó có mã.
- Khi cả module xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 08/11/2026 | Lập `PLAN.md` bản nháp 1 theo prompt cập nhật 08/11/2026 (khối CẬP NHẬT và CẬP NHẬT 2): kiểm mã thật ở `a621747` (= `origin/main`, PR 224, search F9); đọc PLAN `booking` đã merge (mục 5.3, 5.10, 6.7, 7.10, 7.12, TRACKING mục 3) để đối chiếu D1–D12; đọc schema `docs/database/` (bảng `lich_lam_viec`, `khung_gio`, `yeu_cau_nghi_phep`, `bac_si`, `chi_nhanh_lich_hoat_dong`, `thong_bao`, `nhat_ky_hanh_dong`, quy tắc 7, 9, 13, 28–30, 38, 39, 44, truy vấn mẫu); đọc mã `audit`, `rbac`, `common/time`, `admin/entities`, `database/seeds`, `router/*`, `shared/ui/role-shell`; đọc Figma `1OsOfwD5myNNRv7FPCD9YC` (phiên đọc riêng: 252 frame cấp 1, ~35 frame liên quan, 23 ảnh chụp 1440 px). Dựng 42 câu hỏi Q1–Q42, 30 chỗ lệch L1–L30, 20 bẫy H1–H20, mục 5.10 (đối chiếu D1–D12 và thêm D13, D14), 5 nhóm task (P1–P5, B1–B18, F1–F10, D1–D3, X1–X4 = 40 task), 242 test case dự kiến (sau phiên kiểm: 244) | Không áp dụng (chỉ tài liệu) | n/a | Phát hiện chính: (1) **Figma `Phân công ca` là quy tắc lặp nhiều bác sĩ** (khoảng ngày × thứ × ca × ghi chú), 2.4 là từng ngày, schema không có bảng quy tắc/ghi chú (Q10); (2) Figma có **"Hủy yêu cầu" của Bác sĩ** và **lý do từ chối bắt buộc** nhưng 2.4 và schema không có (Q23, Q27); (3) **search KGI-03** ghi "chờ duyệt không ảnh hưởng khung giờ" mâu thuẫn 2.4 TYN và booking D4; (4) `hanh_dong_nhay_cam_enum` **không có** giá trị cho phân công/nghỉ phép và audit whitelist đóng ⇒ cần đổi schema (Q34); (5) A4 của PCLV không còn nhánh riêng khi giờ ca = khoảng nhận khám (Q6); (6) khung giờ đã từng có `lich_hen` (kể cả đã huỷ) không xoá được ⇒ ca có lịch sử đặt không gỡ được (Q8); (7) `yeu_cau_nghi_phep` không có cột chi nhánh ⇒ phạm vi duyệt tính theo chi nhánh hiện tại của bác sĩ, dựa vào bất biến I-1 (Q28); (8) booking D5 cần thêm điều kiện `thoi_gian > now`, D13 (danh sách lịch hẹn bị ảnh hưởng), D14 (đếm theo ca). **Chưa chạy gì trên MySQL thật: mọi nhận định về khoá, múi giờ, quy mô ghi "chưa đo"; danh sách ở PLAN 5.15 (M1–M13)** |
| 08/11/2026 | **Phiên kiểm độc lập bản nháp 1: đạt; Đại duyệt Q4–Q42** (Q1, Q2, Q3 và điểm chạm file của Trung vẫn `[CHỜ Trung]`). Áp 7 điều kiện sửa chỉ ở tài liệu: (1) TRACKING mục 3 điền quyết định; (2) Q16 chọn nhánh SỬA 2.4 (Lễ tân thấy ngày nghỉ `ChoDuyet`, không thấy lý do), thêm vào D2; (3) D3 không động `docs/TECH_DEBT.md` ở PR kế hoạch, mỗi dòng nợ thêm ở PR của task tạo ra nó (B3, B10, B14, B16, F1); (4) P4/Q34: danh sách ENUM lấy từ `clinix.dbml` và `main` tại lúc làm, thêm test MG-08 (chưa có test nào đối chiếu ENUM DB ↔ tuple TypeScript ↔ `AuditEntry`); (5) M13 thành điều kiện `[CHỜ Trung]` của B2, B3, DH-04 (và B2 phụ thuộc X1) [vòng 2 sửa: chỉ B3 và DH-04]; (6) F8 không có nút Duyệt, F9 chỉ làm sau B15 (thêm WA-16); (7) tiêu đề 4.2 đổi thành "đã trả lời". Thêm ghi chú "Đã trả lời" kèm điều kiện cho Q4, Q5, Q7, Q8, Q10, Q13, Q16, Q23, Q26–Q29, Q33, Q34, Q36, Q40; sửa mục 9.2 (nhật ký AI của Trung ở `TRUNG_AI_USAGE_LOG.md`) | Không áp dụng (chỉ tài liệu) | n/a | Số test case 242 → 244 (thêm MG-08, WA-16). Lệch số task giữa lời duyệt và PLAN, đã đối chiếu theo mã thật của PLAN: "Duyệt" là **B15** (không phải B13, vốn là danh sách/chi tiết); "lý do từ chối không có cột" nợ ở **B14** (Từ chối; B12 là lịch sử/chi tiết của Bác sĩ); "thông báo chưa ai đọc" nợ ở **B10** (`LeaveNotifier`). `ParseRelativeIdPipe` hiện ở `patient/relatives/` (không xuất ra ngoài module): `doctor` dùng `parsePublicId` của `search` bọc pipe mỏng hoặc import nếu Đại xác nhận. Chưa chạy gì trên MySQL thật |
| 08/11/2026 | **Vòng 2 của phiên kiểm: bản sau 7 điều kiện ĐẠT**; áp 3 chỗ sửa nhỏ (chỉ tài liệu): (1) cổng đo Q40 và điều kiện M13 chuyển từ B2 sang **B3** (B2 là xem trước, đọc thường, không khoá, không ghi; B2 vẫn phụ thuộc X1 chỉ vì M9), sửa Q40 ở PLAN 4.2/6.1/6.6/6.7, dòng Q40 và tiêu đề mục 6 ở file này; (2) ca `TD-06` và ghi chú P4 không ghi số cứng "15 hành động" (đọc từ tập hành động của `AuditEntry`; booking B14 cũng thêm `OverrideLichHen`), `MG-08` so bằng tập hợp chứ không bằng số lượng; (3) Q13 và mục 5.11: pipe mỏng của `doctor` gọi `parsePublicId` của `search`, **không import pipe của patient**, pipe chạy SAU guard (401/403 trước, 404 vì id sai dạng chỉ cho người có quyền). Ghi **dòng 63** vào `AI_USAGE_LOG.md` (kiểm `origin/main` trước khi ghi: dòng lớn nhất vẫn 61) | Không áp dụng (chỉ tài liệu) | n/a | Số test case vẫn 244. Sai sót AI của bản nháp 1 (đã ghi ở dòng 63): cổng đo Q40/M13 gắn vào B2 thay vì B3 (lời duyệt vòng 1 chép lại); ca `C2-03` viết số cứng. `origin/main` (tham chiếu cục bộ) đã nhích lên `24bcb72` (search F10, #266) sau `a621747`, không chạm file nào của PR này; cây làm việc vẫn ở `a621747`, cần gộp `origin/main` khi mở PR |
| 08/11/2026 | **Ghi quyết định của Trung** (sửa nhỏ, chỉ tài liệu) vào `PLAN.md` và `TRACKING.md`. Trung xác nhận **Q1, Q2, Q3, Q8, Q10, Q28, Q34, Q36** (kèm điều kiện ở mục 3.1); **M13** đã đọc mã: đúng sẵn (DH-04 còn chờ MySQL thật). Gỡ thẻ `[CHỜ Trung]` và `· Trung` ở PLAN: đầu file, 3.3, H4, 4.2 (Q1, Q2, Q3, Q8, Q10, Q28, Q34, Q36), 4.6, 5.15, sơ đồ 6.1, task P2, P3, P4, B1 đến B6, B13, B14, F6 đến F8, D1, 6.7, DH-04 và điều kiện hoàn thành mục 10. **Giữ nguyên** `[CHỜ Q5]` và `[ĐỤNG rbac]` của P3 (Q5 chưa nêu với Trung) và mọi thẻ `[CHỜ booking …]`, `[CHỜ notification]`, `[CHỜ search K1]`. Đọc mã xác nhận ở `cb5b5b8`: (1) `audit/audit-entry.ts` có 11 hành động trong `ChangeMap`, `TargetFor` rơi mặc định về `yeu_cau_thay_doi_chi_nhanh`; `booking` B14 cũng thêm `OverrideLichHen` đúng chỗ này; (2) `ServiceService.update` (`admin/services/service.service.ts` dòng 65) khoá `dich_vu_kham` `FOR UPDATE` (`service.repository.ts` dòng 77) rồi mới `hasFutureSlots` (dòng 79), không khoá `bac_si` ở đâu; (3) `features/admin/index.ts` đã xuất `AdminMe`, `AdminConfirmationDialog`, `AdminDetailPanel`, `AdminSearchInput`, `AdminTable`, `AdminTableColumn`, còn `AdminScopeGuard` và `useAdminScope` có sẵn nhưng chưa xuất; (4) `moc_hoan_tien` có ở `clinix_mysql.sql` dòng 251, repo chưa có migration/entity; (5) `booking` P6, P7, B14 đúng như Trung mô tả | Không áp dụng (chỉ tài liệu) | n/a | (a) KGI-03: phiên kiểm đã đối chiếu 2.4.24 bản Drive (hậu điều kiện và bước 5: nghỉ phép `ChoDuyet` đã chặn khung giờ); **phiên này không có file 2.4**, ghi theo lời phiên kiểm. (b) Phát hiện khi sửa: PLAN 3.3 ghi "thêm 3 hành động" trong khi Q34 và P4 là 4 hành động (đã sửa thành 4). (c) TRACKING mục 7 không có việc chờ Trung nào để bỏ; các việc chờ Trung nằm ở mục 5 (đã cập nhật). Chưa chạy gì trên MySQL thật; DH-04 chưa chạy |
| | | | Pass / Fail | |

## 2. Kết quả test theo use case

Cập nhật lần chạy mới nhất; chi tiết từng ca xem mục 1. **Chưa có ca nào chạy** (mới có kế hoạch).

| Nhóm test (PLAN.md mục 7) | Tổng số ca | Pass | Fail | Chưa chạy | Ngày chạy gần nhất |
|---|---|---|---|---|---|
| Phân công lịch làm việc (`PC-*`, 7.1) | 30 | 0 | 0 | 30 | |
| Sinh khung giờ và luật giờ ca (`SG-*`, `GC-*`, 7.2) | 28 | 0 | 0 | 28 | |
| Khung giờ còn trống (`AV-*`, 7.3) | 16 | 0 | 0 | 16 | |
| Xem lịch làm việc (`XL-*`, 7.4) | 20 | 0 | 0 | 20 | |
| Tạo yêu cầu xin nghỉ phép (`YN-*`, 7.5) | 23 | 0 | 0 | 23 | |
| Phê duyệt / từ chối (`PD-*`, 7.6) | 22 | 0 | 0 | 22 | |
| Quyền và phạm vi (`QH-*`, 7.7) | 12 | 0 | 0 | 12 | |
| Bảng và migration (`MG-*`, 7.8) | 8 | 0 | 0 | 8 | |
| Đồng thời và bất biến (`DH-*`, `IV-*`, 7.9) | 16 | 0 | 0 | 16 | |
| Hợp đồng và cổng (`HD-*`, 7.10) | 12 | 0 | 0 | 12 | |
| Thông báo và nhật ký (`TD-*`, 7.11) | 7 | 0 | 0 | 7 | |
| Giao diện (`WK-*`, `WL-*`, `WN-*`, `WA-*`, 7.12) | 45 | 0 | 0 | 45 | |
| Bảo mật dùng chung (`BD-*`, 7.13) | 5 | 0 | 0 | 5 | |
| **Tổng** | **244** | 0 | 0 | 244 | |

## 3. Quyết định đã chốt

Ghi câu trả lời cho các câu hỏi ở PLAN.md mục 4.2 và ngày chốt, để PLAN.md có thể bỏ thẻ `[CHỜ …]`. Quyết định ở đây là **quyết định cuối**, ưu tiên hơn đề xuất trong PLAN.md.
Trả lời ngày **08/11/2026** (phiên kiểm độc lập bản nháp 1: **đạt**; Đại duyệt Q4–Q42 như đề xuất kèm các điều kiện ghi ở cột cuối). **Trung xác nhận ngày 08/11/2026** (phiên kiểm đã kiểm lại bằng mã và 2.4): Q1, Q2, Q3 và các điểm chạm file của Trung (Q8, Q10, Q28, Q34, Q36); M13 đọc mã thấy đúng sẵn. **Không còn câu nào chờ Trung**, trừ hai chỗ ghi riêng: Q5 (chưa nêu với Trung; P3 sửa `rbac/` nên báo Trung trước khi làm) và Q27 phương án (b) (chỉ khi nhóm muốn hiện lý do từ chối ở Chi tiết, phải đổi schema).
**Mục 5.10 đã đối chiếu xong 08/11/2026 (phiên kiểm, so với `docs/features/booking/PLAN.md` dòng 523–554): Khớp D1, D2, D4, D6 đến D12; Khác D3 (thêm `listMany`, `trangThaiNgay` 4 giá trị), D5 (thêm `now`); mới D13, D14.** Phía `booking` sửa bằng PR riêng của phiên booking (tệp `CapNhat_Booking_5_10_theo_doctor_2026-11-08.txt` do phiên kiểm soạn, theo lời phiên kiểm); PR của module này không sửa `docs/features/booking/*` và `docs/features/search/*`.

### 3.1 Quyết định của nhóm cho module này

| Mã câu hỏi | Quyết định | Ngày chốt | Ghi chú (khác đề xuất? hệ quả cho task) |
|---|---|---|---|
| Q1★ | **Đồng ý** (= booking Q7: `doctor` sở hữu sinh khung giờ và "khung giờ còn trống"); Đại đồng ý, Trung xác nhận | 08/11/2026 (Đại, Trung) | Hết chặn P2, B1, B5, B6, D1. **D1 do Trung sửa 3 chỗ:** `docs/features/search/TRACKING.md` mục 3 (hai dòng ghi chủ bộ tính khung giờ: dòng 89, Q18, và dòng 124, bảng việc chờ hàng `booking`, đổi sang `doctor`), PLAN `search` 5.6 (K1 trả `khungGioId`), ca KGI-03 (dòng 683, "chờ duyệt không ảnh hưởng"); số dòng tính ở `cb5b5b8`. **KGI-03 phải sửa:** theo phiên kiểm đối chiếu 2.4 bản Drive, use case 2.4.24 "Tạo yêu cầu xin nghỉ phép", hậu điều kiện ghi khung giờ làm việc liên quan "tạm không nhận lịch hẹn mới (suy ra từ yêu cầu Chờ duyệt, không đổi trạng thái khung giờ)" và bước (5) ghi lại đúng ý đó ⇒ nghỉ phép `ChoDuyet` đã chặn khung giờ (người viết PR này không có file 2.4) |
| Q2★ | **Trung làm** migration và entity `moc_hoan_tien` trong task admin "Đặt cọc & Hoàn tiền" (= booking Q15; bảng đã có ở `docs/database/clinix_mysql.sql` dòng 251, repo chưa có migration/entity). `booking` P6 chỉ làm tạm nếu tới B8 (cọc > 0) mà Trung chưa xong; Trung báo Đại trước để không viết trùng. `doctor` không có task cho bảng này | 08/11/2026 (Trung) | Không chặn `doctor` |
| Q3★ | **Đồng ý** phương án A của booking (= booking Q29): thêm `thong_bao.lich_hen_id` và UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)`; đã có mẫu `thong_bao_index_yeu_cau_chi_nhanh`. `booking` P7 làm: sửa cả ba file `docs/database/*` cộng migration | 08/11/2026 (Trung) | Vẫn không chặn `doctor` (thông báo nghỉ phép không dùng cột này: Q33). Migration xếp theo timestamp với booking P7 và doctor P1, P4 (H15) |
| Q4★ | Đồng ý D1–D12 và D13, D14, điều kiện `now` của D5; bảng "Khác với booking 5.10" đúng và đủ | Đại duyệt 08/11/2026 | 5.10 đối chiếu xong 08/11/2026: Khớp D1, D2, D4, D6 đến D12; Khác D3 (thêm `listMany`, `trangThaiNgay` 4 giá trị), D5 (thêm `now`); mới D13, D14. Booking sửa bằng PR riêng |
| Q5 | Đồng ý "ai tới trước làm, người sau import" | Đại duyệt 08/11/2026; **chưa nêu với Trung** | Trước B8 `git fetch` và nhìn `origin/main` xem `reception-scope.service.ts` đã có chưa; có thì import, không viết lần hai. P3 sửa `rbac/` (của Trung) nên báo Trung trước khi làm; `[CHỜ Q5]` còn ở P3 |
| Q6★ | Đồng ý: giờ ca = khoảng nhận khám, tính khi đọc; A4 không còn nhánh riêng | Đại duyệt 08/11/2026 | Sửa 2.4 ở D2 (bước 4, A4); ghi lệch Figma 08:00/08:30 |
| Q7★ | Đồng ý sinh ngay trong giao dịch phân công, idempotent, kèm 3 điều kiện | Đại duyệt 08/11/2026 | (i) lô `INSERT` tối đa 500 `[đề xuất]`; (ii) `ON DUPLICATE KEY UPDATE` chỉ là phép gán không đổi, có ca "đột biến" SG-07; (iii) thời gian giữ khoá ≈ 8.000 ô là "chưa đo", đo ở M6 trước khi chốt trần 1.000 ca |
| Q8★ | Đồng ý `DELETE /admin/doctor-shifts/:id`, "sửa ca = gỡ + phân công lại"; chấp nhận giới hạn ca từng có lịch hẹn không gỡ được | Đại duyệt 08/11/2026; Trung xác nhận 08/11/2026 | Trung xác nhận cả việc khớp thứ tự khoá chung (booking 5.3). `TECH_DEBT` ở PR của B3 nêu hệ quả "chưa đổi chi nhánh bác sĩ được"; đưa vào "việc nhóm quyết" kèm hai hướng sửa (cờ `da_go`, hoặc xoá khung giờ chỉ bị lịch `DaHuy` tham chiếu; cả hai đổi schema) |
| Q9 | Đồng ý: ngày ≥ hôm nay; hôm nay chỉ nhận ca chưa kết thúc | Đại duyệt 08/11/2026 |  |
| Q10★ | Đồng ý: quy tắc lặp nhiều bác sĩ (Figma) mở thành từng hàng, một giao dịch all-or-none, khoá `bac_si` id tăng dần, `viPham[]` ≤ 50, bỏ ô "Ghi chú" và panel quy tắc | Đại duyệt 08/11/2026; Trung xác nhận 08/11/2026 | Theo Trung: giao dịch lớn giữ khoá `bac_si` lâu ⇒ **đo M3 và M6, giữ giới hạn 1.000 ca mỗi lần**. Trần 20 bác sĩ / 92 ngày / 1.000 ca giữ `[đề xuất]`, "chưa đo" tới M6. Điều kiện: ca PC-17 (`preview` và `POST` thật ra CÙNG `viPham`, cùng một hàm kiểm; `preview` không ghi) |
| Q11 | Đồng ý: `DangHoatDong` và `ChoKichHoat` được phân công; `NgungHoatDong` thì không | Đại duyệt 08/11/2026 |  |
| Q12 | Đồng ý: chi nhánh của ca đọc dưới khoá `bac_si`, không nhận từ client | Đại duyệt 08/11/2026 |  |
| Q13★ | Đồng ý 403 `KHONG_DU_QUYEN` cùng thân cho "không tồn tại" và "ngoài phạm vi" (Lễ tân) | Đại duyệt 08/11/2026 | Có ca khoá XL-11. `bacSiId` sai dạng qua `ParseRelativeIdPipe`/`parsePublicId` ⇒ 404 (ghi rõ trong PLAN). Admin Chi nhánh vẫn 404 (admin Q40) |
| Q14 | Đồng ý: một vị từ SQL dùng chung (hồ sơ ∪ có ca) | Đại duyệt 08/11/2026 |  |
| Q15 | Đồng ý: ≤ 42 ngày, tuần bắt đầu thứ Hai, lọc trạng thái ở giao diện | Đại duyệt 08/11/2026 |  |
| Q16 | Đồng ý, chọn nhánh **SỬA 2.4**: Lễ tân thấy ngày nghỉ `ChoDuyet` (không thấy lý do) | Đại duyệt 08/11/2026 | Thêm vào D2 (2.4); KHÔNG bỏ "Chờ duyệt" khỏi Figma |
| Q17 | Đồng ý: giờ ca hiển thị lấy từ lịch hoạt động hiện hành | Đại duyệt 08/11/2026 |  |
| Q18 | Đồng ý: ẩn dòng "N lịch hẹn" tới khi có D14, không hiện "0 lịch" sai | Đại duyệt 08/11/2026 |  |
| Q19★ | Đồng ý: không hạn tối thiểu; tối đa 90 ngày tới, 31 ngày liên tiếp | Đại duyệt 08/11/2026 | Hằng có tên trong mã, giữ `[đề xuất]` |
| Q20★ | Đồng ý: chấp nhận khi có ≥ 1 ca trong khoảng | Đại duyệt 08/11/2026 |  |
| Q21★ | Đồng ý: chồng nhau ⇒ `YEU_CAU_NGHI_TRUNG` | Đại duyệt 08/11/2026 |  |
| Q22 | Đồng ý: cho phép nghỉ vào ca có lịch hẹn, hiện số lượng | Đại duyệt 08/11/2026 |  |
| Q23★ | Đồng ý "đợt này không làm" Bác sĩ tự huỷ yêu cầu | Đại duyệt 08/11/2026 | Ẩn nút "Hủy yêu cầu"; ghi lệch Figma `471:2`, `472:2` và "việc nhóm quyết"; KHÔNG sửa 2.4. Hệ quả: yêu cầu `ChoDuyet` chỉ chờ Admin xử lý (trần 5 yêu cầu chờ của Q25 là giới hạn) |
| Q24 | Đồng ý: ngày bắt đầu ≥ hôm nay; `TheoCa` hôm nay chỉ khi ca chưa kết thúc | Đại duyệt 08/11/2026 |  |
| Q25 | Đồng ý: 5 yêu cầu chờ, lý do 2–500 điểm mã | Đại duyệt 08/11/2026 | Cả hai `[đề xuất]` |
| Q26★ | Đồng ý: làm trước danh sách, chi tiết, Từ chối; KHÔNG merge Duyệt tới khi `booking` B10, B11 xong; không `Noop` ở production | Đại duyệt 08/11/2026 | Điều kiện: F8 không có nút Duyệt, F9 chỉ làm sau B15 (WA-16); không để nút bấm ra lỗi/501 |
| Q27★ | Đồng ý phương án (c): lý do bắt buộc 1–255, ghi vào nhật ký và nội dung thông báo cho Bác sĩ, không có cột | Đại duyệt 08/11/2026 | `TECH_DEBT` ở PR của B14. Nếu muốn hiện lại ở Chi tiết thì (b) và đổi schema (`[CHỜ Trung]`) |
| Q28★ | Đồng ý: Admin Chi nhánh duyệt theo chi nhánh HIỆN TẠI của bác sĩ + bất biến I-1 | Đại duyệt 08/11/2026; Trung xác nhận 08/11/2026 | Trung xác nhận dựa vào bất biến I-1 (đúng nhờ quy tắc 13 và khoá `bac_si`). Ca đồng thời DH-03/IV-01: phân công đua với đổi chi nhánh bác sĩ, ca mang đúng chi nhánh mới/cũ, không lẫn |
| Q29★ | Đồng ý: hai giai đoạn + sweeper `@Cron` 5 phút, lô 50, trần 5 lô, cờ `running`, tắt ở `NODE_ENV=test`, nút "Xử lý lại" | Đại duyệt 08/11/2026 | `[CHỜ booking B10, B11]`. Điều kiện: nêu điều kiện DỪNG (yêu cầu qua `ngay_ket_thuc` hoặc `findAffectedByLeave` rỗng); log không có tên bệnh nhân, mã lịch hẹn đầy đủ, lý do (PD-12) |
| Q30 | Đồng ý: ngày đã qua ⇒ `YEU_CAU_NGHI_DA_QUA_HAN`; lịch đã tiếp đón/hoàn thành/vắng mặt không bị huỷ | Đại duyệt 08/11/2026 |  |
| Q31 | Đồng ý: duyệt/từ chối đồng thời ⇒ `YEU_CAU_DA_XU_LY` | Đại duyệt 08/11/2026 |  |
| Q32 | Đồng ý: nội dung hộp "Xác nhận duyệt" nêu số lịch huỷ, đã cọc hoàn 100%, số bệnh nhân | Đại duyệt 08/11/2026 | Figma do nhóm sửa |
| Q33★ | Đồng ý: ghi `thong_bao` trong ứng dụng cùng giao dịch, KHÔNG ghi `email_thong_bao` | Đại duyệt 08/11/2026 | Chuông thông báo chưa ai đọc ⇒ `TECH_DEBT` ở PR của B10; email `[CHỜ notification]` |
| Q34★ | Đồng ý: có nhật ký cho phân công, gỡ ca, duyệt, từ chối; mở rộng enum + `AuditEntry` + whitelist | Đại duyệt 08/11/2026; Trung xác nhận 08/11/2026 | **Tốn công hơn vẻ ngoài** (phiên kiểm đã kiểm mã; đọc lại ở `cb5b5b8`): `audit-entry.ts` có 11 hành động trong `ChangeMap`; thêm 4 hành động và 2 loại đối tượng; kiểu `TargetFor` đang rơi mặc định về `yeu_cau_thay_doi_chi_nhanh` nên phải viết lại nhánh điều kiện, nếu không hành động mới bị gán sai đối tượng; sửa cả ba file `docs/database/*`, migration `MODIFY` ENUM, test audit. **Phối hợp `booking` B14:** B14 cũng thêm `OverrideLichHen` (đối tượng `lich_hen`) vào đúng chỗ này ⇒ hai PR cùng sửa `TargetFor`; đề xuất đổi `TargetFor` thành bảng tra theo hành động (mỗi hành động một dòng) để mỗi PR chỉ thêm dòng của mình; PR gộp sau phải gộp `main` rồi viết lại danh sách. Điều kiện: ENUM lấy từ `clinix.dbml` và `main` tại lúc làm, không chép từ PLAN; hai PR cùng sửa một ENUM thì PR sau gộp `main` rồi viết lại danh sách; thêm test MG-08 |
| Q35 | Đồng ý: `DoctorLayout` tự nối `RoleShell` | Đại duyệt 08/11/2026 |  |
| Q36 | Đồng ý: màn Admin ở `features/doctor/admin/`, import từ bề mặt công khai của admin; trang host `Duyệt yêu cầu` | Đại duyệt 08/11/2026; Trung xác nhận 08/11/2026 | `features/admin/index.ts` đã xuất `AdminMe`, `AdminConfirmationDialog`, `AdminDetailPanel`, `AdminSearchInput`, `AdminTable`, `AdminTableColumn`; `AdminScopeGuard` (`admin-scope-guard.tsx`) và `useAdminScope` (`use-admin-scope.ts`) có sẵn nhưng chưa xuất ⇒ chỉ cần **thêm hai dòng `export`** vào `index.ts` khi làm F6 (`[ĐỤNG admin]`, Trung tự sửa) |
| Q37 | Đồng ý: frame Figma thiếu dùng thành phần có sẵn | Đại duyệt 08/11/2026 |  |
| Q38 | Đồng ý: phân trang, tìm kiếm, `thongKe` | Đại duyệt 08/11/2026 |  |
| Q39 | Đồng ý: seed `doctor-demo` | Đại duyệt 08/11/2026 |  |
| Q40★ | Đồng ý "chưa đo" tới X1 (M1, M2, M3) | Đại duyệt 08/11/2026 | Không viết B3 (ghi) trước khi có số đo; B2 (xem trước, chỉ đọc) vẫn phụ thuộc X1 chỉ vì cần đo M9 (mảng trong DTO) |
| Q41 | Đồng ý: tên endpoint ở PLAN 5.11 | Đại duyệt 08/11/2026 |  |
| Q42 | Đồng ý: không có tệp ảnh | Đại duyệt 08/11/2026 |  |
| M13 (không phải câu hỏi; điều kiện của B3, DH-04) | **Đúng sẵn, theo đọc mã (không phải số đo):** `ServiceService.update` (`apps/api/src/admin/services/service.service.ts` dòng 65) gọi `this.services.lock(manager, id)` = `SELECT … FOR UPDATE` trên `dich_vu_kham` (`service.repository.ts` dòng 77) rồi mới gọi `hasFutureSlots` (dòng 79 trở đi); không khoá `bac_si` ở đâu; chỗ khoá khác duy nhất là `lockGroup` trên `nhom_dich_vu`. Phân công của `doctor` lấy `FOR SHARE` trên `dich_vu_kham` nên không có vòng khoá | 08/11/2026 (Trung, phiên kiểm; đọc lại ở `cb5b5b8`) | Không còn là việc chờ Trung. **Còn thiếu test chứng minh:** DH-04 cần MySQL thật, chưa chạy ⇒ chạy ở X1/B3 |

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

| Quyết định | Nguồn | Hệ quả cho module này |
|---|---|---|
| Khung Bệnh nhân/Lễ tân nhận cấu hình menu từ `router/`; module khác chỉ thêm `to` và route; mục chưa có trang là nút vô hiệu | patient Q21 | `DOCTOR_NAV` ở `router/role-nav.ts`; Lễ tân đặt `to` cho "Lịch làm việc bác sĩ" |
| `features/` không import chéo | CODING_CONVENTION mục 50 | Màn Admin import qua bề mặt `features/admin/index.ts` (Q36, ngoại lệ có chủ đích) |
| Tài nguyên ngoài phạm vi Quản trị viên ⇒ 404 | admin Q40 | Admin Chi nhánh ngoài phạm vi ⇒ 404; **Lễ tân ngoài phạm vi ⇒ 403 theo 2.4 A2 (Q13, khác có chủ đích)** |
| Admin sở hữu migration các bảng nền; module khác không tạo lại | admin Q41 | `lich_lam_viec`, `khung_gio` dùng sẵn; `yeu_cau_nghi_phep` do module này (P1) |
| Chặn đổi `thoi_luong`/dịch vụ chính khi còn khung giờ/ca tương lai; chặn đổi chi nhánh khi còn ca từ hôm nay (ca hôm nay tính là còn) | admin Q16, Q17, quy tắc 13 | Nền của bất biến I-1; `ShiftQueries` là cách đọc ca dùng chung |
| Audit whitelist đóng, ghi cùng giao dịch, không PII | admin 5.10 (C2) | P4 mở rộng 4 hành động + 2 loại đối tượng |
| Thông báo/email tối thiểu ở `apps/api/src/notification/` (chưa làm) | admin Q9 | `LeaveNotifier` tạm; email `[CHỜ notification]` |
| "Khung giờ còn trống" chủ sở hữu | search Q18 (03/11) ↔ prompt 08/11, booking Q7 | Theo 08/11; Trung xác nhận Q1 (08/11/2026); Trung sửa search ở D1 |
| `booking` ghi `khung_gio.trang_thai` và `lich_hen.trang_thai`; `HetHan` không ghi, suy ra khi đọc | booking Q3, 5.10 D7 | `doctor` chỉ `INSERT`/`DELETE` có điều kiện khung giờ; reader suy `HetHan` |
| Duyệt nghỉ phép hoàn 100%, không mời danh sách chờ; chính sách của nhóm | booking Q17 | Module này không tính tiền, không gọi `RefundPort`/`WaitlistPort` |
| Thứ tự khoá toàn cục (tầng 4 `bac_si`, 5 `khung_gio`, 6 `lich_hen`); `READ COMMITTED`, thử lại chỉ trước commit | booking 5.3, Q42 | Mục 5.9; chốt sau X1 |
| Phân trang offset `common/paging`; `AppException`, `expectErrorResponse`; `ScheduleModule.forRoot()` đúng một lần | admin Q42, auth | Dùng nguyên |

## 4. Ghi chú AI

- Lần lập kế hoạch này dùng Claude Code (model Claude Sonnet 5.5) ngày 08/11/2026, trong phiên của Đại; phần đọc Figma do một agent con (loại `general-purpose`, chạy nền, chỉ đọc) làm, **tên model của agent con không được ghi lại trong phiên nên không xác nhận được**. Các giai đoạn: (1) lập bản nháp 1 và đọc mã/schema/PLAN booking — Claude Sonnet 5.5; (2) đọc Figma — agent con; (3) sửa theo lời duyệt của phiên kiểm (bản nháp 2) — Claude Sonnet 5.5.
- **Dòng `AI_USAGE_LOG.md` (của Đại): dòng 63**, đã ghi 08/11/2026 sau khi kiểm `origin/main` (tham chiếu cục bộ `24bcb72`): dòng lớn nhất vẫn 61. Dòng 62 giữ cho task patient B7 (nằm ở PR của F8); nếu hai PR gộp khác thứ tự thì giữ cả hai dòng và sắp lại theo số. Không thêm AI-BUG. Nhật ký AI của task do Trung làm nằm ở **`TRUNG_AI_USAGE_LOG.md`** (mục mới nhất chèn đầu bảng; mã `AI-BUG-nnn` = số lớn nhất của cả hai nhật ký + 1).
- Lần ghi quyết định của Trung (08/11/2026, Claude Code, Claude Sonnet 5.5) là **sửa nhỏ ghi quyết định cho kế hoạch đã có dòng 63**: không có dòng nhật ký riêng ở `AI_USAGE_LOG.md`.
- Mỗi task sinh mã bằng AI: một dòng ở bảng 1 (ghi ở PR kế tiếp nếu chưa có số). Lỗi AI phát hiện: bảng 2, mã `AI-BUG-nnn` trong commit sửa; số dòng nợ kỹ thuật tiếp theo ở `docs/TECH_DEBT.md` kiểm lại trên `main` trước khi ghi (lúc soạn là 84).
- Lỗi AI đã biết ở repo này cần tránh (AGENTS mục 7): chỉ đọc cú pháp rồi báo "xong" (phải chạy thật lint/build/test), ghi version Action/thư viện theo trí nhớ, `hashFiles()` ở cấp job, hook husky gọi `npx` trên Windows. Với module này thêm: tuyên bố "không deadlock" mà chưa chạy DH-* nhiều vòng; viết "suy ra từ mã" như sự thật khi chưa đo (M1–M13); viết SQL `UPDATE lich_hen`/`khung_gio` ở module này (cấm, HD-08); dùng `NOW()` trong SQL.
- Sai sót của AI trong lần lập kế hoạch này (không gán mã AI-BUG): bản đầu của Q8 cho gỡ ca khi khung giờ `DangGiuCho` đã hết hạn, mâu thuẫn với D7 của booking (đã sửa: mọi `DangGiuCho` chặn); thiết kế ban đầu của phân công theo từng ngày × ca theo chữ 2.4 trước khi đọc Figma (Figma là quy tắc lặp nhiều bác sĩ: đã sửa thành Q10); một dòng mã lỗi bịa thêm vào bảng 5.14 khi soạn (đã xoá); bản nháp 1 gắn cổng đo Q40 và M13 vào B2 (xem trước, chỉ đọc) thay vì B3 (ghi), lời duyệt vòng 1 chép lại; ca `C2-03` viết số cứng "15 hành động" dễ xung đột với booking B14 (đã sửa ở vòng 2).

| Ngày | Task | Dòng `AI_USAGE_LOG.md` | Lỗi AI phát hiện (`AI-BUG-nnn`) |
|---|---|---|---|
| 08/11/2026 | Lập kế hoạch module `doctor` (bản nháp 1), sửa theo lời duyệt vòng 1 và vòng 2 | Dòng 63 (dòng 62 giữ cho patient B7 ở PR của F8) | Không có AI-BUG (sai sót ghi ở ghi chú trên) |

## 5. Phối hợp với module khác

Việc chưa làm; cập nhật cột "Trạng thái" khi hai bên đã thống nhất.

| Với | Việc | Task / mục PLAN | Trạng thái |
|---|---|---|---|
| `booking` (Đại) | **Đối chiếu mục 5.10 hai chiều** (D1–D12 + D13, D14): `checkSlotWithinBranchHours`/`BranchHoursReader`, `AvailableSlotsReader` (thêm `listMany`, `trangThaiNgay` có `NghiPhep`), `LeaveReader`, duyệt hai giai đoạn + sweeper, `findAffectedByLeave` thêm `now` và `thoi_gian > now`, `listAffectedByLeave`, `countActiveByShifts`, quy tắc ghi `khung_gio` (D7), phân công sửa `router/role-routes.tsx` (doctor F1 trước; booking F11 thêm một dòng), seed | 5.10, P2, B5, B6, B15–B17, F10 | **Đối chiếu xong 08/11/2026 (phiên kiểm)**; ghi ở mục 3 của module này; phía booking sửa bằng PR riêng của phiên booking (Đại chuyển) |
| `booking` (Đại) | Mở khoá cho booking: **P2** (D2) trước booking B6; **B5** (D4) trước booking B16; **B1/B3/B18** (khung giờ thật, seed) cho demo | P2, B5, B1, B3, B18 | Chưa |
| Trung | **Đã xác nhận 08/11/2026:** Q1, Q2, Q3, Q8, Q10, Q28, Q34, Q36 và M13 (đọc mã). Còn lại: Q5 chưa nêu với Trung (P3 sửa `rbac/`); Q27 phương án (b) chỉ khi nhóm muốn hiện lý do từ chối ở Chi tiết (đổi schema). Việc làm của Trung từ nay: D1 (3 chỗ ở `search`), `moc_hoan_tien` (Q2), `TargetFor` ở P4 cùng booking B14, hai dòng `export` ở `features/admin/index.ts` khi làm F6 | Q1–Q3, Q8, Q10, Q27, Q28, Q34, Q36 | Q1, Q2, Q3, Q8, Q10, Q28, Q34, Q36: xong 08/11/2026; Q5, Q27 (b): chưa |
| `search` (Trung) | Sửa 3 chỗ ở D1: `docs/features/search/TRACKING.md` mục 3 (dòng 89 và 124 ở `cb5b5b8`, đổi chủ bộ tính khung giờ sang `doctor`), PLAN `search` 5.6 (K1 trả `khungGioId`, `trangThaiNgay` có `NghiPhep`), **7.10 KGI-03** (dòng 683); K1 gọi `AvailableSlotsReader`. PLAN `search` còn nhắc `booking` là chủ bộ tính khung giờ ở dòng 117 và 510: Trung rà khi sửa | D1 | Chưa làm (Q1 đã xác nhận 08/11/2026, hết chờ) |
| `admin` (Trung) | B13 (đổi chi nhánh bác sĩ) gọi `ShiftQueries.findFutureShiftsAtBranch`; `admin-sidebar.tsx` đặt `to` cho "Lịch làm việc bác sĩ" và "Duyệt yêu cầu"; `features/admin/index.ts` thêm hai dòng `export` (`AdminScopeGuard`, `useAdminScope`) khi làm F6; seed `doctor-demo` vào `SEED_COMMANDS`; `docs/database/*`; migration + entity `moc_hoan_tien` (Q2, task "Đặt cọc & Hoàn tiền") | B7, F6, F8, B18, P4, D2 | Chưa |
| `rbac`, `audit` (Trung) | `ReceptionScopeService` (P3 hoặc booking P4; Q5 chưa nêu với Trung); 4 hành động nhật ký mới, `TargetFor` đổi thành bảng tra theo hành động (phối hợp booking B14 thêm `OverrideLichHen`) | P3, P4 | Chưa |
| `booking` (Đại) | Theo quyết định của Trung 08/11/2026: Q2 (`moc_hoan_tien` do Trung làm; booking P6 chỉ làm tạm nếu tới B8 mà Trung chưa xong, Trung báo Đại trước); Q3 (booking P7: `thong_bao.lich_hen_id` + UNIQUE, sửa cả ba file `docs/database/*` cộng migration, xếp theo timestamp với doctor P1, P4); P4 (booking B14 và doctor P4 cùng sửa `TargetFor`, PR gộp sau phải gộp `main` rồi viết lại danh sách) | Q2, Q3, Q34, P4 | Chưa |
| `patient` (Đại) | Không sửa file; xác nhận `RoleLayout` giữ trong `features/patient` (module này tự nối `RoleShell`); báo nếu `jscpd` báo trùng | Q35, F1 | Chưa |
| `notification` | Email Bác sĩ/Admin, chuông thông báo, mẫu `688:2` (ba tab) | B10, Q33 | Chưa (module chưa có) |
| `wallet`, `waitlist` | Không gọi trực tiếp (qua `cancel` của booking) | 5.8 | Không cần |
| Nhóm (Figma, 2.4) | Sửa Figma theo L20–L30 và mục 4.5 (form "Theo ca", ô "+", nút Gỡ ca, hộp xác nhận duyệt, dòng "Từ chối", tương phản, dữ liệu mâu thuẫn); sửa 2.4 (repo `TLCN_CLINIX`) theo D2 | D2, D3 | Chưa |

## 6. Số đo thật (PLAN.md mục 5.15; làm ở task X1 trước B2 (M9) và B3 (M1, M2, M3, M6, M7))

| # | Cần đo | Kết quả | Ngày | Hệ quả cho PLAN |
|---|---|---|---|---|
| M1 | Tỉ lệ 1213/1205 của phân công (nhiều bác sĩ, thứ tự chéo) ở `READ COMMITTED` | | | |
| M2 | Lỗi 1062 (UNIQUE ca, UNIQUE khung giờ) và 1451 (xoá khung giờ bị tham chiếu): errno, nội dung | | | |
| M3 | `innodb_lock_wait_timeout` so với giao dịch phân công lớn giữ `bac_si` X (**chốt Q40**) | | | |
| M4 | Múi giờ: ghi `ngay_gio` bằng chuỗi, đọc lại bằng `Date`/`DATE_FORMAT`; cột `DATE` qua SQL thô | | | |
| M5 | Thứ ISO bằng hàm thuần so với `WEEKDAY()+1` cho cả năm | | | |
| M6 | Thời gian/số truy vấn phân công 20 bác sĩ × 92 ngày × 2 ca (giới hạn 1.000 ca) | | | |
| M7 | Id của `INSERT` nhiều hàng liên tiếp (`innodb_autoinc_lock_mode`) | | | |
| M8 | `EXPLAIN` giao nhau nghỉ phép `(bac_si_id, ngay_bat_dau, trang_thai)` và truy vấn sweeper | | | |
| M9 | `ValidationPipe` với mảng `bacSiIds`/`thuTrongTuan`/`cas`, tham số lạ | | | |
| M10 | `EXPLAIN` `findAffectedByLeave` khi tập rỗng, ≥ 100.000 hàng `lich_hen` | | | |
| M11 | Vị từ phạm vi bác sĩ (OR + EXISTS) có dùng chỉ mục | | | |
| M12 | `DELETE khung_gio` bị `lich_hen` tham chiếu: khoá giữ, chu trình với `cancel` | | | |
| M13 | Lệnh sửa dịch vụ admin B3 có khoá `dich_vu_kham` `FOR UPDATE` trước khi kiểm khung giờ **và không xin `bac_si` sau đó** | **Đọc mã (không phải số đo): đúng sẵn.** `ServiceService.update` dòng 65 → `lock` = `FOR UPDATE` trên `dich_vu_kham` (`service.repository.ts` dòng 77) → `hasFutureSlots` dòng 79 trở đi; không khoá `bac_si`; chỗ khoá khác duy nhất là `lockGroup` (`nhom_dich_vu`) | 08/11/2026 | Không còn là việc chờ Trung. DH-04 (cần MySQL thật) chưa chạy ⇒ chạy ở X1/B3 |

## 7. Việc chờ module khác (cập nhật khi module đó có mã)

| Việc | Chờ ai | Hành vi tạm | Ngày thay bằng thật |
|---|---|---|---|
| Duyệt (B15), sweeper (B16), nối D13/D14 (B17), F9 | `booking` B10 (`cancel`), B11 (`findAffectedByLeave`, D13, D14) | **Không merge Duyệt** (Q26); danh sách/chi tiết/Từ chối chạy bình thường, không có mục lịch hẹn bị ảnh hưởng | |
| Số lịch hẹn ở lưới, `soLichHenDangCo` | `booking` B11 (D14) | Ẩn dòng, không hiện "0 lịch" | |
| `ReceptionScopeService` | `booking` P4 hoặc P3 của module này | Lễ tân (B8, F5) chưa làm | |
| Trang "Lịch hẹn" của Bác sĩ (F10) | `booking` F11 | Nút vô hiệu "Chưa được triển khai" | |
| Endpoint công khai khung giờ (K1), giao diện chọn giờ (K2) | `search` | Reader D3 sẵn sàng, chưa có người gọi | |
| Email thông báo, chuông thông báo | `notification` | Chỉ ghi `thong_bao` | |
| Hoàn tiền, thông báo bệnh nhân | `wallet`, `booking` | Nằm trong `cancel` của booking | |
