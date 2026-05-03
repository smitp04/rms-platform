'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ExportDropdownProps {
  filename: string;
  columns: { header: string; key: string }[];
  rows: Record<string, string | number | boolean | null | undefined>[];
}

export function ExportDropdown({ filename, columns, rows }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, close]);

  function buildSheetData() {
    return rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of columns) {
        obj[col.header] = row[col.key] ?? '';
      }
      return obj;
    });
  }

  function exportCSV() {
    const ws = XLSX.utils.json_to_sheet(buildSheetData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}.csv`, { bookType: 'csv' });
    close();
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(buildSheetData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    close();
  }

  async function exportPDF() {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
    doc.setFontSize(16);
    const title = filename.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    doc.text(title, 14, 18);

    const head = [columns.map((c) => c.header)];
    const body = rows.map((row) => columns.map((col) => String(row[col.key] ?? '')));

    autoTable(doc, {
      startY: 28,
      head,
      body,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { top: 14 },
    });

    doc.save(`${filename}.pdf`);
    close();
  }

  const options = [
    { label: 'CSV', onClick: exportCSV },
    { label: 'Excel', onClick: exportExcel },
    { label: 'PDF', onClick: exportPDF },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <Download size={14} />
        Download
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={opt.onClick}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
