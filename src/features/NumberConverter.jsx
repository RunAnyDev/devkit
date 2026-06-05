import React, { useMemo, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { Button, Card } from '../components/ui';

const BASE_CONFIG = [
    { key: 'dec', label: 'Decimal', base: 10, prefix: '' },
    { key: 'hex', label: 'Hex', base: 16, prefix: '0x' },
    { key: 'oct', label: 'Octal', base: 8, prefix: '0o' },
    { key: 'bin', label: 'Binary', base: 2, prefix: '0b' },
];

const DIGIT_PATTERNS = {
    dec: /^[+-]?[0-9]+$/,
    hex: /^[+-]?(?:0x)?[0-9a-fA-F]+$/,
    oct: /^[+-]?(?:0o)?[0-7]+$/,
    bin: /^[+-]?(?:0b)?[01]+$/,
};

const normalizeInput = (value) => value.trim().replace(/[_\s,]/g, '');

const parseBigIntByBase = (value, type) => {
    const normalized = normalizeInput(value);

    if (!normalized) {
        return { value: null, error: '' };
    }

    if (!DIGIT_PATTERNS[type].test(normalized)) {
        return { value: null, error: `Invalid ${type.toUpperCase()} number` };
    }

    const sign = normalized.startsWith('-') ? -1n : 1n;
    const unsigned = normalized.replace(/^[+-]/, '');
    const digits = unsigned.replace(/^0[xob]/i, '');

    if (!digits) {
        return { value: null, error: `Invalid ${type.toUpperCase()} number` };
    }

    try {
        const literal = type === 'dec' ? digits : `0${type[0]}${digits}`;
        const parsed = BigInt(literal);
        return { value: sign * parsed, error: '' };
    } catch {
        return { value: null, error: `Invalid ${type.toUpperCase()} number` };
    }
};

const formatBaseValue = (value, type) => {
    if (value === null) return '';

    const config = BASE_CONFIG.find((item) => item.key === type);
    const sign = value < 0n ? '-' : '';
    const absValue = value < 0n ? -value : value;

    return `${sign}${config.prefix}${absValue.toString(config.base)}`;
};

const copyToClipboard = (text) => {
    if (!text) return;

    navigator.clipboard?.writeText(text) || (() => {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    })();
};

const NumberConverter = () => {
    const [inputType, setInputType] = useState('dec');
    const [inputValue, setInputValue] = useState('255');

    const parsed = useMemo(() => parseBigIntByBase(inputValue, inputType), [inputType, inputValue]);

    const convertedValues = useMemo(() => {
        if (parsed.value === null) return {};

        return BASE_CONFIG.reduce((result, config) => {
            result[config.key] = formatBaseValue(parsed.value, config.key);
            return result;
        }, {});
    }, [parsed.value]);

    const handleReset = () => {
        setInputType('dec');
        setInputValue('255');
    };

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto h-full overflow-y-auto pr-2">
            <Card title="Number Converter">
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm text-slate-400">Input format</label>
                            <select
                                value={inputType}
                                onChange={(e) => setInputType(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:border-blue-500 outline-none"
                            >
                                {BASE_CONFIG.map((config) => (
                                    <option key={config.key} value={config.key}>
                                        {config.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm text-slate-400">Value</label>
                            <input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Enter number..."
                                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 font-mono focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>Supports big integers, negative values, and prefixes like `0x`, `0o`, `0b`.</span>
                        <Button variant="ghost" onClick={handleReset} icon={RefreshCw} className="px-0 py-0">
                            Reset sample
                        </Button>
                    </div>

                    {parsed.error ? (
                        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {parsed.error}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {BASE_CONFIG.map((config) => (
                                <div
                                    key={config.key}
                                    className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col gap-3"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-slate-200">{config.label}</div>
                                            <div className="text-xs text-slate-500">Base {config.base}</div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            onClick={() => copyToClipboard(convertedValues[config.key])}
                                            disabled={!convertedValues[config.key]}
                                            icon={Copy}
                                            className="px-2 py-1"
                                        >
                                            Copy
                                        </Button>
                                    </div>
                                    <div className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-3 font-mono text-sm text-blue-300 break-all min-h-[52px]">
                                        {convertedValues[config.key] || '—'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default NumberConverter;
