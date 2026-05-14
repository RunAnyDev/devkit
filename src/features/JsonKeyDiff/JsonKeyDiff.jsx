import React, { useState, useEffect, useRef } from 'react';
import { FileJson, Trash2, AlertTriangle, Key, Copy, FileSpreadsheet, Link2 } from 'lucide-react';
import { Button, Card } from '../../components/ui';

// Utility to recursively extract all keys from an object
const extractKeys = (obj, prefix = '', isDeep = true) => {
    let keys = [];
    if (typeof obj !== 'object' || obj === null) {
        return keys;
    }

    // If it's an array, handle elements? Or ignore indexing?
    // Let's decide how arrays are handled: usually we might just use index [0], [1] or treat elements as objects.
    // For key comparison, we usually want to know the fields of objects.
    for (const key in obj) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        keys.push(fullPath);
        if (isDeep && typeof obj[key] === 'object' && obj[key] !== null) {
            keys = keys.concat(extractKeys(obj[key], fullPath, isDeep));
        }
    }
    return keys;
};

const JsonKeyDiff = () => {
    const [leftInput, setLeftInput] = useState('');
    const [rightInput, setRightInput] = useState('');
    const [diffResult, setDiffResult] = useState(null);
    const [error, setError] = useState(null);
    const [showDiffOnly, setShowDiffOnly] = useState(false);
    const [isDeepCompare, setIsDeepCompare] = useState(true);
    const [syncScroll, setSyncScroll] = useState(true);

    const leftRef = useRef(null);
    const rightRef = useRef(null);

    const handleLeftScroll = (e) => {
        if (syncScroll && rightRef.current) {
            rightRef.current.scrollTop = e.target.scrollTop;
        }
    };

    const handleRightScroll = (e) => {
        if (syncScroll && leftRef.current) {
            leftRef.current.scrollTop = e.target.scrollTop;
        }
    };

    const downloadFile = (content, filename) => {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copyToClipboard = () => {
        if (!diffResult) return;
        const data = showDiffOnly ? diffResult.filter(d => d.type !== 'same') : diffResult;
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    };

    const exportAs = (format) => {
        if (!diffResult) return;
        const data = showDiffOnly ? diffResult.filter(d => d.type !== 'same') : diffResult;
        if (format === 'json') {
            downloadFile(JSON.stringify(data, null, 2), 'key-diff.json');
        } else if (format === 'csv') {
            const csv = 'Type,Key\n' + data.map(d => `"${d.type}","${d.key}"`).join('\n');
            downloadFile(csv, 'key-diff.csv');
        }
    };

    const compareJSONKeys = () => {
        try {
            if (!leftInput && !rightInput) {
                setDiffResult(null);
                return;
            }

            const leftObj = leftInput ? JSON.parse(leftInput) : {};
            const rightObj = rightInput ? JSON.parse(rightInput) : {};

            const leftKeys = new Set(extractKeys(leftObj, '', isDeepCompare));
            const rightKeys = new Set(extractKeys(rightObj, '', isDeepCompare));

            const allKeys = new Set([...leftKeys, ...rightKeys]);
            const diffs = [];

            allKeys.forEach(key => {
                const inLeft = leftKeys.has(key);
                const inRight = rightKeys.has(key);

                if (inLeft && !inRight) {
                    diffs.push({ key, type: 'removed' });
                } else if (!inLeft && inRight) {
                    diffs.push({ key, type: 'added' });
                } else {
                    diffs.push({ key, type: 'same' });
                }
            });

            // Sort: removed > added > same, then alphabetically
            const sortOrder = { removed: 0, added: 1, same: 2 };
            diffs.sort((a, b) => {
                if (sortOrder[a.type] !== sortOrder[b.type]) {
                    return sortOrder[a.type] - sortOrder[b.type];
                }
                return a.key.localeCompare(b.key);
            });

            setDiffResult(diffs);
            setError(null);
        } catch (err) {
            setError("JSON Parse Error: " + err.message);
            setDiffResult(null);
        }
    };

    useEffect(() => {
        if (leftInput || rightInput) {
            compareJSONKeys();
        } else {
            setDiffResult(null);
            setError(null);
        }
    }, [leftInput, rightInput, isDeepCompare]);

    const handleClear = () => {
        setLeftInput('');
        setRightInput('');
        setDiffResult(null);
        setError(null);
    };

    const displayDiffs = diffResult
        ? (showDiffOnly ? diffResult.filter(d => d.type !== 'same') : diffResult)
        : null;

    const getRowClass = (type) => {
        switch (type) {
            case 'added': return 'bg-green-500/10 text-green-400 border-b border-slate-800';
            case 'removed': return 'bg-red-500/10 text-red-400 border-b border-slate-800';
            default: return 'hover:bg-slate-800/50 border-b border-slate-800 text-slate-300';
        }
    };

    const getIndicator = (type) => {
        switch (type) {
            case 'added': return '+';
            case 'removed': return '-';
            default: return ' ';
        }
    };

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 shrink-0">
                <div className="flex items-center gap-2 text-slate-300 font-medium">
                    <Key size={18} />
                    <span>JSON Key Diff</span>
                </div>

                <div className="h-6 w-px bg-slate-700 mx-2" />

                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none bg-slate-700/50 px-3 py-1.5 rounded hover:bg-slate-700 border border-slate-600 transition-colors">
                    <input
                        type="checkbox"
                        checked={isDeepCompare}
                        onChange={(e) => setIsDeepCompare(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                    />
                    Deep Compare
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none bg-slate-700/50 px-3 py-1.5 rounded hover:bg-slate-700 border border-slate-600 transition-colors">
                    <input
                        type="checkbox"
                        checked={showDiffOnly}
                        onChange={(e) => setShowDiffOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                    />
                    Show Differences Only
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none bg-slate-700/50 px-3 py-1.5 rounded hover:bg-slate-700 border border-slate-600 transition-colors">
                    <input
                        type="checkbox"
                        checked={syncScroll}
                        onChange={(e) => setSyncScroll(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                    />
                    Sync Scroll
                </label>

                <div className="flex-1" />
                <Button variant="ghost" onClick={copyToClipboard} icon={Copy} disabled={!diffResult}>Copy</Button>
                <Button variant="ghost" onClick={() => exportAs('json')} icon={FileJson} disabled={!diffResult}>JSON</Button>
                <Button variant="ghost" onClick={() => exportAs('csv')} icon={FileSpreadsheet} disabled={!diffResult}>CSV</Button>
                <Button variant="ghost" onClick={handleClear} icon={Trash2}>Clear</Button>
            </div>

            {error && (
                <div className="text-red-400 text-sm px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 shrink-0">
                    <AlertTriangle size={16} /> {error}
                </div>
            )}

            {/* Input Areas */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 ${displayDiffs ? 'max-h-[40%]' : ''} transition-all duration-300`}>
                <textarea
                    ref={leftRef}
                    onScroll={handleLeftScroll}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm text-slate-300 resize-none focus:border-blue-500 outline-none w-full h-full placeholder:text-slate-600"
                    placeholder="JSON Object 1..."
                    value={leftInput}
                    onChange={(e) => setLeftInput(e.target.value)}
                    spellCheck="false"
                />
                <textarea
                    ref={rightRef}
                    onScroll={handleRightScroll}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm text-slate-300 resize-none focus:border-blue-500 outline-none w-full h-full placeholder:text-slate-600"
                    placeholder="JSON Object 2..."
                    value={rightInput}
                    onChange={(e) => setRightInput(e.target.value)}
                    spellCheck="false"
                />
            </div>

            {/* Result Area */}
            {displayDiffs && (
                <Card title={`Key Comparison Result (${displayDiffs.length} total keys)`} className="flex-1 min-h-[300px] flex flex-col bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                    <div className="flex-1 overflow-auto font-mono text-sm relative scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900/50">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-800/80 sticky top-0 backdrop-blur-sm z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-2 text-slate-400 font-medium w-16">Diff</th>
                                    <th className="px-4 py-2 text-slate-400 font-medium w-24">Type</th>
                                    <th className="px-4 py-2 text-slate-400 font-medium">Key Path</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayDiffs.map((diff, index) => (
                                    <tr key={index} className={`transition-colors duration-150 ${getRowClass(diff.type)}`}>
                                        <td className="px-4 py-2 font-bold select-none">{getIndicator(diff.type)}</td>
                                        <td className="px-4 py-2 font-medium">
                                            {diff.type === 'added' && <span className="text-green-500">Missing in 1</span>}
                                            {diff.type === 'removed' && <span className="text-red-500">Missing in 2</span>}
                                            {diff.type === 'same' && <span className="text-slate-500">Matches</span>}
                                        </td>
                                        <td className="px-4 py-2 break-all">{diff.key}</td>
                                    </tr>
                                ))}
                                {displayDiffs.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                                            No differences found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default JsonKeyDiff;
