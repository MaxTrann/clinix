# Tracking — module `doctor` (phần khám bệnh: ghi hồ sơ khám, hoàn thành ca khám, xem hồ sơ khám, đánh giá bác sĩ, kiểm duyệt đánh giá)

Nhật ký tiến độ riêng của phần khám bệnh của module `doctor` (Ghi hồ sơ khám bệnh, Xác nhận hoàn thành ca khám, Xem hồ sơ khám bệnh, Đánh giá bác sĩ, Kiểm duyệt đánh giá).
Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass,
chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge. **Người làm scope này: Đại (`MaxTrann`)**; mã nằm trong module `doctor` do **Trung (`junUTE`)** sở hữu (mục 5 liệt kê việc báo Trung); bản kế hoạch do phiên Claude Code của Đại lập (14/11/2026).

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`/`B*`/`F*`/`D*`/`X*` theo PLAN.md mục 6), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md (ví dụ `HSK-01, HSK-03`); "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Ca đồng thời (`DHK-*`) ghi thêm số vòng chạy và số lỗi 1213/1205 đo được; sau mỗi ca đồng thời ghi kết quả IVK-01…IVK-05.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Câu hỏi Q1–Q25 (PLAN.md mục 4.2) được trả lời thì ghi vào mục 3 rồi bỏ thẻ `[CHỜ Qn]` trong PLAN.md. Câu chạm file của Trung ghi tên người xác nhận.
- Số đo thật (M1–M14, PLAN.md mục 5.15) ghi ở mục 6; việc còn chờ module khác ghi ở mục 7 cho tới khi module đó có mã.
- Khi cả scope xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 14/11/2026 | **Lập kế hoạch (bản nháp 1)** scope #8 phần khám bệnh: tạo `docs/features/doctor-exam/PLAN.md` và `TRACKING.md` (nhánh `docs/doctor-exam-plan`, nền `origin/main` = `cb8bf46`, PR 386). Đọc mã thật: `appointments/state/` (ma trận, `complete`), `appointments.module.ts`, `lists/doctor-appointment*.ts`, `audit/`, `doctor/` (module, kiểm kiến trúc), `search/ratings/`, `search/doctors/`; web: booking F11 (`record-card.tsx`, bộ đọc `ghiChuKham`), F2 chi tiết Bệnh nhân, `architecture.test.ts` (BWZ-08), `router/`, `features/doctor/`, `admin-sidebar.tsx`; schema `docs/database/*`; PLAN và TRACKING `booking`, `doctor`, `search`, `admin`; Figma (siêu dữ liệu toàn trang `63:2`, các frame mục 4.4 của PLAN) | — (chưa có mã) | Chưa chạy gì (chỉ tài liệu; không chạy `test`, `build`, `test:int`, `test:e2e`, không lệnh git ghi) | **Phát hiện khi lập kế hoạch (chưa chọn bên):** (1) **PD-19** của `doctor/architecture.spec.ts` cấm `AppointmentTransitionService` ở mọi file của `doctor/`, nên gọi `complete` làm test đỏ ⇒ P3 sửa có điều kiện (Trung); (2) **BWZ-08** cấm `features/booking` import `features/doctor` ⇒ cần Đại chọn Q20; (3) ENUM nhật ký đã có `SuaGhiChuKham`, `AnDanhGia`, `ho_so_kham`, `danh_gia_bac_si` nhưng `audit-entry.ts` chưa có ⇒ không cần migration ENUM; (4) Figma `423:2` bắt buộc nhận xét (≥ 10 ký tự) còn 2.4 và schema để tuỳ chọn (L1); (5) nhật ký `SuaGhiChuKham` theo 2.4 mang **nội dung khám** (L3, Q15); (6) booking `complete` không có điều kiện thời gian; (7) Admin override đưa `DaTiepDon` về trạng thái khác khi đã có hồ sơ (L14, Q16); (8) `search` Q16 chờ "module đánh giá" chọn chủ migration (Q10). Siêu dữ liệu Figma cắt chữ ở 50 ký tự (đọc lại bằng `get_design_context` trước các task F) |
| 14/11/2026 | **Ghi quyết định Q20** vào `PLAN.md` (hàng Q20, E7, 5.13, F1, F2, F3, F6, 6.1, 6.8, 6.10, H5) và `TRACKING.md` (mục 3.1, mục 5, mục 7): Đại chọn **Phương án C** trực tiếp tại cửa sổ của phiên kiểm; bỏ chữ "Cần Đại chọn trước F1" | — (chỉ tài liệu) | Chưa chạy gì | Chỉ sửa trong `docs/features/doctor-exam/`; không sửa file nào khác, không lệnh git; việc đổi `architecture.test.ts` (BWZ-08) làm ở task F1 |
| 14/11/2026 | **Chia lại task theo Iteration một tuần** trong `PLAN.md` (6.1, 6.2 đến 6.6 thêm cột "Iter.", 6.8 viết lại, 6.9, Q13, 4.3) và `TRACKING.md` (mục 3.1 Q13, mục 5, mục 7): Đại xác nhận Iteration 6 = 17/11 đến 23/11, 7 = 24/11 đến 30/11, 8 = 01/12 đến 07/12; giờ/tuần chưa nêu nên dùng mặc định 45 `[đề xuất]`; Iteration 6 ≈ 39 giờ, 7 ≈ 37 giờ, 8 ≈ 22 giờ | — (chỉ tài liệu) | Chưa chạy gì | Chỉ sửa trong `docs/features/doctor-exam/`; không sửa file nào khác, không lệnh git; Iteration 7 và 8 chưa có trong Project (việc của người dùng) |
| 14/11/2026 | **Task P1 (#391): migration + entity `ho_so_kham`, `danh_gia_bac_si`** (nhánh `feat/doctor-exam-p1`, nền `origin/main` = `08485c4`): migration `1793620800000-tao-bang-ho-so-kham.ts` (8 câu DDL sinh bằng script đọc `clinix_mysql.sql`), hai entity, đăng ký `ENTITIES` và `MIGRATIONS`, `exam-tables.int-spec.ts` mới, sửa ba test dùng chung (`schema-parity`, `migrations` gồm MHT-09, `migration-source.spec.ts`); chạy thật và 11 đột biến có dự đoán trước | MGK-01, MGK-02, MGK-03, MGK-04, MGK-05, MGK-06, MGK-07, MGK-08, MGK-09 | Pass (9/9): `exam-tables` 10/10, `audit-enum-parity` 4/4, `schema-parity` 12/12, `migrations` 12/12, `app.e2e-spec` 2/3 (ca TECH_DEBT 132 đỏ đúng dự kiến); `npm test` 261 file và 4.835 test, `lint`, `tsc`, `build` thoát 0 | **Phát hiện:** (1) MHT-09 giả định P6 là migration cuối nên phải sửa theo mẫu TBLH-09; (2) `schema-parity` và `migrations` dùng DB cố định `clinix_ref_test`, `clinix_migration_test` (TECH_DEBT `[đề xuất]` 142); (3) `registry.spec.ts` đọc tên lớp, không đọc thuộc tính `name`: đột biến M7 lọt TRÁI dự đoán, đã thêm ca MGK-07 cho migration của task (TECH_DEBT `[đề xuất]` 143); (4) "hai dòng" ở file dùng chung thực là 6 dòng (`entities.ts` +4, `index.ts` +2); (5) ghi chú (COMMENT) của hai bảng giống nhau ở SQL và dbml. Chi tiết ở mục 8.8 |
| 14/11/2026 | **Task P2 (#392): nhật ký `SuaGhiChuKham`, `AnDanhGia` và tầng khoá `6b`** (nhánh `feat/doctor-exam-p2`, nền `origin/main` = `8bbf2f4`): `audit-entry.ts` (+21), `audit-validation.ts` (+65, hai `case` mới giữa `OverrideLichHen` và `default`, hằng xuất `AUDIT_EXAM_LIMITS`), `lock-order.ts` (hạng `6b`), `lock-order.spec.ts` (sửa LOK-01, thêm HDK-05), bốn file mới (`audit-exam-validation.spec.ts`, `audit-exam.int-spec.ts`, `exam-audit-entries.ts`, `lock-order.int-spec.ts`); chạy thật trên MySQL 8.4 (`clinix_dep2_test`) và 12 đột biến có dự đoán trước | HDK-05, HDK-09, TDK-04, TDK-05 | Pass: HDK-09, TDK-04, TDK-05; **HDK-05 một phần** (đơn vị và tên bảng Pass; chuỗi khoá bằng câu SQL thật chờ B2, B6, B8). `npm test` 262 file và 4.916 ca, `test:int` 22/22 (bốn file) và chín int-spec booking 242/242, `tsc`, `lint`, `build` thoát 0 | **Phát hiện:** (1) LOK-01 đỏ vì liệt kê cứng danh sách hạng (sửa bảng liệt kê, hành vi không đổi); (2) bộ che của `audit/` chạy trên mọi chuỗi nên có thể từ chối nội dung khám hợp lệ (TECH_DEBT `[đề xuất]` 144; cảnh báo cho B2, B8 ở mục 7); (3) `LOCK_ORDER` có tên ba bảng payment và wallet chưa có migration (HDK-05 (b) miễn đích danh; TECH_DEBT `[đề xuất]` 145); (4) file mã `apps/` là LF, `docs/` là CRLF (AI kiểm sai ở lần đầu). Chi tiết ở mục 10.9 |

## 2. Kết quả test theo use case

Mới có mã của P1 (nhóm MGK) và P2 (HDK-05, HDK-09, TDK-04, TDK-05); bảng điền khi từng task xong (số ca theo PLAN.md mục 7; `☐` = chưa làm, `☑` = đã làm và Pass).

| Nhóm | Use case / chủ đề | Số mã | Task | Trạng thái |
|---|---|---|---|---|
| HSK | Ghi hồ sơ khám bệnh | 20 (HSK-01…HSK-20) | B2, F3 | ☐ |
| HTK | Xác nhận hoàn thành ca khám | 12 (HTK-01…HTK-12) | B1, F1 | ☐ |
| XHS | Xem hồ sơ khám bệnh | 14 (XHS-01…XHS-14) | B4, B5, F5 | ☐ |
| DGB | Đánh giá bác sĩ | 15 (DGB-01…DGB-15) | B6, F6 | ☐ |
| KDD | Kiểm duyệt đánh giá | 15 (KDD-01…KDD-15) | B7, B8, F7, F8 | ☐ |
| DTB | Điểm trung bình đọc cho `search` | 10 (DTB-01…DTB-10) | B9 | ☐ |
| QHK | Quyền và phạm vi | 12 (QHK-01…QHK-12) | P3, B1…B8, X3 | ☐ |
| DHK | Đồng thời (MySQL thật) | 11 (DHK-01…DHK-11) | B1, B2, B5, B6, B8 | ☐ |
| IVK | Bất biến | 5 (IVK-01…IVK-05) | P3 | ☐ |
| HDK | Hợp đồng và cổng | 12 (HDK-01…HDK-12) | P2, P3, B3, B9, F2 | ☐ 2/12 từ P2 (HDK-09 Pass; HDK-05 một phần: đơn vị và tên bảng Pass, chuỗi SQL thật chờ B2, B6, B8; 14/11/2026, chi tiết 10.9) |
| TDK | Thông báo và nhật ký | 7 (TDK-01…TDK-07) | P2, B1, B2, B8 | ☐ 2/7 từ P2 (TDK-04, TDK-05 Pass; 14/11/2026, chi tiết 10.9) |
| BDK | Bảo mật dữ liệu sức khoẻ | 9 (BDK-01…BDK-09) | X3 (và từng task) | ☐ |
| MGK | Bảng và migration | 9 (MGK-01…MGK-09) | P1 | ☑ 9/9 Pass (14/11/2026; chi tiết 8.8) |
| WHT | Web: hoàn thành ca khám (Bác sĩ) | 9 (WHT-01…WHT-09) | F1 | ☐ |
| WHS | Web: ghi hồ sơ khám (Bác sĩ) | 10 (WHS-01…WHS-10) | F2, F3, F4 | ☐ |
| WXH | Web: xem hồ sơ khám (Bệnh nhân) | 9 (WXH-01…WXH-09) | F5, F6 | ☐ |
| WDG | Web: đánh giá bác sĩ | 10 (WDG-01…WDG-10) | F6 | ☐ |
| WKD | Web: kiểm duyệt đánh giá | 10 (WKD-01…WKD-10) | F7, F8 | ☐ |
| **Tổng** | | **199** | | |

(Số đếm tính bằng script từ `PLAN.md` mục 7 lúc soạn; sửa ở đây khi PLAN đổi.)

## 3. Quyết định đã chốt

Ghi câu trả lời cho các câu hỏi ở PLAN.md mục 4.2 và ngày chốt, để PLAN.md có thể bỏ thẻ `[CHỜ …]`. Quyết định ở đây là **quyết định cuối**, ưu tiên hơn đề xuất trong PLAN.md. **Mới có Q10, Q11 (ghi nhận), Q20 và phần Iteration của Q13 được trả lời (14/11/2026, Đại); các câu còn lại chưa.** Sau khi phiên kiểm đối chiếu hợp đồng với module kia, nhóm đọc và xác nhận các câu `[CHỜ …]`, điền bảng dưới.

### 3.1 Quyết định của nhóm cho scope này

| Mã câu hỏi | Quyết định | Ngày chốt | Ghi chú (khác đề xuất? hệ quả cho task) |
|---|---|---|---|
| Q1★ (a) tên module, thư mục | `[CHỜ]` — đề xuất: scope `doctor`, `docs/features/doctor-exam/`, `doctor/examination/`, `features/doctor/examination/` | | |
| Q2★ (b1) trường hồ sơ, độ dài, ngày tái khám | `[CHỜ]` — đề xuất: 3 trường bắt buộc, 1–2.000 ký tự, ngày tái khám từ ngày khám đến +365 ngày | | Chặn B2, F3 |
| Q3★ (b2) sửa sau Hoàn thành, nhật ký, sửa chồng | `[CHỜ]` — đề xuất: nhật ký chỉ khi `HoanThanh` và đã có hồ sơ; token `capNhatLanCuoi`; không đổi ⇒ không ghi | | Chặn B2; sửa 2.4 (L4) |
| Q4★ (b3) ai ghi, ai xem | `[CHỜ]` — đề xuất: Bác sĩ phụ trách ghi/đọc; Bệnh nhân chủ đọc khi `HoanThanh`; Lễ tân và Quản trị viên không đọc nội dung | | Chặn B2, B4, B5 |
| Q5★ (c) hoàn thành ca khám | `[CHỜ]` — đề xuất: route riêng của `doctor`, không điều kiện thời gian, nút ở trang chi tiết F11 | | Chặn B1, F1 |
| Q6★ (d) hồ sơ độc lập, hệ quả giao diện | `[CHỜ]` | | Chặn F2, F5 |
| Q7★ (e) đánh giá | `[CHỜ]` — đề xuất: nhận xét tuỳ chọn ≤ 1.000 (lệch Figma `423:2`, L1), một lần, không sửa/xoá | | Chặn B6, F6; sửa Figma hoặc 2.4 |
| Q8★ (f) kiểm duyệt | `[CHỜ]` — đề xuất: chỉ ẩn (không hiện lại), lý do 10–255, phạm vi theo chi nhánh của lịch | | Chặn B7, B8, F7, F8 |
| Q9★ (g) điểm trung bình và `search` | `[CHỜ]` — đề xuất: tính khi đọc; dự phòng đổi schema chỉ sau khi đo M6 | | Chặn B9 |
| Q10★ (h) migration và entity | **Ghi nhận:** scope này làm migration và entity (P1), ngoại lệ Q41 theo tiền lệ doctor P1. **Sự thật:** Trung approve PR 389 ngày 14/11/2026 và không viết bình luận riêng; Đại coi đó là xác nhận theo tin đã gửi (KHÔNG phải Trung xác nhận bằng lời). Đại sẽ tự nhắn Trung một câu riêng về Q10 trước khi mở PR P1 | 14/11/2026 (Đại trả lời trực tiếp: đồng ý ghi như vậy và tự nhắn Trung) | P1 làm xong; `[ĐỤNG database]` (hai file và ba test dùng chung) báo Trung ở mô tả PR |
| Q11★ (i) điểm chạm Trung và review | **Ghi nhận:** danh sách file ở PLAN 6.7 và cách review (Trung là người approve). **Sự thật:** Trung approve PR 389 ngày 14/11/2026, không bình luận riêng; Đại coi đó là xác nhận theo tin đã gửi | 14/11/2026 (cùng câu trả lời của Đại với Q10) | Hết chặn P2, P3, B9, F7; mỗi PR vẫn ghi `[ĐỤNG …]` và báo Trung trước khi mở |
| Q12 (j) mã test, thứ tự task | `[CHỜ]` | | |
| Q13★ (k) giờ và Iteration | **Một phần:** Iteration giữ **MỘT tuần** (6: 17/11 đến 23/11, đã có trong Project; 7: 24/11 đến 30/11; 8: 01/12 đến 07/12, chưa thêm vào Project). Tổng ước ≈ 95 giờ (98 giờ với B10). **Hạn mức giờ/tuần: Đại chưa nêu ⇒ dùng MẶC ĐỊNH 45 giờ/tuần `[đề xuất]`, chờ Đại đổi nếu muốn.** Chia: Iteration 6 ≈ 39 giờ, Iteration 7 ≈ 37 giờ (chừa ≈ 8 giờ đệm), Iteration 8 ≈ 22 giờ (F7, F8, B10, D2, X2, X3; PLAN 6.8 và cột "Iter." của bảng task) | 14/11/2026 (Đại chọn trực tiếp tại cửa sổ của phiên kiểm; phiên kiểm chuyển lại) | Con số 45 chỉ là mặc định: nếu Đại đổi thì chia lại theo PLAN 6.8; người dùng thêm Iteration 7 và 8 vào Project |
| Q14★ (l) điểm nối #9 | `[CHỜ]` | | Báo khi lập kế hoạch #9 |
| Q15 nhật ký `SuaGhiChuKham` chứa nội dung | `[CHỜ]` | | Dòng nợ TECH_DEBT ở B2 |
| Q16 override khi đã có hồ sơ | `[CHỜ]` — đề xuất: giữ dòng, ẩn | | HSK-09, DHK-10 |
| Q17 thông báo, email | `[CHỜ]` — đề xuất: `LichHenHoanThanh` trong ứng dụng, không email | | Chặn B1 |
| Q18 hồ sơ người thân ngừng dùng | `[CHỜ]` | | |
| Q19 Bệnh nhân thấy đánh giá bị ẩn | `[CHỜ]` | | |
| Q20★ cắm giao diện vào trang booking | **Phương án C:** `features/booking` import `features/doctor` **chỉ qua `index.ts`** (thêm `'doctor'` vào `THROUGH_INDEX_ONLY` của `features/booking/architecture.test.ts` và sửa ca đối chứng, đúng tiền lệ F10 với `admin`); `features/doctor` không import `features/booking`; component nhận dữ liệu và hàm tải lại qua props. Phương án A không chọn | 14/11/2026 (Đại chọn trực tiếp tại cửa sổ của phiên kiểm; phiên kiểm chuyển lại cho phiên này) | Hết chặn F1, F2, F3, F6. F1 làm việc sửa `architecture.test.ts` (BWZ-08); tiền lệ F10 ghi ở TRACKING booking |
| Q21 Bệnh nhân đọc qua endpoint riêng | `[CHỜ]` | | |
| Q22 tên endpoint và đường dẫn web | `[CHỜ]` | | |
| Q23 404 cùng thân, 409 | `[CHỜ]` | | Sửa 2.4 (L5) |
| Q24 `coHoSoKham` và `ghiChuKham` ở B5 | `[CHỜ Đại]` | | B3 |
| Q25 seed `exam-demo` | `[CHỜ]` | | B10 tuỳ chọn |
| P2 (#392) hai luật của nhật ký `SuaGhiChuKham` chặt hơn chữ của issue | **QUYẾT ĐỊNH MỚI ngoài PLAN do Đại duyệt:** (1) mỗi khoá của `SuaGhiChuKham` phải thật sự đổi (`truoc` khác `sau`); (2) `ngay_tai_kham_du_kien` chỉ nhận `null` hoặc ngày `YYYY-MM-DD` có thật. Chuỗi rỗng `""` được nhận ở ba trường văn bản (`trieu_chung`, `chan_doan_so_bo`, `huong_xu_ly`) và **bị từ chối** ở `ngay_tai_kham_du_kien` (không phải ngày thật); audit không đặt luật "bắt buộc" của Q2 | 14/11/2026 (Đại trả lời trực tiếp câu hỏi của phiên P2; phiên kiểm chuyển lại cùng nội dung) | Nêu ở thân PR P2; B2 chỉ được gửi các khoá thật sự đổi |

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

| Nguồn | Quyết định | Hệ quả ở scope này |
|---|---|---|
| Quyết định 17/10/2026 | Hồ sơ khám độc lập với Hoàn thành; chưa có hồ sơ ⇒ "Chưa có hồ sơ khám", không nội dung giả | HSK-14, XHS-02, HTK-02 |
| booking Q21, Q22, Q24; AR-01, AR-06, AR-07 | `HoanThanh` chỉ Bác sĩ chuyển, chỉ qua `complete`; không `UPDATE lich_hen` ngoài `appointments/state/` | E1, E8 |
| booking Q33, L25, H10 | Bác sĩ chỉ thấy lịch của mình; mọi 404 cùng thân; `no-store`; không dữ liệu cá nhân vào log | QHK, BDK |
| search Q16 | Điểm trung bình chỉ `bi_an = false`, 1 chữ số thập phân, 0 lượt ⇒ `null` | DTB, B9 |
| admin Q40, Q41 | Ngoài phạm vi ⇒ 404; Admin sở hữu migration bảng nền (ngoại lệ có tiền lệ) | KDD, P1 |
| doctor Q33, Q34 | Whitelist đóng của nhật ký; thông báo trong ứng dụng do module tự ghi | P2, B1 |

## 4. Ghi chú AI

- Lần lập kế hoạch này dùng **Claude Code (model Claude Sonnet 5.5)** ngày 14/11/2026, trong phiên của Đại (`MaxTrann`); không dùng agent con; siêu dữ liệu Figma đọc trực tiếp bằng công cụ chỉ đọc của phiên (`get_metadata` toàn trang `63:2`, lọc bằng script tạm ở thư mục scratchpad, không ghi vào repo).
- **Dòng `AI_USAGE_LOG.md` `[đề xuất]`: dòng 110** (kiểm lại trên `main` lúc ghi: lúc soạn, dòng lớn nhất trên `origin/main` là 107; booking B16a và B18 giữ 108 và 109 theo prompt; nếu hai PR gộp khác thứ tự thì giữ cả hai dòng và sắp lại theo số). **Phiên này KHÔNG sửa `AI_USAGE_LOG.md`**; hỏi Đại trước khi ghi. Nháp dòng:
  - Ngày: 14/11/2026 · Người dùng: MaxTrann · Công cụ: Claude Code (Claude Sonnet 5.5).
  - Phạm vi: `docs/features/doctor-exam/PLAN.md` (mới), `docs/features/doctor-exam/TRACKING.md` (mới), `AI_USAGE_LOG.md` (dòng này) (lập kế hoạch scope #8 phần khám bệnh của module `doctor`; người làm: Đại; mã chạm module của Trung).
  - Prompt chính: lập kế hoạch năm use case Ghi hồ sơ khám bệnh, Xác nhận hoàn thành ca khám, Xem hồ sơ khám bệnh, Đánh giá bác sĩ, Kiểm duyệt đánh giá theo `docs/FEATURE_PLANNING_PROMPT.md` và prompt 14/11/2026; chỉ tạo hai file, không viết mã, không lệnh git ghi, không chạy test; hỏi mọi điểm chưa rõ kèm đề xuất; ghi rõ file của Trung.
  - Phần AI sinh: toàn bộ `PLAN.md` (15 chỗ lệch L1–L15, 14 rủi ro H1–H14, 25 câu hỏi Q1–Q25, hợp đồng với `booking` E1–E13, 26 task P/B/F/D/X kèm ước giờ, 199 test case HSK/HTK/XHS/DGB/KDD/DTB/QHK/DHK/IVK/HDK/TDK/BDK/MGK/WHT/WHS/WXH/WDG/WKD, 14 việc cần đo M1–M14) và `TRACKING.md`; đọc mã thật ở `cb8bf46`, schema `docs/database/*`, PLAN `booking`/`doctor`/`search`/`admin`, Figma; phát hiện PD-19 chặn `complete`, BWZ-08 chặn import chéo, ENUM nhật ký đã đủ, Figma bắt buộc nhận xét, nhật ký chứa nội dung khám.
  - Phần tự sửa/viết: `[cần điền]` (Đại điền khi duyệt).
  - Cách kiểm chứng: chưa chạy mã (chỉ tài liệu); đối chiếu chéo số liệu bằng script (số test case, độ dài tiêu đề PR, tiền tố mã test chưa ai dùng); chờ phiên kiểm độc lập và nhóm xác nhận.
- **Dòng nợ `docs/TECH_DEBT.md` `[đề xuất]`:** lúc soạn dòng lớn nhất trên `origin/main` là **133**; booking B16a và B18 giữ **134 đến 142** ⇒ số tiếp theo `[đề xuất]` **143** (kiểm lại lúc ghi). **KHÔNG thêm dòng nào ở PR kế hoạch**; mỗi dòng thêm ở PR của task tạo ra nó:
  - **B2:** nhật ký `SuaGhiChuKham` mang nội dung khám (triệu chứng, chẩn đoán) trong `chi_tiet_thay_doi`; màn "Nhật ký hành động" (`admin`) phải che; chưa ai đọc được qua giao diện (Q15, L3).
  - **B2:** sửa chồng chỉ phát hiện ở độ chính xác **1 giây** (`cap_nhat_lan_cuoi` là `datetime`): hai lần lưu trong cùng giây từ hai tab không bị 409.
  - **B3:** `coHoSoKham` và `ghiChuKham` đọc ở `appointments/lists/` (booking) bằng `LEFT JOIN ho_so_kham`: booking phụ thuộc bảng của `doctor` (hướng ngược `appointments → doctor` chỉ ở tầng dữ liệu, không import mã).
  - **B8:** không có hiện lại đánh giá đã ẩn (cần giá trị `HienDanhGia` ở ENUM nhật ký ⇒ đổi schema); Bệnh nhân không biết đánh giá của mình bị ẩn (Q19).
  - **B9:** nếu M6 không đạt: điểm trung bình tính khi đọc có thể chậm ở quy mô lớn (phương án cột `bac_si_id` hay bảng tổng hợp).
  - **F1:** BWZ-08 nới cho `doctor` qua `index.ts` (Q20): phụ thuộc hai chiều `features/booking` → `features/doctor` ở tầng chỗ cắm.
  - **F3:** hộp ghi hồ sơ chưa có hỏi xác nhận khi bỏ nội dung đang nhập (Figma không có frame).
  - **X3:** nhắc đánh giá, email "Hoàn thành lịch khám" (`678:2`), tab "Đánh giá" công khai: chờ `notification` và `search` (mục 7).
- Mỗi task sinh mã bằng AI: một dòng ở bảng 1 của `AI_USAGE_LOG.md` (ghi ở PR kế tiếp nếu chưa có số). Lỗi AI phát hiện: bảng 2, mã `AI-BUG-nnn` trong commit sửa.
- Lỗi AI đã biết ở repo này cần tránh (AGENTS mục 7): chỉ đọc cú pháp rồi báo "xong" (phải chạy thật lint/build/test), ghi version Action/thư viện theo trí nhớ, `hashFiles()` ở cấp job, hook husky gọi `npx` trên Windows. Với scope này thêm: tuyên bố "không deadlock" khi chưa chạy DHK nhiều vòng; viết "suy ra từ mã" như sự thật khi chưa đo (M1–M14); viết `UPDATE lich_hen` ở `doctor/` (cấm, HD-08); ghi `ho_so_kham` trước khi khoá `lich_hen` (H1); so "hồ sơ không đổi" bằng SQL (H2); đưa nội dung hồ sơ vào log, URL, nhật ký ứng dụng (H3).
- Ghi quyết định Q20 và phần Iteration của Q13 (14/11/2026, cùng phiên Claude Code, Claude Sonnet 5.5): sửa nhỏ ghi quyết định cho kế hoạch đã có dòng AI log `[đề xuất]` 110, **không** có dòng nhật ký riêng; theo lời phiên kiểm chuyển lại quyết định của Đại.
- **Task P1 (14/11/2026, Claude Code, model Claude Sonnet 5.5, cùng phiên của Đại):** không dùng agent con. **Dòng `AI_USAGE_LOG.md` `[đề xuất]`: dòng 112** (110 giữ cho dòng lập kế hoạch #389, hiện chưa ai ghi; 111 là X3; số thật theo thứ tự merge, phiên kiểm đổi khi gộp). **Phiên này KHÔNG sửa `AI_USAGE_LOG.md`.** Nháp dòng:
  - Ngày: 14/11/2026 · Người dùng: MaxTrann · Công cụ: Claude Code (Claude Sonnet 5.5).
  - Phạm vi: `apps/api/src/database/migrations/1793620800000-tao-bang-ho-so-kham.ts` (mới), `apps/api/src/doctor/entities/ho-so-kham.entity.ts`, `danh-gia-bac-si.entity.ts` và `exam-tables.int-spec.ts` (mới), `database/entities.ts`, `database/migrations/index.ts`, `schema-parity.int-spec.ts`, `migrations.int-spec.ts`, `migration-source.spec.ts`, `docs/features/doctor-exam/PLAN.md`, `TRACKING.md`, `docs/TECH_DEBT.md`.
  - Prompt chính: làm task doctor-exam P1 (#391): migration viết tay và hai entity `ho_so_kham`, `danh_gia_bac_si`; viết test theo MGK-01…MGK-09 trước, mức ĐẦY ĐỦ; lập kế hoạch ngắn rồi chờ duyệt; không lệnh git ghi; không sửa `docs/database/*`; phiên kiểm cấp lượt máy.
  - Phần AI sinh: toàn bộ mã và test kể trên (migration sinh bằng script đọc `clinix_mysql.sql`, không gõ tay), 11 đột biến có dự đoán ghi trước, kế hoạch mục 8, kết quả 8.8, hai dòng TECH_DEBT `[đề xuất]` 142 và 143.
  - Phần tự sửa/viết: `[cần điền]` (Đại điền khi duyệt).
  - Cách kiểm chứng: chạy thật trên MySQL 8.4 (`clinix_dep1_test`): `exam-tables` 10/10, `audit-enum-parity` 4/4, `schema-parity` 12/12, `migrations` 12/12, `app.e2e-spec` 2/3 (ca TECH_DEBT 132 đỏ đúng dự kiến); `npm test` 261 file và 4.835 test, `lint`, `tsc`, `build` thoát 0; 11 đột biến khôi phục và so SHA-256 khớp, 0 file `*.mut`; dự đoán M7 sai (`registry.spec.ts` đọc tên lớp) phát hiện bằng đột biến và ghi ở 8.8.
- **Task P2 (14/11/2026, Claude Code, model Claude Sonnet 5.5, cùng phiên của Đại):** không dùng agent con. **Dòng `AI_USAGE_LOG.md` `[đề xuất]`: dòng 114** (lớn nhất trên `origin/main` lúc ghi là 112; P3 dự kiến 113; số thật theo thứ tự merge, phiên kiểm đổi khi gộp). **Phiên này KHÔNG sửa `AI_USAGE_LOG.md`.** Nháp dòng:
  - Ngày: 14/11/2026 · Người dùng: MaxTrann · Công cụ: Claude Code (Claude Sonnet 5.5).
  - Phạm vi: `apps/api/src/audit/audit-entry.ts`, `audit-validation.ts`, `audit/test/audit-exam-validation.spec.ts`, `audit/test/audit-exam.int-spec.ts`, `audit/testing/exam-audit-entries.ts` (mới), `apps/api/src/appointments/locking/lock-order.ts`, `lock-order.spec.ts`, `lock-order.int-spec.ts` (mới), `docs/features/doctor-exam/PLAN.md`, `TRACKING.md`, `docs/TECH_DEBT.md`.
  - Prompt chính: làm task doctor-exam P2 (#392): thêm hành động `SuaGhiChuKham` và `AnDanhGia` vào bộ ghi nhật ký (`audit/`) và tầng khoá `6b` vào `appointments/locking/lock-order`; lập kế hoạch ngắn rồi chờ duyệt; viết test theo HDK-05, HDK-09, TDK-04, TDK-05 trước, mức ĐẦY ĐỦ; không lệnh git ghi; phiên kiểm cấp lượt máy; hỏi lại Đại trực tiếp các việc ngoài phạm vi và quyết định mới.
  - Phần AI sinh: toàn bộ mã và test kể trên, 12 đột biến có dự đoán ghi trước, kế hoạch mục 10, kết quả mục 10.9, hai dòng TECH_DEBT `[đề xuất]` 144 và 145, cảnh báo cho B2, B8 ở mục 7.
  - Phần tự sửa/viết: `[cần điền]` (Đại điền khi duyệt).
  - Cách kiểm chứng: chạy thật trên MySQL 8.4 (`clinix_dep2_test`): `audit-exam.int-spec` 6/6, `lock-order.int-spec` 1/1, `audit.int-spec` 11/11, `audit-enum-parity` 4/4, chín int-spec của booking 242/242; `npm test` 262 file và 4.916 ca, `tsc --noEmit`, `lint`, `build` thoát 0, `prettier --check` sạch trên 8 file; 12 đột biến khôi phục và so SHA-256 khớp, 0 file `*.mut`; ba dự đoán lệch hoặc cần làm rõ (M1, M2, HDK-05 (b)) ghi ở 10.9.
- **Sai sót của AI trong lần lập kế hoạch này** (không gán mã AI-BUG): chưa có (điền khi phiên kiểm phát hiện).

| Ngày | Task | Dòng `AI_USAGE_LOG.md` | Lỗi AI phát hiện (`AI-BUG-nnn`) |
|---|---|---|---|
| 14/11/2026 | Lập kế hoạch scope #8 phần khám bệnh (bản nháp 1) | Dòng 110 `[đề xuất]` (chưa ghi; hỏi Đại) | Chưa có |
| 14/11/2026 | P1 (#391) migration và entity `ho_so_kham`, `danh_gia_bac_si` | Dòng 112 `[đề xuất]` (chưa ghi; Đại ghi) | Chưa có lỗi trong mã đã giao (dự đoán đột biến M7 sai bị phát hiện bằng đột biến, ghi ở mục 8.8) |
| 14/11/2026 | P2 (#392) nhật ký `SuaGhiChuKham`, `AnDanhGia` và tầng khoá `6b` | Dòng 114 `[đề xuất]` (chưa ghi; Đại ghi) | Chưa có lỗi trong mã đã giao. Hai sai sót của AI bị bắt trong phiên (không gán mã): kiểm kiểu xuống dòng bằng `grep` sai (mẫu khớp mọi dòng) nên báo nhầm file mã là CRLF; giả định "mọi bảng của `LOCK_ORDER` có thật" sai (thiếu ba bảng của payment và wallet), bị bắt ở lần chạy int đầu |

## 5. Phối hợp với module khác

Việc chưa làm; cập nhật cột "Trạng thái" khi hai bên đã thống nhất.

| Với | Việc | Task / mục PLAN | Trạng thái |
|---|---|---|---|
| Trung (`doctor`) | **Nêu và xin xác nhận:** (1) Q10 ngoại lệ Q41: scope này làm migration + entity `ho_so_kham`, `danh_gia_bac_si`; (2) Q11 danh sách file chạm: `doctor.module.ts` (+1 dòng), `architecture.spec.ts` PD-19 (ngoại lệ một file), `features/doctor/index.ts` (+1 dòng `export *`); (3) ba file thuộc phần lịch làm việc **không** đổi: mã mới ở `doctor/examination/` và `features/doctor/examination/`; (4) việc mở của Trung (F9, X2 đến X4) không đụng thư mục mới; (5) F10 hết việc vì booking F11 đã cắm route Lịch hẹn | P1, P3, F1; PLAN 6.7 | Q10, Q11: ghi nhận 14/11/2026 (approve PR 389). **P1 còn việc của Đại trước khi mở PR: nhắn Trung một câu riêng về Q10 và báo hai file `database/*` (`entities.ts` +4 dòng, `migrations/index.ts` +2 dòng) cùng ba test dùng chung.** P3, F1: chưa nêu |
| Trung (`audit`) | P2: thêm `SuaGhiChuKham`, `AnDanhGia` vào `audit-entry.ts`, `audit-validation.ts`, test audit (ENUM DB đã có, không migration); kèm `lock-order.ts`, `lock-order.spec.ts` và file mới `lock-order.int-spec.ts` của booking | P2 | P2 xong ở máy (10.9). **Còn việc của Đại trước khi mở PR: nhắn Trung nêu đúng các file và hai luật chặt hơn issue (mục 3.1);** Trung approve sau khi đọc mô tả `[ĐỤNG audit]` và `[ĐỤNG booking]` là xác nhận cho P2 (quy ước #389, #418). Chưa nhắn |
| Trung (`search`) | B9: đổi thân `DoctorRatingReader.readMany` (K5), TBS-14; PLAN/TRACKING `search`: K5 xong (D2) | B9, D2 | Chưa nêu |
| Trung (`admin`) | F7: một dòng `to` ở `admin-sidebar.tsx`; màn "Nhật ký hành động" `[SAU]` phải che nội dung `SuaGhiChuKham`; PLAN `admin` bỏ "kiểm duyệt đánh giá" khỏi mục không làm | F7, D2 | Chưa nêu |
| `booking` (Đại; chủ cả hai bên) | **Đối chiếu hợp đồng E1–E9** của PLAN 5.10 với `docs/features/booking/PLAN.md` mục 5.10 (D6), 5.3 (tầng `6b`), 5.12; B3 sửa B5 (`ghiChuKham`, `coHoSoKham`, `response-keys.ts`, DSB-06/08); F1, F2, F4, F6 sửa trang F11 và F2; **BWZ-08: Đại đã duyệt Phương án C (Q20, 14/11/2026)**: F1 thêm `'doctor'` vào `THROUGH_INDEX_ONLY` của `features/booking/architecture.test.ts` và sửa ca đối chứng; `features/doctor` không import `features/booking`; F1, F2, F3, F6 dùng props; **hai cửa sổ B16a, B18 đang sửa `docs/features/booking/*` và `appointments/`: sửa docs booking SAU khi hai PR đó vào `main`** | 5.10, B3, F1–F4, F6, D2 | Q20 đã chốt; việc sửa BWZ-08 ở F1: chưa làm; còn lại: Chưa |
| `booking` (Đại) — điểm nối #9 | `markReplaced` không xoá `ho_so_kham`; hồ sơ/đánh giá không di chuyển; chuỗi đổi lịch có tối đa một lịch `HoanThanh` | E9, Q14 | Chưa (nhắc khi lập kế hoạch #9) |
| `patient` (Đại) | Mục menu "Hồ sơ khám bệnh" của `PATIENT_NAV` và route ở khối `BenhNhan` (`[ĐỤNG router]`); không sửa `features/patient/` | F5 | Chưa |
| `notification` | Nhắc đánh giá; email "Hoàn thành lịch khám" (Figma `678:2`); chuông hiển thị `LichHenHoanThanh`; worker `EmailOutboxService` chỉ bốn loại của booking | E6, E12 | Chưa (module chưa có) |
| `followup` (sau) | Đọc `ho_so_kham.ngay_tai_kham_du_kien` | E13 | Chưa |
| Đại (Project "CLINIX Sprint Board") | **Thêm Iteration 7 (24/11 đến 30/11) và Iteration 8 (01/12 đến 07/12)** (Iteration 6, 17/11 đến 23/11, đã có); gán task vào Iteration theo cột "Iter." của PLAN 6.2 đến 6.6 khi tạo issue; xác nhận hoặc đổi mặc định 45 giờ/tuần (Q13) | Q13, 6.8, 6.9 | Chưa |
| Nhóm (Figma, 2.4) | Sửa 2.4 theo L1, L2, L4, L5, L6, L10, Q19; sửa Figma theo L1, L7, L8, L9 và PLAN 4.5 (frame lỗi, rỗng, đang tải, 409, đánh giá ẩn); nhắc mã `CP…` ↔ `CLX-…`; đọc đủ chữ bị cắt ở 50 ký tự trước các task F | D2 | Chưa |

## 6. Số đo thật (PLAN.md mục 5.15; làm ở task X1 trước B1, B2 (M1, M3, M4, M9, M10, M11, M12), B4 (M7), B5 (M14), B7 (M8), B9 (M5, M6))

Chưa đo; điền khi X1 xong. Mỗi dòng: số đo, cách đo, ngày, và có đổi PLAN không.

| M | Giả định | Số đo | Ngày | Ghi chú |
|---|---|---|---|---|
| M1 | `complete` ‖ `PUT exam-record`: khoá `lich_hen` tuần tự hoá, không deadlock chưa thử lại được | chưa đo | | |
| M2 | `SELECT … ho_so_kham … FOR UPDATE` khi chưa có dòng (READ COMMITTED) không chặn lịch khác | chưa đo | | |
| M3 | Khoá chia sẻ ngầm của khoá ngoại ở `ho_so_kham`, `danh_gia_bac_si`, `thong_bao`, `nhat_ky_hanh_dong`; đánh giá chờ `PUT` không chu trình | chưa đo | | |
| M4 | `complete` ‖ override `DaTiepDon → VangMat` (`benh_nhan` X ↔ S ngầm): số 1213, thử lại ≤ 2 đủ không | chưa đo | | |
| M5 | `ROUND(AVG(so_sao), 1)` và `COUNT(*)`: kiểu driver, nửa làm tròn | chưa đo | | |
| M6 | EXPLAIN ANALYZE điểm trung bình ở 100.000 lịch, 1 và 50 bác sĩ; hai kế hoạch | chưa đo | | Không đạt ⇒ dừng, hỏi nhóm (Q9) |
| M7 | EXPLAIN danh sách Bệnh nhân (`lich_hen_index_9`, đếm 12 tháng, lựa chọn người khám) | chưa đo | | |
| M8 | EXPLAIN danh sách kiểm duyệt (JOIN bốn bảng, `LIKE`, sắp, hai `COUNT`) ở 20.000 đánh giá | chưa đo | | Cần chỉ mục ⇒ đổi DDL |
| M9 | `ValidationPipe`: `null`/chuỗi dài/mảng, `@IsOptional` với `null`, kích thước thân JSON, lỗi không mang giá trị | chưa đo (đã đọc `app.setup.ts`: `value: false`) | | |
| M10 | Khứ hồi UTF-8 (có dấu, emoji) qua `text` và `json`; xác nhận `'a' = 'Á'` ở `utf8mb4_unicode_ci` | chưa đo | | |
| M11 | Múi giờ: `cap_nhat_lan_cuoi`, `DATE_FORMAT`, gom tháng 23:30 ngày cuối tháng | chưa đo | | |
| M12 | `INSERT thong_bao` sau `complete` không deadlock; chạy lại không ghi kép | chưa đo | | |
| M13 | HD-08 (doctor), AR-01/05/06/07 (booking) không bắt `SELECT … FOR UPDATE` theo `lich_hen_id` ở `doctor/examination/`; PD-19 sau sửa | chưa đo | | |
| M14 | `GET /patient/exam-records/:maLichHen`: kế hoạch và kích thước phản hồi ở 100.000 lịch | chưa đo | | |

## 7. Cảnh báo và việc chờ module khác (cập nhật khi module đó có mã)

**Cảnh báo cho người làm (đọc trước khi bắt đầu từng task):**
- **Thứ tự khoá (H1):** khoá `lich_hen` `FOR UPDATE` theo khoá chính **trước** mọi `INSERT`/`UPDATE` `ho_so_kham`, `thong_bao`, `nhat_ky_hanh_dong`; `complete` **trước** mọi ghi bảng có khoá ngoại tới `lich_hen`. Không bao giờ khoá `lich_hen` theo `khung_gio_id`.
- **PD-19 và BWZ-08** (H4, H5) làm test đỏ nếu không sửa có điều kiện: P3 và F1 làm đúng thứ tự, báo Trung và Đại.
- **`ghiChuKham` hằng `null` ở nhiều chỗ** (H6): thứ tự **F2 → B3 → F3**; không có dòng `ho_so_kham` thật trên môi trường đã chạy F11 trước khi F2 merge.
- **Dữ liệu sức khoẻ (H3, H10):** không log, không URL, không storage, không thư, Lễ tân/Quản trị viên không đọc; nhật ký `SuaGhiChuKham` có nội dung (Q15).
- **Hai cửa sổ booking B16a, B18** đang sửa `appointments/` và `docs/features/booking/*`, `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md`: `git fetch` và `git log origin/main -- <file>` đầu mỗi phiên; không sửa các file đó trong PR kế hoạch.
- Không chạy hai vitest cùng lúc trên cùng DB test; DB riêng `clinix_exam_<task>_test`; không động DB `clinix` và `clinix_test`; Node 22.x.
- **Nhật ký `SuaGhiChuKham` và `AnDanhGia` (P2 đã thêm ở `audit/`; B2 và B8 là nơi gọi `AuditService.record`):** (1) **bộ che của `audit/` chạy trên MỌI chuỗi trước khi kiểm hình dạng**: nội dung khám hay lý do ẩn có dạng `token=…`, hex 64 ký tự, `Bearer …`, `hash: …` làm `record` ném `AUDIT_SENSITIVE_DATA` và hoàn tác cả lần lưu ⇒ **chặn ở DTO TRƯỚC giao dịch bằng cùng bộ kiểm** (nếp OVR-05 của booking B14), trả 400 có mã ổn định (TECH_DEBT `[đề xuất]` 144); (2) trần của DTO phải ≤ `AUDIT_EXAM_LIMITS` (xuất từ `audit/audit-validation.ts`; hiện 2.000, 10, 255): viết ca buộc hai số này, nếu không thì lưu vượt trần làm `record` ném `AUDIT_ENTRY_INVALID` ngay trong giao dịch; (3) luật của entry: `branchId` là chi nhánh của LỊCH và bắt buộc; `SuaGhiChuKham` chỉ nhận các khoá THẬT SỰ ĐỔI (so ở ứng dụng bằng `===` trên chuỗi đã chuẩn hoá, H2), tối đa bốn trường, `ngay_tai_kham_du_kien` chỉ `null` hoặc ngày `YYYY-MM-DD`; (4) gọi `record` SAU khi đã khoá `lich_hen` rồi `ho_so_kham` hay `danh_gia_bac_si` (tầng 6, 6b, rồi nhật ký ở tầng 7) và trong CÙNG giao dịch; kiểm chuỗi khoá bằng câu SQL thật qua `appointments/testing/lock-chain.ts` (HDK-05 phần chuỗi SQL thật chỉ B2, B6, B8 làm được).

| Chờ | Việc | Khi nào |
|---|---|---|
| `notification` | Nhắc đánh giá; email "Hoàn thành lịch khám" (mẫu Figma `678:2`); chuông; worker gửi `LichHenHoanThanh` | Khi module có mã |
| `search` (phần hai của K5) | Tab "Đánh giá" công khai (nhận xét kèm tên người đánh giá: phải che tên) | `[SAU]` |
| `admin` | Màn "Nhật ký hành động": che nội dung `SuaGhiChuKham`; hiện lại đánh giá (đổi ENUM nhật ký) | `[SAU]` |
| `followup` | Đọc `ngay_tai_kham_du_kien` | Scope sau |
| #9 `booking` đổi lịch | `markReplaced` không xoá hồ sơ (E9) | Khi lập kế hoạch #9 |
| Đại | Xác nhận hoặc đổi mặc định 45 giờ/tuần (Q13); thêm Iteration 7, 8 vào Project | Khi tạo issue |
| Nhóm | Trả lời Q1–Q25; sửa 2.4 và Figma (PLAN 4.5, 4.6, D2) | Trước cụm 1 (Q1–Q5, Q10, Q11; Q20 đã trả lời 14/11/2026) |
| payment và wallet (scope #7, Trung) | Khi migration của `giao_dich_thanh_toan`, `lich_su_hoan_tien`, `giao_dich_vi` vào `main`: xoá ba tên khỏi `NOT_YET_MIGRATED` ở `appointments/locking/lock-order.int-spec.ts` (không bắt buộc, test vẫn xanh; thu hẹp lỗ hổng "tên ba bảng chưa được kiểm"; TECH_DEBT `[đề xuất]` 145) | Khi scope #7 có migration |

## 8. Kế hoạch task P1 (14/11/2026; **đã duyệt và đã làm xong: kết quả thật ở 8.8**; 8.1 đến 8.7 giữ nguyên bản đã duyệt, kể cả dự đoán đột biến)

**Task P1 (#391, Epic #390)** · nhánh `feat/doctor-exam-p1` · nền `origin/main` = `08485c4` · mức **ĐẦY ĐỦ** · ước `[đề xuất]` **3 đến 3,5 giờ** (PLAN 6.2: 3 giờ; thêm ≈ 0,5 giờ vì phải sửa hai test dùng chung, mục 8.5) · PLAN xếp Iteration 6 (17/11), Đại làm sớm từ 14/11/2026 · Claude Sonnet 5.5 (lập kế hoạch và viết mã).
**Bước 0 đã kiểm (14/11/2026):** `git status` sạch; `HEAD...origin/main` = `0 0`; Node `22.23.4`; PR đang mở chỉ có dependabot #378 (không đụng migration); mọi worktree khác không có migration chưa merge; `migrations/index.ts` có 9 migration, **mới nhất `1793534400000`** (`tao-bang-moc-hoan-tien`); `docs/TECH_DEBT.md` lớn nhất trên `origin/main` là **139**; `AI_USAGE_LOG.md` lớn nhất là **109**.

### 8.1 Bảng ánh xạ MGK-01…MGK-09 (U = test đơn vị không DB, I = tích hợp MySQL thật)

| Mã | Ở file test nào | Loại | Cách chạy | Dùng lại của repo |
|---|---|---|---|---|
| MGK-01, MGK-02 (a) | `database/migration-source.spec.ts`, `describe` mới: từng câu DDL của migration **trùng chữ, cùng thứ tự** với `clinix_mysql.sql` (theo từng bảng và cả hai bảng) | U | `npm test` | `officialStatementsFor`, `normalizeStatement`, `targetTable`; nếp MHT-01/02 |
| MGK-01, MGK-02 (b) | `doctor/entities/exam-tables.int-spec.ts` (MỚI): đọc `information_schema` (kiểu, NULL, mặc định `bi_an`, khoá chính, đúng hai chỉ mục `PRIMARY` + `lich_hen_id`, khoá ngoại `*_ibfk_1`, tên hai CHECK); tập tên cột của entity = tập cột DB; ghi/đọc qua entity đúng kiểu | I | `test:int` (một file) | nếp MHT-04, MHT-08; `AdminFixtures` (có sẵn) |
| MGK-03 | `exam-tables.int-spec.ts`: `so_sao` 0, 6, −1 bị CHECK (lỗi **3819** + tên `chk_danh_gia_so_sao`), 1 và 5 nhận; bốn tổ hợp `(bi_an, ly_do_an)`: `(0,NULL)` và `(1,'x')` nhận, `(0,'x')` và `(1,NULL)` bị `chk_danh_gia_an`; biên: `ly_do_an = ''` với `bi_an = 1` DB **nhận** (chỉ service chặn chuỗi rỗng) | I | như trên | nếp MHT-06 (`rejected()`); errno đọc từ `driverError` ngay trong test (không thêm hàm vào `mysql-errors.ts`) |
| MGK-04 | `exam-tables.int-spec.ts`: hai dòng cùng `lich_hen_id` ở **mỗi** bảng ⇒ **1062** (tên khoá `ho_so_kham.lich_hen_id`, `danh_gia_bac_si.lich_hen_id`); khác lịch thì nhận; thêm: `lich_hen_id` không có ⇒ 1452, xoá lịch còn hồ sơ ⇒ 1451, thiếu `cap_nhat_lan_cuoi`/`thoi_diem_tao` bị từ chối, ba cột `text` NULL được (đúng Q2: bắt buộc chỉ ở service) | I | như trên | `isDuplicateKeyError`, `isForeignKeyError` |
| MGK-05 | `database/schema-parity.int-spec.ts` (có sẵn): **thêm hai tên bảng vào `MIGRATED_TABLES`** (nếu không, ca `SHOW CREATE TABLE` đỏ vì danh sách bảng khác) | I | `test:int` (một file) | ca `SHOW CREATE TABLE` giống hệt DB dựng từ file SQL (so cả COMMENT) |
| MGK-06 | `database/migrations.int-spec.ts` (có sẵn): ca mới `up → down → up`, `down` không để lại bảng, `up` lại cho bảng rỗng cùng `SHOW CREATE TABLE` | I | như trên | nếp MHT-09, MG-05; `revertAfter` |
| MGK-07, MGK-08 | `database/registry.spec.ts` (có sẵn, **không sửa**): file migration đăng ký đúng thứ tự timestamp, tên lớp kết thúc bằng timestamp, entity có mặt trong `ENTITIES` | U | `npm test` | chỉ chạy lại; đột biến M7 chứng minh nó canh được |
| MGK-09 | `exam-tables.int-spec.ts`, `describe` riêng: `COLUMN_TYPE` thật của `nhat_ky_hanh_dong.hanh_dong` có `SuaGhiChuKham`, `AnDanhGia`; `loai_doi_tuong` có `ho_so_kham`, `danh_gia_bac_si`; `HANH_DONG_NHAY_CAM` và `LOAI_DOI_TUONG_NHAT_KY` (`admin/entities/enums.ts`) chứa đủ bốn giá trị | I | như trên | `audit/test/audit-enum-parity.int-spec.ts` (MG-08) đã so **tập hợp** ba nguồn nhưng không khẳng định riêng bốn giá trị này; **không sửa file đó** (`audit/` của Trung). **Không migration ENUM** |

### 8.2 Thiết kế
- **Entity** (cạnh `yeu-cau-nghi-phep.entity.ts`, thuộc tính camelCase của cột, khoá chính **không** đặt tên `id`):
  - `HoSoKham` (`ho_so_kham`): `hoSoKhamId` (`bigint`, `string`), `lichHenId` (`bigint`, `string`; `@Index('lich_hen_id', …, { unique: true })`), `trieuChung`, `chanDoanSoBo`, `huongXuLy` (`text`, `string | null`), `ngayTaiKhamDuKien` (`date`, `string | null`; chú thích bẫy `DATE` như `yeu-cau-nghi-phep.entity.ts`), `capNhatLanCuoi` (`datetime`, `Date`, không mặc định).
  - `DanhGiaBacSi` (`danh_gia_bac_si`): `danhGiaBacSiId`, `lichHenId` (UNIQUE), `soSao` (`tinyint`, `number`), `nhanXet` (`text`, `string | null`), `biAn` (`boolean`, `default: false`), `lyDoAn` (`varchar(255)`, `string | null`), `thoiDiemTao` (`datetime`, `Date`); `@Check('chk_danh_gia_so_sao', …)` và `@Check('chk_danh_gia_an', …)`.
  - Khoá ngoại là cột thuần (khoá thật do migration tạo; `synchronize: false`), không `@ManyToOne` (đúng nếp `moc-hoan-tien.entity.ts`).
- **Migration** `1793620800000-tao-bang-ho-so-kham.ts` (một file, hai bảng), lớp `TaoBangHoSoKham1793620800000`, hằng `TAO_BANG_HO_SO_KHAM_SQL` gồm **8 câu chép nguyên văn** từ `clinix_mysql.sql`, đúng thứ tự file (xen kẽ hai bảng): `CREATE TABLE ho_so_kham` (dòng 395), `CREATE TABLE danh_gia_bac_si` (472), `ALTER TABLE … COMMENT` của từng bảng (719, 731), hai `ADD FOREIGN KEY` (814, 846), hai `ADD CONSTRAINT … CHECK` (952, 955). **Sinh chuỗi bằng script đọc file SQL** (không gõ tay: tránh lệch chữ ở các COMMENT dài; đã đối chiếu: ghi chú của hai bảng và ba COMMENT cột `danh_gia_bac_si` **giống nhau** giữa `clinix_mysql.sql` và `clinix.dbml`, không có lệch kiểu TECH_DEBT dòng 8).
  - **Lưu ý khác lời prompt:** `danh_gia_bac_si` có **ba** COMMENT cột (`lich_hen_id`, `so_sao`, `ly_do_an`) và mỗi bảng có một COMMENT bảng (`ALTER TABLE … COMMENT`), không chỉ "hai ghi chú dài"; câu `ALTER … COMMENT` phải có trong migration vì `schema-parity` so `SHOW CREATE TABLE`.
  - `down`: `DROP TABLE danh_gia_bac_si` rồi `DROP TABLE ho_so_kham` (khoá ngoại và chỉ mục nằm trong bảng; **không** bảng nào tham chiếu hai bảng này; FK đều trỏ sang `lich_hen`). Theo PLAN: `down` xoá hết **kể cả dữ liệu** (sau `down` rồi `up` hai bảng RỖNG); ghi hệ quả này ở chú thích đầu file như MHT-09. Việc có chặn `down` khi còn dòng hay không: câu hỏi (j).
- **Chọn timestamp (H13):** `1793534400000 + 86.400.000 = ` **`1793620800000`** (cộng đúng một "ngày" như nếp các file trước). Kiểm lại **ngay trước khi viết** bằng `git fetch` + `git show origin/main:apps/api/src/database/migrations/index.ts`. Nếu lúc đó có migration mới hơn thì chọn số lớn hơn nó. `registry.spec.ts` canh: tên lớp (13 chữ số cuối) phải bằng timestamp ở tên file và danh sách đăng ký phải đúng thứ tự tăng dần (M7).
- **Đăng ký ở file dùng chung `[ĐỤNG database]` (của Trung):** `database/entities.ts` thêm **2 dòng `import` + 2 phần tử mảng** (hai entity); `database/migrations/index.ts` thêm **1 dòng `import` + 1 phần tử mảng** ở CUỐI. PLAN và prompt ghi "đúng hai dòng" theo nghĩa **hai file, hai chỗ đăng ký**; số dòng thật là **6**: ghi chính xác ở mô tả PR.

### 8.3 Đột biến có kiểm soát (tối thiểu 6; **10 ca**, chỉ trên file MỚI của task; dự đoán ghi TRƯỚC khi chạy)

Cách làm: sao lưu file và ghi SHA-256, sửa đúng một chỗ, chạy các ca dự đoán là bắt (đơn vị `migration-source.spec.ts` luôn; `exam-tables.int-spec.ts`; `schema-parity` và `migrations.int-spec` khi dự đoán có), **khôi phục**, so SHA-256, cuối cùng `find … -name "*.mut"` = 0. Mỗi ca ghi "dự đoán ↔ thực tế"; ca nào lọt sẽ bị nêu rõ.

| M | Đột biến (file mới) | Dự đoán: ca nào bắt | Ca KHÔNG được bắt (dự đoán) |
|---|---|---|---|
| M1 | bỏ `UNIQUE` ở `lich_hen_id` của `ho_so_kham` (migration) | MGK-01a (chữ), MGK-01b (chỉ mục), MGK-04 (không còn 1062 ở `ho_so_kham`), MGK-05 | MGK-03, MGK-06 |
| M2 | `chk_danh_gia_so_sao` thành `BETWEEN 0 AND 5` | MGK-02a, MGK-03 (`so_sao = 0` lọt), MGK-05 | MGK-04, MGK-06 |
| M3 | bỏ khoá ngoại `danh_gia_bac_si → lich_hen` | MGK-02a, MGK-02b (FK + ca 1452), MGK-05 | MGK-03 |
| M4 | `so_sao tinyint` → `int` | MGK-02a, MGK-02b (`DATA_TYPE`), MGK-05 | MGK-03 (CHECK vẫn chặn 0 và 6) |
| M5 | `bi_an` `DEFAULT false` → `DEFAULT true` | MGK-02a, MGK-02b (mặc định), MGK-03 (chèn không truyền `bi_an` kèm `ly_do_an` NULL phải nhận), MGK-05 | MGK-04 |
| M6 | `down` không xoá `danh_gia_bac_si` | **chỉ MGK-06** (bảng còn sau `down`; `up` lại lỗi "table exists") | mọi ca khác (chỉ chạy `up`) |
| M7 | tên lớp mang timestamp `1793534300000` (nhỏ hơn migration cũ) | MGK-07 (`registry.spec.ts`), và `up` của `migrations.int-spec.ts` (thứ tự áp dụng ≠ sổ) | MGK-03, MGK-04 |
| M8 | `chk_danh_gia_an`: nhánh ẩn đổi `ly_do_an IS NOT NULL` thành `IS NULL` | MGK-02a, MGK-03 (tổ hợp `(1,'x')` bị từ chối, `(1,NULL)` lọt), MGK-05 | MGK-04 |
| M9 | `ho_so_kham.cap_nhat_lan_cuoi` bỏ `NOT NULL` | MGK-01a, MGK-01b (nullable), ca "thiếu `cap_nhat_lan_cuoi` bị từ chối", MGK-05 | MGK-03 |
| M10 | entity `DanhGiaBacSi`: `name: 'so_sao'` thành tên sai | MGK-02b (tập tên cột entity ≠ DB; ghi/đọc qua entity lỗi `ER_BAD_FIELD_ERROR`) | MGK-01a, MGK-02a (chỉ đọc migration), MGK-05 |

**Sống sót đã biết (nói trước):** bỏ `@Check`/`@Index` ở entity **không** làm test nào đỏ nếu tôi không thêm kiểm metadata (`synchronize: false`, decorator chỉ để mô tả); đề xuất cho MGK-02b một ca nhỏ so `dataSource.getMetadata(...)` (tên CHECK, UNIQUE) với `information_schema` để decorator không thành chữ chết (câu hỏi (c)).
**EXPLAIN không áp dụng:** task không có truy vấn ứng dụng, chỉ DDL và vài `INSERT` thử ràng buộc; chỉ mục duy nhất là khoá chính và UNIQUE `lich_hen_id` của DDL nguyên văn (không thêm chỉ mục). EXPLAIN M6, M7, M8, M14 làm ở X1 và các task B.

### 8.4 Chạy máy (mọi lệnh DB chỉ trên `clinix_dep1_test`; truyền `TEST_DB_NAME=clinix_dep1_test` ở dòng lệnh, **không** ghi `.env`)
- Không cần lượt nặng: viết kế hoạch, test và mã (chưa chạy); `npm test` (đơn vị) khi đã có mã; `lint`; `build`.
- Cần lượt nặng (hỏi phiên kiểm, đo RAM bằng lệnh riêng trước từng lệnh, từ 2,4 GB trở lên chạy tuần tự một tiến trình): `test:int` các file `exam-tables`, `schema-parity`, `migrations`, `audit-enum-parity` (và các lần đột biến); mỗi lần `test:int` còn chạy `globalSetup` = tạo lại `clinix_dep1_test` rồi áp **mọi** migration từ con số 0 (cũng là bằng chứng `up` đúng).
- **Đã đọc hạ tầng DB test trước khi chạy: có HAI file dùng DB KHÁC `TEST_DB_NAME`** (câu hỏi (h) bên dưới, **chưa chạy**): `schema-parity.int-spec.ts` cứng `clinix_ref_test` (DROP rồi CREATE) và `migrations.int-spec.ts` cứng `clinix_migration_test` (DROP rồi CREATE). `exam-tables.int-spec.ts` và `audit-enum-parity.int-spec.ts` chỉ dùng `TEST_DB_NAME`.
- `app.e2e-spec.ts` ca "AppModule nối đúng DB test" cứng `clinix_test` nên đỏ khi dùng DB riêng (TECH_DEBT 132), không phải lỗi của P1. Mức ĐẦY ĐỦ của P1 không có route nên `test:e2e` không thêm bằng chứng: đề xuất chạy duy nhất `app.e2e-spec.ts` (bằng chứng `AppModule` nạp được hai entity mới) và nêu rõ ca 132 đỏ vì tên DB.

### 8.5 File dự kiến đổi (mới = M)
- **Mới:** `apps/api/src/doctor/entities/ho-so-kham.entity.ts`, `danh-gia-bac-si.entity.ts`, `exam-tables.int-spec.ts`; `apps/api/src/database/migrations/1793620800000-tao-bang-ho-so-kham.ts`.
- **Sửa file dùng chung `[ĐỤNG database]` (sáu dòng, mục 8.2):** `database/entities.ts`, `database/migrations/index.ts`.
- **Sửa test có sẵn (cần Đại duyệt, câu hỏi (c) và (k)):** `database/schema-parity.int-spec.ts` (thêm hai bảng vào `MIGRATED_TABLES`); `database/migrations.int-spec.ts` (thêm `EXAM_TABLES`, ca MGK-06; **sửa MHT-09**: ca này viết khi P6 là migration cuối nên khẳng định `revertAfter(P6)` trả `[]` và `up` lại trả đúng `[P6]`, sẽ **đỏ** khi có migration thứ mười; sửa theo mẫu TBLH-09: dùng `later` và `[P6, ...later]`, và bỏ hai bảng mới khỏi tập bảng phải còn sau khi hoàn tác); `database/migration-source.spec.ts` (thêm `describe` MGK-01/02a).
- **Tài liệu cùng PR:** `docs/features/doctor-exam/PLAN.md` (tick P1, trạng thái MGK-01…09; bỏ `[CHỜ Q10]` khi Đại chốt), `TRACKING.md` (cập nhật mục 1, 2, 3, 4, 5 và mục 8 này; mục 6 không đổi vì P1 không có số đo M), `docs/TECH_DEBT.md` **chỉ khi có lối tắt thật** (hiện chưa thấy; số kế tiếp `[đề xuất]` từ **142** (lúc lập kế hoạch ghi từ 143; phiên kiểm đổi ngày 14/11/2026 vì X3 giữ 140 và 141), kiểm lại trên `main`). **Không sửa** `docs/database/*` (DDL đã có), `AI_USAGE_LOG.md`, `appointments/**`, `search/**`, `admin/**`, `auth/**`, `rbac/**`, `audit/**`, `scheduling/**`, `router/`, `apps/web`, mọi migration đã có.

### 8.6 KHÔNG làm; rủi ro
- **Không làm:** route, service, module Nest (P3), audit và tầng khoá `6b` (P2), migration ENUM, đổi `docs/database/*`, seed, web.
- **Rủi ro:** (1) timestamp vượt mặt nếu có migration mới trước khi mở PR: kiểm lại và `git fetch` trước khi báo xong; (2) CHECK với kiểu `tinyint` và `bi_an` trên MySQL 8.4: chỉ khẳng định sau khi chạy (chưa đo); (3) ca "thiếu `cap_nhat_lan_cuoi` bị từ chối" phụ thuộc `sql_mode` nghiêm ngặt của MySQL test: đo ở lần chạy đầu, nếu không nghiêm thì bỏ ca và ghi lý do; (4) hai file test dùng DB cố định khác `TEST_DB_NAME` (8.4); (5) PR chạm file của Trung: báo Trung **trước** khi mở PR, Trung approve.

### 8.7 Câu hỏi cho Đại (mỗi câu kèm đề xuất; (a) đến (g) theo prompt, (h) đến (k) phát sinh khi đọc mã)
- **(a) Q10 và Q11 `[CHỜ Trung]`.** Sự thật đã ghi: Trung **đã approve PR #389** ngày 14/11/2026 và **không viết bình luận riêng**; tin Đại gửi Trung nêu "bạn comment hay approve trên PR là mình coi như đã xác nhận Q10 và Q11". **Đề xuất:** coi approve đó là xác nhận Q10 (P1 làm migration + entity ngoại lệ Q41), ghi vào mục 3.1 đúng chữ "Trung approve PR #389, không bình luận riêng; Đại coi đó là xác nhận theo tin đã gửi" (không viết "Trung xác nhận bằng lời"); **nhưng** nhắn Trung một câu xác nhận riêng cho Q10 trước khi mở PR P1 vì P1 sửa hai file `database/*` của Trung. Quyết định của Đại: coi approve là đủ, hay chờ Trung nhắn.
- **(b) MGK-09 thuộc P1 hay P2.** **Đề xuất: P1** (issue #391 và PLAN 6.2 liệt kê MGK-01…09; dòng P2 chỉ nhắc "kiểm lại ENUM bằng `SHOW COLUMNS` ở MGK-09" và danh sách ca của P2 ở 6.9 không có MGK-09; không mâu thuẫn). Không migration ENUM; ca nằm ở `exam-tables.int-spec.ts`, không sửa `audit/`.
- **(c) File test chứa MGK:** như bảng 8.1: **file int-spec mới** `doctor/entities/exam-tables.int-spec.ts` (một file cho cả hai bảng: tách hai file sẽ lặp phần dựng dữ liệu, `jscpd` quét cả `*.int-spec.ts`) + ba file có sẵn (`schema-parity`, `migrations`, `migration-source.spec.ts`). `migration-source.spec.ts` ngoài danh sách file prompt nêu: **xin duyệt thêm**; lùi lại là đặt MGK-01/02a vào `schema-parity.int-spec.ts` (mất chạy không DB). Xin duyệt thêm ca nhỏ so metadata entity ↔ `information_schema` (mục 8.3).
- **(d) Timestamp:** **`1793620800000`** (tên lớp `TaoBangHoSoKham1793620800000`), kiểm lại trước khi viết.
- **(e) Đột biến:** **10 ca** M1…M10 (mục 8.3), dự đoán đã ghi, khôi phục và so SHA-256, 0 file `*.mut`. Nếu Đại muốn gọn: giữ M1, M2, M5, M6, M7, M10.
- **(f) Giờ:** **3 đến 3,5 giờ** `[đề xuất]` (không tính thời gian chờ lượt chạy nặng).
- **(g) PR:** tiêu đề `feat(db): thêm bảng hồ sơ khám và đánh giá bác sĩ (doctor-exam P1)` (≈ 67 ký tự, scope `db` hợp lệ); thân PR: `Closes #391`, `Refs #390`, `[ĐỤNG database]` nêu `database/entities.ts` (+2 `import`, +2 phần tử) và `database/migrations/index.ts` (+1 `import`, +1 phần tử), và liệt kê ba test dùng chung được sửa; không `@Ten` trần.
- **(h) DB cố định: CẦN ĐẠI QUYẾT (theo luật của prompt, tôi dừng, chưa chạy gì).** `schema-parity.int-spec.ts` và `migrations.int-spec.ts` `DROP`/`CREATE` hai DB dùng chung tên cố định `clinix_ref_test` và `clinix_migration_test` (cả hai kết thúc `_test`, do `assertTestDatabaseName` ép), **không** theo `TEST_DB_NAME`. **Đề xuất (A):** Đại cho phép chạy hai file này đúng một lần mỗi đợt, **chỉ khi phiên kiểm cấp lượt nặng độc quyền** (không cửa sổ khác chạy cùng hai file vào lúc đó), vì hai DB chỉ chứa dữ liệu dựng lại mỗi lần chạy. Lựa chọn khác: (B) không chạy hai file này ở máy, để CI chạy (mất bằng chứng MGK-05, MGK-06 ở máy, vi phạm mức ĐẦY ĐỦ); (C) làm một PR riêng đổi hai tên DB thành suy ra từ `TEST_DB_NAME` (ngoài phạm vi P1, tôi không làm).
- **(i) Số hàng `AI_USAGE_LOG.md`:** prompt dự kiến **110** cho phiên P1, nhưng `PLAN.md` đầu file và mục 4 của TRACKING đã đặt **110** cho dòng "lập kế hoạch" (#389) chưa ghi (`origin/main` mới có tới 109). **Đề xuất:** dòng 110 giữ cho đúng ý Đại nêu ở prompt (P1), dòng lập kế hoạch đổi thành `[đề xuất]` 111; tôi sửa chữ ở TRACKING mục 4 cho khớp nhưng **không sửa `AI_USAGE_LOG.md`**. Đại xác nhận số nào.
- **(j) `down` khi còn dữ liệu:** PLAN nói `down` xoá hai bảng, không nhắc chặn. **Đề xuất:** làm đúng PLAN (không chặn, ghi hệ quả "mất hồ sơ khám và đánh giá khi `down`" ở chú thích đầu migration, như MHT-09); không thêm dòng TECH_DEBT vì dữ liệu mẫu. Nếu Đại muốn chặn như P7 (ném lỗi khi còn dòng) thì là quyết định mới ngoài PLAN: xin chỉ thị.
- **(k) Sửa ba test dùng chung** (`schema-parity`, `migrations` gồm sửa MHT-09, `migration-source.spec.ts`): bắt buộc để CI không đỏ vì migration thứ mười (MHT-09) và danh sách bảng; xin Đại duyệt phạm vi này, ghi ở mô tả PR (file `database/*` thuộc phần của Trung).

**`[cần điền]`:** xác nhận của Trung cho Q10 (hỏi (a)); số hàng AI log (hỏi (i)). **`[đề xuất]`:** timestamp, danh sách 10 đột biến, ước giờ, tên và vị trí file test, TECH_DEBT từ 142 (lúc lập kế hoạch ghi 143; đã đổi như ở 8.5).

### 8.8 Kết quả P1 (14/11/2026; đã chạy thật trên trạng thái cuối)

**Câu trả lời đã nhận (8.7):** (a) Q10, Q11: coi Trung approve PR 389 là xác nhận, ghi đúng sự thật ở mục 3.1; Đại tự nhắn Trung một câu riêng về Q10 trước khi mở PR (Đại xác nhận trực tiếp). (b) MGK-09 thuộc P1. (c), (k) Đại duyệt trực tiếp sửa cả ba test dùng chung (`schema-parity.int-spec.ts`, `migrations.int-spec.ts` gồm MHT-09, `migration-source.spec.ts`) và ca so metadata entity. (d) `1793620800000` (kiểm lại bằng `git fetch` ngay trước khi viết: `0 0`, migration mới nhất vẫn `1793534400000`). (e) 10 đột biến, chỉ trên file mới của task (sau đó thêm hai ca, xem dưới). (f) 3 đến 3,5 giờ. (g) tiêu đề và thân PR như 8.7. (h) Đại cho chạy `schema-parity` và `migrations` (DB cố định) đúng một lần mỗi lượt độc quyền. (i) không sửa `AI_USAGE_LOG.md`, nháp P1 là dòng **112** `[đề xuất]` (110 giữ cho dòng lập kế hoạch #389, 111 là X3). (j) làm đúng PLAN, `down` không chặn.

**Kết quả từng MGK** (mọi lệnh DB trên `clinix_dep1_test`, riêng `schema-parity` dùng thêm `clinix_ref_test` và `migrations` dùng `clinix_migration_test`, mỗi file một lần mỗi lượt):

| Mã | Ca (file) | Kết quả |
|---|---|---|
| MGK-01 | chữ DDL `ho_so_kham` (`migration-source.spec.ts`) + cột/chỉ mục/FK thật + entity khớp bảng + ghi/đọc qua entity (`exam-tables.int-spec.ts`) | Pass |
| MGK-02 | chữ DDL `danh_gia_bac_si` (`migration-source.spec.ts`) + cột/mặc định `bi_an`/chỉ mục/FK/hai CHECK thật (`exam-tables.int-spec.ts`) | Pass |
| MGK-03 | `so_sao` -1, 0, 6, 127 bị 3819 và 1, 5 nhận; bốn tổ hợp `(bi_an, ly_do_an)` cộng `bi_an = 2`; mặc định `bi_an`; biên `ly_do_an = ''` DB nhận (`exam-tables.int-spec.ts`) | Pass |
| MGK-04 | UNIQUE 1062 ở mỗi bảng; FK 1452 và 1451; NOT NULL 1048 và 1364; ba cột `text` NULL được (`exam-tables.int-spec.ts`) | Pass |
| MGK-05 | `SHOW CREATE TABLE` giống hệt DB dựng thẳng từ file SQL, cả hai bảng (`schema-parity.int-spec.ts`, 12/12) | Pass |
| MGK-06 | `up → down → up`, `down` xoá cả hai bảng kể cả khi còn dòng, `up` lại cho bảng rỗng cùng cấu trúc (`migrations.int-spec.ts`, 12/12; MHT-09 đã sửa vẫn Pass) | Pass |
| MGK-07 | thứ tự timestamp và tên lớp (`registry.spec.ts`, không sửa) **cộng ca mới** thuộc tính `name` trùng tên lớp và lớn hơn mọi migration đứng trước (`migration-source.spec.ts`) | Pass |
| MGK-08 | entity có trong `ENTITIES` (`registry.spec.ts`) | Pass |
| MGK-09 | `SHOW COLUMNS` thật và `enums.ts` có đủ `SuaGhiChuKham`, `AnDanhGia`, `ho_so_kham`, `danh_gia_bac_si`; DB nhận dòng nhật ký cho từng cặp (`exam-tables.int-spec.ts`); `audit-enum-parity.int-spec.ts` 4/4 | Pass |

**Số chạy thật (trạng thái cuối):** `exam-tables.int-spec.ts` 10/10; `audit-enum-parity.int-spec.ts` 4/4; `schema-parity.int-spec.ts` 12/12; `migrations.int-spec.ts` 12/12; `app.e2e-spec.ts` 2/3 (ca "AppModule nối đúng DB test" đỏ đúng dự kiến: nhận `clinix_dep1_test`, kỳ vọng cứng `clinix_test`, TECH_DEBT 132; `AppModule` nạp được hai entity mới). Không chạy toàn bộ `test:int` và `test:e2e` (xem rủi ro ở dưới). `npm test` (đơn vị) 261 file, 4.835 test Pass; `lint`, `tsc --noEmit` (gồm cả spec), `build` thoát 0; `prettier --check` sạch trên các file của task.
**Ba kỳ vọng chưa đo ở lần chạy đầu** ra **đúng như viết, không phải sửa kỳ vọng:** `bi_an` là `tinyint(1)` mặc định `'0'` và `so_sao` là `tinyint`; thiếu `cap_nhat_lan_cuoi` hay `thoi_diem_tao` bị lỗi 1364 (`sql_mode` nghiêm); `SHOW COLUMNS ... LIKE ?` nhận tham số.
**Không chạy:** `test:int` và `test:e2e` đầy đủ (chỉ các file liên quan, ghi ở trên; CI chạy toàn bộ), EXPLAIN (không áp dụng), `schema-parity` cho đột biến ngoài M1 (phép Đại: một lần mỗi lượt, đã dành cho M1).

**Đột biến (dự đoán ghi TRƯỚC ở 8.3, nguyên văn, không sửa) ↔ thực tế.** Khôi phục bằng sao lưu ở thư mục tạm ngoài repo, **so SHA-256 khớp sau từng ca**, `git status` giữ nguyên 10 dòng, `find -name "*.mut"` = 0. "Đơn vị" = `migration-source.spec.ts` + `registry.spec.ts`; "exam" = `exam-tables.int-spec.ts`.

| M | Đột biến | Dự đoán (8.3) | Thực tế | Kết luận |
|---|---|---|---|---|
| M1 | bỏ UNIQUE `lich_hen_id` ở `ho_so_kham` | MGK-01a, 01b, 04, 05; không MGK-03, 06 | đơn vị: MGK-01 và ca "đúng 8 câu"; exam: MGK-01 (chỉ mục), entity↔DB, MGK-04 (không còn 1062); `schema-parity`: SHOW CREATE TABLE đỏ | bị bắt, đúng dự đoán |
| M2 | `chk_danh_gia_so_sao` thành 0..5 | MGK-02a, 03, 05; không MGK-04, 06 | đơn vị: MGK-02 và ca "đúng 8 câu"; exam: MGK-03 (`so_sao = 0` lọt) **và MGK-02** (kiểm CHECK qua `information_schema`, thêm so với dự đoán) | bị bắt; MGK-05 không chạy |
| M3 | bỏ khoá ngoại `danh_gia_bac_si` | MGK-02a, 02b (FK và 1452), 05; không MGK-03 | đơn vị: MGK-02 và "đúng 8 câu"; exam: MGK-02 (FK rỗng) và MGK-04 (1452 lọt) | bị bắt, đúng dự đoán; MGK-05 không chạy |
| M4 | `so_sao` tinyint thành int | MGK-02a, 02b (kiểu), 05; không MGK-03 | đơn vị: MGK-02 và "đúng 8 câu"; exam: chỉ MGK-02 (kiểu) | bị bắt, đúng dự đoán; MGK-05 không chạy |
| M5 | `bi_an` mặc định false thành true | MGK-02a, 02b, 03, 05; không MGK-04 | đơn vị: MGK-02 và "đúng 8 câu"; exam: **6/10 ca đỏ**: MGK-02, ghi/đọc entity, hai ca MGK-03, **và hai ca MGK-04** | bị bắt; **dự đoán lệch:** MGK-04 cũng đỏ vì mọi `INSERT` không truyền `bi_an` vi phạm `chk_danh_gia_an` |
| M6 | `down` không xoá `danh_gia_bac_si` | chỉ MGK-06; mọi ca khác lọt | `migrations.int-spec.ts`: **6/12 đỏ**: MGK-06 (`Table 'danh_gia_bac_si' already exists`) và MHT-09 (cũng gọi `down` của P1 qua `revertAfter`) cùng bốn ca sau đỏ dây chuyền vì DB còn bảng; exam 10/10 và đơn vị xanh | bị bắt, đúng dự đoán (chỉ ca có `down` bắt); ghi chú dây chuyền |
| M7 | **đổi thuộc tính `name`** (timestamp nhỏ hơn migration cũ) | MGK-07 (`registry.spec.ts`) và `up` của `migrations.int-spec.ts` | `registry.spec.ts` **XANH**, tức **LỌT** | **dự đoán SAI:** `registry.spec.ts` đọc tên LỚP (`Function.name`), không đọc thuộc tính `name` mà TypeORM dùng để xếp thứ tự; `up` của `migrations.int-spec.ts` không được chạy lại cho ca này (đã bắt ở mức đơn vị) |
| M7 thay thế | đổi tên LỚP ở file migration và ở import và đăng ký trong `index.ts` (hai dòng task thêm) | (đột biến thay thế, thêm sau khi M7 lọt; cùng ý "timestamp nhỏ hơn migration cũ") | `registry.spec.ts` đỏ ("đúng thứ tự thời gian, tên lớp kết thúc bằng timestamp"); ca MGK-07 mới cũng đỏ nhưng vì lý do phụ (`is not a constructor`) | bị bắt (MGK-07) |
| M11 | = M7 cũ (chỉ đổi thuộc tính `name`) chạy lại sau khi thêm ca MGK-07 mới | (thêm sau) | `registry.spec.ts` vẫn xanh; ca MGK-07 mới ở `migration-source.spec.ts` **đỏ** (`'TaoBangHoSoKham1793534300000'` khác `'TaoBangHoSoKham1793620800000'`) | khe hở của `registry.spec.ts` đã được ca mới bít cho migration của task; migration cũ chưa canh (TECH_DEBT `[đề xuất]` 143) |
| M8 | `chk_danh_gia_an` nhánh ẩn: `IS NOT NULL` thành `IS NULL` | MGK-02a, 03, 05; không MGK-04 | đơn vị: MGK-02 và "đúng 8 câu"; exam: chỉ MGK-03 (`chk_danh_gia_an`) | bị bắt, đúng dự đoán; MGK-05 không chạy |
| M9 | `cap_nhat_lan_cuoi` bỏ NOT NULL | MGK-01a, 01b, ca thiếu `cap_nhat_lan_cuoi`, 05; không MGK-03 | đơn vị: MGK-01 và "đúng 8 câu"; exam: MGK-01 (nullable) và MGK-04 (ca 1364) | bị bắt, đúng dự đoán; MGK-05 không chạy |
| M10 | entity `DanhGiaBacSi` sai tên cột `so_sao` | MGK-02b; không MGK-01a, 02a, 05 | đơn vị xanh; exam: entity↔DB và ghi/đọc qua entity (`Unknown column 'so_sao_x'`) | bị bắt, đúng dự đoán |

**Giới hạn đã biết (câu để chép vào thân PR):** Chưa có đột biến riêng cho việc bỏ `@Check`/`@Index` ở entity; phần này chỉ có ca "entity khớp bảng thật".

**Còn sống sót / chưa chứng minh:** (1) bỏ `@Check` hay `@Index` ở entity: đã có ca "entity khớp bảng thật" nên không còn là chữ chết, nhưng **chưa có đột biến riêng** cho nó (không nằm trong các ca đã dự đoán); (2) MGK-05 của đột biến ngoài M1 không chạy (phép một lần mỗi lượt đã dành cho M1; đã bị bắt bởi ca khác); (3) `registry.spec.ts` vẫn chưa canh thuộc tính `name` của 9 migration cũ (TECH_DEBT `[đề xuất]` 143).

**File đã đổi:** mới: `database/migrations/1793620800000-tao-bang-ho-so-kham.ts` (8 câu DDL sinh bằng script đọc `clinix_mysql.sql`), `doctor/entities/ho-so-kham.entity.ts`, `danh-gia-bac-si.entity.ts`, `exam-tables.int-spec.ts`; sửa `[ĐỤNG database]`: `database/entities.ts` (+4 dòng: 2 `import`, 2 phần tử) và `database/migrations/index.ts` (+2 dòng: 1 `import`, 1 phần tử); sửa ba test dùng chung (Đại duyệt): `schema-parity.int-spec.ts`, `migrations.int-spec.ts` (thêm MGK-06, sửa MHT-09 theo mẫu TBLH-09, thêm `TABLES_BEFORE_P6` và `TABLES_BEFORE_EXAM`), `migration-source.spec.ts`; tài liệu: `PLAN.md`, `TRACKING.md`, `TECH_DEBT.md` (hai dòng `[đề xuất]` 142, 143). Không sửa `docs/database/*`, `AI_USAGE_LOG.md`, mọi migration đã có, `audit/`, `appointments/`, `search/`, `admin/`.

**Rủi ro còn lại:** (1) `schema-parity`, `migrations` dùng DB cố định (TECH_DEBT `[đề xuất]` 142): hai cửa sổ cùng chạy sẽ giẫm nhau; (2) `test:int` và `test:e2e` đầy đủ chưa chạy ở máy (CI chạy); (3) H13: nếu migration khác vào `main` trước PR này với timestamp lớn hơn `1793534400000`, phải đổi timestamp và thứ tự đăng ký (kiểm lại bằng `git fetch` trước khi mở PR).

**Việc để lại (không phải của phiên này):** Đại nhắn Trung một câu riêng về Q10 và báo hai file `database/*` cùng ba test dùng chung trước khi mở PR (mô tả PR ghi `[ĐỤNG database]` đủ 6 dòng, nêu rõ "hai dòng" ở PLAN nghĩa là hai file); Đại ghi `AI_USAGE_LOG.md` dòng 112 `[đề xuất]`; Đại quyết xoá ba DB tạm `clinix_dep1_test`, `clinix_ref_test`, `clinix_migration_test` (chưa xoá); Đại tự commit, push, mở PR.

## 10. Kế hoạch task P2 (14/11/2026; **đã duyệt và đã làm xong: kết quả thật ở 10.9**; 10.1 đến 10.8 giữ nguyên bản đã duyệt, kể cả dự đoán đột biến; Q11 `[CHỜ Trung]` ghi nhận ở mục 3.1)

**Task P2 (#392, Epic #390)** · nhánh `feat/doctor-exam-p2` · nền `origin/main` = `8bbf2f4` · mức **ĐẦY ĐỦ** · ước `[đề xuất]` **3 đến 3,5 giờ** (PLAN 6.2: 3 giờ; thêm ≈ 0,5 giờ cho file int-spec của `lock-order`, mục 10.1) · Claude Sonnet 5.5 (lập kế hoạch và viết mã). Mục này đánh số **10** vì P3 (cửa sổ khác) dự kiến dùng mục 9; đổi lại khi gộp nếu P3 đổi số.
**Bước 0 đã kiểm (14/11/2026):** `git status` sạch; `HEAD...origin/main` = `0 0`; Node `22.23.4`; PR đang mở chỉ có dependabot #378; `origin/main` thấy `8bbf2f4` (X3) và `0778748` (P1); `.env`, `node_modules` (gốc, `apps/api`, `apps/web`) có; không nhánh nào khác (B15, B16a, B18, X3, P3) đụng `audit/` hay `appointments/locking/`; `docs/TECH_DEBT.md` lớn nhất trên `origin/main` là **143** và `AI_USAGE_LOG.md` lớn nhất là **112** ⇒ số `[đề xuất]` của P2: TECH_DEBT **144** (P3 không thêm dòng nợ nên 144 để trống; lúc lập kế hoạch P2 đề xuất 145, phiên kiểm đổi 14/11/2026), AI log **114** (P3 dự kiến 113). Mọi file mã và docs liên quan đều CRLF: sửa bằng script giữ CRLF.

### 10.1 Bảng ánh xạ HDK-05, HDK-09, TDK-04, TDK-05 (U = đơn vị không DB, I = tích hợp MySQL thật)

| Mã | Ở file nào | Loại | Cách chạy | Dùng lại của repo |
|---|---|---|---|---|
| HDK-05 (a) | `appointments/locking/lock-order.spec.ts`: **sửa LOK-01** (thêm hạng `6b`, xem 10.3) và thêm `describe` HDK-05: vị trí và bảng của `6b`; chuỗi HSK `lich_hen → ho_so_kham → nhat_ky_hanh_dong`, DGB `lich_hen → danh_gia_bac_si`, KDD `danh_gia_bac_si → nhat_ky_hanh_dong`, HTK `lich_hen → thong_bao` qua `findLockOrderViolation` = `null`; **đảo thứ tự** (`ho_so_kham → lich_hen`, `nhat_ky_hanh_dong → danh_gia_bac_si`, `giao_dich_thanh_toan → ho_so_kham`…) trả đúng `{ index, truoc, sau }`; hai bảng cùng hạng `6b` theo thứ tự nào cũng `null` | U | `npm test` (một file) | LOK-02, LOK-03, LOK-04 có sẵn **giữ nguyên** |
| HDK-05 (b) | `appointments/locking/lock-order.int-spec.ts` (**MỚI, cần duyệt, câu (g)**): mọi tên bảng của `LOCK_ORDER` tồn tại ở `information_schema` của DB test (tên gõ sai thì `findLockOrderViolation` **bỏ qua** bảng đó và mọi chuỗi qua giả) | I | `test:int` (một file) | `createTestDataSource`, `readTestDbSettings` |
| HDK-05 (c) | Chuỗi khoá bằng **câu SQL thật** của HSK, DGB, KDD: **không làm ở P2** (chưa có service, nên chưa có câu SQL thật); thuộc B2, B6, B8 qua `appointments/testing/lock-chain.ts` (E5) | I | B2, B6, B8 | — |
| HDK-09 | `audit/test/audit-exam-validation.spec.ts` (**MỚI**): hai hành động hợp lệ; payload sai (khoá thừa và thiếu, `truoc`/`sau` lệch khoá, khoá ngoài bốn trường kể cả `ho_ten`, `so_dien_thoai`, `email`, chuỗi 2.001 ký tự, lý do 9 ký tự, `bi_an` sai, `bac_si_id` sai, `branchId` `null`, `targetType` sai) ⇒ `AUDIT_ENTRY_INVALID`; `HienDanhGia`, `XoaGhiChuKham` ⇒ `AUDIT_ACTION_UNSUPPORTED`; lỗi không chứa nội dung hồ sơ (H11) | U | `npm test` (một file) | ca `DoiQuyen` ⇒ `AUDIT_ACTION_UNSUPPORTED` và C2-03 có sẵn chạy lại; nếp describe riêng của B14 |
| TDK-04 | `audit/test/audit-exam.int-spec.ts` (**MỚI**): `AuditService.record` THẬT trong giao dịch, lịch hẹn + `ho_so_kham` dựng bằng `AdminFixtures`, `branchId` = chi nhánh của lịch, `targetId` = `ho_so_kham_id`; đọc lại `nhat_ky_hanh_dong`: cột đúng, `chi_tiet_thay_doi` đúng từng khoá, tối đa 4 khoá, **không chứa tên, SĐT, email** của bệnh nhân và bác sĩ; payload tối đa (4 khoá × 2.000 ký tự × hai phía, có dấu, xuống dòng, emoji) khứ hồi nguyên vẹn qua cột `json` (chỉ kiểm lại, **không thay M10 của X1**); payload sai ⇒ không dòng nào và giao dịch ngoài hoàn tác | I | `test:int` (một file) | `useIntegrationHooks`, `AdminFixtures`; nếp C2-02/03/04 của `audit.int-spec.ts` |
| TDK-05 | cùng `audit-exam.int-spec.ts`: `AnDanhGia` (actor là Quản trị viên; `targetId` = `danh_gia_bac_si_id`); `truoc`/`sau`/`ly_do`/`bac_si_id` đúng; `bi_an` đọc lại là boolean (không 0/1); `bac_si_id` BIGINT dạng chuỗi (> 2^53) giữ nguyên; **không chứa nhận xét, tên, SĐT, email** | I | như trên | như trên |
| (dùng chung) | `audit/testing/exam-audit-entries.ts` (**MỚI**): hai hàm dựng entry hợp lệ cho spec và int-spec (tránh lặp, `jscpd` quét cả `*.int-spec.ts`). **Không** sửa `audit-fixtures.ts` và `audit.int-spec.ts` (đang khẳng định "đủ 15 action"; tiền lệ B14: hành động mới có describe riêng) | — | — | — |

### 10.2 Thiết kế phía `audit/` `[ĐỤNG audit]` (hai file mã sửa; test là file mới)

- **Cách tổ chức (đã đối chiếu với mã thật):** `validateChanges` là một `switch (entry.action)`; case cuối hiện là `OverrideLichHen` rồi tới `default` (ném `AUDIT_ACTION_UNSUPPORTED`). P2 thêm **hai `case` giữa `OverrideLichHen` và `default`, mỗi hành động một khối riêng** (PLAN 6.7), không đổi dòng nào của khối xử lý 16 hành động cũ; hằng và hàm trợ giúp đặt ngay trước `validateChanges`. Hồi quy = chạy toàn bộ `audit/test/*` (kể cả `audit-enum-parity`).
- **`audit-entry.ts`:** `ChangeMap` thêm `SuaGhiChuKham: { truoc: ExamRecordFacts; sau: ExamRecordFacts }` (`ExamRecordFacts` = `Partial<Record<'trieu_chung' | 'chan_doan_so_bo' | 'huong_xu_ly' | 'ngay_tai_kham_du_kien', string | null>>`) và `AnDanhGia: { truoc: { bi_an: false }; sau: { bi_an: true }; ly_do: string; bac_si_id: string }`; `TargetMap` thêm `SuaGhiChuKham: 'ho_so_kham'`, `AnDanhGia: 'danh_gia_bac_si'`. Chú thích ngắn ở `SuaGhiChuKham`: **mang nội dung khám (dữ liệu sức khoẻ, Q15, L3); màn "Nhật ký hành động" `[SAU]` phải che hoặc chỉ cho Toàn hệ thống** (chỉ chú thích; dòng TECH_DEBT của việc này nằm ở B2).
- **Luật `SuaGhiChuKham`:** `targetType = ho_so_kham`; `branchId` **bắt buộc** (chi nhánh của lịch, như `OverrideLichHen`); `changes` chỉ có `truoc`, `sau`; mỗi bên là đối tượng 1 đến 4 khoá, **tập khoá hai bên bằng nhau** (so sau khi sắp, nếp `configChanges`) và ⊂ bốn trường; giá trị `string | null`, `length ≤ 2.000` (đơn vị UTF-16, như `String.length` ở B14); khoá ngoài bốn trường (kể cả `ho_ten`, `so_dien_thoai`, `email`, dạng camelCase) ⇒ `AUDIT_ENTRY_INVALID`. Hai luật chặt hơn chữ của issue: câu (h).
- **Luật `AnDanhGia`:** `targetType = danh_gia_bac_si`; `branchId` bắt buộc; `changes` đủ và chỉ có `truoc`, `sau`, `ly_do`, `bac_si_id`; `truoc = { bi_an: false }`, `sau = { bi_an: true }` (đúng boolean; dùng lại `snapshots`); `ly_do` là chuỗi, `trim().length ≥ 10` và `length ≤ 255`; `bac_si_id` BIGINT dạng chuỗi (hàm `id` có sẵn).
- **Mã lỗi:** **không thêm mã mới.** Sai hình dạng ⇒ `AUDIT_ENTRY_INVALID`; hành động ngoài tập ⇒ `AUDIT_ACTION_UNSUPPORTED` (nhánh `default` giữ nguyên); chuỗi giống bí mật ⇒ `AUDIT_SENSITIVE_DATA` do `copyAuditJson` (xem rủi ro 1). Giới hạn `[đề xuất]` (2.000; 10; 255; chờ Q2, Q8) là hằng cục bộ có tên và chú thích: câu (b).

### 10.3 Thiết kế tầng khoá `6b` `[ĐỤNG booking]`

- `LockTierId` thêm `'6b'`; `LOCK_ORDER` thêm đúng một hạng `{ tang: '6b', bang: ['ho_so_kham', 'danh_gia_bac_si'] }` **giữa** hạng `lich_hen` (tầng 6) và `giao_dich_thanh_toan` (tầng 7). Không đổi hạng cũ, không thêm chu trình; hai bảng cùng một hạng (không luồng nào xin cả hai). `RANK_OF` và `findLockOrderViolation` tính theo vị trí trong mảng nên **không cần sửa**. Thêm một dòng `6b` vào bảng chú thích đầu file (chỉ chú thích).
- **Ca LOK đỏ có chủ đích (luật "thêm `6b` làm ca LOK nào đỏ thì dừng hỏi", nên nêu trước):** chỉ `LOK-01` (`it` đầu: liệt kê cứng danh sách tầng, `slice(0, 7)` và `slice(7)`) sẽ đỏ vì thêm một hạng. Đây là **bảng liệt kê, không phải hành vi**: sửa danh sách mong đợi (thêm `'6b'`, `slice(0, 8)`, `slice(8)`), không sửa kết quả của LOK-02, LOK-03, LOK-04 và các chuỗi cũ. Đã đọc: không test nào khác trong `appointments/` khẳng định số hạng hay vị trí hạng (các int-spec chỉ gọi `findLockOrderViolation`). Xin xác nhận: câu (f).
- Hồi quy: chạy `lock-order.spec.ts`, `appointments/architecture.spec.ts` (quét mã nguồn theo `LICH_HEN_FORBIDDEN_LOCK_COLUMNS`; chú thích của nó nói rõ không bắt tên bảng đứng một mình) và toàn bộ `npm test`.

### 10.4 Đột biến có kiểm soát (**12 ca**, tối thiểu 6; chỉ trên đoạn P2 thêm hoặc sửa; **dự đoán ghi TRƯỚC khi chạy**)

Cách làm (nếp P1): sao lưu file ra thư mục tạm ngoài repo và ghi SHA-256, sửa đúng một chỗ, chạy các ca dự đoán là bắt, **khôi phục**, so SHA-256, cuối cùng `find … -name "*.mut"` = 0; mỗi ca ghi "dự đoán ↔ thực tế".

| M | Đột biến | Dự đoán: ca nào bắt | Dự đoán: KHÔNG bắt |
|---|---|---|---|
| M1 | `SuaGhiChuKham`: bỏ so sánh tập khoá `truoc`/`sau` | HDK-09 (ca lệch khoá, cả hai chiều) | TDK-04, TDK-05, HDK-05 |
| M2 | `SuaGhiChuKham`: trần 2.000 thành 2.001 | HDK-09 (ca 2.001 ký tự bị từ chối) | TDK-04 (payload tối đa vẫn 2.000) |
| M3 | `SuaGhiChuKham`: bỏ kiểm "⊂ bốn trường" (cho khoá thừa) | HDK-09 (`ho_ten`, `so_dien_thoai`, `email`, camelCase), TDK-04 (ca payload sai) | HDK-05, TDK-05 |
| M4 | `AnDanhGia`: bỏ cận dưới 10 của `ly_do` | HDK-09 (9 ký tự; 9 ký tự có khoảng trắng đệm) | TDK-04, HDK-05 |
| M5 | `AnDanhGia`: cho `truoc.bi_an` nhận `true` (bỏ `before === false`) | HDK-09 | TDK-05 (dữ liệu hợp lệ), HDK-05 |
| M6 | `AnDanhGia`: `targetType` `danh_gia_bac_si` thành `ho_so_kham` | HDK-09, TDK-05 (record ném lỗi) | TDK-04, HDK-05 |
| M7 | `TargetMap`: bỏ dòng `SuaGhiChuKham` (chỉ ở **kiểu**) | **chỉ `tsc --noEmit`** (đỏ ngay ở `audit-entry.ts`); **vitest xanh ⇒ lọt** (vitest không kiểm kiểu) | mọi ca vitest |
| M8 | `SuaGhiChuKham`: cho `branchId` nhận `null` (bỏ `id(branch)`) | HDK-09 (`branchId` `null`) | TDK-04, TDK-05 |
| M9 | `lock-order.ts`: đặt `6b` SAU hạng `giao_dich_thanh_toan` | HDK-05 (a) (LOK-01 mới và ca `giao_dich_thanh_toan → ho_so_kham` hết vi phạm) | HDK-05 (b), LOK-02, LOK-03, LOK-04 |
| M10 | `lock-order.ts`: đảo hạng `6b` lên TRƯỚC `lich_hen` | HDK-05 (a) (chuỗi HSK `lich_hen → ho_so_kham` thành vi phạm; LOK-01) | HDK-05 (b), LOK-02, LOK-04 |
| M11 | `lock-order.ts`: gộp `ho_so_kham` và `danh_gia_bac_si` vào CHUNG hạng với `lich_hen` | HDK-05 (a) (ca đảo `ho_so_kham → lich_hen` thành `null` vì cùng hạng; LOK-01) | HDK-05 (b), LOK-03 |
| M12 | `lock-order.ts`: gõ sai tên `ho_so_kham` thành `ho_so_khams` **và** sửa luôn danh sách mong đợi ở `lock-order.spec.ts` (mô phỏng "gõ sai cả hai chỗ") | **chỉ `lock-order.int-spec.ts`** (không có bảng đó ở `information_schema`); toàn bộ unit xanh. Cần duyệt câu (g) | mọi ca đơn vị |

**Sống sót đã biết (nói trước):** M7 (kiểu) chỉ `tsc` bắt: giữ `tsc --noEmit` trong lệnh bắt buộc. Nếu Đại muốn gọn: giữ M1, M2, M3, M4, M7, M9, M10 (7 ca).
**EXPLAIN không áp dụng:** P2 chỉ thêm hằng, hàm thuần, kiểu và validation; **không truy vấn mới** (câu `INSERT` của `AuditRepository` có sẵn, không đổi).

### 10.5 Chạy máy (mọi lệnh DB chỉ trên `clinix_dep2_test`: `TEST_DB_NAME=clinix_dep2_test` ở dòng lệnh, **không** ghi `.env`)

- **Không cần lượt nặng:** viết kế hoạch, test và mã (chưa chạy). Khi RAM trống ≥ 2,4 GB (đo bằng lệnh riêng): `npm test` (file audit và lock-order trước, toàn bộ sau), `tsc --noEmit`, `lint`, `prettier --check`, `build`, đột biến đơn vị (M1, M2, M4, M5, M7, M8, M9, M10, M11).
- **Cần lượt nặng (hỏi phiên kiểm trước đợt đầu; một tiến trình, tuần tự):** `test:int` các file `audit-exam.int-spec.ts`, `lock-order.int-spec.ts`, `audit.int-spec.ts`, `audit-enum-parity.int-spec.ts` (hồi quy) và các đột biến cần DB (M3, M6, M12). Mỗi lần `test:int` còn chạy `globalSetup` = tạo lại `clinix_dep2_test` rồi áp mọi migration từ con số 0. **Đề xuất thêm một lần ở cuối** (câu (i)): chín int-spec của `booking` dùng `findLockOrderViolation` (đã đếm bằng grep: bảy file gọi trực tiếp là `appointment-cancellation.service`, `appointment-transition.service`, `check-in`, `create-appointment.service`, `mark-no-show`, `slot-hold.service`, `bookability.reader`; hai file chỉ qua `lock-chain.ts` là `confirm-paid`, `complete-appointment`), vì `lock-order.ts` là file của booking. Hai spec đơn vị `mark-no-show.spec.ts`, `check-in.spec.ts` nằm trong `npm test`.
- **Không chạy:** `schema-parity`, `migrations`, `upload` (P2 không có migration), `test:e2e` (không route; P1 đã chứng minh `AppModule` nạp bằng `app.e2e-spec.ts`, ca "AppModule nối đúng DB test" đỏ vì tên DB, TECH_DEBT 132, không phải lỗi của task), `jscpd` và `gitleaks` (CI đo). Không `SET GLOBAL`, không đụng DB `clinix` và `clinix_test`, không `docker compose down -v`.

### 10.6 File dự kiến đổi (mới = M)

- **Sửa `[ĐỤNG audit]` (Trung):** `apps/api/src/audit/audit-entry.ts` (≈ +25 dòng), `audit-validation.ts` (≈ +70 dòng). **Mới trong `audit/`:** `test/audit-exam-validation.spec.ts`, `test/audit-exam.int-spec.ts`, `testing/exam-audit-entries.ts`.
- **Sửa `[ĐỤNG booking]` (Đại):** `apps/api/src/appointments/locking/lock-order.ts` (≈ +6 dòng), `lock-order.spec.ts` (≈ +60 dòng, gồm sửa LOK-01). **Mới (cần duyệt, (g)):** `lock-order.int-spec.ts` (≈ 30 dòng).
- **Tài liệu cùng PR:** `PLAN.md` (tick P2; ghi trạng thái HDK-05, HDK-09, TDK-04, TDK-05), `TRACKING.md` (mục 1, 2, 4, 5, 7 và mục 10 này, thêm 10.9 kết quả), `docs/TECH_DEBT.md` **chỉ khi có lối tắt thật** (chưa thấy; số `[đề xuất]` 144). Số dòng thật của mỗi file điền ở mô tả PR.
- **Không sửa:** `docs/database/*`, mọi migration, `AI_USAGE_LOG.md`, `doctor/**`, `search/**`, `admin/**`, `auth/**`, `rbac/**`, `scheduling/**`, `router/`, `apps/web`, và các file khác của `audit/` và `appointments/` (kể cả `audit-fixtures.ts`, `audit.int-spec.ts`, `audit-json.ts`).

### 10.7 KHÔNG làm; rủi ro

- **Không làm:** route, service ghi nhật ký (B2 và B8 là nơi gọi `AuditService.record`), migration (ENUM đã đủ; P1 đã kiểm bằng MGK-09), dòng TECH_DEBT về nội dung khám trong nhật ký (của B2), màn "Nhật ký hành động" (che nội dung `SuaGhiChuKham`; `[SAU]`), sửa PLAN booking 5.3 (D2), `AuditError` mới.
- **Rủi ro 1 (đã đọc `audit-json.ts`, `sanitize.ts`):** `copyAuditJson` chạy `redactText` trên **mọi chuỗi** của payload **trước** `validateChanges`. Triệu chứng hay chẩn đoán có dạng bí mật (`token=…`, chuỗi hex 64 ký tự, `Bearer …`, `hash: …`) làm `record` ném `AUDIT_SENSITIVE_DATA`, và B2 sẽ hoàn tác cả lần lưu của bác sĩ. Bộ che **không** che SĐT hay email. Cách xử lý: P2 ghim hành vi bằng một ca (lỗi không chứa giá trị) và ghi cảnh báo vào mục 7 cho B2 (chặn ở DTO TRƯỚC giao dịch bằng cùng bộ kiểm, trả 400 có mã ổn định; nếp OVR-05 của B14); **không đổi `audit-json.ts`**.
- **Rủi ro 2:** hai nguồn giới hạn (DTO của B2, B8 và luật của audit): nếu Q2 hay Q8 đổi giới hạn mà audit không đổi thì nội dung vượt trần bị `AUDIT_ENTRY_INVALID` ngay trong giao dịch. Giảm bằng câu (b): hằng có tên và được xuất để B2, B8 viết ca buộc "trần của DTO ≤ trần của audit".
- **Rủi ro 3:** gộp xung đột. `audit-validation.ts` (khối cuối `switch`) và `TRACKING.md` (cuối file) với P3 ở cửa sổ khác: `git fetch` và `git log origin/main -- <file>` trước khi báo xong; gộp `main` rồi chạy lại.
- **Rủi ro 4:** HDK-05 chỉ đạt U và I mức bảng tên (a), (b); phần chuỗi câu SQL thật (c) để B2, B6, B8. Khi báo cáo sẽ ghi đúng như vậy, không ghi "HDK-05 Pass" khơi khơi.

### 10.8 Câu hỏi cho Đại (mỗi câu kèm đề xuất; (a) đến (e) theo prompt, (f) đến (i) phát sinh khi đọc mã)

- **(a) Q11 (`[ĐỤNG audit]` của Trung và `lock-order.*` của Đại).** **Đề xuất:** Đại nhắn Trung nêu đúng các file (`audit-entry.ts`, `audit-validation.ts` và ba file test mới trong `audit/`) trước khi mở PR; Trung approve sau khi đọc mô tả `[ĐỤNG audit]` là đủ (quy ước đã dùng ở #389, #418). Sự thật đã ghi ở mục 3.1: Q11 mới là ghi nhận từ approve #389, chưa phải Trung xác nhận bằng lời.
- **(b) Giới hạn `[đề xuất]` (2.000; 10 đến 255; chờ Q2, Q8).** **Đề xuất:** hằng cục bộ có tên ở `audit-validation.ts` (`EXAM_TEXT_MAX`, `HIDE_REASON_MIN`, `HIDE_REASON_MAX`) kèm chú thích `[đề xuất]`, **và xuất** một đối tượng `AUDIT_EXAM_LIMITS` (một dòng thêm vào bề mặt công khai của `audit-validation.ts`) để B2, B8 buộc DTO ≤ trần audit. Lựa chọn khác: chữ cứng trong luật như `255` ở B14 (ít dòng hơn, nhưng rủi ro 2 không có chỗ bắt).
- **(c) Đột biến.** **Đề xuất:** 12 ca M1…M12 (mục 10.4), dự đoán đã ghi; gọn: 7 ca (M1, M2, M3, M4, M7, M9, M10).
- **(d) Giờ.** **Đề xuất:** 3 đến 3,5 giờ (không tính thời gian chờ lượt nặng).
- **(e) PR.** Tiêu đề `feat(audit): thêm nhật ký sửa hồ sơ khám và ẩn đánh giá (doctor-exam P2)` (72 ký tự, scope `audit` hợp lệ); thân: `Closes #392`, `Refs #390`, `[ĐỤNG audit]` và `[ĐỤNG booking]` kèm số dòng thật mỗi file, không `@Ten` trần.
- **(f) `LOK-01` phải sửa** (mục 10.3): đây là ca duy nhất của `booking` đỏ vì thêm `6b`, và nó đỏ do **bảng liệt kê**, không do hành vi. **Đề xuất:** sửa danh sách mong đợi (không đổi LOK-02, LOK-03, LOK-04). Theo luật của prompt tôi **dừng ở đây** cho tới khi Đại xác nhận.
- **(g) File mới ngoài danh sách đã nêu:** `appointments/locking/lock-order.int-spec.ts` (kiểm tên bảng thật; chống lỗi "gõ sai tên bảng khiến mọi chuỗi qua giả"). **Đề xuất:** làm (≈ 30 dòng, một ca, cùng lượt `test:int` với TDK-04). Nếu không: HDK-05 chỉ có loại U và M12 bỏ.
- **(h) Hai luật chặt hơn chữ của issue ("`string | null` ≤ 2.000"), cùng lý do thu nhỏ dữ liệu của Q15:** (1) mỗi khoá của `SuaGhiChuKham` phải thật sự đổi (`truoc` ≠ `sau`): khoá không đổi sẽ đưa nội dung khám không cần thiết vào nhật ký; (2) `ngay_tai_kham_du_kien` chỉ nhận `null` hoặc ngày `YYYY-MM-DD` có thật (dùng `calendarDate` có sẵn). Chuỗi rỗng `""` **được nhận** (không đặt luật về rỗng, để không buộc audit theo luật bắt buộc của Q2). **Đề xuất:** làm cả hai; nếu Đại muốn đúng chữ của issue thì bỏ (1) và (2).
- **(i) Chạy thêm chín int-spec của `booking` ở cuối** (mục 10.5; chúng chỉ gọi `findLockOrderViolation`, nên rủi ro thấp nhưng tốn lượt nặng). **Đề xuất:** có, một lần, nếu phiên kiểm cấp lượt; không thì bỏ và ghi rõ trong báo cáo.

**`[cần điền]`:** xác nhận của Trung cho Q11 (câu (a)); Q2, Q7, Q8 chưa trả lời nên 2.000 và 10 đến 255 vẫn là `[đề xuất]`. **`[đề xuất]`:** 12 đột biến, tên hằng, tên và vị trí file test mới, 3 đến 3,5 giờ, AI log **114**, TECH_DEBT **144** nếu có, mục TRACKING số 10.
**Thứ tự làm sau khi duyệt:** (1) test theo mã (HDK-09, HDK-05 đơn vị, rồi hai int-spec) và xem chúng đỏ đúng lý do; (2) mã `audit-entry.ts`, `audit-validation.ts`, `lock-order.ts`; (3) chạy `npm test`, `tsc`, `lint`, `build`; (4) lượt nặng; (5) đột biến; (6) tài liệu và báo cáo. **Dừng chờ duyệt, chưa viết mã.**

### 10.9 Kết quả P2 (14/11/2026; đã chạy thật trên trạng thái cuối)

**Câu trả lời đã nhận (10.8):** (a) Q11: Đại nhắn Trung nêu đúng các file (`audit-entry.ts`, `audit-validation.ts`, ba file test mới trong `audit/`, hai file `lock-order` và file mới `lock-order.int-spec.ts` của booking) trước khi mở PR; Trung approve sau khi đọc mô tả `[ĐỤNG audit]` và `[ĐỤNG booking]` là xác nhận cho P2 (quy ước #389, #418; sự thật: Q11 mới là ghi nhận từ approve #389, chưa phải Trung xác nhận bằng lời). (b) hằng có tên và xuất `AUDIT_EXAM_LIMITS`. (c) cả 12 đột biến. (d) 3 đến 3,5 giờ. (e) tiêu đề và thân PR như 10.8. (f) sửa danh sách LOK-01, giữ nguyên hành vi. (g) **Đại đồng ý trực tiếp** (câu hỏi trong cửa sổ P2, 14/11/2026): file mới `lock-order.int-spec.ts`. (h) **Đại đồng ý trực tiếp** cả hai luật chặt hơn issue (**quyết định mới ngoài PLAN**, mục 3.1); chuỗi rỗng nhận ở ba trường văn bản, `ngay_tai_kham_du_kien` nhận `null` hoặc ngày thật (`""` bị từ chối). (i) chạy chín int-spec của booking. Hai việc thêm của phiên kiểm: dòng TECH_DEBT 144 và cảnh báo mục 7 cho B2, B8. Phiên kiểm cấp lượt máy 14/11/2026 (6.470 MB trống lúc cấp).
**Sửa một khẳng định sai ở phần mở đầu mục 10:** "mọi file mã và docs liên quan đều CRLF" chỉ đúng cho `docs/`; file mã trong `apps/` là **LF** (`.gitattributes` đặt `eol=lf`). AI kiểm bằng `grep` với mẫu khớp mọi dòng nên báo nhầm; script sửa file tự nhận kiểu xuống dòng và dừng nếu lệch, nên không file nào bị đổi kiểu.

**Kết quả từng mã** (mọi lệnh DB trên `clinix_dep2_test`):

| Mã | Ca (file) | Kết quả |
|---|---|---|
| HDK-05 (a) | `lock-order.spec.ts` 39/39: LOK-01 sửa danh sách (thêm `6b`); `describe` HDK-05 mới (vị trí và bảng của `6b`; 9 chuỗi HSK, HSK lần đầu, DGB, KDD, HTK, hai bảng cùng hạng, lặp, từ ngoài vào, trước tầng 7 ⇒ `null`; 9 chuỗi đảo thứ tự ⇒ đúng `{ index, truoc, sau }`); LOK-02, LOK-03, LOK-04 không đổi | Pass |
| HDK-05 (b) | `lock-order.int-spec.ts` 1/1: tên bảng của `LOCK_ORDER` là bảng thật. **Lệch kế hoạch 10.1:** DB đã áp mọi migration thiếu đúng ba bảng tầng 7 (`giao_dich_thanh_toan`, `lich_su_hoan_tien`, `giao_dich_vi`; payment và wallet, scope #7, chưa có migration; lần chạy đầu đỏ 1/1 vì giả định "mọi bảng có thật" sai), nên ca miễn ĐÍCH DANH ba bảng này; mọi bảng khác thiếu (kể cả `ho_so_kham`, `danh_gia_bac_si`, hay tên gõ sai) làm ca đỏ. Kiểm lỏng có chủ đích để PR của payment không đỏ chéo; TECH_DEBT `[đề xuất]` 145 | Pass |
| HDK-05 (c) | chuỗi khoá bằng câu SQL THẬT của HSK, DGB, KDD | **Chưa làm ở P2** (chưa có service, chưa có câu SQL thật); thuộc B2, B6, B8 qua `appointments/testing/lock-chain.ts` (E5) |
| HDK-09 | `audit-exam-validation.spec.ts` 62 ca: hằng giới hạn; `SuaGhiChuKham` (nhận 1 đến 4 khoá, null và ngày, trần 2.000 và 2.001 cả hai phía, chuỗi rỗng, field thừa và thiếu, tập khoá lệch, khoá ngoài bốn trường gồm `ho_ten`, `so_dien_thoai`, `email`, kiểu sai, khoá không đổi, ngày không thật, `branchId`, `targetType`, lỗi không chứa nội dung, ghim bộ che); `AnDanhGia` (`bi_an`, lý do 9, 10, 255, 256 và đệm khoảng trắng, `bac_si_id`, khoá thừa gồm nhận xét và tên); `HienDanhGia`, `XoaGhiChuKham`, rỗng ⇒ `AUDIT_ACTION_UNSUPPORTED` | Pass |
| TDK-04 | `audit-exam.int-spec.ts` 3/3: ghi đúng cột, chỉ trường có đổi, không tên, SĐT, email và không nội dung trường không đổi; payload tối đa (4 khoá × 2.000 × hai phía, có dấu, xuống dòng, emoji) khứ hồi nguyên vẹn (chỉ kiểm lại, không thay M10 của X1); payload sai ⇒ không dòng nào và giao dịch ngoài hoàn tác | Pass |
| TDK-05 | `audit-exam.int-spec.ts` 3/3: `truoc`/`sau`/`ly_do`/`bac_si_id` đúng, `bi_an` đọc lại là boolean, không nhận xét và tên; `bac_si_id` lớn nhất của BIGINT giữ dạng chuỗi; lý do 8 ký tự ⇒ hoàn tác | Pass |

**Câu để chép vào thân PR (HDK-05 (b)):** `lock-order.int-spec.ts` kiểm lỏng: miễn đích danh ba bảng `giao_dich_thanh_toan`, `lich_su_hoan_tien`, `giao_dich_vi` (payment và wallet, scope #7); tên ba bảng này CHƯA được kiểm có thật; khi payment merge migration thì bỏ miễn trừ (TECH_DEBT `[đề xuất]` 145).

**Số chạy thật (trạng thái cuối):** `npm test` 262 file, 4.916 ca Pass (gồm `appointments/architecture.spec.ts`, `doctor/architecture.spec.ts`, mọi spec import `lock-order`, toàn bộ `audit/test/*.spec.ts`); `test:int` `audit-exam` 6/6, `lock-order.int-spec` 1/1, `audit.int-spec` 11/11, `audit-enum-parity` 4/4; chín int-spec của booking dùng `findLockOrderViolation` **9 file, 242/242** (`appointment-cancellation.service`, `appointment-transition.service`, `check-in`, `create-appointment.service`, `mark-no-show`, `slot-hold.service`, `bookability.reader`, `confirm-paid`, `complete-appointment`); `tsc --noEmit`, `lint`, `build` thoát 0; `prettier --check` sạch trên 8 file của task. **Không chạy:** `schema-parity`, `migrations`, `upload` (không migration), `test:e2e` (không route), `jscpd` và `gitleaks` (CI đo). EXPLAIN không áp dụng (không truy vấn mới).

**Đột biến (dự đoán ghi TRƯỚC ở 10.4, nguyên văn, không sửa) ↔ thực tế.** Mỗi ca: sao lưu ra thư mục tạm ngoài repo, sửa đúng một chỗ, chạy, khôi phục, **so SHA-256 khớp**; sau toàn đợt `git status` giữ nguyên và `find -name "*.mut"` = 0. M1 đến M11 chạy bằng vitest đơn vị (M3, M6 thêm lượt `audit-exam.int-spec`; M12 thêm lượt `lock-order.int-spec`).

| M | Dự đoán (10.4) | Thực tế | Kết luận |
|---|---|---|---|
| M1 | HDK-09 (ca lệch khoá, cả hai chiều) | **1 ca đỏ**: "sau thừa một khoá". Chiều "sau thiếu" **không** đỏ vì giá trị `undefined` bị kiểm kiểu bắt trước | bị bắt; **dự đoán "cả hai chiều" sai**: đột biến một phần tương đương (giữ nguyên dự đoán đã ghi) |
| M2 | HDK-09 (ca 2.001 ký tự); TDK-04 không bắt | 1 ca đỏ (ca trần 2.000 và 2.001); TDK-04 không chạy (đột biến đơn vị) | bị bắt, đúng dự đoán. Đột biến đặt ở phép so sánh, không ở hằng (sửa hằng thì ca ghim `AUDIT_EXAM_LIMITS` cũng đỏ) |
| M3 | HDK-09 (`ho_ten`, `so_dien_thoai`, `email`, camelCase), TDK-04 (ca payload sai) | HDK-09: 8 ca đỏ; `audit-exam.int-spec`: 1/6 đỏ, đúng ca "payload sai (khoá ho_ten)" | bị bắt, đúng dự đoán |
| M4 | HDK-09 (9 ký tự; 9 ký tự có đệm) | 1 ca đỏ (ca lý do 9, 10, 255, 256) | bị bắt, đúng dự đoán |
| M5 | HDK-09 | 2 ca đỏ (`truoc.bi_an = true`, `truoc.bi_an = 0`) | bị bắt, đúng dự đoán |
| M6 | HDK-09, TDK-05 (record ném lỗi) | HDK-09: 4 ca đỏ; `audit-exam.int-spec`: 2/6 đỏ (hai ca TDK-05 dữ liệu hợp lệ); ca lý do ngắn vẫn xanh vì kỳ vọng từ chối | bị bắt, đúng dự đoán |
| M7 | **chỉ `tsc --noEmit`** (vitest xanh, lọt) | vitest 0/188 đỏ; `tsc` thoát 2, lỗi đầu `audit-entry.ts(139,41) TS2536` | đúng dự đoán: kiểu chỉ `tsc` bắt |
| M8 | HDK-09 (`branchId` `null`) | 1 ca đỏ | bị bắt, đúng dự đoán |
| M9 | HDK-05 (a); không LOK-02, 03, 04 | 4 ca đỏ (LOK-01; ca cấu trúc "6b ngay sau lich_hen"; chuỗi "6b trước toàn bộ tầng 7"; `giao_dich_thanh_toan` trước `ho_so_kham`); LOK-02, 03, 04 xanh | bị bắt, đúng dự đoán |
| M10 | HDK-05 (a); không LOK-02, 04 | 11 ca đỏ (LOK-01, cấu trúc, các chuỗi có `lich_hen` trước `6b`, hai ca đảo thành `null`, ca cách vài bước); LOK-02, 03, 04 xanh | bị bắt, đúng dự đoán |
| M11 | HDK-05 (a) (ca đảo thành `null` vì cùng hạng; LOK-01); không LOK-03 | 5 ca đỏ; LOK-02, 03, 04 xanh | bị bắt, đúng dự đoán |
| M12 | **chỉ `lock-order.int-spec.ts`**; toàn bộ unit xanh | đơn vị 0/39 đỏ; `lock-order.int-spec` 1/1 đỏ | đúng dự đoán: chỉ ca tích hợp bắt lỗi gõ sai tên bảng ở cả mã lẫn test |

**File đã đổi (số dòng thật):** sửa `[ĐỤNG audit]`: `audit/audit-entry.ts` (+21), `audit/audit-validation.ts` (+65); sửa `[ĐỤNG booking]`: `appointments/locking/lock-order.ts` (+5, −1), `lock-order.spec.ts` (+108, −3); mới trong `audit/`: `test/audit-exam-validation.spec.ts` (364), `test/audit-exam.int-spec.ts` (317), `testing/exam-audit-entries.ts` (52); mới `[ĐỤNG booking]`: `appointments/locking/lock-order.int-spec.ts` (47); tài liệu: `PLAN.md` (tick P2), `TRACKING.md`, `docs/TECH_DEBT.md` (+2: 144 và 145). Không sửa `docs/database/*`, migration, `AI_USAGE_LOG.md`, `doctor/**`, `search/**`, `admin/**`, `auth/**`, `rbac/**`, `scheduling/**`, `router/`, `apps/web`, các file khác của `audit/` và `appointments/`.

**Rủi ro còn lại:** (1) HDK-05 (c): chuỗi khoá bằng câu SQL thật chưa có ở P2, B2, B6, B8 phải chạy; (2) hai nguồn giới hạn (DTO của B2, B8 và `AUDIT_EXAM_LIMITS`): B2, B8 viết ca buộc "trần của DTO ≤ trần của audit"; (3) bộ che của `audit/` có thể từ chối nội dung khám hợp lệ (TECH_DEBT 144; B2, B8 chặn ở DTO); (4) ba tên bảng payment và wallet chưa được kiểm (TECH_DEBT 145); (5) xung đột gộp với P3 ở cuối `TRACKING.md` và ở `AI_USAGE_LOG.md` (hai hàng TECH_DEBT 144 và 145 là của P2, P3 không thêm dòng nợ; số hàng của PR khác vào `main` trước thì đổi theo): `git fetch` rồi gộp `main`, chạy lại test audit và lock-order (lúc báo, `origin/main` chưa có commit mới đụng các file này: `HEAD...origin/main` = `0 0`).

**Việc để lại (không phải của phiên này):** Đại nhắn Trung nêu đúng các file (câu (a)) và nêu hai luật chặt hơn issue trước khi mở PR; Đại ghi `AI_USAGE_LOG.md` dòng 114 `[đề xuất]`; Đại quyết xoá DB tạm `clinix_dep2_test` (**chưa xoá**; không dùng `clinix`, `clinix_test`, `clinix_ref_test`, `clinix_migration_test`); Đại tự commit, push, mở PR (tiêu đề `feat(audit): thêm nhật ký sửa hồ sơ khám và ẩn đánh giá (doctor-exam P2)`; thân `Closes #392`, `Refs #390`, `[ĐỤNG audit]` và `[ĐỤNG booking]` kèm số dòng ở trên, nêu quyết định mới ở mục 3.1).
