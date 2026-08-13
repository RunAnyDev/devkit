import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy, Check, Trash2, Type, Hash, Radio, Play, Square,
  Volume2, ArrowRight, ArrowLeftRight, Activity
} from 'lucide-react';
import { Button, Card } from '../components/ui';

// ─── Morse code table (ITU / International Morse) ────────────────────────────
// Letters A-Z, digits 0-9, and the most common punctuation. Unknown
// characters are dropped during encoding.
const MORSE_TABLE = {
  // Letters
  'A': '.-',   'B': '-...', 'C': '-.-.', 'D': '-..',  'E': '.',
  'F': '..-.', 'G': '--.',  'H': '....', 'I': '..',   'J': '.---',
  'K': '-.-',  'L': '.-..', 'M': '--',   'N': '-.',   'O': '---',
  'P': '.--.', 'Q': '--.-', 'R': '.-.',  'S': '...',  'T': '-',
  'U': '..-',  'V': '...-', 'W': '.--',  'X': '-..-', 'Y': '-.--',
  'Z': '--..',
  // Digits
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  // Common punctuation
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
  '!': '-.-.--', '/': '-..-.',  '(': '-.--.',  ')': '-.--.-',
  '&': '.-...',  ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.',  '-': '-....-', '_': '..--.-', '"': '.-..-.',
  '$': '...-..-','@': '.--.-.',
};

// Build reverse lookup once at module load: morse code -> char
const MORSE_REVERSE = (() => {
  const map = {};
  for (const [char, code] of Object.entries(MORSE_TABLE)) map[code] = char;
  return map;
})();

// ─── Decode: morse -> text ──────────────────────────────────────────────────
// Accepted separators:
//   - one or more spaces (' '), or '|', between letters
//   - '/', with optional surrounding whitespace, between words
// Unknown codes (no entry in MORSE_REVERSE) are silently skipped.
export const morseToText = (input) => {
  const text = String(input ?? '').trim();
  if (!text) return '';
  const normalized = text.replace(/\|/g, ' ');
  const words = normalized.split(/\s*\/\s*/);
  return words
    .map(word => {
      if (!word.trim()) return '';
      return word
        .trim()
        .split(/\s+/)
        .map(code => MORSE_REVERSE[code] || '')
        .join('');
    })
    .filter(w => w)
    .join(' ');
};

// ─── Encode: text -> morse ──────────────────────────────────────────────────
// ' ' separates letters; ' / ' separates words. Unknown characters (including
// non-ASCII) are dropped so the output is always valid morse.
export const textToMorse = (input) => {
  const text = String(input ?? '').toUpperCase();
  const words = text.split(/\s+/).filter(Boolean);
  return words
    .map(word =>
      word
        .split('')
        .map(ch => MORSE_TABLE[ch] || '')
        .filter(Boolean)
        .join(' ')
    )
    .join(' / ');
};

// ─── Timeline builder ───────────────────────────────────────────────────────
// Breaks a morse string into a flat list of timed tokens + a list of letter
// spans. The same data is used by:
//   1. Web Audio scheduling (one oscillator per ON token)
//   2. The SVG signal visualization (one rect per token + letter labels)
//
// ITU timing standard:
//   dit (dot)            = 1 unit ON
//   dah (dash)           = 3 units ON
//   intra-letter gap     = 1 unit OFF
//   inter-letter gap     = 3 units OFF
//   inter-word gap       = 7 units OFF (= letter gap + 4 extra units)
//   unit (ms)            = 1200 / WPM    (PARIS-standard word = 50 units)
export const buildTimeline = (morse, wpm) => {
  const unit = 1200 / wpm;
  if (!morse || !morse.trim()) return { tokens: [], letters: [], totalMs: 0 };

  const parts = morse.trim().split(/\s+/);
  const tokens = [];
  const letters = [];
  let t = 0;
  let letterIdx = 0;

  // Tracks when each token starts in absolute ms. We add `start` and `end` to
  // every token because the SVG renderers and the active-state scan rely on
  // them. NaN here would cascade into invalid SVG attribute warnings.
  const stamp = (tok) => {
    tok.start = t;
    t += tok.duration;
    tok.end = t;
    return tok;
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '') continue;

    // Word boundary: the previous letter already contributed its 3u trailing
    // gap, so we add 4 more units to reach the full 7u inter-word gap.
    if (part === '/') {
      stamp(tokens[ tokens.push({ type: 'off', duration: 4 * unit, kind: 'word', charIdx: -1, positionInChar: -1 }) - 1 ]);
      continue;
    }

    // Emit elements (dots/dashes) and intra-letter gaps for this letter.
    const letterStart = t;
    const myCharIdx = letterIdx;
    for (let j = 0; j < part.length; j++) {
      const ch = part[j];
      if (ch === '.') {
        stamp(tokens[ tokens.push({ type: 'on', duration: unit, kind: 'dot', charIdx: myCharIdx, positionInChar: j }) - 1 ]);
      } else if (ch === '-') {
        stamp(tokens[ tokens.push({ type: 'on', duration: 3 * unit, kind: 'dash', charIdx: myCharIdx, positionInChar: j }) - 1 ]);
      }
      if (j < part.length - 1) {
        stamp(tokens[ tokens.push({ type: 'off', duration: unit, kind: 'intra', charIdx: myCharIdx, positionInChar: j }) - 1 ]);
      }
    }
    const letterEnd = t;

    // Trailing gap: 3u if another letter follows, none if '/' or end.
    const next = parts[i + 1];
    if (next !== undefined && next !== '' && next !== '/') {
      stamp(tokens[ tokens.push({ type: 'off', duration: 3 * unit, kind: 'letter', charIdx: myCharIdx, positionInChar: part.length - 1 }) - 1 ]);
    }

    letters.push({
      idx: letterIdx++,
      start: letterStart,
      end: letterEnd,
      char: MORSE_REVERSE[part] || '?',
      morse: part,
    });
  }

  return { tokens, letters, totalMs: t };
};

