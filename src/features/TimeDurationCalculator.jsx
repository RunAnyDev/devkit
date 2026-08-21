import React, { useState, useEffect } from 'react';
import { Copy, Clock, CalendarDays, Hourglass, RefreshCcw } from 'lucide-react';
import { Button, Card } from '../components/ui';

/**
 * Format a Date object into the value expected by <input type="datetime-local">.
 * Returns a string like "2024-08-21T15:30" (local time, no seconds/Z).
 */
const toLocalInputValue = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Parse a datetime-local string into a Date object.
 * Returns NaN-Date when input is empty or invalid.
 */
const parseLocalInput = (val) => {
    if (!val) return new Date(NaN);
    const d = new Date(val);
    return d;
};

/**
 * Compute calendar-aware breakdown of duration between two dates.
 * Uses absolute diff (always positive) and returns a "before/after" sign separately.
 */
const computeBreakdown = (from, to) => {
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;

    const sign = to.getTime() >= from.getTime() ? 1 : -1;
    const start = sign >= 0 ? from : to;
    const end = sign >= 0 ? to : from;

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    let hours = end.getHours() - start.getHours();
    let minutes = end.getMinutes() - start.getMinutes();
    let seconds = end.getSeconds() - start.getSeconds();

    if (seconds < 0) { seconds += 60; minutes -= 1; }
    if (minutes < 0) { minutes += 60; hours -= 1; }
    if (hours < 0) { hours += 24; days -= 1; }
    if (days < 0) {
        // borrow days from previous month
        const lastDayOfPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
        days += lastDayOfPrevMonth;
        months -= 1;
    }
    if (months < 0) { months += 12; years -= 1; }

    const totalMs = Math.abs(to.getTime() - from.getTime());
    const totalSeconds = Math.floor(totalMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);
    const totalWeeks = Math.floor(totalDays / 7);
    const totalMonthsApprox = Math.round((totalDays / 30.4375) * 100) / 100;
    const totalYearsApprox = Math.round((totalDays / 365.25) * 100) / 100;

    return {
        sign,
        years, months, days, hours, minutes, seconds,
        totalMs, totalSeconds, totalMinutes, totalHours, totalDays, totalWeeks,
        totalMonthsApprox, totalYearsApprox,
    };
};

/**
 * Format breakdown as "Y years, M months, D days, h hours, m minutes, s seconds".
 * Skips leading zero units, but always shows the last non-zero unit.
 */
const formatBreakdown = (b) => {
    if (!b) return '';
    const parts = [];
    if (b.years) parts.push(`${b.years} year${b.years !== 1 ? 's' : ''}`);
    if (b.months) parts.push(`${b.months} month${b.months !== 1 ? 's' : ''}`);
    if (b.days) parts.push(`${b.days} day${b.days !== 1 ? 's' : ''}`);
    if (b.hours) parts.push(`${b.hours} hour${b.hours !== 1 ? 's' : ''}`);
    if (b.minutes) parts.push(`${b.minutes} minute${b.minutes !== 1 ? 's' : ''}`);
    // Always include seconds; if everything above was zero, we still want to show "0 years 0 months 0 days 0 hours 0 minutes X seconds".
    parts.push(`${b.seconds} second${b.seconds !== 1 ? 's' : ''}`);
    return parts.join(', ');
};

const QUICK_PRESETS = [
    { label: '- 1 hour', ms: -1 * 60 * 60 * 1000 },
    { label: '- 1 day', ms: -1 * 24 * 60 * 60 * 1000 },
    { label: '- 1 week', ms: -7 * 24 * 60 * 60 * 1000 },
    { label: '- 1 month', ms: -30 * 24 * 60 * 60 * 1000 },
    { label: '- 1 year', ms: -365 * 24 * 60 * 60 * 1000 },
    { label: '- 5 years', ms: -5 * 365 * 24 * 60 * 60 * 1000 },
    { label: '- 10 years', ms: -10 * 365 * 24 * 60 * 60 * 1000 },
];

/**
 * Time Duration Calculator
 * Compute the duration from a past date/time to a chosen date/time
 * (default = now). Useful for age counters, project timers, "time since" views.
 */
