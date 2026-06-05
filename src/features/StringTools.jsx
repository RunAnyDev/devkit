import { useState, useCallback, useRef } from 'react';
import {
    Copy, Check, ArrowLeftRight, Trash2, Upload,
    ChevronDown, AlertCircle, FileText, Braces
} from 'lucide-react';

// ─── Codec definitions ────────────────────────────────────────────────────────

const encodeBase64 = (str) => {
    // Support Unicode via TextEncoder
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => (binary += String.fromCharCode(b)));
    return btoa(binary);
};

const decodeBase64 = (str) => {
    // Strip ALL whitespace (newlines, spaces, tabs) — atob rejects them
    const cleaned = str.replace(/\s/g, '');
    const binary = atob(cleaned);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
};

const encodeBase64Safe = (str) => encodeBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decodeBase64Safe = (str) => {
    // Strip ALL whitespace first, then convert URL-safe chars back
    let s = str.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeBase64(s);
};

const encodeUrl = (str) => encodeURIComponent(str);
const decodeUrl = (str) => decodeURIComponent(str);

const encodeUrlFull = (str) => {
    return str.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code > 127) return encodeURIComponent(c);
        return '%' + code.toString(16).toUpperCase().padStart(2, '0');
    }).join('');
};

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_DECODE_MAP = Object.fromEntries(Object.entries(HTML_ENTITIES).map(([k, v]) => [v, k]));

