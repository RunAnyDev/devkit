import React from 'react';

const ROW_BG = {
    same: '',
    added: 'bg-green-500/5',
    removed: 'bg-red-500/5',
    changed: 'bg-amber-500/5',
};

const WORD_BG = {
    same: '',
    added: 'bg-green-500/40 text-green-50 rounded-sm',
    removed: 'bg-red-500/40 text-red-50 rounded-sm',
};

const PREFIX = {
    same: ' ',
    added: '+',
    removed: '-',
    changed: '~',
};

const PREFIX_COLOR = {
    same: 'text-slate-600',
    added: 'text-green-400',
    removed: 'text-red-400',
    changed: 'text-amber-400',
};

/**
 * Expand a 'changed' aligned row into two display rows for the unified view:
 * a removed row (left content, `-` prefix) followed by an added row (right
 * content, `+` prefix). Other row types pass through unchanged.
 */
const expandForInline = (aligned) => {
    const out = [];
    for (const r of aligned) {
        if (r.type === 'changed') {
            out.push({
                key: `${r.leftLineNo ?? 'x'}-r`,
                kind: 'removed',
                lineNo: r.leftLineNo,
                content: r.leftContent,
                words: r.leftWords,
            });
            out.push({
                key: `${r.rightLineNo ?? 'x'}-a`,
                kind: 'added',
                lineNo: r.rightLineNo,
                content: r.rightContent,
                words: r.rightWords,
            });
        } else {
            out.push({
                key: `${r.leftLineNo ?? r.rightLineNo ?? 'x'}-${r.type}`,
                kind: r.type,
                lineNo: r.type === 'added' ? r.rightLineNo : r.leftLineNo,
                content: r.type === 'added' ? r.rightContent : r.leftContent,
                words: null,
            });
        }
    }
    return out;
};

/**
 * Render a word array as inline spans, with the appropriate highlight class.
 * If `words` is missing, falls back to raw content.
 */
const renderWords = (words, fallback) => {
    if (!words) return fallback ?? '';
    return words.map((w, i) => (
        <span key={i} className={WORD_BG[w.type]}>
            {w.value}
        </span>
    ));
};

const EmptyState = () => (
    <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        <div className="text-center">
            <div className="text-base mb-1 text-slate-400">No differences</div>
            <div className="text-xs">Both inputs are identical.</div>
        </div>
    </div>
);

const SideBySideRow = ({ row, showLineNumbers }) => {
    const lineNoCell = (n) =>
        showLineNumbers ? (
            <td className="select-none text-right pr-2 pl-2 py-0.5 text-slate-500 w-10 border-r border-slate-800 align-top tabular-nums">
                {n ?? ''}
            </td>
        ) : null;

    const leftBg = row.leftContent === null ? 'bg-slate-800/40' : '';
    const rightBg = row.rightContent === null ? 'bg-slate-800/40' : '';
    const leftText =
        row.type === 'removed' || row.type === 'changed' ? 'text-red-100' : 'text-slate-300';
    const rightText =
        row.type === 'added' || row.type === 'changed' ? 'text-green-50' : 'text-slate-300';

    return (
        <tr className={ROW_BG[row.type]}>
            {lineNoCell(row.leftLineNo)}
            <td
                className={`pr-3 pl-2 py-0.5 whitespace-pre-wrap break-all ${leftBg} ${leftText}`}
            >
                {row.leftWords
                    ? renderWords(row.leftWords, row.leftContent)
                    : row.leftContent ?? ''}
            </td>
            {lineNoCell(row.rightLineNo)}
            <td
                className={`pr-3 pl-2 py-0.5 whitespace-pre-wrap break-all border-l border-slate-800 ${rightBg} ${rightText}`}
            >
                {row.rightWords
                    ? renderWords(row.rightWords, row.rightContent)
                    : row.rightContent ?? ''}
            </td>
        </tr>
    );
};

const InlineRow = ({ display, showLineNumbers }) => {
    const { kind, lineNo, content, words } = display;
    const isEmpty = content === null;

    const lineClasses = {
        same: 'text-slate-400',
        added: 'text-green-100 bg-green-500/10',
        removed: 'text-red-100 bg-red-500/10',
    }[kind];

    return (
        <tr className={lineClasses}>
            {showLineNumbers && (
                <td className="select-none text-right pr-2 pl-2 py-0.5 text-slate-500 w-10 border-r border-slate-800 align-top tabular-nums">
                    {lineNo ?? ''}
                </td>
            )}
            <td
                className={`select-none pr-2 pl-2 py-0.5 w-4 align-top font-bold text-center ${PREFIX_COLOR[kind]}`}
            >
                {PREFIX[kind]}
            </td>
            <td className="pr-3 pl-1 py-0.5 whitespace-pre-wrap break-all">
                {isEmpty ? '' : words ? renderWords(words, content) : content}
            </td>
        </tr>
    );
};

const SideBySideView = ({ aligned, showLineNumbers }) => (
    <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-800/80 sticky top-0 backdrop-blur-sm z-10">
            <tr>
                {showLineNumbers && (
                    <th className="text-right pr-2 pl-2 py-1.5 text-slate-500 font-normal w-10 border-r border-slate-700">
                        #
                    </th>
                )}
                <th className="text-left pr-3 pl-2 py-1.5 text-slate-400 font-normal">Original</th>
                {showLineNumbers && (
                    <th className="text-right pr-2 pl-2 py-1.5 text-slate-500 font-normal w-10 border-l border-r border-slate-700">
                        #
                    </th>
                )}
                <th className="text-left pr-3 pl-2 py-1.5 text-slate-400 font-normal border-l border-slate-700">
                    Modified
                </th>
            </tr>
        </thead>
        <tbody>
            {aligned.map((row, i) => (
                <SideBySideRow key={i} row={row} showLineNumbers={showLineNumbers} />
            ))}
        </tbody>
    </table>
);

const InlineView = ({ aligned, showLineNumbers }) => {
    const rows = expandForInline(aligned);
    return (
        <table className="w-full border-collapse text-xs">
            <tbody>
                {rows.map((d) => (
                    <InlineRow key={d.key} display={d} showLineNumbers={showLineNumbers} />
                ))}
            </tbody>
        </table>
    );
};

const DiffView = ({ aligned, viewMode, showLineNumbers, isIdentical }) => {
    if (isIdentical) return <EmptyState />;
    if (viewMode === 'inline') {
        return <InlineView aligned={aligned} showLineNumbers={showLineNumbers} />;
    }
    return <SideBySideView aligned={aligned} showLineNumbers={showLineNumbers} />;
};

export default DiffView;
