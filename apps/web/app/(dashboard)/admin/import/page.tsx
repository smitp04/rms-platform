'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, AlertCircle, ArrowRight } from 'lucide-react';

interface ZohoRow {
  zoho_deal_id: string;
  deal_name: string;
  account_name: string;
  closing_date: string;
  deal_owner: string;
  billing_model: string;
  devx_pillar: string;
  revenue_usd: number;
  tech_stack: string[];
  errors: string[];
}

interface PreviewResult {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  rows: ZohoRow[];
}

interface ImportResult {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  errors: number;
  skipped: number;
  results: { row: number; status: string; message: string }[];
}

const PILLAR_LABELS: Record<string, string> = {
  CUSTOMER_INTERACTION: 'Customer Interaction',
  AI_OPS: 'AI Ops',
  ENTERPRISE_ARCHITECTURE: 'Enterprise Architecture',
  MARKETING_AUTOMATION: 'Marketing Automation',
};

const BILLING_LABELS: Record<string, string> = {
  TIME_AND_MATERIAL: 'T&M',
  FIXED_PRICE: 'Fixed',
  RETAINER: 'Retainer',
  OUTCOME_BASED: 'Outcome Based',
  MILESTONE_BASED: 'Milestone',
};

export default function ImportPage() {
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string);
      setPreview(null);
      setImportResult(null);
      setError('');
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!csvText) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/import/zoho-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Preview failed');
      setPreview(data.data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!csvText) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/import/zoho-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setImportResult(data.data);
      setPreview(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = preview?.rows.filter((r) => r.errors.length > 0) ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Import Deals from Zoho CRM</h1>
        <p className="text-gray-400 mt-1">Upload a Zoho CRM deals CSV export to import projects into RMS.</p>
      </div>

      {/* Upload */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">1. Upload CSV</h2>
        <div
          className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-500 dark:text-gray-400 mx-auto mb-2" />
          <p className="text-gray-400">
            {csvText ? (
              <span className="text-green-400">✓ File loaded — {csvText.split('\n').length - 1} rows</span>
            ) : (
              'Click to upload Zoho deals CSV'
            )}
          </p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
        </div>

        {csvText && !preview && !importResult && (
          <button
            onClick={handlePreview}
            disabled={loading}
            className="mt-4 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? 'Parsing...' : 'Preview Import'} <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 flex gap-2">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">2. Review Preview</h2>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{preview.total}</div>
              <div className="text-gray-400 text-sm">Total Deals</div>
            </div>
            <div className="bg-green-900/30 border border-green-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{preview.valid}</div>
              <div className="text-gray-400 text-sm">Ready to Import</div>
            </div>
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{preview.invalid}</div>
              <div className="text-gray-400 text-sm">Will be Skipped</div>
            </div>
          </div>

          {/* Invalid rows warning */}
          {invalidRows.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-yellow-400 font-medium">
                <AlertCircle className="w-4 h-4" />
                {invalidRows.length} rows will be skipped due to errors:
              </div>
              {invalidRows.map((r, i) => (
                <div key={i} className="text-sm text-yellow-300 ml-6">
                  Row {i + 2}: <span className="font-medium">{r.deal_name || '(no name)'}</span> — {r.errors.join('; ')}
                </div>
              ))}
            </div>
          )}

          {/* Valid rows table */}
          {validRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-gray-400">
                    <th className="text-left px-3 py-2">Deal Name</th>
                    <th className="text-left px-3 py-2">Account</th>
                    <th className="text-left px-3 py-2">Start Date</th>
                    <th className="text-left px-3 py-2">Owner</th>
                    <th className="text-left px-3 py-2">Pillar</th>
                    <th className="text-left px-3 py-2">Billing</th>
                    <th className="text-right px-3 py-2">Revenue (USD)</th>
                    <th className="text-left px-3 py-2">Tech Stack</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="px-3 py-2 text-white font-medium max-w-[200px] truncate">{row.deal_name}</td>
                      <td className="px-3 py-2 text-gray-300">{row.account_name}</td>
                      <td className="px-3 py-2 text-gray-300">{row.closing_date}</td>
                      <td className="px-3 py-2 text-gray-300">{row.deal_owner}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 rounded text-xs">
                          {PILLAR_LABELS[row.devx_pillar] ?? row.devx_pillar}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-300 text-xs">{BILLING_LABELS[row.billing_model] ?? row.billing_model}</td>
                      <td className="px-3 py-2 text-right text-gray-300">
                        ${row.revenue_usd.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs max-w-[150px] truncate">
                        {row.tech_stack.join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleImport}
              disabled={loading || preview.valid === 0}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'Importing...' : `Import ${preview.valid} Deals`}
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setPreview(null); setCsvText(''); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {importResult && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" /> Import Complete
          </h2>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-green-900/30 border border-green-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{importResult.created}</div>
              <div className="text-gray-400 text-sm">Created</div>
            </div>
            <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{importResult.updated}</div>
              <div className="text-gray-400 text-sm">Updated</div>
            </div>
            <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{importResult.skipped}</div>
              <div className="text-gray-400 text-sm">Skipped</div>
            </div>
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{importResult.errors}</div>
              <div className="text-gray-400 text-sm">Errors</div>
            </div>
          </div>

          {/* Detailed results */}
          <div className="max-h-80 overflow-y-auto space-y-1">
            {importResult.results.map((r, i) => (
              <div key={i} className={`flex items-start gap-2 text-sm px-3 py-1.5 rounded ${
                r.status === 'created' ? 'text-green-400' :
                r.status === 'updated' ? 'text-blue-400' :
                r.status === 'error' ? 'text-red-400' : 'text-yellow-400'
              }`}>
                {r.status === 'created' && <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                {r.status === 'updated' && <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                {r.status === 'error' && <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                {r.status === 'skipped' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>Row {r.row}: {r.message}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setImportResult(null); setCsvText(''); }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}
