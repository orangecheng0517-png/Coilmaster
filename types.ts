
export enum MaterialGrade {
  DX51D = 'DX51D',
  DX52D = 'DX52D',
  DX53D = 'DX53D',
  DX54D = 'DX54D',
}

export enum SurfaceType {
  Y = 'Y', // Oiled / Non-passivated
  FY = 'FY', // Passivated
}

export interface Material {
  id: string;
  batchId?: string; // Added batch ID for tracking import batches
  client: string;
  model: string;
  materialCode: string; // Internal Code
  sheetMetalCode: string;
  name: string; // Material Name (e.g. 底盘体)
  quota: number; // kg per piece (standard)
  grade: MaterialGrade;
  coating: 80 | 180;
  surface: SurfaceType;
  thickness: number; // mm
  spec1: number; // Width 1 (mm)
  spec1Note?: string; // e.g. "*C", "*L"
  spec2: number; // Width 2 (mm)
  spec2Note?: string; // e.g. "*C", "*L"
  isSpecial: boolean; // *C or *L marker on code level
  requiredWeight: number; // WEIGHT BALANCE. Negative = Shortage (Need to produce), Positive = Surplus (Inventory).
  allowOverProduction?: boolean; // If true, can be included in plan even if no shortage (capped at 1500kg)
}

export interface Coil {
  id: string;
  motherCoilId: string; // Renamed from batchId
  grade: MaterialGrade;
  coating: 80 | 180;
  surface: SurfaceType;
  thickness: number;
  width: number; // mm
  totalWeight: number; // kg
  remainingWeight: number; // kg
  entryDate: string;
  lastUsedDate?: string; // Track when this coil was last processed
}

// AI Generated Plan Structures
export interface AIStrip {
  materialId: string | null; // null if it's scrap/trim
  materialCode: string;
  width: number; // mm
  count: number; // number of strips of this width
  usageType: 'PRODUCT' | 'SCRAP' | 'STOCK';
}

export interface PlanSegment {
  ordinal: number; // 1, 2, 3
  strips: AIStrip[];
  processingWeight: number; // Weight allocated to this segment
  efficiency: number;
  totalUsedWidth: number;
}

export interface AIPlanOption {
  id: number;
  name: string; // e.g., "方案A：综合最优"
  description: string;
  
  // Aggregate Stats
  efficiency: number; // Weighted average efficiency
  processingWeight: number; // Total weight used across all segments
  remainingCoilWeight: number; // Final leftover
  
  segments: PlanSegment[]; // The sequence of cuts
}

export interface CalculatedStrip extends AIStrip {
  weightPerStrip: number; // kg
  totalWeight: number; // kg (weightPerStrip * count)
  expectedPieces: number; // pieces
  originalShortage: number; // kg
  remainingShortage: number; // kg (Negative means shortage)
  client: string;
  model: string;
  widthLabel?: string; // e.g. "258*C"
  
  // New fields for UI display
  sheetMetalCode: string;
  name: string;
  batchId: string;
  
  // Context for UI
  segmentOrdinal: number; 
}

// History Tracking
export interface PlanImpact {
  materialId: string;
  materialCode: string; // Snapshot for history
  materialName: string; // Snapshot for history
  weightDeducted: number; // Standard weight equivalent deducted from shortage
  piecesDeducted?: number; // Accurate piece count produced
}

export interface ExecutedPlan {
  id: string;
  timestamp: string; // ISO Date
  originalPlanName: string;
  
  coilId: string;
  coilMotherId: string;
  
  totalConsumedWeight: number; // The weight taken from the coil
  efficiency: number;
  
  segments: PlanSegment[];
  impacts: PlanImpact[]; // To allow rollback
}

// Helper maps for logic
export const GRADE_RANK: Record<MaterialGrade, number> = {
  [MaterialGrade.DX51D]: 1,
  [MaterialGrade.DX52D]: 2,
  [MaterialGrade.DX53D]: 3,
  [MaterialGrade.DX54D]: 4,
};
