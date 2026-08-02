import type { CsvItemRow, CsvRowIssue, CsvValidationResult } from "@/modules/onboarding/types";

export const ITEM_CSV_TEMPLATE = `name,sku,base_unit,entry_unit,category,description
Nitrile Gloves Medium,PPE-GLV-M,each,box,PPE,Powder-free exam gloves
Saline Flush 10mL,INJ-SAL-10,each,each,Injection supplies,Prefilled saline syringe
`;

const REQUIRED_HEADERS = ["name", "sku", "base_unit", "entry_unit"] as const;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function parseItemCsv(csvText: string): {
  headers: string[];
  rawRows: Array<{ rowNumber: number; values: Record<string, string> }>;
  headerErrors: CsvRowIssue[];
} {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rawRows: [],
      headerErrors: [{ rowNumber: 0, message: "CSV is empty" }],
    };
  }

  const headers = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const headerErrors: CsvRowIssue[] = [];
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      headerErrors.push({
        rowNumber: 1,
        field: required,
        message: `Missing required column: ${required}`,
      });
    }
  }

  const rawRows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const values: Record<string, string> = {};
    headers.forEach((header, i) => {
      values[header] = (cells[i] ?? "").trim();
    });
    return { rowNumber: index + 2, values };
  });

  return { headers, rawRows, headerErrors };
}

export function validateItemCsvRows(
  csvText: string,
  context: {
    existingSkus: Set<string>;
    unitSymbols: Set<string>;
    categoryNames: Set<string>;
  },
): CsvValidationResult {
  const { rawRows, headerErrors } = parseItemCsv(csvText);
  const errors: CsvRowIssue[] = [...headerErrors];
  const warnings: CsvRowIssue[] = [];
  const rows: CsvItemRow[] = [];
  const seenSkus = new Set<string>();

  if (headerErrors.length > 0) {
    return {
      rows: [],
      errors,
      warnings,
      validCount: 0,
      errorCount: errors.length,
    };
  }

  for (const raw of rawRows) {
    const name = raw.values.name ?? "";
    const sku = raw.values.sku ?? "";
    const baseUnit = (raw.values.base_unit ?? "").toLowerCase();
    const entryUnit = (raw.values.entry_unit ?? "").toLowerCase();
    const category = (raw.values.category ?? "").trim() || null;
    const description = (raw.values.description ?? "").trim() || null;
    let rowHasError = false;

    if (!name) {
      errors.push({ rowNumber: raw.rowNumber, field: "name", message: "Name is required" });
      rowHasError = true;
    }
    if (!sku) {
      errors.push({ rowNumber: raw.rowNumber, field: "sku", message: "SKU is required" });
      rowHasError = true;
    } else {
      const skuKey = sku.toLowerCase();
      if (seenSkus.has(skuKey)) {
        errors.push({
          rowNumber: raw.rowNumber,
          field: "sku",
          message: `Duplicate SKU in file: ${sku}`,
        });
        rowHasError = true;
      } else if (context.existingSkus.has(skuKey)) {
        errors.push({
          rowNumber: raw.rowNumber,
          field: "sku",
          message: `SKU already exists in catalog: ${sku}`,
        });
        rowHasError = true;
      } else {
        seenSkus.add(skuKey);
      }
    }

    if (!baseUnit) {
      errors.push({
        rowNumber: raw.rowNumber,
        field: "base_unit",
        message: "Base unit is required",
      });
      rowHasError = true;
    } else if (!context.unitSymbols.has(baseUnit)) {
      errors.push({
        rowNumber: raw.rowNumber,
        field: "base_unit",
        message: `Unknown base unit symbol: ${baseUnit}`,
      });
      rowHasError = true;
    }

    if (!entryUnit) {
      errors.push({
        rowNumber: raw.rowNumber,
        field: "entry_unit",
        message: "Entry unit is required",
      });
      rowHasError = true;
    } else if (!context.unitSymbols.has(entryUnit)) {
      errors.push({
        rowNumber: raw.rowNumber,
        field: "entry_unit",
        message: `Unknown entry unit symbol: ${entryUnit}`,
      });
      rowHasError = true;
    } else if (entryUnit !== baseUnit) {
      warnings.push({
        rowNumber: raw.rowNumber,
        field: "entry_unit",
        message:
          "Entry unit differs from base unit — item will be created, but add a conversion before using that entry unit",
      });
    }

    if (category && !context.categoryNames.has(category.toLowerCase())) {
      errors.push({
        rowNumber: raw.rowNumber,
        field: "category",
        message: `Unknown category: ${category}`,
      });
      rowHasError = true;
    }

    if (!rowHasError) {
      rows.push({
        rowNumber: raw.rowNumber,
        name,
        sku,
        baseUnit,
        entryUnit,
        category,
        description,
      });
    }
  }

  return {
    rows,
    errors,
    warnings,
    validCount: rows.length,
    errorCount: errors.length,
  };
}
