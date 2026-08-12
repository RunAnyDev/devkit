# Plan: Text Diff Tool (devkit)

## Background

devkit là collection dev tools in-browser (React + Vite + Tailwind), deploy lên
`kit.runany.dev`. Hiện có 2 diff tool: `Debezium Diff` (so sánh JSON before/after
cho CDC events) và `JSON Key Diff` (so sánh key set giữa 2 JSON). Thiếu tool
so sánh text thuần — use case phổ biến cho config/log/code/prose khi user không
muốn parse JSON trước.

## Goal

Thêm tool `Text Diff` vào sidebar group **Utilities** (cùng nhóm với Text
Analyzer, Epoch, Number Converter, v.v.), cho phép paste 2 đoạn text và render
diff trực quan ngay trong trang, không cần backend.

## Scope

### In scope
- Component `TextDiff` với 2 textarea (Original / Modified)
- Diff line-level + highlight word-level bên trong dòng đã đổi
- View toggle: side-by-side (default) ↔ inline/uni-diff
- Options: Ignore Whitespace, Ignore Case, Sync Scroll, Show Line Numbers
- Buttons: Compare (auto-trigger khi input đổi), Swap, Clear
- File upload: kéo/thả hoặc click để pick file → fill vào 1 trong 2 panel
- Empty / identical state messages
- Theo pattern sidebar group + route id như các tool hiện có

### Out of scope (gọi sau nếu cần)
- Diff 3-way (merge base)
- Patch export / apply (`.diff`, `.patch` files)
- Stats summary tổng `+N/-N` lines (mỗi thay đổi thêm nhỏ nhưng cộng dồn sẽ làm toolbar nặng — để v2)
- Drag-to-drop file lên panel cụ thể (chỉ 1 nút upload chung ban đầu)
- Persist state vào localStorage (cân nhắc sau, không cần MVP)
- Syntax highlighting (devkit có Markdown Viewer riêng; text diff giữ plain)

## Approach

