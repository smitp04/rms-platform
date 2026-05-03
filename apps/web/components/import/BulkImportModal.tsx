'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import * as XLSX from 'xlsx';

type ImportType = 'employees' | 'projects';

interface ImportResult {
  row: number;
  status: 'created' | 'updated' | 'error';
  message: string;
}

interface ImportResponse {
  type: ImportType;
  created: number;
  updated: number;
  errors: number;
  results: ImportResult[];
}

const TEMPLATES: Record<ImportType, { headers: string[]; altHeaders?: string[]; example: Record<string, string> }> = {
  employees: {
    headers: ['name', 'email', 'function', 'role', 'pod', 'platforms'],
    example: {
      name: 'Jane Smith',
      email: 'jane@devxlabs.ai',
      function: 'Tech',
      role: 'SDE - 2',
      pod: 'Alpha',
      platforms: 'Shopify, AWS',
    },
  },
  projects: {
    headers: ['deal_name', 'brand_name', 'status', 'devx_pillar', 'billing_model', 'start_date', 'end_date', 'revenue_usd', 'project_manager_email'],
    // Zoho CSV columns that are also accepted (auto-detected by backend)
    altHeaders: ['Deal Name', 'Account Name', 'Closing Date', 'Total Deal Amount', 'Currency', 'Exchange Rate', 'Deal Type', 'Project Manager', 'Record Id', 'Stage'],
    example: {
      deal_name: 'Nike Commerce Replatform',
      brand_name: 'Nike',
      status: 'ACTIVE',
      devx_pillar: 'CUSTOMER_INTERACTION',
      billing_model: 'RETAINER',
      start_date: '2025-01-06',
      end_date: '2025-06-30',
      revenue_usd: '45000',
      project_manager_email: 'arjun@devxlabs.ai',
    },
  },
};

function downloadTemplate(type: ImportType) {
  const t = TEMPLATES[type];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    t.headers,
    t.headers.map((h) => t.example[h] ?? ''),
    // Add hints row for projects
    ...(type === 'projects'
      ? [['← deal name', '← account/brand', 'UPCOMING|ACTIVE|ON_HOLD|COMPLETED|CANCELLED', 'CUSTOMER_INTERACTION|MARKETING_AUTOMATION|AI_OPS|ENTERPRISE_ARCHITECTURE', 'TIME_AND_MATERIAL|FIXED_PRICE|RETAINER', 'YYYY-MM-DD', 'YYYY-MM-DD (optional)', 'monthly USD (no $)', 'employee email (optional)']]
      : [['← full name', '← work email', 'Tech|Growth|Design|...', 'role name exactly as in system', 'pod name (optional)', 'comma-separated platform names']]),
  ]);
  XLSX.utils.book_append_sheet(wb, ws, type === 'employees' ? 'Employees' : 'Projects');
  XLSX.writeFile(wb, `${type}_import_template.xlsx`);
}

