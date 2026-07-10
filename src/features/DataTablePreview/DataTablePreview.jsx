import React, { useState, useRef, useCallback, useMemo } from 'react';
import { UploadCloud, FileText, X, AlertCircle, Settings, ChevronRight, ChevronLeft, Play } from 'lucide-react';
import Papa from 'papaparse';

const DataTablePreview = () => {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [delimiter, setDelimiter] = useState('auto'); // 'auto', ',', '\t', ';'
  const [rawInput, setRawInput] = useState('');
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'paste'
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  const fileInputRef = useRef(null);

  const parseData = useCallback((input, currentDelimiter) => {
    if (!input) {
      setData([]);
      setHeaders([]);
      return;
    }

    setLoading(true);
    setError(null);

    // Using PapaParse
    Papa.parse(input, {
      delimiter: currentDelimiter === 'auto' ? '' : (currentDelimiter === '\\t' ? '\t' : currentDelimiter),
      header: true,
      skipEmptyLines: true,
      preview: 5000, // Limit to 5000 rows max to avoid breaking browser
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          // If auto failed or completely broke, warn but still show data if possible
          console.warn("Parse errors:", results.errors);
          if (results.data.length === 0) {
            setError('Failed to parse data. Please check delimiter or format.');
          }
        }

        if (results.meta && results.meta.fields) {
          setHeaders(results.meta.fields);
          setData(results.data);
          setCurrentPage(1);
        } else if (results.data && results.data.length > 0) {
          // Fallback if no header found
          const generatedHeaders = Object.keys(results.data[0]);
          setHeaders(generatedHeaders);
          setData(results.data);
          setCurrentPage(1);
        } else {
          setHeaders([]);
          setData([]);
        }
        setLoading(false);
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      }
    });
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setRawInput('');

    // Read full file for parsing, or preview slice
    Papa.parse(file, {
      delimiter: delimiter === 'auto' ? '' : (delimiter === '\\t' ? '\t' : delimiter),
      header: true,
      skipEmptyLines: true,
      preview: 5000, 
      complete: (results) => {
        if (results.errors && results.errors.length > 0 && results.data.length === 0) {
          setError('Failed to parse file. Please check if it is valid CSV or TSV.');
        } else {
          setHeaders(results.meta.fields || []);
          setData(results.data);
          setCurrentPage(1);
        }
        setLoading(false);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const handlePasteChange = (e) => {
    const value = e.target.value;
    setRawInput(value);
    // Do not auto-parse; just store raw text
    // User must click Parse or press Ctrl+Enter
  };

  const handlePasteKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      parseData(rawInput, delimiter);
    }
  };

  const handleParseClick = () => {
    parseData(rawInput, delimiter);
  };

  const handleDelimiterChange = (e) => {
    const newDelimiter = e.target.value;
    setDelimiter(newDelimiter);
    // If data already exists, re-parse with the new delimiter
    if (data.length > 0 && activeTab === 'paste' && rawInput) {
      parseData(rawInput, newDelimiter);
    }
  };

  const handleClear = () => {
    setData([]);
    setHeaders([]);
    setError(null);
    setRawInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Pagination compute
  const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));
  const displayedData = useMemo(() => {
    const startOffset = (currentPage - 1) * rowsPerPage;
    return data.slice(startOffset, startOffset + rowsPerPage);
  }, [data, currentPage, rowsPerPage]);


  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Settings / Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-900 rounded-lg border border-slate-800 gap-4">
        
        <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-md border border-slate-800">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'upload' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            File Upload
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'paste' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Paste Text
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Settings size={16} />
            <span>Delimiter:</span>
            <select
              value={delimiter}
              onChange={handleDelimiterChange}
              className="bg-slate-950 border border-slate-700 rounded-md py-1 px-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="auto">Auto-detect</option>
              <option value=",">Comma (,)</option>
              <option value="\t">Tab (\t)</option>
              <option value=";">Semicolon (;)</option>
            </select>
          </div>
          
          {(data.length > 0 || rawInput) && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-sm transition-colors"
            >
              <X size={16} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Input Area */}
      {(!data || data.length === 0) && !loading && (
        <div className="flex-1 min-h-[300px]">
          {activeTab === 'upload' ? (
            <label className="flex flex-col items-center justify-center w-full h-full border-2 border-slate-800 border-dashed rounded-xl cursor-pointer bg-slate-900/50 hover:bg-slate-800/50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <UploadCloud className="w-12 h-12 mb-4 text-slate-500" />
                <p className="mb-2 text-sm text-slate-400">
                  <span className="font-semibold text-blue-400">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-slate-500">CSV or TSV/TXT (Max preview 5000 rows)</p>
              </div>
              <input 
                ref={fileInputRef} 
                type="file" 
                className="hidden" 
                accept=".csv,.tsv,.txt" 
                onChange={handleFileUpload}
              />
            </label>
          ) : (
            <div className="h-full flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <label className="text-sm text-slate-400 font-medium">Paste CSV or Tab-separated content below:</label>
                <button
                  onClick={handleParseClick}
                  disabled={!rawInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
                >
                  <Play size={14} />
                  Parse <span className="text-blue-200 text-xs ml-1">(Ctrl+Enter)</span>
                </button>
              </div>
              <textarea
                value={rawInput}
                onChange={handlePasteChange}
                onKeyDown={handlePasteKeyDown}
                placeholder={`id,name,email\n1,John Doe,john@example.com\n...`}
                className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 resize-none transition-colors"
              />
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center bg-slate-900/30 rounded-xl border border-slate-800">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
            <span className="text-slate-400 font-medium">Parsing data...</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !loading && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}

      {/* Data Table */}
      {data.length > 0 && !loading && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {/* Table Header Info */}
          <div className="flex justify-between items-center p-3 border-b border-slate-800 bg-slate-900/80">
            <div className="text-sm text-slate-400 font-medium flex items-center gap-2">
              <FileText size={16} className="text-blue-400" />
              Showing <span className="text-slate-200">{(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, data.length)}</span> of <span className="text-slate-200">{data.length}</span> rows
              {data.length === 5000 && <span className="text-xs text-amber-500 font-normal ml-2">(Preview limit reached)</span>}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-slate-400">
                Page <span className="text-slate-200 font-medium">{currentPage}</span> of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap">
              <thead className="text-xs uppercase bg-slate-950/50 text-slate-400 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 font-medium tracking-wider w-12 text-center border-b border-slate-800">#</th>
                  {headers.map((header, i) => (
                    <th key={i} className="px-4 py-3 font-medium tracking-wider border-b border-slate-800 border-l border-slate-800/50">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {displayedData.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-4 py-2.5 text-center text-slate-500 text-xs border-r border-slate-800/50 w-12">
                      {(currentPage - 1) * rowsPerPage + rowIndex + 1}
                    </td>
                    {headers.map((header, colIndex) => (
                      <td key={colIndex} className="px-4 py-2.5 max-w-[300px] truncate group-hover:text-slate-200">
                        {row[header] !== undefined && row[header] !== null ? String(row[header]) : <span className="text-slate-600 italic">null</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Additional Global Styles for Custom Scrollbar if needed */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5); 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(51, 65, 85, 0.8); 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 1); 
        }
      `}} />
    </div>
  );
};

export default DataTablePreview;
