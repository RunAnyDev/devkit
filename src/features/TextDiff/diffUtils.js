/**
 * Pure diff utilities for the TextDiff tool.
 * Wraps jsdiff's diffLines + diffWordsWithSpace to produce a side-by-side
 * aligned row structure that React can render directly.
 */
import { diffLines, diffWordsWithSpace } from 'diff';

/**
 * Split a jsdiff chunk value into an array of lines WITHOUT the trailing
 * newline that jsdiff always appends. Example:
 *   "alpha\nbeta\n" -> ["alpha", "beta"]
 *   ""             -> []
 *   "single\n"     -> ["single"]
 */
const splitLines = (value) => {
    if (!value) return [];
    const lines = value.split('\n');
    // jsdiff always terminates with \n, so the last element after split is ''.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
};

/**
 * Compute an aligned diff between two strings, suitable for side-by-side
 * rendering. Consecutive removed+added blocks are paired up so that
 * "changed" rows line up cleanly across both columns.
 *
 * Returns an array of rows:
 *   {
 *     type: 'same' | 'added' | 'removed' | 'changed',
 *     leftLineNo: number | null,
 *     rightLineNo: number | null,
 *     leftContent: string | null,
 *     rightContent: string | null,
 *     leftWords?:  Array<{ type: 'same' | 'removed', value: string }>,
 *     rightWords?: Array<{ type: 'same' | 'added',  value: string }>,
 *   }
 */
export function computeAlignedDiff(left, right, opts = {}) {
    const { ignoreWhitespace = false, ignoreCase = false } = opts;
    const lineOpts = { newlineIsToken: false };
    if (ignoreWhitespace) lineOpts.ignoreWhitespace = true;
    if (ignoreCase) lineOpts.ignoreCase = true;

    const chunks = diffLines(left ?? '', right ?? '', lineOpts);

    // Normalize chunks into a friendlier shape.
    const normalized = chunks.map((c) => ({
        type: c.added ? 'added' : c.removed ? 'removed' : 'same',
        lines: splitLines(c.value),
    }));

    const aligned = [];
    let leftLineNo = 1;
    let rightLineNo = 1;
    let i = 0;

    while (i < normalized.length) {
        const c = normalized[i];

        if (c.type === 'same') {
            for (const line of c.lines) {
                aligned.push({
                    type: 'same',
                    leftLineNo: leftLineNo++,
                    rightLineNo: rightLineNo++,
                    leftContent: line,
                    rightContent: line,
                });
            }
            i++;
            continue;
        }

        // Collect one contiguous run of added/removed chunks.
        const removed = [];
        const added = [];
        while (
            i < normalized.length &&
            (normalized[i].type === 'added' || normalized[i].type === 'removed')
        ) {
            if (normalized[i].type === 'removed') removed.push(...normalized[i].lines);
            else added.push(...normalized[i].lines);
            i++;
        }

        const maxLen = Math.max(removed.length, added.length);
        for (let j = 0; j < maxLen; j++) {
            const hasLeft = j < removed.length;
            const hasRight = j < added.length;

            let type;
            let leftContent = null;
            let rightContent = null;

            if (hasLeft && hasRight) {
                type = 'changed';
                leftContent = removed[j];
                rightContent = added[j];
            } else if (hasLeft) {
                type = 'removed';
                leftContent = removed[j];
            } else {
                type = 'added';
                rightContent = added[j];
            }

            const row = {
                type,
                leftLineNo: hasLeft ? leftLineNo++ : null,
                rightLineNo: hasRight ? rightLineNo++ : null,
                leftContent,
                rightContent,
            };

            // For "changed" rows, compute intra-line word highlight.
            if (type === 'changed') {
                try {
                    const wordOpts = {};
                    if (ignoreCase) wordOpts.ignoreCase = true;
                    const parts = diffWordsWithSpace(leftContent, rightContent, wordOpts);
                    row.leftWords = parts
                        .filter((p) => !p.added)
                        .map((p) => ({ type: p.removed ? 'removed' : 'same', value: p.value }));
                    row.rightWords = parts
                        .filter((p) => !p.removed)
                        .map((p) => ({ type: p.added ? 'added' : 'same', value: p.value }));
                } catch {
                    // If word diff fails, leave content as-is (no highlight).
                }
            }

            aligned.push(row);
        }
    }

    return aligned;
}

/**
 * Compute summary stats from aligned rows.
 */
export function computeStats(aligned) {
    let added = 0;
    let removed = 0;
    let changed = 0;
    let same = 0;
    for (const r of aligned) {
        if (r.type === 'same') same++;
        else if (r.type === 'changed') changed++;
        else if (r.type === 'added') added++;
        else if (r.type === 'removed') removed++;
    }
    return { added, removed, changed, same, total: aligned.length };
}

/**
 * Returns true if aligned contains any non-'same' rows.
 */
export function hasChanges(aligned) {
    if (!aligned || aligned.length === 0) return false;
    return aligned.some((r) => r.type !== 'same');
}