// ─── Morse tree builder ─────────────────────────────────────────────────────
// Builds a binary tree from the morse table. Each node represents a prefix
// of a morse code; leaves are the actual characters. DIT = left child,
// DAH = right child. Used by the tree-map visualization so the user can
// watch the playback path light up from the root to the current letter.
const buildMorseTree = () => {
  const root = { char: null, dit: null, dah: null };
  for (const [char, code] of Object.entries(MORSE_TABLE)) {
    let node = root;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      const childKey = ch === '.' ? 'dit' : 'dah';
      if (!node[childKey]) {
        node[childKey] = { char: null, dit: null, dah: null, parent: node, edge: childKey };
      }
      node = node[childKey];
    }
    node.char = char;
  }
  return root;
};

// ─── Tree layout (leaf-counting) ────────────────────────────────────────────
// Assigns (x, y) positions to each node so that each subtree is centered
// above its children. Width is measured in "leaf units"; the SVG renderer
// multiplies by a node-spacing constant.
const layoutTree = (root) => {
  const widthCache = new Map();
  const computeWidth = (node) => {
    if (!node) return 0;
    if (widthCache.has(node)) return widthCache.get(node);
    let w;
    if (!node.dit && !node.dah) w = 1;
    else w = (node.dit ? computeWidth(node.dit) : 0) + (node.dah ? computeWidth(node.dah) : 0);
    widthCache.set(node, w);
    return w;
  };

  const nodes = [];
  const edges = [];
  const assign = (node, depth, leftX) => {
    if (!node) return;
    const w = computeWidth(node);
    const x = leftX + w / 2;
    nodes.push({ node, x, depth });
    const ditW = node.dit ? computeWidth(node.dit) : 0;
    if (node.dit) {
      edges.push({ from: node, to: node.dit, kind: 'dit' });
      assign(node.dit, depth + 1, leftX);
    }
    if (node.dah) {
      edges.push({ from: node, to: node.dah, kind: 'dah' });
      assign(node.dah, depth + 1, leftX + ditW);
    }
  };
  assign(root, 0, 0);

  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  return { nodes, edges, totalWidth: computeWidth(root), maxDepth };
};