const TimeDurationCalculator = () => {
    const [fromInput, setFromInput] = useState(() => {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return toLocalInputValue(oneYearAgo);
    });
    const [useNow, setUseNow] = useState(true);
    const [toInput, setToInput] = useState(() => toLocalInputValue(new Date()));
    const [now, setNow] = useState(new Date());

    // Tick "now" every second so a "since X ago" stays accurate when target = now.
    useEffect(() => {
        if (!useNow) return undefined;
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, [useNow]);

    const fromDate = parseLocalInput(fromInput);
    const toDate = useNow ? now : parseLocalInput(toInput);
    const breakdown = computeBreakdown(fromDate, toDate);

    const copyToClipboard = (text) => {
        const fallback = () => {
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(fallback);
        } else {
            fallback();
        }
    };

    const reset = () => {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        setFromInput(toLocalInputValue(oneYearAgo));
        setToInput(toLocalInputValue(new Date()));
        setUseNow(true);
    };

    const applyPreset = (deltaMs) => {
        const base = useNow ? new Date() : parseLocalInput(toInput);
        if (isNaN(base.getTime())) return;
        const target = new Date(base.getTime() + deltaMs);
        setFromInput(toLocalInputValue(target));
    };

    const fromInvalid = isNaN(fromDate.getTime());
    const toInvalid = !useNow && isNaN(toDate.getTime());
    const hasError = fromInvalid || toInvalid;

    const directionLabel = !breakdown ? '' : (breakdown.sign >= 0 ? 'after' : 'before');

    return (
        <div className="flex flex-col gap-6 max-w-3xl mx-auto h-full overflow-y-auto pr-2">
            {/* Hero: headline duration */}
            <Card>
                <div className="flex flex-col items-center text-center gap-2 py-2">
                    <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-widest">
                        <Hourglass size={14} />
                        <span>Duration</span>
                    </div>
                    {breakdown && !hasError ? (
                        <>
                            <div className="text-2xl md:text-3xl font-mono text-blue-300 font-semibold break-words">
                                {formatBreakdown(breakdown)}
                            </div>
                            <div className="text-sm text-slate-400">
                                {directionLabel === 'after' ? 'Target is' : 'Target was'} {directionLabel} the start point
                            </div>
                        </>
                    ) : (
                        <div className="text-slate-500 italic">Enter a valid date/time on both sides.</div>
                    )}
                </div>
            </Card>

            {/* Inputs */}
            <Card title={<span className="flex items-center gap-2"><CalendarDays size={16} /> Date & Time</span>}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-slate-400">From (start point)</label>
                        <input
                            type="datetime-local"
                            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 font-mono focus:border-blue-500 outline-none"
                            value={fromInput}
                            onChange={(e) => setFromInput(e.target.value)}
                        />
                        {fromInvalid && (
                            <div className="text-xs text-red-400">Invalid start date.</div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-400">To (target)</label>
                            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    className="accent-blue-500"
                                    checked={useNow}
                                    onChange={(e) => setUseNow(e.target.checked)}
                                />
                                Use now
                            </label>
                        </div>
                        <input
                            type="datetime-local"
                            disabled={useNow}
                            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 font-mono focus:border-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                            value={toInput}
                            onChange={(e) => setToInput(e.target.value)}
                        />
                        {!useNow && toInvalid && (
                            <div className="text-xs text-red-400">Invalid target date.</div>
                        )}
                        {useNow && (
                            <div className="text-xs text-slate-500 font-mono">
                                Now: {toLocalInputValue(now)}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-700/50 mt-4">
                    <span className="text-xs text-slate-500 self-center mr-1">Quick presets (sets "from" relative to target):</span>
                    {QUICK_PRESETS.map((p) => (
                        <Button
                            key={p.label}
                            variant="secondary"
                            onClick={() => applyPreset(p.ms)}
                        >
                            {p.label}
                        </Button>
                    ))}
                    <Button variant="ghost" onClick={reset} icon={RefreshCcw}>
                        Reset
                    </Button>
                </div>
            </Card>

            {/* Totals */}
            <Card title={<span className="flex items-center gap-2"><Clock size={16} /> Totals</span>}>
                {breakdown && !hasError ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                            { label: 'Years (approx)', value: breakdown.totalYearsApprox },
                            { label: 'Months (approx)', value: breakdown.totalMonthsApprox },
                            { label: 'Weeks', value: breakdown.totalWeeks },
                            { label: 'Days', value: breakdown.totalDays },
                            { label: 'Hours', value: breakdown.totalHours },
                            { label: 'Minutes', value: breakdown.totalMinutes },
                            { label: 'Seconds', value: breakdown.totalSeconds },
                            { label: 'Milliseconds', value: breakdown.totalMs },
                            { label: 'Sign', value: breakdown.sign >= 0 ? '+ (future)' : '- (past)' },
                        ].map((row) => (
                            <div key={row.label} className="bg-slate-900/60 border border-slate-700/60 rounded p-3 flex flex-col gap-1 group">
                                <div className="text-xs text-slate-500 uppercase tracking-wide">{row.label}</div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-slate-200 text-sm truncate">{String(row.value)}</span>
                                    <button
                                        onClick={() => copyToClipboard(String(row.value))}
                                        className="text-slate-500 hover:text-blue-300 transition-colors"
                                        title="Copy value"
                                    >
                                        <Copy size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-slate-500 italic">Totals will appear here once both dates are valid.</div>
                )}
            </Card>
        </div>
    );
};

export default TimeDurationCalculator;
