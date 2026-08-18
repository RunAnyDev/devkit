import { useMemo, useState } from 'react';
import {
  Copy, Check, Trash2, Keyboard, Hash, Type, Space, Lightbulb, ArrowRight, ArrowLeftRight
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
  { label: 'em',       latin: 'em',       digits: '33 6',                  note: 'example from the prompt' },
  { label: 'hello',    latin: 'hello',    digits: '44 33 555 555 666',     note: 'classic Nokia' },
  { label: 'abc',      latin: 'abc',      digits: '2 22 222',              note: 'press 2 repeatedly' },
  { label: 'hi ok',    latin: 'hi ok',    digits: '44 444 0 666 5',        note: 'space uses `0` (alone)' },
  { label: 'can',      latin: 'can',      digits: '222266',                note: 'no wrap: 2222 -> ca, +66 -> n' },
  { label: '2024',     latin: '2024',     digits: '2024',                  note: 'cluster with `0` -> kept as number' },
  { label: 'mot ngay', latin: 'mot ngay', digits: '6 666 8 0 66 4 2 999',  note: 'string with spaces' },
];

// ─── Component ───────────────────────────────────────────────────────────────
//
// Single unified panel with a mode toggle:
//   - 't9'    mode: input is a T9 key sequence, preview decodes to Latin.
//   - 'latin' mode: input is a Latin string, preview encodes to T9.
// The "Swap" button converts the current value to the other form and toggles
// the mode in one click — same pattern as the Morse converter.
const T9Converter = () => {
  const [mode, setMode] = useState('t9'); // 't9' | 'latin'
  const [value, setValue] = useState('33 6');

  const isT9Mode = mode === 't9';
  const t9Invalid = /[^0-9\s]/.test(value);
  const latinInvalid = /[^a-z0-9\s]/.test(value.toLowerCase());
  const invalid = isT9Mode ? t9Invalid : latinInvalid;
  const invalidMsg = isT9Mode
    ? 'Only digits 0-9 and whitespace are accepted.'
    : 'Only letters a-z, digits 0-9, and whitespace are accepted.';

  const preview = useMemo(() => {
    if (invalid || !value.trim()) return '';
    return isT9Mode ? t9ToLatin(value) : latinToT9(value);
  }, [value, invalid, isT9Mode]);

  // Swap: if we have a clean preview, move it into the input box and flip
  // the mode. If the input is invalid/empty, we still flip the mode but
  // leave the value alone so the user doesn't lose their typing.
  const handleSwap = () => {
    if (preview) setValue(preview);
    setMode(m => (m === 't9' ? 'latin' : 't9'));
  };

  // Loading an example also jumps to the matching mode, so the preview
  // reflects the example immediately without an extra click.
  const handlePickExample = (kind, digits, latin) => {
    if (kind === 't9') {
      setMode('t9');
      setValue(digits);
    } else {
      setMode('latin');
      setValue(latin);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto h-full overflow-y-auto pr-2">
      <Card title="T9 Phone Keypad ↔ Latin">
        <div className="flex flex-col gap-5">
          {/* ── Unified input with mode-aware label, preview, and Swap ── */}
          <UnifiedPanel
            mode={mode}
            value={value}
            onChange={setValue}
            onSwap={handleSwap}
            invalid={invalid}
            invalidMsg={invalidMsg}
            preview={preview}
            previewLabel={isT9Mode ? 'Decode (T9 → Latin)' : 'Encode (Latin → T9)'}
          />

          {/* ── Mode-specific helpers ── */}
          {isT9Mode ? (
            <Keypad value={value} onChange={setValue} />
          ) : null}
          <CheatSheet mode={mode} />

          {/* ── Reference + examples ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KeyMap />
            <Examples onPick={handlePickExample} />
          </div>
        </div>
      </Card>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const UnifiedPanel = ({
  mode, value, onChange, onSwap,
  invalid, invalidMsg, preview, previewLabel,
}) => {
  const [copied, setCopied] = useState(false);
  const isT9Mode = mode === 't9';
  const Icon = isT9Mode ? Hash : Type;
  const label = isT9Mode ? 'T9 key sequence' : 'Latin string';
  const placeholder = isT9Mode
    ? 'Example: 33 6  or  4433555 555666'
    : 'Example: em  or  hello';
  const otherModeName = isT9Mode ? 'Latin' : 'T9';

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
    <div className="flex flex-col gap-2 min-w-0">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 min-h-[34px]">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
          <Icon size={11} />
          {label}
        </label>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-slate-600">{value.length} chars</span>
          <Button
            variant="secondary"
            onClick={onSwap}
            icon={ArrowLeftRight}
            className="px-2 py-1"
            title={`Convert the current value to ${otherModeName} and switch mode`}
          >
            Swap
          </Button>
          <Button
            variant="ghost"
            onClick={handleCopy}
            disabled={!preview}
            icon={copied ? Check : Copy}
            className="px-2 py-1"
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onChange('')}
            disabled={!value}
            icon={Trash2}
            className="px-2 py-1"
          >
            Clear
          </Button>
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
};

const Keypad = ({ value, onChange }) => {
  const handleKey = (k) => onChange(value + k);
  const handleSpace = () => onChange(value + ' ');
  const handleBackspace = () => onChange(value.slice(0, -1));

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
        <Keyboard size={11} />
        Virtual keypad
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
                onClick={() => handleKey(k)}
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
            onClick={handleSpace}
            className="px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
          >
            <Space size={11} />
            Split group
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
          >
            ⌫ Delete 1 char
          </button>
        </div>
      </div>
    </div>
  );
};

const CheatSheet = ({ mode }) => {
  if (mode === 't9') {
    return (
      <div className="rounded-xl bg-slate-900/70 border border-slate-700/70 p-3 text-[11px] text-slate-500 leading-relaxed">
        <div><span className="font-mono text-slate-300">0</span> alone (by itself) -&gt; space.</div>
        <div>A digit cluster containing <span className="font-mono text-slate-300">0</span> and longer than 1 character -&gt; kept as a number
          (e.g. <span className="font-mono text-slate-300">2024</span> -&gt; <span className="font-mono text-blue-300">2024</span>).</div>
        <div>Cluster without <span className="font-mono text-slate-300">0</span> -&gt; T9 multi-tap decode.</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-slate-900/70 border border-slate-700/70 p-3 text-xs text-slate-500 leading-relaxed">
      Type <span className="font-mono text-slate-300">a-z</span>, <span className="font-mono text-slate-300">0-9</span> and whitespace; other characters are dropped.
      Letters are space-separated; number clusters pass through,
      e.g. <span className="font-mono text-slate-300">hello 2024</span> -&gt; <span className="font-mono text-blue-300">44 33 555 555 666 0 2024</span>.
    </div>
  );
};

const KeyMap = () => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
      Key map
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
        <span className="font-mono text-xs text-slate-400">space character</span>
      </div>
    </div>
  </div>
);

const Examples = ({ onPick }) => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
      <Lightbulb size={11} />
      Quick examples
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
              title={`Switch to Latin mode and load "${ex.latin}"`}
              onClick={() => onPick('latin', ex.digits, ex.latin)}
              className="px-2 py-1 rounded text-[10px] font-mono bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              latin
            </button>
            <button
              type="button"
              title={`Switch to T9 mode and load "${ex.digits}"`}
              onClick={() => onPick('t9', ex.digits, ex.latin)}
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