// ─── Audio playback (Web Audio API) ─────────────────────────────────────────
// We schedule one OscillatorNode per ON token and a smooth gain envelope on
// each to avoid clicks. RAF ticks update a `playhead` state for the cursor.
//
// Important: the playhead is driven primarily by `performance.now()` (wall
// clock), NOT by `ctx.currentTime`. If the AudioContext is blocked / fails
// to resume (e.g. strict autoplay policy, system audio muted, browser bug),
// `ctx.currentTime` would never advance and the tick would loop forever with
// no way to ever call `onEnd`. Using the wall clock as the primary source
// guarantees the playback always finishes at the right wall-clock time, even
// when no audio is actually being produced. A safety timeout (1.5s past the
// expected end) is also in place to force-end if anything goes wrong.
const useMorsePlayer = (tokens, freq, onProgress, onEnd) => {
  const ctxRef = useRef(null);
  const sourcesRef = useRef([]);
  const rafRef = useRef(0);
  const stopRef = useRef(() => {});
  const onProgressRef = useRef(onProgress);
  const onEndRef = useRef(onEnd);
  onProgressRef.current = onProgress;
  onEndRef.current = onEnd;

  const play = () => {
    stopRef.current();
    if (!tokens.length) {
      onEndRef.current?.();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      console.error('Morse playback: Web Audio API is not supported in this browser.');
      onEndRef.current?.();
      return;
    }
    let ctx;
    try {
      ctx = new Ctor();
    } catch (e) {
      console.error('Morse playback: failed to create AudioContext', e);
      onEndRef.current?.();
      return;
    }

    // Latches so we only end once, even if multiple paths race to call onEnd.
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (safetyTimer) clearTimeout(safetyTimer);
      sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
      sourcesRef.current = [];
      try { ctx.close(); } catch {}
      ctxRef.current = null;
      onEndRef.current?.();
    };

    const totalMs = tokens[tokens.length - 1].end;
    const wallStart = performance.now();
    // Schedule the safety timer to fire 1s after the expected end so the UI
    // can never get stuck in the playing state, even if all RAF / audio
    // machinery fails silently.
    const safetyTimer = setTimeout(finish, totalMs + 1000);

    const startPlayback = () => {
      ctxRef.current = ctx;
      let startAt = 0;
      try { startAt = ctx.currentTime + 0.05; } catch {}
      const sources = [];
      try {
        for (const tk of tokens) {
          if (tk.type !== 'on') continue;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const onset = startAt + tk.start / 1000;
          const offset = onset + tk.duration / 1000;
          // 5ms attack/release on each tone to suppress click artifacts.
          // Peak gain 0.4 (was 0.25) — many systems need a louder signal.
          gain.gain.setValueAtTime(0, onset);
          gain.gain.linearRampToValueAtTime(0.4, onset + 0.005);
          gain.gain.setValueAtTime(0.4, offset - 0.005);
          gain.gain.linearRampToValueAtTime(0, offset);
          osc.connect(gain).connect(ctx.destination);
          osc.start(onset);
          osc.stop(offset + 0.01);
          sources.push(osc);
        }
      } catch (e) {
        console.error('Morse playback: failed to schedule oscillators', e);
        finish();
        return;
      }
      sourcesRef.current = sources;

      const tick = () => {
        // Wall clock is the source of truth. If the AudioContext is dead or
        // never started, the wall clock will still reach `totalMs` and we
        // can finish cleanly. ctx.currentTime is only used as a tiebreaker
        // when the context IS running and we want sub-frame precision.
        const wallElapsed = performance.now() - wallStart;
        if (wallElapsed >= totalMs) {
          onProgressRef.current(totalMs);
          finish();
          return;
        }
        onProgressRef.current(wallElapsed);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    // Fire-and-forget the resume — don't await, that would risk losing the
    // user-activation window. startPlayback will be called either from the
    // resume() resolution or, if the context is already running, sync.
    const begin = () => {
      if (ended) return;
      if (ctx.state === 'running') {
        startPlayback();
        return;
      }
      try {
        const p = ctx.resume();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (ended) return;
            if (ctx.state === 'running') {
              startPlayback();
            } else {
              // Resume resolved but state still not running — still start
              // the tick so the playhead animates from the wall clock; the
              // audio may be silent but the UI must not get stuck.
              console.warn('Morse playback: ctx.state still', ctx.state, 'after resume; running silent mode');
              startPlayback();
            }
          }).catch((e) => {
            console.error('Morse playback: ctx.resume() rejected', e);
            if (ended) return;
            // Even if resume rejects, try to start the visual playback from
            // the wall clock. Audio may be silent; UI will not get stuck.
            startPlayback();
          });
        } else {
          // Synchronous resume (older API). Try to start immediately.
          startPlayback();
        }
      } catch (e) {
        console.error('Morse playback: ctx.resume() threw', e);
        if (ended) return;
        startPlayback();
      }
    };
    begin();
  };

  stopRef.current = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current = [];
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch {}
      ctxRef.current = null;
    }
  };

  // Cleanup on unmount: read the latest stop via the ref to avoid TDZ issues.
  useEffect(() => () => { stopRef.current(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { play, stop: stopRef.current };
};

// ─── Main component ─────────────────────────────────────────────────────────
const MorseConverter = () => {
  // One unified input with a mode toggle. The "value" is always text or morse
  // depending on `mode`; the preview shows the conversion in the other form.
  // Swap button converts the current value to the other mode and toggles.
  const [mode, setMode] = useState('text'); // 'text' | 'morse'
  const [value, setValue] = useState('SOS');
  const [wpm, setWpm] = useState(15);
  const [freq, setFreq] = useState(600);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);

  const textInvalid = /[^A-Za-z0-9\s.,?!'&:;=\-+_/"@$()]/.test(value);
  const morseInvalid = /[^.\-\s|/]/.test(value);
  const invalid = mode === 'text' ? textInvalid : morseInvalid;

  const preview = useMemo(() => {
    if (invalid || !value.trim()) return '';
    return mode === 'text' ? textToMorse(value) : morseToText(value);
  }, [mode, value, invalid]);

  // For playback: encode text mode into morse, or use morse mode directly.
  const morseToPlay = useMemo(() => {
    if (!value.trim()) return '';
    if (mode === 'text') return textInvalid ? '' : textToMorse(value);
    return morseInvalid ? '' : value.trim();
  }, [mode, value, textInvalid, morseInvalid]);

  // First valid morse code in the playback string. Used as the default
  // character for the code-path visualization when nothing is playing yet,
  // so the model is visible immediately.
  const firstMorseCode = useMemo(() => {
    if (!morseToPlay) return null;
    for (const tok of morseToPlay.split(/\s+/)) {
      if (tok && tok !== '/') return tok;
    }
    return null;
  }, [morseToPlay]);

  // Swap: convert current value to the other form and toggle the mode.
  const handleSwap = () => {
    if (mode === 'text') {
      setValue(textInvalid ? '' : textToMorse(value));
      setMode('morse');
    } else {
      setValue(morseInvalid ? '' : morseToText(value));
      setMode('text');
    }
  };

  const { tokens, letters, totalMs } = useMemo(
    () => buildTimeline(morseToPlay, wpm),
    [morseToPlay, wpm]
  );

  // Derive the "active character" for the tree-map visualization. We find
  // the token whose [start, end) interval contains the playhead and pull
  // out the character and step index. During gaps, the step is the one we
  // just played; during ON tokens, it's the symbol currently sounding.
  const activeState = useMemo(() => {
    if (!isPlaying || !tokens.length) {
      return { activeChar: null, activeStep: -1, isOn: false };
    }
    let activeToken = null;
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (playhead >= tk.start && playhead < tk.end) {
        activeToken = tk;
        break;
      }
    }
    if (!activeToken || activeToken.charIdx == null || activeToken.charIdx < 0) {
      return { activeChar: null, activeStep: -1, isOn: false };
    }
    const char = letters.find(l => l.idx === activeToken.charIdx) || null;
    return {
      activeChar: char,
      activeStep: activeToken.positionInChar ?? -1,
      isOn: activeToken.type === 'on',
    };
  }, [playhead, tokens, letters, isPlaying]);

  const handlePlayEnd = () => setIsPlaying(false);
  const player = useMorsePlayer(tokens, freq, setPlayhead, handlePlayEnd);

  const handlePlay = () => {
    if (!morseToPlay || isPlaying) return;
    setPlayhead(0);
    setIsPlaying(true);
    player.play();
  };
  const handleStop = () => {
    player.stop();
    setIsPlaying(false);
    setPlayhead(0);
  };

  // If the user edits the input mid-playback, stop cleanly.
  useEffect(() => {
    if (isPlaying) handleStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morseToPlay, wpm, freq]);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto pr-2 pb-4">
      <Card title="Morse Code ↔ Text">
        <div className="flex flex-col gap-5">
          {/* ── Unified input with mode toggle + swap ── */}
          <UnifiedPanel
            mode={mode}
            value={value}
            onChange={setValue}
            onSwap={handleSwap}
            invalid={invalid}
            invalidMsg={mode === 'text'
              ? "Only letters, digits, and common punctuation are supported."
              : "Only dots, dashes, whitespace, and '/' are accepted."}
            preview={preview}
            previewLabel={mode === 'text' ? 'Encode (Text → Morse)' : 'Decode (Morse → Text)'}
          />

          {/* ── Audio playback + signal visualization ── */}
          <AudioVizCard
            tokens={tokens}
            letters={letters}
            totalMs={totalMs}
            playhead={playhead}
            isPlaying={isPlaying}
            activeChar={activeState.activeChar}
            activeStep={activeState.activeStep}
            activeIsOn={activeState.isOn}
            wpm={wpm}
            setWpm={setWpm}
            freq={freq}
            setFreq={setFreq}
            onPlay={handlePlay}
            onStop={handleStop}
            disabled={!morseToPlay}
            hasContent={!!morseToPlay}
            defaultChar={firstMorseCode ? (MORSE_REVERSE[firstMorseCode] || null) : null}
          />

          {/* ── Reference only ── */}
          <div className="grid grid-cols-1 gap-4">
            <MorseReference />
          </div>
        </div>
      </Card>
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const UnifiedPanel = ({
  mode, value, onChange, onSwap,
  invalid, invalidMsg, preview, previewLabel,
}) => {
  const [copied, setCopied] = useState(false);
  const isTextMode = mode === 'text';
  const Icon = isTextMode ? Type : Hash;
  const label = isTextMode ? 'Text' : 'Morse';

  const handleCopy = async () => {
    if (!preview) return;
    try { await navigator.clipboard.writeText(preview); }
    catch {
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
      <div className="flex items-center justify-between gap-3 min-h-[34px]">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
          <Icon size={11} />
          {label}
          <span className="text-slate-600 normal-case font-normal ml-0.5">mode</span>
        </label>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-slate-600">{value.length} chars</span>
          <Button
            variant="ghost"
            onClick={onSwap}
            icon={ArrowLeftRight}
            className="px-2 py-1"
            title={`Switch to ${isTextMode ? 'Morse' : 'Text'} mode and convert the input`}
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

      <textarea
        spellCheck={false}
        autoComplete="off"
        className={
          'bg-slate-900 border rounded-xl p-4 font-mono text-base text-slate-200 outline-none resize-none transition-colors placeholder-slate-600 focus:border-slate-500 min-h-[96px] ' +
          (invalid ? 'border-red-800/60 focus:border-red-700' : 'border-slate-700')
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isTextMode
          ? 'Example: SOS  or  hello world'
          : "Example: ... --- ...  (use '/' for word gaps)"}
      />

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

const AudioVizCard = ({
  tokens, letters, totalMs, playhead, isPlaying,
  activeChar, activeStep, activeIsOn,
  wpm, setWpm, freq, setFreq, onPlay, onStop, disabled, hasContent,
  defaultChar,
}) => (
  <div className="rounded-xl border border-slate-700 bg-slate-900/40 overflow-hidden">
    {/* Header: title + controls */}
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-700 bg-slate-800/40">
      <div className="flex items-center gap-2">
        <Volume2 size={14} className="text-amber-400" />
        <span className="text-sm font-semibold text-slate-200">Audio & Signal</span>
        <span className="text-[11px] text-slate-500 hidden sm:inline">
          hear the dots &amp; dashes, watch the timing
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {isPlaying && (
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400 mr-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
            </span>
            PLAYING
          </span>
        )}
        {!isPlaying ? (
          <Button
            onClick={onPlay}
            disabled={disabled}
            icon={Play}
            className="px-3 py-1.5"
          >
            Play
          </Button>
        ) : (
          <Button
            onClick={onStop}
            icon={Square}
            className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900/80 text-red-200 border border-red-800 shadow-lg shadow-red-500/10"
          >
            Stop
          </Button>
        )}
      </div>
    </div>

    {/* Speed + frequency sliders */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 border-b border-slate-700/60">
      <SliderRow
        label="Speed"
        unit="WPM"
        value={wpm}
        min={5}
        max={40}
        step={1}
        onChange={setWpm}
        hint="Words per minute (PARIS standard). Faster = shorter unit time."
      />
      <SliderRow
        label="Tone"
        unit="Hz"
        value={freq}
        min={300}
        max={1000}
        step={10}
        onChange={setFreq}
        hint="Carrier frequency for the beeps."
      />
    </div>

    {/* Signal visualization */}
    <div className="p-4">
      {hasContent ? (
        <SignalTimeline
          tokens={tokens}
          letters={letters}
          totalMs={totalMs}
          playhead={playhead}
          isPlaying={isPlaying}
        />
      ) : (
        <div className="h-[120px] flex flex-col items-center justify-center gap-1 text-slate-600 text-sm">
          <Activity size={20} className="text-slate-700" />
          <span>Type text or morse above to render the signal.</span>
        </div>
      )}

      {/* Tree map: shows the morse code as a binary tree (DIT left, DAH
          right). During playback, the path from the root to the current
          character lights up step by step. */}
      {hasContent && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            <Radio size={10} />
            Code path
            <span className="text-slate-600 normal-case font-normal tracking-normal">
              — see how each letter is built step by step
            </span>
          </div>
          <MorseCodePath
            activeChar={activeChar}
            activeStep={activeStep}
            isOn={activeIsOn}
            isPlaying={isPlaying}
            hasContent={hasContent}
            defaultChar={defaultChar}
          />
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[10px] text-slate-500">
        <LegendDot color="bg-amber-400" label="ON (dit or dah)" />
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-amber-300">.</span> dit = 1u
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-amber-300">-</span> dah = 3u
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-slate-500">|||</span> intra = 1u
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-slate-400">|||</span> letter = 3u
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-slate-300">|||</span> word = 7u
        </span>
        <span className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-700">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> DIT
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-1 rounded-sm bg-blue-500" /> DAH
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" /> current
        </span>
      </div>
    </div>
  </div>
);

const SliderRow = ({ label, unit, value, min, max, step, onChange, hint }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        {label}
      </span>
      <span className="font-mono text-slate-300">
        {value} <span className="text-slate-500">{unit}</span>
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-amber-400 cursor-pointer"
    />
    {hint && <div className="text-[10px] text-slate-600">{hint}</div>}
  </div>
);

// ─── Signal timeline (SVG) ─────────────────────────────────────────────────
// Renders the morse signal as a horizontal bar of ON/OFF segments with the
// decoded letter centered under each letter's span. The playhead is a fixed-
// width vertical line that moves via state. Container is measured so we can
// auto-scale the signal to fit; very long messages get horizontal scroll
// instead of being crammed into a 1px-per-unit view.
const SIGNAL_MIN_PX_PER_MS = 0.04; // ~ 40px per second of audio minimum
const SIGNAL_BAR_HEIGHT = 56;
const SIGNAL_PADDING = 12;

const SignalTimeline = ({ tokens, letters, totalMs, playhead, isPlaying }) => {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!tokens.length || totalMs === 0) return null;

  // Pick a px/ms scale that fills the container but never gets smaller than
  // the minimum readable density.
  const fitScale = containerWidth / totalMs;
  const pxPerMs = Math.max(SIGNAL_MIN_PX_PER_MS, fitScale);
  const totalWidth = Math.max(containerWidth, totalMs * pxPerMs);
  const innerWidth = totalWidth - 2 * SIGNAL_PADDING;
  const svgWidth = totalMs * pxPerMs;

  // Letter label font scales with density so long messages stay readable.
  const labelFontSize = pxPerMs > 0.1 ? 11 : Math.max(7, 11 - (0.1 - pxPerMs) * 40);
  const showLabels = letters.length <= 80; // skip labels if too many to be useful

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-x-auto overflow-y-hidden rounded-lg bg-slate-950 border border-slate-800"
      style={{ height: SIGNAL_BAR_HEIGHT + 36 }}
    >
      <div style={{ width: totalWidth, position: 'relative' }}>
        <svg
          width={svgWidth}
          height={SIGNAL_BAR_HEIGHT + 36}
          viewBox={`0 0 ${svgWidth} ${SIGNAL_BAR_HEIGHT + 36}`}
          style={{ display: 'block' }}
        >
          {/* Base line through the middle of the bar */}
          <line
            x1={0}
            y1={SIGNAL_BAR_HEIGHT / 2 + 4}
            x2={svgWidth}
            y2={SIGNAL_BAR_HEIGHT / 2 + 4}
            stroke="#1e293b"
            strokeWidth={1}
          />

          {/* Token rectangles */}
          <g transform={`translate(${SIGNAL_PADDING}, 0)`}>
            {tokens.map((tk, i) => {
              if (tk.type !== 'on') return null;
              const x = tk.start * pxPerMs;
              const w = tk.duration * pxPerMs;
              return (
                <rect
                  key={i}
                  x={x}
                  y={4}
                  width={Math.max(w, 1)}
                  height={SIGNAL_BAR_HEIGHT - 8}
                  fill={tk.kind === 'dash' ? '#fbbf24' : '#fcd34d'}
                  rx={2}
                />
              );
            })}

            {/* Word boundary markers (dashed vertical line) */}
            {tokens.map((tk, i) => {
              if (tk.type !== 'off' || tk.kind !== 'word') return null;
              return (
                <line
                  key={`wb-${i}`}
                  x1={tk.start * pxPerMs}
                  y1={2}
                  x2={tk.start * pxPerMs}
                  y2={SIGNAL_BAR_HEIGHT - 2}
                  stroke="#475569"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              );
            })}

            {/* Playhead */}
            <line
              x1={playhead * pxPerMs}
              y1={0}
              x2={playhead * pxPerMs}
              y2={SIGNAL_BAR_HEIGHT}
              stroke={isPlaying ? '#22d3ee' : '#60a5fa'}
              strokeWidth={isPlaying ? 3 : 2}
              style={{
                filter: isPlaying
                  ? 'drop-shadow(0 0 6px #22d3ee)'
                  : 'drop-shadow(0 0 4px #60a5fa)',
              }}
            />

            {/* Letter labels */}
            {showLabels && letters.map((lt) => {
              const mid = ((lt.start + lt.end) / 2) * pxPerMs;
              return (
                <text
                  key={`lbl-${lt.idx}`}
                  x={mid}
                  y={SIGNAL_BAR_HEIGHT + 22}
                  textAnchor="middle"
                  fontSize={labelFontSize}
                  fill="#cbd5e1"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {lt.char}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};

const LegendDot = ({ color, label }) => (
  <span className="flex items-center gap-1.5">
    <span className={`inline-block w-2.5 h-2.5 rounded-sm ${color}`} />
    {label}
  </span>
);

// ─── Morse code path visualization ──────────────────────────────────────────
// A pedagogical "build the letter step by step" model. Instead of the full
// binary tree, we show ONLY the path from root to the current character,
// stacking the nodes vertically. Each step adds one node and reveals the
// partial morse code accumulated so far, so the user can see how a letter
// is built out of DITs (red dots) and DAHs (blue bars).
//
// During playback each dit/dah lights up its corresponding step; when the
// character finishes, the letter node stays lit until the next one starts.
const PATH_NODE_W = 72;
const PATH_NODE_H = 64;
const PATH_NODE_GAP_Y = 8;
const PATH_EDGE_GAP_Y = 6;
const PATH_DOT_SIZE = 8;
const PATH_BAR_W = 22;
const PATH_BAR_H = 4;

const MorseCodePath = ({ activeChar, activeStep, isOn, isPlaying, hasContent, defaultChar }) => {
  const tree = useMemo(() => buildMorseTree(), []);

  // Walk from root to the active character, accumulating a list of step
  // nodes. When nothing is being played, prefer the parent-supplied
  // `defaultChar` (the first character of the current input) so the model
  // is always visible. As a last-resort fallback we use 'S' so the user can
  // still see the canonical SOS letter when there is no input.
  const path = useMemo(() => {
    const char = activeChar?.char || defaultChar || (hasContent ? null : 'S');
    if (!char || !MORSE_TABLE[char]) return [];
    const morse = MORSE_TABLE[char];
    const steps = [{ char: null, morse: '', kind: 'root', depth: 0 }];
    let node = tree;
    for (let i = 0; i < morse.length; i++) {
      const ch = morse[i];
      const childKey = ch === '.' ? 'dit' : 'dah';
      if (!node[childKey]) break;
      node = node[childKey];
      steps.push({
        char: node.char,
        morse: morse.substring(0, i + 1),
        kind: childKey,
        depth: i + 1,
      });
    }
    return steps;
  }, [activeChar, defaultChar, hasContent, tree]);

  if (!path.length) {
    return (
      <div className="h-[180px] flex flex-col items-center justify-center gap-1 text-slate-500 text-sm">
        <Radio size={20} className="text-slate-700" />
        <span>Type something to see the morse code path.</span>
      </div>
    );
  }

  // activeStep is 0-based and refers to the symbol within the current
  // character's morse code. The path has len(morse) + 1 entries (root +
  // each step). During playback the current step is the one being sounded;
  // otherwise we show the path fully complete up to the character itself.
  const targetChar = activeChar?.char;
  const isLive = isPlaying && targetChar === path[path.length - 1].char;
  const currentStepIdx = isLive
    ? Math.min(activeStep + 1, path.length - 1)
    : path.length - 1;

  return (
    <div className="flex flex-col items-center py-3 px-2">
      {/* Header: which character / full morse is being shown */}
      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 mb-3 tracking-wider">
        <span className="uppercase font-bold text-slate-400">Path</span>
        <span>·</span>
        <span className="text-slate-300 font-bold text-sm">
          {targetChar || path[path.length - 1].char}
        </span>
        <span className="text-slate-600">(</span>
        <span className="text-blue-300">{path[path.length - 1].morse || '·'}</span>
        <span className="text-slate-600">)</span>
      </div>

      {path.map((node, i) => {
        const isCurrent = i === currentStepIdx;
        const isCompleted = i < currentStepIdx;
        return (
          <Fragment key={i}>
            {i > 0 && (
              <PathEdge
                kind={node.kind}
                isCompleted={isCompleted}
                isCurrent={isCurrent && isOn}
              />
            )}
            <PathNode
              char={node.char}
              morse={node.morse}
              isRoot={i === 0}
              isCurrent={isCurrent}
              isCompleted={isCompleted}
              isSounding={isCurrent && isOn}
            />
          </Fragment>
        );
      })}
    </div>
  );
};

const PathNode = ({ char, morse, isRoot, isCurrent, isCompleted, isSounding }) => {
  // Three visual tiers: completed (passed), current (active), upcoming.
  const palette = isCurrent
    ? {
        box: 'border-amber-300 bg-amber-300/15 shadow-lg shadow-amber-400/30',
        letter: 'text-amber-200',
        morse: 'text-amber-300',
        dot: 'bg-amber-300',
      }
    : isCompleted
    ? {
        box: 'border-slate-500 bg-slate-800/60',
        letter: 'text-slate-200',
        morse: 'text-slate-400',
        dot: 'bg-slate-400',
      }
    : {
        box: 'border-slate-700/70 bg-slate-900/40',
        letter: 'text-slate-600',
        morse: 'text-slate-700',
        dot: 'bg-slate-700',
      };

  return (
    <div
      style={{ width: PATH_NODE_W, height: PATH_NODE_H }}
      className={`
        relative flex flex-col items-center justify-center
        rounded-lg border-2 transition-all duration-150
        ${palette.box}
        ${isSounding ? 'scale-105 ring-2 ring-cyan-400/60' : ''}
      `}
    >
      <div className={`text-lg font-bold font-mono leading-none ${palette.letter}`}>
        {isRoot ? '·' : char}
      </div>
      <div className={`text-[10px] font-mono mt-1 tracking-[0.2em] ${palette.morse}`}>
        {morse || 'start'}
      </div>
    </div>
  );
};

// Edge between two nodes shows the symbol that was sent to get from the
// parent down to the child. DIT = red dot, DAH = blue bar.
const PathEdge = ({ kind, isCompleted, isCurrent }) => {
  const palette = isCurrent
    ? { dit: 'bg-red-300 shadow-red-300/60', dah: 'bg-blue-300 shadow-blue-300/60' }
    : isCompleted
    ? { dit: 'bg-red-500/70', dah: 'bg-blue-500/70' }
    : { dit: 'bg-slate-700', dah: 'bg-slate-700' };

  return (
    <div
      style={{ height: PATH_EDGE_GAP_Y * 2 + PATH_DOT_SIZE }}
      className="flex items-center justify-center"
    >
      {kind === 'dit' ? (
        <div
          style={{ width: PATH_DOT_SIZE, height: PATH_DOT_SIZE }}
          className={`rounded-full shadow-sm ${palette.dit}`}
        />
      ) : (
        <div
          style={{ width: PATH_BAR_W, height: PATH_BAR_H }}
          className={`rounded-sm shadow-sm ${palette.dah}`}
        />
      )}
    </div>
  );
};

// ─── Reference chart ────────────────────────────────────────────────────────
const MORSE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => [c, MORSE_TABLE[c]]);
const MORSE_DIGITS = '0123456789'.split('').map(c => [c, MORSE_TABLE[c]]);
const MORSE_PUNCT = ['.', ',', '?', '!', '/', '(', ')', '&', ':', ';', '=', '+', '-', '_', '@']
  .map(c => [c, MORSE_TABLE[c]]);

const MorseReference = () => (
  <div className="flex flex-col gap-3">
    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
      <Radio size={11} />
      Reference
    </p>
    <div className="rounded-xl bg-slate-900/70 border border-slate-700/70 p-3">
      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Letters</div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-x-3 gap-y-1 font-mono text-xs">
        {MORSE_LETTERS.map(([c, code]) => (
          <div key={c} className="flex items-center justify-between gap-2">
            <span className="text-slate-300 font-bold w-3">{c}</span>
            <span className="text-amber-300">{code}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-3 mb-1.5">Digits</div>
      <div className="grid grid-cols-5 gap-x-3 gap-y-1 font-mono text-xs">
        {MORSE_DIGITS.map(([c, code]) => (
          <div key={c} className="flex items-center justify-between gap-2">
            <span className="text-slate-300 font-bold w-3">{c}</span>
            <span className="text-amber-300">{code}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-3 mb-1.5">Punctuation</div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-1 font-mono text-xs">
        {MORSE_PUNCT.map(([c, code]) => (
          <div key={c} className="flex items-center justify-between gap-2">
            <span className="text-slate-300 font-bold w-3">{c}</span>
            <span className="text-amber-300">{code}</span>
          </div>
        ))}
      </div>
    </div>
    <div className="rounded-xl bg-slate-900/70 border border-slate-700/70 p-3 text-[11px] text-slate-500 leading-relaxed">
      <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-1">Separators</div>
      <div><span className="font-mono text-slate-300">space</span> between elements within or between letters</div>
      <div><span className="font-mono text-slate-300">/</span> (with surrounding spaces) between words</div>
      <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mt-2 mb-1">Timing (1 unit)</div>
      <div>dit = 1u &nbsp;·&nbsp; dah = 3u &nbsp;·&nbsp; letter gap = 3u &nbsp;·&nbsp; word gap = 7u</div>
      <div>unit (ms) = <span className="font-mono text-slate-300">1200 / WPM</span></div>
    </div>
  </div>
);

export default MorseConverter;
