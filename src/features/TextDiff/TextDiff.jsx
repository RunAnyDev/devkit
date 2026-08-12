import React, { useState, useEffect, useRef } from 'react';
import {
    FileText,
    ArrowLeftRight,
    Trash2,
    Upload,
    AlertTriangle,
    Columns2,
    AlignLeft,
    Hash,
    Pilcrow,
    CaseSensitive,
    Link2,
} from 'lucide-react';
import { Card } from '../../components/ui';
import { computeAlignedDiff, computeStats, hasChanges } from './diffUtils';
import DiffView from './DiffView';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const FILE_ACCEPT = '.txt,.log,.md,.json,.xml,.yaml,.yml,.csv,.tsv,.ini,.conf,.env,.js,.ts,.tsx,.jsx,.css,.html,.py,.go,.rs,text/*';

const ToggleChip = ({ label, icon: Icon, checked, onChange, title }) => (
    <label
        title={title}
        className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none bg-slate-700/50 px-2.5 py-1.5 rounded hover:bg-slate-700 border border-slate-600 transition-colors"
    >
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
        />
        {Icon && <Icon size={13} />}
        {label}
    </label>
);

const TextDiff = () => {
    const [leftInput, setLeftInput] = useState('');
    const [rightInput, setRightInput] = useState('');
    const [viewMode, setViewMode] = useState('split'); // 'split' | 'inline'
    const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
    const [ignoreCase, setIgnoreCase] = useState(false);
    const [syncScroll, setSyncScroll] = useState(true);
    const [showLineNumbers, setShowLineNumbers] = useState(true);
    const [uploadTarget, setUploadTarget] = useState('left'); // 'left' | 'right'
    const [error, setError] = useState(null);
    const [aligned, setAligned] = useState(null);

    const leftInputRef = useRef(null);
    const rightInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const syncingRef = useRef(false);

    // Auto-compute diff whenever inputs or compare options change.
    useEffect(() => {
        if (!leftInput && !rightInput) {
            setAligned(null);
            setError(null);
            return;
        }
        try {
            const result = computeAlignedDiff(leftInput, rightInput, {
                ignoreWhitespace,
                ignoreCase,
            });
            setAligned(result);
            setError(null);
        } catch (err) {
            setAligned(null);
            setError(err?.message || 'Diff failed');
        }
    }, [leftInput, rightInput, ignoreWhitespace, ignoreCase]);

    const stats = aligned ? computeStats(aligned) : null;
    const identical = aligned && !hasChanges(aligned);
    const showResult = !!aligned;

    // Sync scroll between input textareas.
    const handleLeftScroll = (e) => {
        if (!syncScroll || !rightInputRef.current || syncingRef.current) return;
        syncingRef.current = true;
        rightInputRef.current.scrollTop = e.target.scrollTop;
        rightInputRef.current.scrollLeft = e.target.scrollLeft;
        requestAnimationFrame(() => {
            syncingRef.current = false;
        });
    };
    const handleRightScroll = (e) => {
        if (!syncScroll || !leftInputRef.current || syncingRef.current) return;
        syncingRef.current = true;
        leftInputRef.current.scrollTop = e.target.scrollTop;
        leftInputRef.current.scrollLeft = e.target.scrollLeft;
        requestAnimationFrame(() => {
            syncingRef.current = false;
        });
    };

    const handleSwap = () => {
        setLeftInput(rightInput);
        setRightInput(leftInput);
    };

    const handleClear = () => {
        setLeftInput('');
        setRightInput('');
        setError(null);
    };

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
            setError(`File too large (max 5MB): ${file.name}`);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const text = typeof reader.result === 'string' ? reader.result : '';
            if (uploadTarget === 'left') setLeftInput(text);
            else setRightInput(text);
        };
        reader.onerror = () => setError(`Failed to read: ${file.name}`);
        reader.readAsText(file, 'UTF-8');
    };

    return (
        <div className="h-full flex flex-col gap-4">
            <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={handleFile}
                accept={FILE_ACCEPT}
            />

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5 bg-slate-800 p-3 rounded-lg border border-slate-700 shrink-0">
                <div className="flex items-center gap-2 text-slate-300 font-medium pr-1">
                    <FileText size={18} />
                    <span>Text Diff</span>
                </div>

                <div className="h-6 w-px bg-slate-700" />

                {/* File upload group */}
                <div className="flex items-center gap-1.5">
                    <select
                        value={uploadTarget}
                        onChange={(e) => setUploadTarget(e.target.value)}
                        title="Which panel the file uploads to"
                        className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                    </select>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        title="Load text file"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 transition-all"
                    >
                        <Upload size={13} /> File
                    </button>
                </div>

                <div className="h-6 w-px bg-slate-700" />

                {/* Compare options */}
                <ToggleChip
                    label="Ignore WS"
                    icon={Pilcrow}
                    checked={ignoreWhitespace}
                    onChange={setIgnoreWhitespace}
                    title="Trim trailing whitespace and ignore pure-whitespace line changes"
                />
                <ToggleChip
                    label="Ignore Case"
                    icon={CaseSensitive}
                    checked={ignoreCase}
                    onChange={setIgnoreCase}
                    title="Case-insensitive comparison"
                />
                <ToggleChip
                    label="Sync Scroll"
                    icon={Link2}
                    checked={syncScroll}
                    onChange={setSyncScroll}
                    title="Scroll both input panels together"
                />
                <ToggleChip
                    label="Line #"
                    icon={Hash}
                    checked={showLineNumbers}
                    onChange={setShowLineNumbers}
                    title="Show line numbers in the diff result"
                />

                <div className="h-6 w-px bg-slate-700" />

                {/* View mode toggle */}
                <div className="flex bg-slate-900 rounded-md p-0.5">
                    <button
                        onClick={() => setViewMode('split')}
                        title="Side-by-side view"
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                            viewMode === 'split'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Columns2 size={13} /> Split
                    </button>
                    <button
                        onClick={() => setViewMode('inline')}
                        title="Unified inline view"
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                            viewMode === 'inline'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <AlignLeft size={13} /> Inline
                    </button>
                </div>

                <div className="flex-1" />

                <button
                    onClick={handleSwap}
                    disabled={!leftInput && !rightInput}
                    title="Swap left and right inputs"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    <ArrowLeftRight size={13} /> Swap
                </button>
                <button
                    onClick={handleClear}
                    disabled={!leftInput && !rightInput}
                    title="Clear both inputs"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    <Trash2 size={13} /> Clear
                </button>
            </div>

            {error && (
                <div className="text-red-400 text-sm px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 shrink-0">
                    <AlertTriangle size={16} /> {error}
                </div>
            )}

            {/* Stats summary */}
            {stats && (
                <div className="flex items-center gap-4 text-xs px-2 shrink-0">
                    <span className="text-slate-400">
                        <span className="text-green-400 font-semibold">
                            +{stats.added + stats.changed}
                        </span>{' '}
                        additions
                    </span>
                    <span className="text-slate-400">
                        <span className="text-red-400 font-semibold">
                            -{stats.removed + stats.changed}
                        </span>{' '}
                        deletions
                    </span>
                    <span className="text-slate-500">
                        {stats.same} unchanged · {stats.total} total
                    </span>
                </div>
            )}

            {/* Input areas */}
            <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
                    showResult ? 'h-[180px]' : 'flex-1 min-h-[300px]'
                } transition-all duration-300`}
            >
                <textarea
                    ref={leftInputRef}
                    onScroll={handleLeftScroll}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm text-slate-300 resize-none focus:border-blue-500 outline-none w-full h-full placeholder:text-slate-600"
                    placeholder="Original text..."
                    value={leftInput}
                    onChange={(e) => setLeftInput(e.target.value)}
                    spellCheck="false"
                />
                <textarea
                    ref={rightInputRef}
                    onScroll={handleRightScroll}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm text-slate-300 resize-none focus:border-blue-500 outline-none w-full h-full placeholder:text-slate-600"
                    placeholder="Modified text..."
                    value={rightInput}
                    onChange={(e) => setRightInput(e.target.value)}
                    spellCheck="false"
                />
            </div>

            {/* Diff result */}
            {showResult && (
                <Card className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-700 overflow-hidden">
                    <div className="flex-1 overflow-auto font-mono text-xs scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900/50">
                        <DiffView
                            aligned={aligned}
                            viewMode={viewMode}
                            showLineNumbers={showLineNumbers}
                            isIdentical={identical}
                        />
                    </div>
                </Card>
            )}
        </div>
    );
};

export default TextDiff;
