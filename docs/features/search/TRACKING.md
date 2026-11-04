# Tracking — module `search`

Nhật ký tiến độ riêng của module `search` (Tra cứu chi nhánh / chuyên khoa, Tra cứu bác sĩ và lịch khám — phần chưa có khung giờ, khung giao diện công khai).
**Người làm module: Trung (`junUTE`)**, cũng là chủ module `admin`; Đại (`MaxTrann`) là chủ `auth`, `patient` và review PR.
Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass,
chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge.

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`/`B*`/`F*`/`D*`/`K*`/`X*` theo PLAN.md mục 6), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md (ví dụ `TCN-01, CC-03`); "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối).
  Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Quyết định mới hoặc đổi quyết định thì ghi vào mục 3 (kèm ngày) rồi sửa `PLAN.md` cho khớp.
- Khi cả module (phần đợt này) xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này. Phần `[SAU]` (K1–K5) ghi tiếp ở đây khi làm.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 03/11/2026 | Lập `PLAN.md` bản nháp 1 (26 câu hỏi Q1–Q26, rủi ro H1–H14, 32 task P/B/F/D/K/X, 100 test case); đọc mã thật ở `7c2586a`, schema `docs/database/*`, PLAN `auth`/`admin`/`patient`, 15 frame Figma | Không áp dụng (chỉ tài liệu) | n/a | Phát hiện: route `@Public` bỏ qua token (không cần sửa guard); `chi_nhanh` không có cột trạng thái/mô tả/khu vực; "dịch vụ → chuyên khoa" hiểu khác nhau giữa 2.4, schema, Figma; chưa có `computeSurcharge`; `danh_gia_bac_si` chưa có migration |
| 03/11/2026 | Phiên kiểm độc lập bản nháp 1: **đạt, duyệt có chỉnh nhỏ**; nhóm đồng ý cả 26 đề xuất ⇒ `PLAN.md` bản nháp 2 (mục 4.2a), ghi quyết định ở mục 3, bỏ mọi thẻ `[CHỜ Qn]` (giữ `[CHỜ admin B12]`) | Không áp dụng (chỉ tài liệu) | n/a | Q20, Q21 ⇒ cụm 4 xếp sau cùng, tách `GET /public/overview` thành task **B9**, `clinic-info` (B7) chuyển lên cụm 1, X1 không chờ cụm 4. Sửa X3 trỏ nhầm "KGI-10" ⇒ "KGI-08". Số test case không đổi (100 ca, 92 ca tính vào đợt này) |
| 03/11/2026 | Cập nhật người làm module: **Trung**, không phải Đại ⇒ sửa Q15 (Trung tự tách `computeSurcharge` + hàm cộng giá thành PR nhỏ trước B4), Q24/P2 (Trung viết seed, Đại review), Q19/F1 (Đăng xuất dùng `useLogout()` của auth F5), quy ước thẻ `[ĐỤNG …]` (báo Đại khi đụng `auth`/`patient`), mục 8 | Không áp dụng (chỉ tài liệu) | n/a | Quyết định Q1–Q26 giữ nguyên, chỉ đổi người thực hiện. `AI_USAGE_LOG.md`: dòng #43 cho lần lập kế hoạch này, dòng #42 điền `PR #131` |
| 04/11/2026 | **P1** (#157): `SearchModule` rỗng đăng ký `AppModule`; `search.constants.ts`; `common/` (`PublicQueryDto` q 0–100 + escape LIKE, `parsePublicId` id sai dạng ⇒ 404, `PUBLIC_DOCTOR_CONDITION` + `PUBLIC_DOCTOR_FROM`, `buildWeeklySchedule`, `runReadOnly` REPEATABLE READ + READ ONLY); `testing/search-fixtures.ts`, `testing/public-route-audit.ts` | CC-04, BMS-03 (phần DTO), AN-01…AN-04 (phần khung, tích hợp) | Pass | Unit: 30 ca pass (4 file), cả bộ api 1750 ca pass; tích hợp `public-doctor.int-spec.ts` 9/9 pass trên MySQL thật; lint, build, prettier xanh. Giả định: lỗi `q` quá dài là lỗi trường `q` mã `TU_KHOA_KHONG_HOP_LE` trong `loi[]` (thân `DU_LIEU_KHONG_HOP_LE`); thứ `hoat_dong = false` cũng trả `hoatDong: null` |
| 04/11/2026 | **B7** (#165): `GET /public/clinic-info` — `search/site/` (`PublicSiteController` `@Public()` cấp class, service, repository SQL chỉ đọc 4 cột của `thong_tin_phong_kham`); đăng ký trong `SearchModule`; e2e `test/search-clinic-info.e2e-spec.ts` | KC-05 (phần API), AN-04, CC-01, CC-02, CC-03, CC-04, CC-05, CC-07 | Pass | Unit 3 ca + tích hợp 3 ca + e2e 6 ca pass; lint, build, prettier xanh; cả bộ unit api 1753/1753. CC-04 tự quét controller thật (không vi phạm). Chưa kiểm KC-05 phía giao diện (thuộc F1) |
| 04/11/2026 | **F1** (#168): khung công khai — `features/search/` (`PublicLayout`, `PublicHeader`, `PublicFooter`, `AccountMenu`, `ServiceMenu`, `api/search-service.ts` dùng `skipAuthToken`), `router/public-nav.ts`, ghép vào `router/routes.tsx` (trang chủ + 404 trong khung; auth và khu vai trò ngoài khung) | KC-01, KC-02, KC-03, KC-05, KC-06, KC-10, CC-08 (phần FE) | Một phần | Vitest cả web 764/764, lint, build xanh (9 ca mới ở `public-layout.test.tsx`). Quyết định với người dùng: mục chưa có trang là nút vô hiệu; footer ẩn cột Chuyên khoa và khối giờ (chờ B2/F2); "Dịch vụ khám" giữ mũi tên, menu nhận nhóm qua prop, chưa nối B3 (hiện "Chưa có nhóm dịch vụ nào"). Chưa làm: KC-04 (nút Đặt lịch khám còn vô hiệu, chờ trang), KC-07, KC-08 (F10), KC-09 (chưa đo tương phản/tab bằng trình duyệt thật). Chưa so ảnh với Figma bằng mắt. Nút cam dùng chữ tối thay chữ trắng (Q26). Bỏ 2 biểu tượng mạng xã hội (chưa có liên kết thật). Sửa test cũ: `auth-routes.test.tsx` AU-73 (header có liên kết), `routes.test.tsx`, `App.test.tsx` (giả mạng) — **báo Đại** vì đụng test của auth |

## 2. Kết quả test theo use case

Cập nhật lần chạy mới nhất; chi tiết từng ca xem mục 1.

| Nhóm test (PLAN.md mục 7) | Tổng số ca | Pass | Fail | Chưa chạy | Ngày chạy gần nhất |
|---|---|---|---|---|---|
| Tra cứu chi nhánh (`TCN-*`) | 13 | | | | |
| Tra cứu chuyên khoa (`TCK-*`) | 10 | | | | |
| Chi nhánh đang chọn (`CNC-*`) | 14 | | | | |
| Tra cứu bác sĩ (`TBS-*`) | 22 | | | | |
| Chỉ lộ dữ liệu công khai (`AN-*`) | 6 | | | | |
| Truy cập công khai (`CC-*`) | 8 | | | | |
| Khung công khai (`KC-*`) | 10 | | | | |
| Trang chủ và tìm kiếm tổng (`TCH-*`) — cụm 4, bỏ cùng cụm 4 nếu thiếu thời gian | 5 | | | | |
| Bảo mật dùng chung (`BMS-*`) | 4 | | | | |
| Khung giờ `[SAU]` (`KGI-*`) — không tính vào đợt này | 8 | | | | |

## 3. Quyết định đã chốt

Ghi câu trả lời cho các câu hỏi ở PLAN.md mục 4.2 và ngày chốt. Quyết định ở đây là **quyết định cuối**, ưu tiên hơn đề xuất trong PLAN.md. Nhóm đồng ý **cả 26 đề xuất** ngày 03/11/2026;
cột "Ghi chú" ghi phần nhóm dặn thêm và cập nhật người làm (cùng ngày).

| Mã câu hỏi | Quyết định | Ngày chốt | Ghi chú (khác đề xuất? hệ quả cho task) |
|---|---|---|---|
| Q1 | Trang công khai chỉ hiện dữ liệu đang hoạt động, **không** có ô lọc trạng thái; mọi chi nhánh là công khai; chuyên khoa `NgungHoatDong` ẩn, chi tiết 404; sửa 2.4 bỏ "lọc theo trạng thái" | 03/11/2026 | Như đề xuất (A). B1, B2, D1 |
| Q2 | Bỏ "mô tả chi nhánh" khỏi 2.4; chi tiết chi nhánh = tên, địa chỉ, giờ nhận khám 7 ngày, dịch vụ, số bác sĩ, liên kết bác sĩ tại chi nhánh | 03/11/2026 | Như đề xuất (A). Không đổi schema. B1, D1 |
| Q3 | Không có bộ lọc khu vực; từ khoá khớp tên và địa chỉ chi nhánh | 03/11/2026 | Như đề xuất. B1, D1 |
| Q4 | Thứ chưa khai báo: API `hoatDong: null`, giao diện hiện "Nghỉ"; ngày hoạt động hiện cả hai khoảng, tiêu đề "Giờ nhận khám"; bỏ `[đề xuất]` ở quy tắc 28 | 03/11/2026 | Như đề xuất. Dùng chung câu trả lời với admin Q45 — **chờ xác nhận Q45** (Trung, chủ admin); chỉ chặn phần quy tắc 28 của D3, không chặn B1 |
| Q5 | Chuyên khoa: có chi nhánh ⇒ chỉ chuyên khoa có ≥ 1 bác sĩ công khai ở đó (đếm tại chi nhánh); "Toàn quốc" ⇒ mọi chuyên khoa đang hoạt động (kể cả "Sắp có bác sĩ"). Chi nhánh: hiện tất cả, chi nhánh đang chọn xếp đầu | 03/11/2026 | Như đề xuất. B2, F3, F4 |
| Q6 | Chi nhánh gần nhất tính **ở trình duyệt** (Haversine, bằng nhau ⇒ id nhỏ hơn); chi nhánh thiếu toạ độ bỏ qua; không chi nhánh nào có toạ độ ⇒ "Toàn quốc", không xin quyền; chờ vị trí tối đa 10 giây | 03/11/2026 | Như đề xuất. F2 |
| Q7 | `localStorage` chỉ lưu `{chiNhanhId \| null, nguon}`; xin quyền tự động một lần ở lần đầu, từ chối thì không hỏi lại; chi nhánh không còn ⇒ "Toàn quốc"; đổi lọc ở TCCN cập nhật giá trị chung, ở TCBS b5 thì không; đăng nhập/đăng xuất giữ nguyên; mã ở `shared/branch-selection/` | 03/11/2026 | Như đề xuất. F2 |
| Q8 | Trang chi nhánh `/chi-nhanh`, `/chi-nhanh/:id` theo bố cục đề xuất; điểm vào từ bộ chọn chi nhánh và chân trang, không thêm mục vào thanh điều hướng | 03/11/2026 | Như đề xuất. **Nhóm bổ sung frame Figma trang chi nhánh** (mục 5); F3 làm theo bố cục đề xuất trong lúc chờ |
| Q9 | Chi tiết chuyên khoa có "Giá khám từ X · cọc Y" (giá áp dụng thấp nhất của bác sĩ công khai) và danh sách bác sĩ; sửa 2.4 TCCN b6 | 03/11/2026 | Như đề xuất. `giaKhamTu` chờ B4 (`[CHỜ admin B12]`). B2, F4, F6 |
| Q10 | "Dịch vụ" ở TCBS b1 = nhóm dịch vụ; "chuyên khoa/lĩnh vực cụ thể" ở b2–b3 = dịch vụ khám; b6 lọc theo `bac_si.dich_vu_kham_id`; chuyên khoa là bộ lọc phụ; dịch vụ "đang cung cấp" = có trong `chi_nhanh_dich_vu_kham`; nhóm không còn dịch vụ ⇒ "Sắp triển khai" | 03/11/2026 | Như đề xuất (A). Không đổi schema. B3, B5, F5, D2 |
| Q11 | "Đội ngũ bác sĩ" và danh sách bác sĩ trong chi tiết chuyên khoa thuộc TCBS, cùng API, dịch vụ là bộ lọc tuỳ chọn | 03/11/2026 | Như đề xuất. F6, D2 |
| Q12 | Lọc giá "Từ"/"Đến" (đồng, số nguyên ≥ 0, khoảng đóng, so với giá áp dụng); lọc đánh giá "Từ 3★/4★/4,5★", bác sĩ chưa có đánh giá bị loại; sắp mặc định kinh nghiệm giảm dần → họ tên → id, thêm "Giá tăng dần", "Đánh giá cao" | 03/11/2026 | Như đề xuất. **Nhóm bổ sung frame Figma hai ô lọc** (mục 5); F5 làm theo đề xuất trong lúc chờ |
| Q13 | Bác sĩ công khai khi: tài khoản `BacSi` `DangHoatDong` (ẩn `ChoKichHoat`, `NgungHoatDong`), chuyên khoa `DangHoatDong`, cặp chi nhánh–dịch vụ còn trong `chi_nhanh_dich_vu_kham`; bác sĩ chưa có lịch vẫn hiện; ghi thành quy tắc trong `clinix_quy_tac_nghiep_vu.md` | 03/11/2026 | Như đề xuất. B2, B5, B6, D3 |
| Q14 | Danh sách trắng trường bác sĩ như PLAN mục 5.5 (không email, SĐT, ngày sinh, giới tính, địa chỉ, trạng thái, học vị, ảnh); ảnh chữ viết tắt; bỏ "Đặt trước tối đa 7 ngày"; "Nhắn tin" vô hiệu; hiện cọc và thời lượng | 03/11/2026 | Như đề xuất. B5, B6, F5, F7 |
| Q15 | Giá áp dụng dùng **một** hàm chung (`computeSurcharge` + hàm cộng giá trên chuỗi decimal) cho `search` và `booking`; `search` đọc toàn bộ quy tắc phụ phí mỗi request; lọc/sắp theo giá trong bộ nhớ; chưa có hàm thì B4–B6 `[CHỜ admin B12]`, không làm tạm bằng số tự đặt | 03/11/2026 | Như đề xuất (a)–(d). **Cập nhật người làm:** Trung là chủ cả admin B12 lẫn `search` ⇒ Trung **tự tách** `computeSurcharge` và hàm cộng giá thành PR nhỏ **trước task B4**, đặt ở `apps/api/src/pricing/` hoặc chỗ Trung chọn; **cấm công thức phụ phí lần hai** |
| Q16 | Chỉ tính đánh giá `bi_an = false`; trung bình làm tròn 1 chữ số (chuỗi), kèm số lượt; 0 lượt ⇒ `null`; chưa có bảng ⇒ `null`/0; tab danh sách nhận xét `[SAU]` | 03/11/2026 | Như đề xuất. Chủ migration `danh_gia_bac_si` ghi khi lập kế hoạch module đánh giá. B4, K5 |
| Q17 | Lễ tân thấy như Khách vãng lai; không tự điền chi nhánh của Lễ tân; token sai/hết hạn/thu hồi bị bỏ qua (giữ hành vi auth, không sửa guard) | 03/11/2026 | Như đề xuất. CC-02, CC-03, D2 |
| Q18 | Bộ tính khung giờ dùng chung thuộc `booking`; "ngày gần nhất" = hôm nay (giờ VN) | 03/11/2026 | Như đề xuất. Chỉ ảnh hưởng K1–K4 `[SAU]` |
| Q19 | Khung công khai: bộ chọn chi nhánh bên trái "Đặt lịch khám"; đã đăng nhập ⇒ menu họ tên ("Trang của tôi", "Đăng xuất"); "Cẩm nang", "Liên hệ", "Nhắn tin" vô hiệu, ẩn bong bóng chat; "Đặt lịch khám" mở TCBS b1; chân trang lấy liên hệ từ `thong_tin_phong_kham`, giờ của chi nhánh đang chọn; màn hẹp là task F10; đường dẫn như PLAN | 03/11/2026 | Như đề xuất. **Cập nhật:** nút Đăng xuất dùng **`useLogout()` của auth F5** (đang làm, chưa merge) ⇒ F1 `[PHỤ THUỘC auth F5]` cho phần menu tài khoản; F5 chưa merge thì dùng `logout()` trực tiếp rồi đổi sau |
| Q20 | Ô tìm tổng "Trang chủ - Tìm kiếm" thuộc module này: gợi ý theo loại (chuyên khoa, dịch vụ, bác sĩ, ≤ 5 mỗi loại); Enter ⇒ "Đội ngũ bác sĩ" với từ khoá | 03/11/2026 | Như đề xuất. **Cụm 4 xếp sau cùng, bỏ trước nếu thiếu thời gian** (B8, F9) |
| Q21 | Trang chủ: hero + ô tìm, ba con số, nhóm dịch vụ, chuyên khoa, đội ngũ bác sĩ, quy trình (sửa câu "Giữ chỗ 15 phút"); ẩn "Cẩm nang" | 03/11/2026 | Như đề xuất. **Cụm 4 xếp sau cùng, bỏ trước nếu thiếu thời gian** (B9, F8); F1 có trang chủ tạm dẫn vào đủ hai use case |
| Q22 | Tiền tố `/public/` cho mọi route; tên endpoint như PLAN mục 5.5 | 03/11/2026 | Như đề xuất |
| Q23 | `PageQueryDto` (20/100) cho chi nhánh, chuyên khoa, bác sĩ; nhóm dịch vụ và dịch vụ không phân trang; `q` 0–100 ký tự, escape LIKE; tham số lạ ⇒ 400; id lọc sai dạng ⇒ 400, không tồn tại ⇒ 200 rỗng; bộ chọn chi nhánh lấy `pageSize=100` | 03/11/2026 | Như đề xuất. `TECH_DEBT` nếu > 100 chi nhánh |
| Q24 | Test tự động dùng `search-fixtures.ts` dựng trên `AdminFixtures`; seed demo bổ sung (toạ độ, lịch khác nhau, mô tả chuyên khoa, ~8 bác sĩ, chuyên khoa ngừng, bác sĩ chưa kích hoạt); phụ phí demo để trống trừ khi nhóm đưa số minh hoạ | 03/11/2026 | Như đề xuất. **Cập nhật người làm:** Trung (chủ file seed và chủ module) thêm seed demo ở P2; **Đại review PR** |
| Q25 | Trạng thái chưa có frame dùng `shared/ui` có sẵn; câu A1 lấy nguyên 2.4 | 03/11/2026 | Như đề xuất |
| Q26 | Màu Figma không đạt WCAG 2.2 AA dùng token ADR 0004; ghi danh sách lệch Figma | 03/11/2026 | Như đề xuất |

## 4. Ghi chú AI

Mỗi lần dùng AI sinh mã/tài liệu cho module này phải được ghi vào `AI_USAGE_LOG.md` (bảng 1) của người dùng AI; lỗi AI phát hiện (`AI-BUG-nnn`) ghi ở bảng 2.
Dòng nhật ký ở mục 1 nên trỏ tới số thứ tự tương ứng khi có dùng AI.

| Ngày | Mục trong `AI_USAGE_LOG.md` (số thứ tự / `AI-BUG-nnn`) | Task liên quan |
|---|---|---|
| 03/11/2026 | `AI_USAGE_LOG.md` #43 (lập kế hoạch, bản nháp 1 và 2) | `PLAN.md`, `TRACKING.md` |

## 5. Phối hợp với người/module khác

Việc cần người khác làm hoặc cần báo (PLAN.md mục 3.3). Người làm module là Trung (cũng chủ `admin`), nên việc phía `admin` là việc của chính Trung, ghi để không quên.
Ghi ngày đã báo và phản hồi.

| Module / người | Điểm cần báo / việc cần làm | Task | Ngày báo | Phản hồi |
|---|---|---|---|---|
| Nhóm (Figma) | **Bổ sung frame trang danh sách/chi tiết chi nhánh** (Q8) | F3 | 03/11/2026 | Nhóm đồng ý bổ sung; chưa có frame |
| Nhóm (Figma) | **Bổ sung hai ô lọc giá và đánh giá** ở "Đội ngũ bác sĩ" và "Bước 3" (Q12) | F5 | 03/11/2026 | Nhóm đồng ý bổ sung; chưa có frame |
| Nhóm (Figma) | Bộ chọn chi nhánh trên thanh điều hướng (Q19a), trạng thái chưa có frame (PLAN mục 4.5), các mục "phải bỏ/sửa" và màu (PLAN mục 4.4) | F1, F2 | | |
| Đại (`auth`) | Báo Đại: khung công khai dùng `useLogout()` của auth F5 cho nút Đăng xuất (Q19); không sửa file nào của `auth`; module dựa vào hành vi `@Public` bỏ qua token, gọi API công khai bằng `skipAuthToken` | F1 | | |
| Đại (`patient`) | Báo Đại: mục "Về trang chủ" của khung Bệnh nhân trỏ về `/` (trang chủ công khai); "chi nhánh đang chọn" đọc qua `shared/branch-selection/` | F1, F2 | | |
| Đại (review) | Review PR seed demo P2 (file seed của `admin`, Q24) | P2 | | |
| `admin` (Trung — việc của chính người làm) | Tách `computeSurcharge` và hàm cộng giá thành PR nhỏ **trước B4**, đặt ở `apps/api/src/pricing/` hoặc chỗ Trung chọn; cấm công thức phụ phí lần hai (Q15) | B4 | | |
| `admin` (Trung — việc của chính người làm) | Xác nhận admin Q45 "thứ chưa khai báo" để chốt Q4 và sửa quy tắc 28 (D3) | D3 | | |
| `admin` (Trung — việc của chính người làm) | Biểu thức ảnh chuyên khoa `COALESCE(secure_url, anh_dai_dien)` lặp giữa `admin` và `search`: cân nhắc tách hằng SQL dùng chung khi làm B2 | B2 | | |
| `booking` | Chủ bộ tính khung giờ dùng chung (Q18); hợp đồng endpoint khung giờ và dữ liệu điền sẵn khi chuyển sang "Đặt lịch khám" (PLAN mục 5.6); nút "Đặt lịch khám" hiện mở luồng TCBS b1; dùng hàm giá chung (Q15) | K1, K3, F1 | | |
| `doctor` | `lich_lam_viec` thật và migration `yeu_cau_nghi_phep` là điều kiện của K1 | K1 | | |
| `waitlist` | Popup đăng ký chờ từ khung Đã đặt/Đang giữ chỗ (TCBS A2) | K4 | | |
| Module đánh giá | Chủ migration `danh_gia_bac_si`; chỉ tính đánh giá `bi_an = false`; trường hiển thị của tab "Đánh giá" (Q16) | K5 | | |
