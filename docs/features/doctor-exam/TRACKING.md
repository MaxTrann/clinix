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

## 2. Kết quả test theo use case

Chưa có mã nào; bảng điền khi từng task xong (số ca theo PLAN.md mục 7; `☐` = chưa làm).

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
| HDK | Hợp đồng và cổng | 12 (HDK-01…HDK-12) | P2, P3, B3, B9, F2 | ☐ |
| TDK | Thông báo và nhật ký | 7 (TDK-01…TDK-07) | P2, B1, B2, B8 | ☐ |
| BDK | Bảo mật dữ liệu sức khoẻ | 9 (BDK-01…BDK-09) | X3 (và từng task) | ☐ |
| MGK | Bảng và migration | 9 (MGK-01…MGK-09) | P1 | ☐ |
| WHT | Web: hoàn thành ca khám (Bác sĩ) | 9 (WHT-01…WHT-09) | F1 | ☐ |
| WHS | Web: ghi hồ sơ khám (Bác sĩ) | 10 (WHS-01…WHS-10) | F2, F3, F4 | ☐ |
| WXH | Web: xem hồ sơ khám (Bệnh nhân) | 9 (WXH-01…WXH-09) | F5, F6 | ☐ |
| WDG | Web: đánh giá bác sĩ | 10 (WDG-01…WDG-10) | F6 | ☐ |
| WKD | Web: kiểm duyệt đánh giá | 10 (WKD-01…WKD-10) | F7, F8 | ☐ |
| **Tổng** | | **199** | | |

(Số đếm tính bằng script từ `PLAN.md` mục 7 lúc soạn; sửa ở đây khi PLAN đổi.)

## 3. Quyết định đã chốt

Ghi câu trả lời cho các câu hỏi ở PLAN.md mục 4.2 và ngày chốt, để PLAN.md có thể bỏ thẻ `[CHỜ …]`. Quyết định ở đây là **quyết định cuối**, ưu tiên hơn đề xuất trong PLAN.md. **Mới có Q20 và phần Iteration của Q13 được trả lời (14/11/2026, Đại); các câu còn lại chưa.** Sau khi phiên kiểm đối chiếu hợp đồng với module kia, nhóm đọc và xác nhận các câu `[CHỜ …]`, điền bảng dưới.

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
| Q10★ (h) migration và entity | `[CHỜ Trung]` — đề xuất: scope này làm (P1), theo tiền lệ doctor P1 | | Chặn P1 |
| Q11★ (i) điểm chạm Trung và review | `[CHỜ Trung]` — danh sách ở PLAN 6.7 | | Chặn P2, P3, B9, F7 |
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
- **Sai sót của AI trong lần lập kế hoạch này** (không gán mã AI-BUG): chưa có (điền khi phiên kiểm phát hiện).

| Ngày | Task | Dòng `AI_USAGE_LOG.md` | Lỗi AI phát hiện (`AI-BUG-nnn`) |
|---|---|---|---|
| 14/11/2026 | Lập kế hoạch scope #8 phần khám bệnh (bản nháp 1) | Dòng 110 `[đề xuất]` (chưa ghi; hỏi Đại) | Chưa có |

## 5. Phối hợp với module khác

Việc chưa làm; cập nhật cột "Trạng thái" khi hai bên đã thống nhất.

| Với | Việc | Task / mục PLAN | Trạng thái |
|---|---|---|---|
| Trung (`doctor`) | **Nêu và xin xác nhận:** (1) Q10 ngoại lệ Q41: scope này làm migration + entity `ho_so_kham`, `danh_gia_bac_si`; (2) Q11 danh sách file chạm: `doctor.module.ts` (+1 dòng), `architecture.spec.ts` PD-19 (ngoại lệ một file), `features/doctor/index.ts` (+1 dòng `export *`); (3) ba file thuộc phần lịch làm việc **không** đổi: mã mới ở `doctor/examination/` và `features/doctor/examination/`; (4) việc mở của Trung (F9, X2 đến X4) không đụng thư mục mới; (5) F10 hết việc vì booking F11 đã cắm route Lịch hẹn | P1, P3, F1; PLAN 6.7 | Chưa nêu |
| Trung (`audit`) | P2: thêm `SuaGhiChuKham`, `AnDanhGia` vào `audit-entry.ts`, `audit-validation.ts`, test audit (ENUM DB đã có, không migration) | P2 | Chưa nêu |
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

| Chờ | Việc | Khi nào |
|---|---|---|
| `notification` | Nhắc đánh giá; email "Hoàn thành lịch khám" (mẫu Figma `678:2`); chuông; worker gửi `LichHenHoanThanh` | Khi module có mã |
| `search` (phần hai của K5) | Tab "Đánh giá" công khai (nhận xét kèm tên người đánh giá: phải che tên) | `[SAU]` |
| `admin` | Màn "Nhật ký hành động": che nội dung `SuaGhiChuKham`; hiện lại đánh giá (đổi ENUM nhật ký) | `[SAU]` |
| `followup` | Đọc `ngay_tai_kham_du_kien` | Scope sau |
| #9 `booking` đổi lịch | `markReplaced` không xoá hồ sơ (E9) | Khi lập kế hoạch #9 |
| Đại | Xác nhận hoặc đổi mặc định 45 giờ/tuần (Q13); thêm Iteration 7, 8 vào Project | Khi tạo issue |
| Nhóm | Trả lời Q1–Q25; sửa 2.4 và Figma (PLAN 4.5, 4.6, D2) | Trước cụm 1 (Q1–Q5, Q10, Q11; Q20 đã trả lời 14/11/2026) |
