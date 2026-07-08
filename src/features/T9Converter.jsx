import { useMemo, useState } from 'react';
import {
  Copy, Check, Trash2, Keyboard, Hash, Type, Space, AlertCircle, Lightbulb, ArrowRight
} from 'lucide-react';
import { Button, Card } from '../components/ui';

// ─── T9 logic ────────────────────────────────────────────────────────────────
//
// DECODE (t9ToLatin):
//  - Input is split by whitespace into tokens. Within each token, contiguous
//    digit runs form a "cluster"; non-digit characters are silently skipped.
//  - Cluster handling:
//      * cluster === '0' (isolated)        -> single space character
//      * cluster contains '0' AND length>1 -> NUMBER MODE: pass through verbatim
//                                             (e.g. '2024' -> '2024', '00' -> '00')
//      * cluster has no '0'                -> T9 decode (group same-digit runs).
//  - T9 decode uses `decodeRun` (no-wrap rule):
//      * N <= L (key length)               -> 1 letter at position N
//      * N >  L                            -> floor(N/L) letters at the LAST
//                                             position, plus one extra letter
//                                             at position (N % L) when N % L > 0.
//    So '2222' -> 'ca'; '77777' -> 'sp'; '222266' -> 'ca' + 'n' = 'can'.
//
// ENCODE (latinToT9):
//  - Lowercases input. Each letter becomes the key digit repeated by its
//    position. Spaces become '0'. Contiguous digit clusters are passed through
//    verbatim (mirrors the decoder's number-mode).
//  - Convention: always space-separate letter groups (canonical Nokia-style),
//    so output is round-trip-safe and visually grouped.
//  - Other characters (punctuation, ...) are dropped.
//  - Note: a standalone '0' digit in input becomes '0' on the wire; the
//    decoder always interprets '0' as space, so a literal zero round-trips
//    as space (no syntax to encode a bare zero digit in T9).
//
const T9_KEYS = {
  '2': 'abc',
  '3': 'def',
  '4': 'ghi',
  '5': 'jkl',
  '6': 'mno',
  '7': 'pqrs',
  '8': 'tuv',
  '9': 'wxyz',
};

// Build a reverse lookup once at module load: letter -> { digit, count }
const T9_REVERSE = (() => {
  const map = {};
  for (const [digit, letters] of Object.entries(T9_KEYS)) {
    for (let i = 0; i < letters.length; i++) {
      map[letters[i]] = { digit, count: i + 1 };
    }
  }
  return map;
})();

// Decode a run of `count` identical presses on a key whose letter group has
// length L. Rule (no-wrap): when presses exceed L, the previous letter is
// COMMITTED at the last position and a new letter starts from the beginning.
// Examples:  L=3: '222'='c', '2222'='ca', '222266'='ca'+'n'='can'
//            L=4: '7777'='s', '77777'='sp', '9999'='z', '99999'='zw'
const decodeRun = (letters, count) => {
  const L = letters.length;
  const fullCycles = Math.floor(count / L);
  const remainder = count % L;
  let out = letters[L - 1].repeat(fullCycles);
  if (remainder > 0) out += letters[remainder - 1];
  return out;
};

export const t9ToLatin = (input) => {
  const tokens = String(input ?? '').split(/\s+/);
  let out = '';
  for (const token of tokens) {
    if (!token) continue;
    let i = 0;
    while (i < token.length) {
      const ch = token[i];
      if (ch >= '0' && ch <= '9') {
        // Collect one contiguous digit cluster.
        let j = i;
        while (j < token.length && token[j] >= '0' && token[j] <= '9') j++;
        const cluster = token.slice(i, j);
        if (cluster === '0') {
          // Isolated '0' (alone in its cluster) -> space character.
          out += ' ';
        } else if (cluster.includes('0')) {
          // '0' adjacent to other digits -> the whole cluster is a number;
          // pass it through verbatim (e.g. '2024' -> '2024', '00' -> '00').
          out += cluster;
        } else {
          // T9 decode: group same-digit runs within the cluster.
          let k = 0;
          while (k < cluster.length) {
            const c = cluster[k];
            let run = 1;
            while (k + run < cluster.length && cluster[k + run] === c) run += 1;
            if (T9_KEYS[c]) out += decodeRun(T9_KEYS[c], run);
            k += run;
          }
        }
        i = j;
      } else {
        // Non-digit characters are silently skipped (kept for future pass-through).
        i++;
      }
    }
  }
  return out;
};

