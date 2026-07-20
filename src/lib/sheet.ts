'use client';

/**
 * قراءة ملف Excel (.xlsx/.xls) أو CSV إلى صفوف — عبر SheetJS (استيراد ديناميكي).
 * يُعيد أول ورقة كـ { headers, rows } (كلها نصوص مقصوصة).
 */
export interface SheetData {
  headers: string[];
  rows: string[][];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function readSheet(file: File): Promise<SheetData> {
  const mod: any = await import('xlsx');
  // توافق ESM/CJS: قد تكون الدوال على default.
  const XLSX: any = mod.read ? mod : mod.default ?? mod;

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) return { headers: [], rows: [] };

  const sheet = wb.Sheets[first];
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false, // يُعيد نصوصاً منسّقة (يتفادى مشاكل الأرقام/التواريخ)
  });

  const all = matrix.map((r) => (r || []).map((c: unknown) => (c == null ? '' : String(c).trim())));
  const headers = (all.shift() ?? []).map((h) => h.trim());
  const rows = all.filter((r) => r.some((x) => x !== ''));
  return { headers, rows };
}