function downloadResults(results: ImportResult[], type: ImportType) {
  const rows = results.map((r) => ({
    row: r.row,
    status: r.status,
    message: r.message,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Import Results');
  XLSX.writeFile(wb, `${type}_import_results.xlsx`);
}

export function BulkImportModal({
  onClose,
  onSuccess,
  defaultType,
}: {
  onClose: () => void;
  onSuccess: () => void;
  defaultType?: ImportType;
}) {
  const [importType, setImportType] = useState<ImportType>(defaultType ?? 'employees');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback((f: File) => {
    setFile(f);
    setResponse(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
      if (rows.length > 0) {
        setHeaders(Object.keys(rows[0]));
        setPreview(rows.slice(0, 5));
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) parseFile(f);
    },
    [parseFile]
  );

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setResponse(null);
    try {
      const reader = new FileReader();
      const rows: Record<string, string>[] = await new Promise((resolve) => {
        reader.onload = (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false }));
        };
        reader.readAsArrayBuffer(file);
      });

      const res = await fetch('/api/v1/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, rows }),
      });
      const json = await res.json();
      setResponse(json.data ?? json);
      if ((json.data?.errors ?? json.errors ?? 0) === 0) {
        setTimeout(onSuccess, 1200);
      }
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setResponse(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const expectedHeaders = TEMPLATES[importType].headers;
  const altHeaders = TEMPLATES[importType].altHeaders ?? [];
  // If Zoho columns are detected (e.g. "Deal Name"), treat as valid — no missing headers
  const isZohoUpload = importType === 'projects' && headers.some((h) => altHeaders.includes(h));
  const missingHeaders = file && !isZohoUpload
    ? expectedHeaders.filter((h) => !headers.includes(h))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 -z-10" onClick={onClose} />

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Bulk Import</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Type selector */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-2">
              Import type
            </label>
            <div className="flex gap-2">
              {(['employees', 'projects'] as ImportType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setImportType(t); reset(); }}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium border transition-all',
                    importType === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                  )}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Template download */}
          <div className="bg-blue-50 rounded-xl p-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-800">Download template first</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Use the template to ensure columns are named correctly. Row 2 is an example, row 3 shows valid values.
              </p>
            </div>
            <button
              onClick={() => downloadTemplate(importType)}
              className="flex items-center gap-1.5 bg-white dark:bg-gray-900 border border-blue-200 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
            >
              <Download size={12} />
              Template
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
            )}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={24} className={cn('mx-auto mb-2', dragOver ? 'text-blue-500' : 'text-gray-300')} />
            {file ? (
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{file.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{preview.length} rows previewed</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Drop your Excel file here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, or .csv accepted</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
            />
          </div>

          {/* Column mismatch warning */}
          {file && missingHeaders.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Missing required columns</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {missingHeaders.join(', ')} — please add these to your file.
                </p>
              </div>
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Preview (first {preview.length} rows)
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100">
                      {headers.map((h) => (
                        <th
                          key={h}
                          className={cn(
                            'px-3 py-2 text-left font-semibold whitespace-nowrap',
                            missingHeaders.includes(h)
                              ? 'text-red-500'
                              : expectedHeaders.includes(h)
                              ? 'text-gray-700 dark:text-gray-300'
                              : 'text-gray-400'
                          )}
                        >
                          {h}
                          {!expectedHeaders.includes(h) && !(isZohoUpload && altHeaders.includes(h)) && (
                            <span className="ml-1 text-[9px] text-gray-300">(ignored)</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        {headers.map((h) => (
                          <td key={h} className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[160px] truncate">
                            {row[h] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import results */}
          {response && (
            <div>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-green-50 dark:bg-green-950/40 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">{response.created}</div>
                  <div className="text-[10px] text-green-400 dark:text-green-500 font-medium">Created</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{response.updated}</div>
                  <div className="text-[10px] text-blue-400 dark:text-blue-500 font-medium">Updated</div>
                </div>
                <div className={cn('rounded-xl p-3 text-center', response.errors > 0 ? 'bg-red-50' : 'bg-gray-50 dark:bg-gray-800')}>
                  <div className={cn('text-lg font-bold', response.errors > 0 ? 'text-red-600' : 'text-gray-400')}>
                    {response.errors}
                  </div>
                  <div className={cn('text-[10px] font-medium', response.errors > 0 ? 'text-red-400' : 'text-gray-300')}>
                    Errors
                  </div>
                </div>
              </div>

              {/* Row-level results */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {response.results.map((r, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-2 text-xs px-3 py-2 rounded-lg border',
                      r.status === 'error'
                        ? 'bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-800'
                        : r.status === 'created'
                        ? 'bg-green-50 dark:bg-green-950/40 border-green-100 dark:border-green-800'
                        : 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-800'
                    )}
                  >
                    {r.status === 'error' ? (
                      <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 size={12} className={cn('flex-shrink-0 mt-0.5', r.status === 'created' ? 'text-green-500' : 'text-blue-500')} />
                    )}
                    <span className={cn('font-medium flex-shrink-0', r.status === 'error' ? 'text-red-600 dark:text-red-400' : r.status === 'created' ? 'text-green-700 dark:text-green-300' : 'text-blue-700 dark:text-blue-300')}>
                      Row {r.row}
                    </span>
                    <span className={r.status === 'error' ? 'text-red-600' : 'text-gray-600 dark:text-gray-400'}>
                      {r.message}
                    </span>
                  </div>
                ))}
              </div>

              {/* Download results */}
              {response.errors > 0 && (
                <button
                  onClick={() => downloadResults(response.results, importType)}
                  className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-800 transition-colors"
                >
                  <Download size={12} />
                  Download error report (.xlsx)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            disabled={!file}
          >
            <RefreshCw size={13} />
            Reset
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!file || loading || missingHeaders.length > 0}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all',
                !file || loading || missingHeaders.length > 0
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              )}
            >
              {loading ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload size={13} />
                  Import {importType}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