export const latinToT9 = (input) => {
  const text = String(input ?? '').toLowerCase();
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ') {
      parts.push('0');
      i++;
    } else if (ch >= '0' && ch <= '9') {
      // Contiguous digit cluster -> pass through verbatim (mirrors decoder
      // number-mode). E.g. '2024' -> '2024', '00' -> '00'.
      let j = i;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      parts.push(text.slice(i, j));
      i = j;
    } else if (T9_REVERSE[ch]) {
      parts.push(T9_REVERSE[ch].digit.repeat(T9_REVERSE[ch].count));
      i++;
    } else {
      i++; // skip unknown (punctuation etc.)
    }
  }
  return parts.join(' ');
};

// Visual layout for the on-screen keypad (rows of buttons).
// Only digits 1-9 and '0' are rendered; '*' and '#' are intentionally omitted
// to avoid accidental clicks. `null` cells are kept as placeholders so '0'
// stays centered in the 3-column grid.
const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', null],
];

// Each example carries both directions so a single click can populate either side.
const EXAMPLES = [
  { label: 'em',       latin: 'em',       digits: '33 6',                  note: 'ví dụ trong đề bài' },
  { label: 'hello',    latin: 'hello',    digits: '44 33 555 555 666',     note: 'Nokia cổ điển' },
  { label: 'abc',      latin: 'abc',      digits: '2 22 222',              note: 'lần lượt phím 2' },
  { label: 'hi ok',    latin: 'hi ok',    digits: '44 444 0 666 5',        note: 'space dùng `0` (đứng riêng)' },
  { label: 'can',      latin: 'can',      digits: '222266',                note: 'không quay vòng: 2222 -> ca, +66 -> n' },
  { label: '2024',     latin: '2024',     digits: '2024',                  note: 'cụm có `0` -> giữ nguyên số' },
  { label: 'mot ngay', latin: 'mot ngay', digits: '6 666 8 0 66 4 2 999',  note: 'chuỗi có dấu cách' },
];

// ─── Component ───────────────────────────────────────────────────────────────