### Library
Cài [`diff`](https://www.npmjs.com/package/diff) (jsdiff):
- ~30KB minified, MIT license
- API: `diffLines`, `diffWords`, `diffChars` — trả về array `[{ value, added?, removed? }]`
- Đủ cho line-level + word-level trong 1 package, không cần 2 lib
- `diff-match-patch` (Google) mạnh hơn cho char-level nhưng API verbose hơn, không cần

### Granularity strategy
- Bước 1: `diffLines(text1, text2, { ignoreWhitespace, ignoreCase })` → array of chunks
- Bước 2: với mỗi cặp (removed, added) liền kề, chạy thêm `diffWords` để lấy
  intra-line highlights
- Render: 2 cột (left cho removed/same, right cho added/same), word highlight
  inline dùng `<span class="bg-green-500/30">` / `bg-red-500/30`

### View modes
- **Side-by-side** (default): table 4 cột — left line#, left content, right line#, right content
  - Mỗi dòng 1 row, padding chung để hàng same căn đều 2 bên
  - Hàng chỉ có 1 bên (added/removed) để bên kia trống
- **Inline**: giống git diff — mỗi dòng prefix `+` / `-` / ` `, dùng chung line# accumulator
  - Compact, scroll ngắn hơn

### Options mapping
- `Ignore Whitespace` → `diffLines({ ignoreWhitespace: true })` + normalize trim
- `Ignore Case` → `diffLines({ ignoreCase: true })`
- `Sync Scroll` → onScroll handler sync top 2 panel (copy pattern từ `JsonKeyDiff.jsx`)
- `Show Line Numbers` → toggle cột line# ở side-by-side, prefix ở inline

### File upload
- Dùng `<input type="file" hidden ref>` + button trigger
- `FileReader.readAsText(file)` rồi set state của panel đang active (chọn
  panel qua small dropdown / radio: "Upload to: Original | Modified")
- Giới hạn 5MB để tránh treo trình duyệt với file log khổng lồ
- Drag-and-drop: lướt scope MVP, làm sau nếu user cần

## File structure

```
src/features/TextDiff/
  index.js              # export default TextDiff
  TextDiff.jsx          # main UI: state, toolbar, input panels, options
  DiffView.jsx          # render side-by-side / inline, nhận diff chunks
  diffUtils.js          # wrap jsdiff, normalize options, build chunks
```

### Integration points (4 file cần edit)
- `package.json` — thêm `"diff": "^7.0.0"` (pin version ổn định, jsdiff 7.x ESM-friendly)
- `src/features/index.js` — `export { default as TextDiff } from './TextDiff';`
- `src/App.jsx` — import `TextDiff` + thêm vào `MENU_GROUPS` (Utilities) + `FEATURE_COMPONENTS`
- `README.md` — thêm dòng tool mới vào bảng Features

## UI sketch (toolbar)

```
┌──────────────────────────────────────────────────────────────────┐
│  [📄 Upload ▾] │ [☐ Ignore WS] [☐ Ignore Case] [☐ Sync Scroll]    │
│                                       [☐ Line#]  [⇄ Side-by-side]│
│                                              [Swap] [Clear]       │
└──────────────────────────────────────────────────────────────────┘
```

Toolbar dùng cùng class Tailwind như `JsonKeyDiff.jsx` để giữ visual đồng nhất
(`bg-slate-800`, `border-slate-700`, `text-slate-300`, button variants từ
`components/ui`).

## Implementation order

1. `npm install diff` + verify import works trong Vite
2. Tạo `diffUtils.js`:
   - `computeLineDiff(a, b, opts)` → array chunks normalized
   - `computeWordDiff(removedLine, addedLine)` → cho intra-line highlight
3. Tạo `TextDiff.jsx` shell: state, toolbar, 2 textarea, file upload handler
4. Tạo `DiffView.jsx`: render side-by-side, switch sang inline qua prop
5. Wire options (ignore ws/case, sync scroll, line#) — test với 3-4 case
6. Đăng ký vào `App.jsx` + `features/index.js`
7. Update `README.md` bảng features
8. Build test: `npm run build` phải pass clean

## Verification

- **Functional cases:**
  - 2 text identical → "No differences"
  - 1 dòng thêm ở cuối → hiển thị đúng 1 hàng added
  - 1 dòng sửa giữa file → 1 hàng removed + 1 hàng added với word highlight
  - File CRLF (Windows) vs LF (Unix) → normalize, không báo diff vô nghĩa
  - Empty input 1 bên → toàn bộ bên kia là added/removed
- **Options:**
  - Ignore WS bật → diff tối thiểu khi chỉ khác indent
  - Sync Scroll bật → scroll 1 bên, bên kia theo
  - Side-by-side ↔ inline toggle không mất state
- **Performance:** 10k dòng mỗi bên → render <500ms, scroll mượt
- **Build:** `npm run build` pass, không warning bundle size
- **Visual:** dùng màu đỏ/xanh giống pattern `Debezium Diff` để consistent

## Risks & mitigations

- **Bundle bloat**: jsdiff ~30KB gzipped. Chấp nhận được, devkit đang <500KB total.
- **Perf với file rất lớn**: 100k+ dòng có thể lag. Mitigation: warn user khi
  > 50k dòng, hoặc debounce compute. Để v2.
- **Encoding issues**: file binary/non-UTF8 → fallback readAsText với charset
  detection, hiện chỉ dùng UTF-8 (giống các tool khác).
- **CSS collision**: dùng Tailwind utility class giống `JsonKeyDiff` để khỏi
  đụng global style.

## Next step

Sau khi bạn duyệt plan này, mình sẽ:
1. `npm install diff` và verify Vite import
2. Tạo skeleton `TextDiff/` theo file structure trên
3. Implement `diffUtils.js` trước (pure logic, dễ test) rồi mới đến UI
4. Wire vào App.jsx, smoke test trên `npm run dev`
5. Build verify + update README

Estimate: 1 turn implement + 1 turn verify/test. Nếu muốn mình làm luôn thì confirm "go".