const encodeHtml = (str) => str.replace(/[&<>"']/g, m => HTML_ENTITIES[m]);
const decodeHtml = (str) => {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
};

const encodeHex = (str) => {
    return new TextEncoder().encode(str).reduce((acc, b) => acc + b.toString(16).padStart(2, '0'), '');
};
const decodeHex = (str) => {
    const clean = str.replace(/\s/g, '');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
    return new TextDecoder().decode(new Uint8Array(bytes));
};

const encodeBinary = (str) => {
    return new TextEncoder().encode(str).reduce((acc, b) => acc + b.toString(2).padStart(8, '0') + ' ', '').trim();
};
const decodeBinary = (str) => {
    const chunks = str.trim().split(/\s+/);
    const bytes = chunks.map(c => parseInt(c, 2));
    return new TextDecoder().decode(new Uint8Array(bytes));
};

const encodeUnicode = (str) => {
    return [...str].map(c => {
        const cp = c.codePointAt(0);
        return cp > 0xFFFF ? `\\U${cp.toString(16).toUpperCase().padStart(8, '0')}` : `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    }).join('');
};
const decodeUnicode = (str) => {
    return str.replace(/\\[Uu]([0-9a-fA-F]{4,8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
};

const encodeJwt = (str) => { throw new Error('JWT encode không áp dụng, dùng JWT Debugger'); };
const decodeJwt = (str) => {
    const parts = str.trim().split('.');
    if (parts.length !== 3) throw new Error('JWT không hợp lệ, cần 3 phần ngăn cách bởi dấu chấm');
    const decode = p => {
        let s = p.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return JSON.parse(decodeBase64(s));
    };
    return JSON.stringify({ header: decode(parts[0]), payload: decode(parts[1]), signature: parts[2] }, null, 2);
};

// ─── CODEC REGISTRY ───────────────────────────────────────────────────────────

const CODECS = [
    {
        id: 'base64',
        label: 'Base64',
        color: 'blue',
        description: 'Encode/Decode chuỗi text sang Base64 (hỗ trợ Unicode)',
        encode: encodeBase64,
        decode: decodeBase64,
    },
    {
        id: 'base64url',
        label: 'Base64 URL Safe',
        color: 'indigo',
        description: 'Base64 biến thể an toàn cho URL (thay +/ bằng -_)',
        encode: encodeBase64Safe,
        decode: decodeBase64Safe,
    },
    {
        id: 'url',
        label: 'URL Encode',
        color: 'violet',
        description: 'Encode ký tự đặc biệt cho query string (encodeURIComponent)',
        encode: encodeUrl,
        decode: decodeUrl,
    },
    {
        id: 'urlfull',
        label: 'URL Full Encode',
        color: 'purple',
        description: 'Encode toàn bộ ký tự thành %XX (kể cả ASCII)',
        encode: encodeUrlFull,
        decode: decodeUrl,
    },
    {
        id: 'html',
        label: 'HTML Entities',
        color: 'amber',
        description: 'Chuyển đổi &, <, >, ", \' thành HTML entities',
        encode: encodeHtml,
        decode: decodeHtml,
    },
    {
        id: 'hex',
        label: 'Hex',
        color: 'green',
        description: 'Encode bytes thành chuỗi hexadecimal',
        encode: encodeHex,
        decode: decodeHex,
    },
    {
        id: 'binary',
        label: 'Binary',
        color: 'teal',
        description: 'Chuyển text thành chuỗi nhị phân 0/1',
        encode: encodeBinary,
        decode: decodeBinary,
    },
    {
        id: 'unicode',
        label: 'Unicode Escape',
        color: 'cyan',
        description: 'Chuyển ký tự thành \\uXXXX hoặc \\UXXXXXXXX',
        encode: encodeUnicode,
        decode: decodeUnicode,
    },
    {
        id: 'jwt',
        label: 'JWT Decode',
        color: 'rose',
        description: 'Giải mã JWT payload (không verify signature)',
        encode: null,
        decode: decodeJwt,
    },
];

const COLOR_MAP = {
    blue:   { ring: 'ring-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-300' },
    indigo: { ring: 'ring-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-400', badge: 'bg-indigo-500/20 text-indigo-300' },
    violet: { ring: 'ring-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-400', badge: 'bg-violet-500/20 text-violet-300' },
    purple: { ring: 'ring-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
    amber:  { ring: 'ring-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-400',  badge: 'bg-amber-500/20 text-amber-300' },
    green:  { ring: 'ring-green-500',  bg: 'bg-green-500/10',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300' },
    teal:   { ring: 'ring-teal-500',   bg: 'bg-teal-500/10',   text: 'text-teal-400',   badge: 'bg-teal-500/20 text-teal-300' },
    cyan:   { ring: 'ring-cyan-500',   bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   badge: 'bg-cyan-500/20 text-cyan-300' },
    rose:   { ring: 'ring-rose-500',   bg: 'bg-rose-500/10',   text: 'text-rose-400',   badge: 'bg-rose-500/20 text-rose-300' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const CopyButton = ({ text, size = 16 }) => {
    const [copied, setCopied] = useState(false);
    const handle = useCallback(async () => {
        if (!text) return;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [text]);

    return (
        <button
            id="copy-output-btn"
            onClick={handle}
            disabled={!text}
            title="Copy to clipboard"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
            {copied ? <Check size={size} className="text-green-400" /> : <Copy size={size} />}
        </button>
    );
};

const CodecSelector = ({ selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const codec = CODECS.find(c => c.id === selected);
    const colors = COLOR_MAP[codec.color];

    return (
        <div className="relative">
            <button
                id="codec-selector-btn"
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-800/80 border-slate-700 hover:border-slate-500 transition-all text-sm font-medium text-slate-200 min-w-48`}
            >
                <span className={`w-2 h-2 rounded-full ${colors.bg} ${colors.ring} ring-1`} />
                {codec.label}
                <ChevronDown size={14} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full mt-1 left-0 z-50 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
                    {CODECS.map(c => {
                        const cl = COLOR_MAP[c.color];
                        return (
                            <button
                                key={c.id}
                                id={`codec-option-${c.id}`}
                                onClick={() => { onChange(c.id); setOpen(false); }}
                                className={`w-full flex flex-col gap-0.5 px-4 py-3 text-left hover:bg-slate-700 transition-all ${selected === c.id ? 'bg-slate-700' : ''}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${cl.bg} ${cl.ring} ring-1 shrink-0`} />
                                    <span className="text-sm font-medium text-slate-200">{c.label}</span>
                                    {selected === c.id && <Check size={12} className="ml-auto text-green-400" />}
                                </div>
                                <p className="text-xs text-slate-500 pl-4">{c.description}</p>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const StringTools = () => {
    const [input, setInput] = useState('');
    const [codecId, setCodecId] = useState('base64');
    const [direction, setDirection] = useState('encode'); // 'encode' | 'decode'
    const [error, setError] = useState('');
    const fileRef = useRef(null);

    const codec = CODECS.find(c => c.id === codecId);
    const colors = COLOR_MAP[codec.color];

    // Derived: compute output on every render (no useEffect for derived state)
    let output = '';
    let computeError = '';

    if (input) {
        try {
            if (direction === 'encode') {
                if (!codec.encode) throw new Error(`${codec.label} không hỗ trợ encode`);
                output = codec.encode(input);
            } else {
                if (!codec.decode) throw new Error(`${codec.label} không hỗ trợ decode`);
                output = codec.decode(input);
            }
        } catch (e) {
            computeError = e.message;
        }
    }

    const handleSwap = () => {
        if (!output || computeError) return;
        setInput(output);
        setDirection(d => d === 'encode' ? 'decode' : 'encode');
    };

    const handleClear = () => {
        setInput('');
        setError('');
    };

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setInput(reader.result);
        reader.readAsText(file, 'UTF-8');
        e.target.value = '';
    };

    const handleCodecChange = (id) => {
        setCodecId(id);
        // JWT is decode-only
        if (id === 'jwt') setDirection('decode');
    };

    const inputLabel = direction === 'encode' ? 'Plaintext' : 'Encoded';
    const outputLabel = direction === 'encode' ? 'Encoded' : 'Decoded';
    const outputColor = computeError ? 'text-red-400' : colors.text;

    const stats = input
        ? `${input.length} ký tự · ${new TextEncoder().encode(input).length} bytes`
        : 'Chưa có input';

    return (
        <div className="flex flex-col gap-5 h-full">

            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-3">
                <CodecSelector selected={codecId} onChange={handleCodecChange} />

                {/* Direction toggle */}
                <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
                    {codec.encode && (
                        <button
                            id="direction-encode-btn"
                            onClick={() => setDirection('encode')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${direction === 'encode' ? `${colors.badge} shadow-sm` : 'text-slate-400 hover:text-white'}`}
                        >
                            Encode
                        </button>
                    )}
                    <button
                        id="direction-decode-btn"
                        onClick={() => setDirection('decode')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${direction === 'decode' ? `${colors.badge} shadow-sm` : 'text-slate-400 hover:text-white'}`}
                    >
                        Decode
                    </button>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 ml-auto">
                    <button
                        id="upload-file-btn"
                        onClick={() => fileRef.current?.click()}
                        title="Tải file text"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                    >
                        <Upload size={13} /> File
                    </button>
                    <button
                        id="swap-btn"
                        onClick={handleSwap}
                        disabled={!output || !!computeError}
                        title="Swap input/output"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ArrowLeftRight size={13} /> Swap
                    </button>
                    <button
                        id="clear-btn"
                        onClick={handleClear}
                        disabled={!input}
                        title="Xoá input"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <Trash2 size={13} /> Clear
                    </button>
                </div>
                <input ref={fileRef} type="file" accept="text/*" className="hidden" onChange={handleFile} />
            </div>

            {/* ── Description badge ── */}
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${colors.bg} border border-slate-700/50`}>
                <Braces size={13} className={colors.text} />
                <span className={colors.text}>{codec.label}</span>
                <span className="text-slate-500">—</span>
                <span className="text-slate-400">{codec.description}</span>
            </div>

            {/* ── Editor panels ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">

                {/* Input */}
                <div className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between gap-3 min-h-[34px]">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                            <FileText size={11} />
                            {inputLabel}
                        </label>
                        <span className="text-xs text-slate-600 text-right truncate min-w-0">{stats}</span>
                    </div>
                    <textarea
                        id="encode-input"
                        spellCheck={false}
                        className={`flex-1 bg-slate-900 border rounded-xl p-4 font-mono text-sm text-slate-200 outline-none resize-none transition-all placeholder-slate-600 focus:border-slate-500 border-slate-700`}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Nhập ${inputLabel.toLowerCase()} tại đây...`}
                    />
                </div>

                {/* Output */}
                <div className="flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between gap-3 min-h-[34px]">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                            <FileText size={11} />
                            {outputLabel}
                        </label>
                        <div className="flex items-center gap-1 shrink-0">
                            {output && !computeError && (
                                <span className="text-xs text-slate-600">{output.length} ký tự</span>
                            )}
                            <CopyButton text={computeError ? '' : output} />
                        </div>
                    </div>
                    <textarea
                        id="encode-output"
                        readOnly
                        spellCheck={false}
                        className={`flex-1 bg-slate-800/60 border border-slate-700 rounded-xl p-4 font-mono text-sm outline-none resize-none ${outputColor} ${computeError ? 'border-red-800/50 bg-red-950/20' : ''}`}
                        value={computeError ? `⚠ ${computeError}` : output}
                        placeholder="Kết quả sẽ hiển thị ở đây..."
                    />
                </div>
            </div>

            {/* ── Error bar ── */}
            {computeError && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-950/40 border border-red-800/40 text-red-400 text-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{computeError}</span>
                </div>
            )}

            {/* ── Quick reference ── */}
            <QuickRef codecId={codecId} />
        </div>
    );
};

// ─── Quick Reference Panel ────────────────────────────────────────────────────

const QUICK_REFS = {
    base64: [
        { label: 'Hello', encoded: 'SGVsbG8=' },
        { label: 'Hello World!', encoded: 'SGVsbG8gV29ybGQh' },
        { label: '{"key":"value"}', encoded: 'eyJrZXkiOiJ2YWx1ZSJ9' },
    ],
    base64url: [
        { label: 'Hello', encoded: 'SGVsbG8' },
        { label: 'safe+chars', encoded: 'c2FmZStjaGFycw' },
    ],
    url: [
        { label: 'hello world', encoded: 'hello%20world' },
        { label: 'a=1&b=2', encoded: 'a%3D1%26b%3D2' },
        { label: 'https://ex.com', encoded: 'https%3A%2F%2Fex.com' },
    ],
    urlfull: [
        { label: 'hello', encoded: '%68%65%6C%6C%6F' },
        { label: 'ABC', encoded: '%41%42%43' },
    ],
    html: [
        { label: '<script>', encoded: '&lt;script&gt;' },
        { label: '"quotes"', encoded: '&quot;quotes&quot;' },
        { label: 'Tom & Jerry', encoded: 'Tom &amp; Jerry' },
    ],
    hex: [
        { label: 'Hi', encoded: '4869' },
        { label: 'Hello', encoded: '48656c6c6f' },
        { label: 'ABC', encoded: '414243' },
    ],
    binary: [
        { label: 'A', encoded: '01000001' },
        { label: 'Hi', encoded: '01001000 01101001' },
    ],
    unicode: [
        { label: 'A', encoded: '\\u0041' },
        { label: '☺', encoded: '\\u263A' },
        { label: '你好', encoded: '\\u4F60\\u597D' },
    ],
    jwt: [],
};

const QuickRef = ({ codecId }) => {
    const refs = QUICK_REFS[codecId] ?? [];
    if (!refs.length) return null;

    return (
        <div className="flex flex-col gap-2 shrink-0">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Ví dụ nhanh</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {refs.map((r, i) => (
                    <div
                        key={i}
                        className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50"
                    >
                        <span className="text-xs text-slate-500 font-mono truncate">{r.label}</span>
                        <span className="text-xs text-slate-300 font-mono truncate">{r.encoded}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StringTools;