const T9Converter = () => {
  // Two independent state vars. Each side owns its own input; the other side
  // shows the live conversion as a read-only preview. No circular updates.
  const [t9, setT9] = useState('33 6');
  const [latin, setLatin] = useState('em');

  const t9Invalid = /[^0-9\s]/.test(t9);
  const latinInvalid = /[^a-z0-9\s]/.test(latin.toLowerCase());

  const decoded = useMemo(() => (t9Invalid || !t9.trim() ? '' : t9ToLatin(t9)), [t9, t9Invalid]);
  const encoded = useMemo(() => (latinInvalid || !latin ? '' : latinToT9(latin)), [latin, latinInvalid]);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto h-full overflow-y-auto pr-2">
      <Card title="T9 Phone Keypad ↔ Latin">
        <div className="flex flex-col gap-5">
          {/* ── Bidirectional panels ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DigitPanel
              value={t9}
              onChange={setT9}
              preview={decoded}
              previewLabel="Decode (T9 → Latin)"
              invalid={t9Invalid}
              invalidMsg="Chỉ chấp nhận chữ số 0-9 và khoảng trắng."
              showKeypad
            />
            <LatinPanel
              value={latin}
              onChange={setLatin}
              preview={encoded}
              previewLabel="Encode (Latin → T9)"
              invalid={latinInvalid}
              invalidMsg="Chỉ chấp nhận chữ cái a-z, chữ số 0-9 và khoảng trắng."
            />
          </div>

          {/* ── Reference + examples ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KeyMap />
            <Examples
              onPickT9={setT9}
              onPickLatin={setLatin}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const PanelShell = ({
  label, icon: Icon, value, onChange, placeholder,
  preview, previewLabel, invalid, invalidMsg,
  charCount,
  onCopy, onClear, copied,
}) => (
  <div className="flex flex-col gap-2 min-w-0">
    {/* Header row */}
    <div className="flex items-center justify-between gap-3 min-h-[34px]">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
        <Icon size={11} />
        {label}
      </label>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-slate-600">{charCount}</span>
        {onCopy && (
          <Button
            variant="ghost"
            onClick={onCopy}
            disabled={!preview}
            icon={copied ? Check : Copy}
            className="px-2 py-1"
          >
            {copied ? 'Đã copy' : 'Copy'}
          </Button>
        )}
        {onClear && (
          <Button
            variant="ghost"
            onClick={onClear}
            disabled={!value}
            icon={Trash2}
            className="px-2 py-1"
          >
            Xóa
          </Button>
        )}
      </div>
    </div>

    {/* Input */}
    <textarea
      spellCheck={false}
      autoComplete="off"
      className={
        'bg-slate-900 border rounded-xl p-4 font-mono text-base text-slate-200 outline-none resize-none transition-colors placeholder-slate-600 focus:border-slate-500 min-h-[96px] ' +
        (invalid ? 'border-red-800/60 focus:border-red-700' : 'border-slate-700')
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />

    {/* Preview */}
    <div className="flex flex-col gap-1.5 mt-1">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
        <ArrowRight size={10} />
        {previewLabel}
      </div>
      <div
        className={
          'min-h-[64px] rounded-xl border p-3 font-mono text-sm break-words whitespace-pre-wrap ' +
          (invalid
            ? 'border-red-800/50 bg-red-950/20 text-red-300'
            : 'border-slate-700 bg-slate-800/60 text-blue-300')
        }
      >
        {invalid ? `⚠ ${invalidMsg}` : (preview || <span className="text-slate-600">…</span>)}
      </div>
    </div>
  </div>
);

const DigitPanel = ({ value, onChange, preview, previewLabel, invalid, invalidMsg, showKeypad }) => {
  const [copied, setCopied] = useState(false);
  const handleKey = (k) => onChange(value + k);
  const handleSpace = () => onChange(value + ' ');
  const handleBackspace = () => onChange(value.slice(0, -1));

  const handleCopy = async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview);
    } catch {
      const el = document.createElement('textarea');
      el.value = preview;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <PanelShell
        label="Chuỗi phím T9"
        icon={Hash}
        value={value}
        onChange={onChange}
        placeholder="Ví dụ: 33 6  hoặc  4433555 555666"
        preview={preview}
        previewLabel={previewLabel}
        invalid={invalid}
        invalidMsg={invalidMsg}
        charCount={`${value.length} ký tự`}
        onCopy={handleCopy}
        onClear={() => onChange('')}
        copied={copied}
      />
      {showKeypad && (
        <Keypad
          onKey={handleKey}
          onSpace={handleSpace}
          onBackspace={handleBackspace}
        />
      )}
      {/* Decode cheat-sheet */}
      <div className="rounded-xl bg-slate-900/70 border border-slate-700/70 p-3 text-[11px] text-slate-500 leading-relaxed">
        <div><span className="font-mono text-slate-300">0</span> đứng riêng (một mình) → space.</div>
        <div>Cụm chữ số có chứa <span className="font-mono text-slate-300">0</span> và dài hơn 1 ký tự → giữ nguyên số
          (vd <span className="font-mono text-slate-300">2024</span> → <span className="font-mono text-blue-300">2024</span>).</div>
        <div>Cụm không có <span className="font-mono text-slate-300">0</span> → decode T9 multi-tap.</div>
      </div>
    </div>
  );
};

