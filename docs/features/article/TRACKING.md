# Tracking — scope `article` Bài viết và cẩm nang sức khỏe

Nhật ký tiến độ riêng của scope (mã sẽ nằm trong `apps/api/src/article/` và `apps/web/src/features/article/`; scope commit `article`). Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass, chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge. **Người làm: Đại (`MaxTrann`); người review: Trung (`junUTE`).**

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `B*`, `F*`, `X*` theo PLAN.md mục 6; ngoài file này luôn viết "article B1" để không nhầm với task cùng mã của module khác), mới nhất ở cuối.
- "Test case": liệt kê mã ở mục 7 của PLAN.md; "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Quyết định của nhóm ghi ở mục 3. **Chỉ ghi "ĐÃ TRẢ LỜI" khi Đại trả lời trực tiếp** (tin của phiên kiểm độc lập chỉ duyệt kế hoạch và trả lời câu kỹ thuật).
- Số đo thật (PLAN.md mục 5.16) ghi ở mục 6 **sau khi đặt tiêu chí trước**; việc còn chờ ghi ở mục 7.
- **Không dán secret, nội dung `.env`, khoá Cloudinary hay nội dung bài viết thật vào file này.**
- Khi cả scope xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 28/11/2026 | **Lập kế hoạch scope article** (Đại `MaxTrann`; nhánh `docs/article-plan`, worktree `clinix-app-de-p1`, `origin/main` `187c4bd`; chỉ tạo `PLAN.md` và file này). Đọc nguyên văn ba use case "Quản lý bài viết / cẩm nang", "Tra cứu bài viết / cẩm nang", "Đánh giá bài viết (Thích / Không thích)" ở hai bản 2.4 bằng `python-docx` (chỉ đọc; so từng đoạn: **trùng từng chữ**, số 2.4.55 và 2.4.52 cho use case Quản lý, 2.4.6 và 2.4.22 giống nhau ở cả hai); 1.2.1, 1.3.12, 2.1_2.2, bảng Phân loại (M16, M27), văn bản Phạm vi 27/11 (F-6, mục 9); mã Figma Make `BlogPage.tsx`, `AdminBlogPage.tsx`; đối chiếu `docs/database/*` (DDL bốn bảng, quy tắc 41), 18 migration, nếp `tao-bang-chat.ts`, test so khớp schema, `apps/api/src/{admin/specialties,common/upload,search,rbac,audit,chatbot}`, `apps/web/src/{features/admin,features/search,router,shared}`, `docs/TECH_DEBT.md`, PLAN `dashboard`, `chatbot`, `search`, `admin`. **Hai agent Explore (chỉ đọc) khảo sát mã API và web song song**; kết quả được đối chiếu lại bằng `git grep` và đọc trực tiếp các file then chốt. **Hỏi Đại bằng ba hộp câu hỏi** (Q1 đến Q10 ở PLAN 4.2): bảy câu theo đề xuất, **ba câu chọn khác: Q2 (đánh giá TRONG), Q5 (ảnh đại diện TRONG), Q7 (Iteration 10, song song)**. Tạo `PLAN.md` (mục 0 đến 10, Phụ lục A và B nguyên văn; 120 mã test case, 9 task, 35 giờ gồm lõi 22,5) và file này. **Không** chạy `npm`, test, build, Docker, MySQL; **không** đọc `.env`; **không** sửa file nào khác; git chỉ đọc và `git fetch`. | — (tài liệu; chưa có mã) | — | **Phát hiện khi đối chiếu (PLAN mục 2, 3.3):** (1) bốn bảng có DDL nhưng **không migration, entity, API, trang** (L: cần migration viết tay); (2) **`anh_tai_len` có CHECK `muc_dich = 'ChuyenKhoa'`**, kiểm tham chiếu khi dọn chỉ nhìn `chuyen_khoa`, nên ảnh bài viết cần đổi schema và sửa mã upload của admin P7 (L8, R2); (3) **`hashtag.ten` UNIQUE theo `utf8mb4_unicode_ci` không phân biệt dấu** (quy tắc DB 41), nên "mắt" ≡ "mặt" (L9, R4; **chưa chạy thử**, ca ABD-04 xác nhận); (4) trang chủ **không có** khối Cẩm nang (chỉ test `TCH-02` khoá việc vắng tiêu đề), khác chữ "bị ẩn khi chưa có dữ liệu" ở chỉ dẫn giao việc (L7); (5) bật mục "Bài viết" và "Cẩm nang" làm đỏ `AQ-03`, `AF1-02`, `KC-01` (R3); (6) enum audit không có hành động cho bài viết (L11); (7) không có thư viện làm sạch HTML, không hook tiêu đề trang (5.5, T15); (8) phạm vi: Phạm vi F-6 hai việc, 2.4 ba use case, Đại thêm đánh giá và ảnh nên **9 task, 35 giờ, vượt mốc 6 đến 7 task và 15 đến 21 giờ** của chỉ dẫn; thứ tự cắt Q10; (9) chỉ dẫn nói dashboard đã giao Trung: **đúng** (dashboard Q22, PR #789, `187c4bd`); lúc đầu phiên GitHub và PLAN trên `f087bef` còn ghi Đại, đã hết lệch. |
| 28/11/2026 | **Gửi phiên kiểm độc lập** (`Repo, Docker CI/CD và class diagram`) đề nghị duyệt kỹ thuật T1 đến T22 (PLAN 4.3). **Phiên kiểm đã trả lời một việc trong lúc lập kế hoạch:** xác nhận dashboard giao cả cho Trung (câu hỏi sự thật Q11); T1 đến T22 chưa có trả lời lúc gửi (đã có ở dòng kế tiếp). | — (tài liệu) | — | — |
| 28/11/2026 | **Phiên kiểm độc lập duyệt kỹ thuật T1 đến T22** (theo ủy quyền của Đại; không phải quyết định sản phẩm hay schema), đối chiếu mã ở `origin/main` `187c4bd`, kèm **bốn chỗ sửa chữ và vài lưu ý**. Phiên lập kế hoạch đối chiếu lại từng điểm bằng `git grep` rồi sửa PLAN và file này. | ABT-11 (mới; tổng 120 mã) | — | **(1) Danh sách test của 5.2:** phiên kiểm nói `MIGRATED_TABLES` chỉ ở `migrations.int-spec.ts:92`; **đối chiếu thấy có ở CẢ HAI** (`migrations.int-spec.ts:92` và `schema-parity.int-spec.ts:82`, so ở 141) nên ghi cả hai; thêm `ARTICLE_TABLES` và ca `SHOW CREATE TABLE`; ca "migration chat là cuối cùng" ở `migration-source.spec.ts:1057-1059` (ca `MCH-12` ở `dbml-parity.spec.ts:196` là ca khác); **B4 phải mặt nạ ca sao chép nguyên văn của B1 và `CK-11/SE-A7`** (`migration-source.spec.ts:166-179`); thêm `article-schema.int-spec.ts` và ca hạ nâng; mốc lớn hơn `1794312000000`. **(2) T6:** ABD-04 thêm cặp `mắt/mặt/mat`, `đau/dau` (chưa kiểm `đ`), hoa thường, khoảng trắng cuối (PAD SPACE); thẻ đã có nhưng tắt ⇒ 409 `THE_DA_TAT` (ABT-11). **(3) T16:** phương án chính là `assignArticle` **song song**, không đổi chữ ký `assignSpecialty` (người gọi ở `specialty.service.ts:65, 102`, `vi.spyOn` ở `specialty.int-spec.ts:361`, gọi trực tiếp ở `upload.int-spec.ts`); **cleanup có HAI chỗ** chỉ nhìn `chuyen_khoa`: `claimCleanup` (`upload.repository.ts:144-145`) và `cleanupOwned` (dòng 170, `NOT EXISTS`): phiên kiểm thấy một chỗ, đã trả lời lại; `upload.int-spec.ts:315` thêm `bai_viet`. **(4) 6.4:** ghi rõ quy mô vượt chỉ dẫn. **Lưu ý:** T11 chấp nhận (`VALUES()` có tiền lệ `branch.repository.ts:346`; thêm ca hai `PUT` song song, ABR-08); T9 **tái dùng** `auditPublicControllers`; T13, T14, T22 đúng, `AQ-03`, `AF1-02`, `KC-01` kiểm lại bằng `git grep` lúc làm. **Giờ không đổi** (tổng 35): phần mặt nạ và int-spec ràng buộc nằm trong B1, B4; đệm Iteration 11 khoảng 2 giờ. |

## 2. Kết quả test theo use case (mã ở PLAN.md mục 7)

| Nhóm | Mã | Số ca | Task | Trạng thái |
|---|---|---|---|---|
| Dữ liệu và migration | ABD-01…ABD-07 | 7 | B1 | chưa chạy |
| Quyền và phạm vi | ABQ-01…ABQ-07 | 7 | B1 (01, 02, 05 đến 07), B2 (03, 04) | chưa chạy |
| Vòng đời và biên tập | ABV-01…ABV-13 | 13 | B1 | chưa chạy |
| Thẻ | ABT-01…ABT-11 | 11 | B1 (01 đến 08, 11), B2 (09, 10) | chưa chạy |
| Nội dung và an toàn | ABN-01…ABN-10 | 10 | B1 (01 đến 04), F1 (05 đến 10) | chưa chạy |
| API công khai | ABP-01…ABP-12 | 12 | B2 | chưa chạy |
| Web quản trị | ABW-01…ABW-12 | 12 | F1 | chưa chạy |
| Web công khai | ABG-01…ABG-14 | 14 | F2 | chưa chạy |
| Đánh giá, API `[CẮT ĐƯỢC]` | ABR-01…ABR-10 | 10 | B3 | chưa chạy |
| Đánh giá, web `[CẮT ĐƯỢC]` | ABU-01…ABU-07 | 7 | F3 | chưa chạy |
| Ảnh `[CẮT ĐƯỢC]` | ABI-01…ABI-09 | 9 | B4 (01 đến 07), F4 (08, 09) | chưa chạy |
| Kiểm tay | ABK-01…ABK-08 | 8 | X1 | chưa chạy |
| **Tổng** | | **120** | | **0 đã chạy** |

Đột biến mục tiêu (PLAN 5.16): 11, chưa chạy; bốn loại đột biến web: chưa chạy.

## 3. Quyết định đã chốt

### 3.1 Quyết định của nhóm cho scope này

**Đại trả lời trực tiếp ngày 28/11/2026** (Q1 đến Q10), qua ba hộp câu hỏi trong phiên lập kế hoạch (mỗi câu có đề xuất kèm theo; câu hỏi và hệ quả ở PLAN mục 4.2).

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q1 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): nội dung là văn bản tối giản tự dựng (đoạn, `## ` tiêu đề phụ, `- ` danh sách), không HTML thô, không thư viện** | theo đề xuất; `[ĐỒNG BỘ TL]` ("đa phương tiện") |
| Q2 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): đánh giá Thích / Không thích nằm TRONG phương án (B3, F3)** | **Khác đề xuất** (đề xuất là ngoài); +6,5 giờ |
| Q3 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): đường dẫn `id-slug`, slug trang trí sinh ở web, không đổi schema** | theo đề xuất |
| Q4 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): chỉ Quản trị viên Toàn hệ thống biên tập và xem bản nháp, bản lưu trữ; công khai chỉ thấy `DaXuatBan`, 404 cùng thân** | theo đề xuất |
| Q5 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): ảnh đại diện nằm TRONG phương án (B4, F4), đổi schema** | **Khác đề xuất** (đề xuất là ngoài); +6 giờ; `[ĐỒNG BỘ TL]` ba file `docs/database/*` |
| Q6 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): giữ DDL; trùng khác dấu thì 409 `THE_TRUNG_KHONG_DAU`** | theo đề xuất |
| Q7 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): làm ở Iteration 10, song song** | **Khác đề xuất** (đề xuất là Iteration 11 trở đi); xếp lịch ở PLAN 6.4 dựa trên Q11 |
| Q8 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): chỉ mục đo trước ở X1, không đạt mới hỏi** | theo đề xuất |
| Q9 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): bài liên quan và bài nổi bật ngoài, làm sau** | theo đề xuất |
| Q10 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): thứ tự cắt: ảnh trước, rồi đánh giá** | theo đề xuất |
| Q11 | **ĐÃ ĐỐI CHIẾU (28/11/2026):** Đại chọn "dashboard đã chuyển cho Trung"; phiên kiểm xác nhận và `origin/main` `187c4bd` (PR #789) ghi dashboard Q22 | câu sự thật, không phải quyết định |

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

Admin, rbac: tài nguyên dùng chung chỉ Toàn hệ thống ghi, ngoài phạm vi 404, thiếu quyền 403. Auth: mã lỗi ổn định, không log bí mật. Search: route công khai dưới `public/`, 404 cùng thân. Admin P7 (ADR 0001): ảnh tải qua máy chủ, không nhận URL từ client. Dashboard Q10 và chatbot Q11: chỉ mục đo trước; chatbot chưa dùng bài viết. Booking: giờ Việt Nam. Phạm vi 27/11: F-6 là Tùy chọn, cắt đầu tiên.

### 3.3 Điểm kỹ thuật (PLAN 4.3, T1 đến T22): **ĐÃ DUYỆT kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 28/11/2026)**

**Đã duyệt kỹ thuật ngày 28/11/2026, kèm bốn chỗ sửa chữ đã làm (mục 1, dòng cuối).** Là `[đề xuất]` của phiên lập kế hoạch; **không phải quyết định sản phẩm hay schema** (các việc đó đã hỏi Đại ở mục 3.1). Các điểm: T1 thư mục và scope `article`; T2 ba nhóm route, một `PATCH`, không xoá bài; T3 `id-slug` chỉ ở web; T4 hai migration (bốn bảng nguyên văn ở B1, `ALTER` ở B4); T5 một giao dịch, khoá hàng, thẻ sắp và `ON DUPLICATE KEY`; T6 so tên nguyên văn sau khi tìm thẻ; T7 quy tắc nội dung (ký tự và byte); T8 trình dựng là hàm thuần, không HTML thô; T9 test kiến trúc riêng cho route công khai; T10 `Cache-Control`; T11 ghi đánh giá với `FOR SHARE`; T12 trạng thái phiếu qua route riêng; T13 khe `handbookSlot` ở trang chủ; T14 `systemOnly` và guard `ToanHeThong`; T15 hook tiêu đề nội bộ; T16 `assignArticle` song song và kiểm tham chiếu khi dọn ở hai chỗ; T17 lặp hằng ảnh ở web; T18 hằng đường dẫn; T19 danh sách không đọc `noi_dung`; T20 `demTheoTrangThai`; T21 mức kiểm; T22 trang quản trị dùng bề mặt `features/admin/index.ts` (thêm một dòng export `useFocusFirstInvalid`, phương án lùi: tự viết) và bộ lọc ở URL. **Điều kiện kèm theo khi làm:** T4 (mặt nạ cho ca sao chép của B1 và `CK-11/SE-A7`; danh sách test ở PLAN 5.2), T5 và T6 (nhánh phụ thuộc kết quả ABD-04, thêm thẻ tắt), T9 (tái dùng `auditPublicControllers`), T11 (thêm ca hai `PUT` song song), T16 (`assignArticle` song song), T22 (sửa `features/admin/index.ts`); kiểm lại `AQ-03`, `AF1-02`, `KC-01` bằng `git grep`.

## 4. Ghi chú AI

**Phiên lập kế hoạch KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`.** Dưới đây là **bản nháp**; kiểm lại số lớn nhất trên `main` lúc ghi. Kiểm ở `origin/main` `187c4bd` (28/11/2026): AI log có đến hàng 224, TECH_DEBT đến dòng 356, `AI-BUG` đến 141 (các số 222, 223, 225 đến 366 có thể do cửa sổ khác giữ). Số Đại đã cấp cho task này: **AI log hàng 226, nợ kỹ thuật từ 367, `AI-BUG` từ 150**; Đại quyết số khi ghi.

### 4.1 Nháp dòng AI log (bảng 1, mười cột)

| # | Ngày | Người dùng | Công cụ / model | Phạm vi (module/file) | Prompt chính | Phần AI sinh | Phần tự sửa/viết | Cách kiểm chứng | Commit/PR |
|---|------|-----------|-----------------|-----------------------|--------------|--------------|------------------|-----------------|-----------|
| 226 | 28/11/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | `docs/features/article/PLAN.md`, `docs/features/article/TRACKING.md` (MỚI; chỉ hai file này; kế hoạch scope bài viết và cẩm nang sức khỏe) | Lập kế hoạch (chỉ tài liệu, không viết mã) cho scope "Bài viết và cẩm nang sức khỏe" (nhóm F-6): ba use case Quản lý, Tra cứu, Đánh giá bài viết; vòng đời bài, quyền và phạm vi, định dạng nội dung và an toàn XSS, thẻ, ảnh Cloudinary, hiệu năng, migration và đồng bộ tài liệu, phương án tối thiểu 15 đến 21 giờ và tối đa 6 đến 7 task, danh sách issue đề xuất; hỏi Đại các quyết định sản phẩm và schema | Toàn bộ PLAN (mục 0 đến 10; 120 mã test case; 9 task) và TRACKING; Phụ lục A và B sao chép bằng script; bản nháp commit, PR, AI log, nợ kỹ thuật | Đại trả lời trực tiếp ba hộp câu hỏi (Q1 đến Q10; bảy theo đề xuất, ba chọn khác: đánh giá TRONG, ảnh TRONG, Iteration 10); phiên kiểm độc lập xác nhận người làm dashboard và duyệt kỹ thuật T1 đến T22 kèm bốn chỗ sửa (28/11/2026); PLAN chờ Trung review | Đọc nguyên văn 2.4 bằng `python-docx` (chỉ đọc), so hai bản; đối chiếu DDL, migration, route, tên lớp, test sẽ đỏ với mã trên `origin/main` `187c4bd` (`git grep`, `git show`, `git ls-tree`; hai agent Explore khảo sát chỉ đọc rồi đối chiếu lại); `gh issue view 750`; script ngoài repo kiểm số cột bảng, số mã test và mỗi mã đúng một task, độ dài tiêu đề issue và PR, kiểu xuống dòng; không chạy `npm`, test, build, Docker, MySQL; không đọc `.env`; không lệnh git ghi | `[cần điền]` (PR tài liệu của Đại) |

### 4.2 Nháp dòng nợ kỹ thuật (từ 367; chỉ ghi khi lối tắt có thật trong mã; cột đúng bảng của `docs/TECH_DEBT.md`)

| # | Ngày | Mô tả nợ | Vì sao chấp nhận | Rủi ro | Kế hoạch xử lý (khi nào) | Trạng thái |
|---|---|---|---|---|---|---|
| 367 | `[ngày merge article B1]` | **Nội dung bài viết lưu là chữ thuần, không lọc HTML ở máy chủ**: an toàn nhờ web dựng bằng phần tử React (`features/article/common/article-content.tsx`); mọi nơi dùng nội dung sau này (chatbot, email, tìm kiếm, xuất tệp) phải tự coi là chữ thuần; thân JSON chưa có giới hạn riêng (mặc định framework `[chưa kiểm]`) | Q1: không thêm thư viện; không có consumer nào khác ở thời điểm này | Một consumer mới đưa nội dung vào HTML thô thì mở lỗ XSS | Khi nối chatbot hay email: thêm hàm thoát tập trung và test kiến trúc cho consumer đó | Mở |
| 368 | `[ngày merge article B1]` | **Không ghi nhật ký hành động (Audit) cho thao tác bài viết**: enum `nhat_ky_hanh_dong.hanh_dong` và `loai_doi_tuong` không có giá trị cho bài viết | Thêm giá trị là đổi enum ở DDL, entity, hai tuple, `audit-entry.ts` và test so khớp; bài viết không thuộc nhóm hành động nhạy cảm của Phạm vi | Không truy được ai đổi hay ẩn bài nào | Khi có yêu cầu: mở enum (ba file `docs/database/*`, migration, parity) khoảng 3 giờ | Mở |
| 369 | `[ngày merge article B1]` | **Thẻ: không màn quản lý, thẻ mồ côi không dọn; trùng khác dấu bị từ chối thay vì phân biệt dấu** (cột `hashtag.ten` theo `utf8mb4_unicode_ci`; kết quả ABD-04 `[cần điền]`) | Q6: không đổi collation; 2.4.55 "không có màn quản lý hashtag riêng" | Admin không tạo được hai thẻ chỉ khác dấu ("mắt", "mặt"); thẻ cũ không còn bài vẫn nằm trong bảng và gợi ý | Đổi collation cột (migration và ba file) hoặc màn quản lý thẻ khoảng 1,5 đến 2,5 giờ | Mở |
| 370 | `[ngày merge article B2]` | **Route công khai bài viết không throttling; `q` dùng `LIKE '%…%'`; chưa có chỉ mục `bai_viet (trang_thai, thoi_diem_xuat_ban)`** `[kết quả đo X1 cần điền]` | Nợ chung của route công khai (dòng 176, 177); trần `pageSize` 30 và `q` ≤ 100 ký tự | Bị gọi dồn thì chậm khi nhiều bài | Throttling chung (X3 của auth và admin); chỉ mục nếu X1 không đạt (hỏi Đại) | Mở |
| 371 | `[ngày merge article F1]` | **Hai Quản trị viên sửa một bài: người ghi sau thắng** (không khoá lạc quan bằng `cap_nhat_lan_cuoi`) | Cỡ đồ án: ít người biên tập | Mất thay đổi của người ghi trước | Gửi kèm `capNhatLanCuoi` và so khi `PATCH` khoảng 1,5 giờ | Mở |
| 372 | `[ngày merge article F4]` | **Hằng ảnh (loại tệp, 10 MB) và hàm tải lên lặp** ở `features/article/admin/` so với `features/admin/specialties/` | Web không import chéo `features/`; không đưa vào `shared/` để khỏi đụng module khác | Đổi giới hạn ở một nơi mà quên nơi kia | Đưa vào `shared/` khi có consumer thứ ba | Mở |
| 373 | `[ngày merge article B4]` | **Cột `bai_viet.anh_dai_dien varchar(255)` còn lại nhưng luôn NULL** (ảnh đọc qua `anh_tai_len_id`) | Tương thích với DDL và nếp chuyên khoa | Hiểu nhầm có hai nguồn ảnh | Bỏ cột khi chắc không dùng (migration và ba file) | Mở |

### 4.3 Nháp lỗi AI (`AI-BUG-150`, `[đề xuất]`; chỉ ghi nếu Đại muốn, vì lỗi do AI tự phát hiện và sửa trước khi giao, chưa vào commit nào)

| Mã | Ngày | Mô tả lỗi | Nguyên nhân (phân tích) | Cách phát hiện | Commit sửa |
|---|---|---|---|---|---|
| `AI-BUG-150` | 28/11/2026 | Ở article (lập kế hoạch, MaxTrann, Claude Code Claude Sonnet 5.5): các sai sót trong bản nháp PLAN, sửa trước khi giao: (1) PLAN ghi `useFocusFirstInvalid` dùng được "qua `features/admin/index.ts`", trong khi `index.ts` **không xuất** hook này (chỉ `AdminConfirmationDialog`, `AdminDetailPanel`, `AdminSearchInput`, `AdminTable`, `AdminScopeGuard`, `useAdminScope`); (2) PLAN ghi trang công khai dùng `Breadcrumb` và `PUBLIC_CONTAINER` của search, trong khi `features/search/index.ts` **không xuất** hai thứ này và web cấm import chéo `features/`; (3) khi chọn tiền tố mã test, định dùng họ `BV…`, đã bị `BVR-01…07` của booking dùng (bắt trước khi viết, đổi sang `AB…`); (4) đếm số migration hiện có là 17, đúng là 18 (đếm lại bằng `git ls-tree`) | (1), (2) tin báo cáo agent khảo sát "đã có sẵn" mà chưa đối chiếu **bề mặt công khai** (`index.ts`) của module chứa nó; (3) chọn tên theo thói quen đặt tên mà chưa quét; (4) đếm bằng mắt từ danh sách dài | (1), (2) đối chiếu cuối phiên bằng `cat apps/web/src/features/admin/index.ts` và `features/search/index.ts` sau khi ghép PLAN; (3) quét `git grep` tiền tố trước khi viết; (4) đếm lại bằng lệnh | `[cần điền]` (chưa vào commit) |

Nếu review phát hiện thêm lỗi thì ghi tiếp từ **151**. Đại quyết có ghi `AI-BUG-150` hay không (lỗi do AI tự phát hiện và sửa trước khi giao).

## 5. Phối hợp với module khác

| Với | Điểm | Cần gì | Trạng thái |
|---|---|---|---|
| Trung (review) | chín PR của scope (B1, B2, F1, F2, B3, F3, B4, F4, X1), khoảng 4,5 giờ | review và approve; đang làm cả dashboard 33,5 giờ (R1) | chờ; giờ rảnh `[cần điền]` |
| Trung (dashboard) | F1 của article và F1 của dashboard cùng sửa `admin-layout.test.tsx`, `admin-routes.tsx`, `role-routes.tsx`; `app.module.ts`, `commitlint.config.cjs`, `AGENTS.md` | ai sau rebase; báo trước | chờ |
| Trung (admin P7) | B4 sửa `common/upload/*` và test upload, chuyên khoa; ca `CK-11/14` chập chờn (TECH_DEBT 326) | báo trước khi mở PR B4; chạy lại toàn bộ test upload và chuyên khoa | `[CẮT ĐƯỢC]` |
| Đại (search) | F2: `home-page.tsx` (khe `handbookSlot`), `public-layout.test.tsx` (KC-01), `home-page.test.tsx`, `empty-public-home-response.ts` | cùng chủ module; chạy cả bộ web | chờ |
| Đại (patient) | F1: sửa ca `AQ-03` ở `admin-profile-routing.test.tsx` | cùng chủ | chờ |
| Chatbot | **không đổi**; "nguồn bài viết" (+5 giờ ở PLAN chatbot 6.5) làm sau; ca G29 của bộ câu hỏi chuẩn vẫn đúng | khi nối bài viết thì sửa G29 và chatbot L8 | không chờ |
| Dashboard | không đụng dữ liệu của nhau | — | không chờ |
| Phiên kiểm | T1 đến T22 | duyệt kỹ thuật; chú ý T4, T5, T6, T11, T16, T22 | **đã duyệt** (28/11/2026), kèm bốn chỗ sửa đã làm |
| Đại (GitHub) | nhãn `module:article`, milestone `article`, Epic, script sinh issue (PLAN 6.6) | sau khi PR tài liệu merge | chờ |
| Đại (Word 2.4, Phạm vi) | sửa use case 2.4.55, 2.4.6, 2.4.22, 1.2.1, 1.3.12, Phân loại M16, Class Diagram (B4); cân nhắc ghi mốc F-6 và thêm đánh giá, ảnh vào dòng F-6 của Phạm vi (PLAN 4.6) | trước 01/12/2026 nếu F-6 vào hồ sơ SRS/SDD | chờ |
| Đại (dữ liệu, khoá) | bài mẫu cho kiểm tay; khoá Cloudinary dev cho ABK-07 | cho phép chạy X1 | `[CHỜ Đại]` |

## 6. Số đo thật (PLAN.md mục 5.16; **tiêu chí đặt TRƯỚC khi chạy, không đổi sau khi thấy số**)

| Mã | Đo | Tiêu chí đạt (`[đề xuất]`) | Kết quả |
|---|---|---|---|
| M1 | `GET /public/articles` trang 1, không lọc, 5.000 bài đã xuất bản | p95 ≤ 100 ms | chưa đo |
| M2 | như M1 với `the` là thẻ phổ biến | p95 ≤ 100 ms | chưa đo |
| M3 | như M1 với `q` khớp một từ trong tiêu đề | p95 ≤ 150 ms | chưa đo |
| M4 | `GET /public/articles/:id` kèm số đếm (khi có B3) | p95 ≤ 60 ms | chưa đo |
| M5 | `GET /admin/articles` kèm `demTheoTrangThai` | p95 ≤ 150 ms | chưa đo |
| M6 | `GET /public/article-tags` | p95 ≤ 150 ms | chưa đo |
| M7 | 20 lời gọi danh sách song song, pool 10 kết nối | 0 lỗi, p95 ≤ 1.000 ms | chưa đo |

Ngoài số đo: ABD-04 (collation của `hashtag.ten`) và ABN-04 (giới hạn thân JSON) ghi hành vi thật khi chạy; kết quả ảnh hưởng T6 và R8.

## 7. Cảnh báo và việc chờ (cập nhật khi có thay đổi)

- **Phương án vượt mốc của chỉ dẫn giao việc** (9 task, 35 giờ so với 6 đến 7 task, 15 đến 21 giờ) vì Đại chọn đánh giá (Q2) và ảnh (Q5) nằm trong; phần lõi 5 task, 22,5 giờ. Thứ tự cắt Q10 (ảnh, rồi đánh giá).
- **Lịch chặt (R1):** Iteration 10 còn khoảng 17 giờ cho Đại sau review dashboard và phần nối tiếp chatbot `[cần điền]`; Trung vừa làm dashboard vừa review chín PR. Phần lớn ảnh và đánh giá rơi vào Iteration 11.
- **T1 đến T22 đã được phiên kiểm duyệt kỹ thuật (28/11/2026)**, kèm bốn chỗ sửa chữ đã làm; theo tin của phiên kiểm, bước tiếp là gói commit, push, PR sau khi nhận "SẴN SÀNG"; **phiên lập kế hoạch không chạy git và không xác nhận quyền git, việc đó do Đại quyết**.
- **`[ĐỒNG BỘ TL]` ngoài repo (Đại):** use case 2.4.55, 2.4.6, 2.4.22, 1.2.1, 1.3.12, Phân loại M16, Class Diagram, văn bản Phạm vi dòng F-6 (PLAN 4.6); chưa sửa.
- **Việc của Đại sau khi PR tài liệu merge:** tạo nhãn `module:article` và milestone `article` (chưa có), Epic và chín issue (PLAN 6.6); gán Iteration 10, 11.
- **`[CHỜ Đại]`:** bài mẫu cho kiểm tay và bảo vệ; khoá Cloudinary dev (nếu còn B4); cho phép chạy X1 (lane nặng).
- **Chưa kiểm bằng cách chạy:** giả thuyết collation "mắt" ≡ "mặt", giới hạn thân JSON, mọi cỡ thời gian (chưa đo); chỗ nào ghi "suy ra" trong PLAN là chưa chạy thử.
