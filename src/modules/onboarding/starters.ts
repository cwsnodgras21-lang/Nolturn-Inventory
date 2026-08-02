import type { StarterPack } from "@/modules/onboarding/types";

export type StarterUnit = {
  name: string;
  symbol: string;
  dimension: "count" | "mass" | "volume" | "length" | "time" | "other";
  precision: number;
  unitKind: "base" | "pack" | "other";
};

export type StarterCategory = {
  name: string;
  children?: string[];
};

export type StarterStorageArea = {
  name: string;
  code: string;
  areaType: "room" | "cabinet" | "shelf" | "refrigerator" | "freezer" | "closet" | "warehouse" | "other";
  children?: Array<{
    name: string;
    code: string;
    areaType: "room" | "cabinet" | "shelf" | "refrigerator" | "freezer" | "closet" | "warehouse" | "other";
  }>;
};

export type StarterDemoItem = {
  name: string;
  sku: string;
  baseUnitSymbol: string;
  categoryName: string;
  description?: string;
};

export type StarterDefinition = {
  id: StarterPack;
  label: string;
  description: string;
  units: StarterUnit[];
  categories: StarterCategory[];
  storage: StarterStorageArea[];
  demoItems: StarterDemoItem[];
};

const COMMON_UNITS: StarterUnit[] = [
  { name: "Each", symbol: "each", dimension: "count", precision: 0, unitKind: "base" },
  { name: "Box", symbol: "box", dimension: "count", precision: 0, unitKind: "pack" },
  { name: "Case", symbol: "case", dimension: "count", precision: 0, unitKind: "pack" },
  { name: "Milliliter", symbol: "mL", dimension: "volume", precision: 2, unitKind: "base" },
  { name: "Liter", symbol: "L", dimension: "volume", precision: 3, unitKind: "base" },
];

export const STARTER_DEFINITIONS: Record<StarterPack, StarterDefinition> = {
  blank: {
    id: "blank",
    label: "Blank setup",
    description: "No starter reference data. Add units and categories yourself.",
    units: [],
    categories: [],
    storage: [],
    demoItems: [],
  },
  clinic: {
    id: "clinic",
    label: "Clinic starter",
    description: "Common clinical units, categories, and exam-room storage layout.",
    units: COMMON_UNITS,
    categories: [
      { name: "Clinical supplies", children: ["PPE", "Injection supplies", "Wound care"] },
      { name: "Office supplies" },
    ],
    storage: [
      {
        name: "Exam Room 1",
        code: "EXAM-1",
        areaType: "room",
        children: [
          { name: "Supply Cabinet", code: "EXAM-1-CAB", areaType: "cabinet" },
          { name: "Refrigerator", code: "EXAM-1-FRIDGE", areaType: "refrigerator" },
        ],
      },
    ],
    demoItems: [
      {
        name: "Nitrile Gloves Medium",
        sku: "CLINIC-GLV-M",
        baseUnitSymbol: "each",
        categoryName: "PPE",
        description: "Starter demo item — no opening balance unless demo data is enabled",
      },
      {
        name: "Alcohol Prep Pads",
        sku: "CLINIC-ALC-PAD",
        baseUnitSymbol: "each",
        categoryName: "Injection supplies",
      },
    ],
  },
  dental: {
    id: "dental",
    label: "Dental starter",
    description: "Dental-oriented categories and operatory storage suggestions.",
    units: COMMON_UNITS,
    categories: [
      {
        name: "Dental supplies",
        children: ["Operatory disposables", "Impression materials", "Infection control"],
      },
      { name: "Office supplies" },
    ],
    storage: [
      {
        name: "Operatory 1",
        code: "OP-1",
        areaType: "room",
        children: [
          { name: "Side Cabinet", code: "OP-1-CAB", areaType: "cabinet" },
          { name: "Sterile Drawer", code: "OP-1-STERILE", areaType: "other" },
        ],
      },
    ],
    demoItems: [
      {
        name: "Saliva Ejectors",
        sku: "DENTAL-SE-100",
        baseUnitSymbol: "each",
        categoryName: "Operatory disposables",
      },
    ],
  },
  medspa: {
    id: "medspa",
    label: "Med spa starter",
    description: "Aesthetic practice categories and treatment-room storage suggestions.",
    units: COMMON_UNITS,
    categories: [
      {
        name: "Aesthetic supplies",
        children: ["Injectables accessories", "Skincare", "Consumables"],
      },
      { name: "Office supplies" },
    ],
    storage: [
      {
        name: "Treatment Room A",
        code: "TRT-A",
        areaType: "room",
        children: [
          { name: "Product Cabinet", code: "TRT-A-CAB", areaType: "cabinet" },
          { name: "Medical Fridge", code: "TRT-A-FRIDGE", areaType: "refrigerator" },
        ],
      },
    ],
    demoItems: [
      {
        name: "Microfiber Towels",
        sku: "SPA-TOWEL",
        baseUnitSymbol: "each",
        categoryName: "Consumables",
      },
    ],
  },
};