const LatinPanel = ({ value, onChange, preview, previewLabel, invalid, invalidMsg }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview);
    } catch {
      const el = document.createElement('textarea');
      el.value = preview;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <PanelShell
        label="Chuỗi Latin"
        icon={Type}
        value={value}
        onChange={onChange}
        placeholder="Ví dụ: em  hoặc  hello"
        preview={preview}
        previewLabel={previewLabel}
        invalid={invalid}
        invalidMsg={invalidMsg}
        charCount={`${value.length} ký tự`}
        onCopy={handleCopy}
        onClear={() => onChange('')}
        copied={copied}
      />
      {/* Encode cheat-sheet */}
      <div className="rounded-xl bg-slate-900/70 border border-slate-700/70 p-3 text-xs text-slate-500 leading-relaxed">
        Gõ <span className="font-mono text-slate-300">a-z</span>, <span className="font-mono text-slate-300">0-9</span> và dấu cách; ký tự khác bị bỏ qua.
        Chữ cái tách bằng khoảng trắng; cụm số giữ nguyên,
        ví dụ <span className="font-mono text-slate-300">hello 2024</span> → <span className="font-mono text-blue-300">44 33 555 555 666 0 2024</span>.
      </div>
    </div>
  );
};

const Keypad = ({ onKey, onSpace, onBackspace }) => (
  <div className="flex flex-col gap-2">
    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
      <Keyboard size={11} />
      Bàn phím ảo
    </label>
    <div className="rounded-xl bg-slate-900/70 border border-slate-700/70 p-3">
      <div className="grid grid-cols-3 gap-1.5 max-w-[200px] mx-auto">
        {KEYPAD_ROWS.flat().map((k, idx) => (
          k === null ? (
            <div key={`empty-${idx}`} aria-hidden="true" />
          ) : (
            <button
              key={k}
              type="button"
              onClick={() => onKey(k)}
              className="aspect-square rounded-md bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-slate-200 font-mono text-base font-semibold transition-colors flex flex-col items-center justify-center"
            >
              <span>{k}</span>
              <span className="text-[9px] text-slate-500 font-normal tracking-widest mt-px">
                {k === '0' ? '␣' : T9_KEYS[k] || ''}
              </span>
            </button>
          )
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-2 max-w-[200px] mx-auto">
        <button
          type="button"
          onClick={onSpace}
          className="px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
        >
          <Space size={11} />
          Tách nhóm
        </button>
        <button
          type="button"
          onClick={onBackspace}
          className="px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
        >
          ⌫ Xóa 1 ký tự
        </button>
      </div>
    </div>
  </div>
);

const KeyMap = () => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
      Bảng phím
    </p>
    <div className="grid grid-cols-4 gap-2">
      {Object.entries(T9_KEYS).map(([digit, letters]) => (
        <div
          key={digit}
          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50"
        >
          <span className="font-mono text-base font-bold text-slate-200 w-5 text-center">
            {digit}
          </span>
          <span className="font-mono text-xs text-slate-400 tracking-wider">
            {letters.split('').join(' ')}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 col-span-4">
        <span className="font-mono text-base font-bold text-slate-200 w-5 text-center">0</span>
        <span className="font-mono text-xs text-slate-400">dấu cách (space)</span>
      </div>
    </div>
  </div>
);

const Examples = ({ onPickT9, onPickLatin }) => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
      <Lightbulb size={11} />
      Ví dụ nhanh
    </p>
    <div className="flex flex-col gap-2">
      {EXAMPLES.map((ex) => (
        <div
          key={ex.label}
          className="group flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-colors"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-semibold text-blue-300 truncate">{ex.label}</span>
            <span className="text-[11px] text-slate-500 truncate">{ex.note}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title={`Nạp "${ex.latin}" vào ô Latin`}
              onClick={() => onPickLatin(ex.latin)}
              className="px-2 py-1 rounded text-[10px] font-mono bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              latin
            </button>
            <button
              type="button"
              title={`Nạp "${ex.digits}" vào ô T9`}
              onClick={() => onPickT9(ex.digits)}
              className="px-2 py-1 rounded text-[10px] font-mono bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              t9
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default T9Converter;
