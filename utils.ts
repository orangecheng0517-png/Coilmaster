
import { GRADE_RANK, MaterialGrade, Material, Coil, SurfaceType } from './types';

// Check if Coil Grade is compatible with Material Grade
// High grade can be used for low grade (e.g., 53D coil for 51D material)
// 54D > 53D > 52D > 51D
export const isGradeCompatible = (coilGrade: MaterialGrade, materialGrade: MaterialGrade): boolean => {
  return GRADE_RANK[coilGrade] >= GRADE_RANK[materialGrade];
};

// Check full compatibility (Grade, Zinc, Surface, Thickness)
export const isCoilCompatible = (coil: Coil, mat: Material): string | null => {
  // 1. Grade Check
  if (!isGradeCompatible(coil.grade, mat.grade)) {
    return `牌号不兼容: 钢卷${coil.grade} 无法满足 物料${mat.grade} 的要求`;
  }
  
  // 2. Coating Check
  if (coil.coating !== mat.coating) {
     return `锌层不匹配: 钢卷Z${coil.coating} vs 物料Z${mat.coating}`;
  }

  // 3. Surface Check
  if (coil.surface !== mat.surface) {
    return `表面处理不匹配: 钢卷${coil.surface} vs 物料${mat.surface}`;
  }
  
  // 4. Thickness Check
  const thickDiff = Math.abs(coil.thickness - mat.thickness);
  if (thickDiff > 0.0501) { 
    return `厚度差异过大: 钢卷${coil.thickness}mm vs 物料${mat.thickness}mm (允许偏差 ±0.05mm)`;
  }

  return null;
};

export const calculateAdjustedQuota = (stdQuota: number, stdThickness: number, actualThickness: number): number => {
  if (stdThickness === 0) return 0;
  return stdQuota * (actualThickness / stdThickness);
};

export const calculatePieces = (weight: number, quota: number): number => {
  if (quota === 0) return 0;
  // Weight is likely negative for shortages.
  // -1000 / 10 = -100.
  // Add epsilon to handle float precision towards zero for negatives or away?
  // Simply dividing usually works, but floor handles negatives by moving away from zero (-99.9 -> -100).
  // This is safe for "shortage".
  return Math.floor((weight / quota) + 0.001);
};

export const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Bulk Import Logic Helpers ---

const parseGradeOnly = (str: string): MaterialGrade => {
  const s = str.toUpperCase().trim();
  if (s.includes('54')) return MaterialGrade.DX54D;
  if (s.includes('53')) return MaterialGrade.DX53D;
  if (s.includes('52')) return MaterialGrade.DX52D;
  return MaterialGrade.DX51D; // Default
};

const parseCoatingOnly = (str: string): 80 | 180 => {
  const s = str.toUpperCase().trim();
  if (s.includes('180') || s.includes('Z180')) return 180;
  return 80; // Default
};

const parseSurfaceOnly = (str: string): SurfaceType => {
  const s = str.toUpperCase().trim();
  if (s.includes('FY') || s.includes('钝化')) return SurfaceType.FY;
  return SurfaceType.Y; // Default
};

// Helper to remove labels like "客户名：" or "厚度" from the value
const cleanValue = (val: string): string => {
  if (!val) return '';
  let cleaned = val.replace(/^.*[：:]\s*/, ''); 
  return cleaned.trim();
};

const cleanNum = (val: string) => {
    if (!val) return 0;
    const normalized = val.replace(/,/g, '').replace(/[^\d.-]/g, '');
    return parseFloat(normalized) || 0;
 };

// --- Material Bulk Import ---
export const parseBulkText = (text: string): Material[] => {
  const rows = text.trim().split('\n');
  const materials: Material[] = [];

  rows.forEach(row => {
    // Handle tab (Excel) or comma (CSV)
    const cols = row.split(/\t|,/).map(c => c.trim());
    
    // Skip empty rows or headers
    if (cols.length < 5 || cols[0] === '') return;
    if (cols[2].includes('编码') && cols[2].length < 10) return; 

    try {
      const client = cleanValue(cols[0]);
      const model = cleanValue(cols[1]);
      const matCode = cleanValue(cols[2]);
      const sheetMetalCode = cleanValue(cols[3]);
      const name = cleanValue(cols[4]); 
      
      const gradeStr = cleanValue(cols[5]);
      const coatingSurfaceStr = cleanValue(cols[6]);
      
      const grade = parseGradeOnly(gradeStr);
      const coating = parseCoatingOnly(coatingSurfaceStr);
      const surface = parseSurfaceOnly(coatingSurfaceStr);
      
      const extractNote = (val: string) => {
          if (!val) return undefined;
          const upper = val.toUpperCase();
          if (upper.includes('*C')) return '*C';
          if (upper.includes('*L')) return '*L';
          return undefined;
      };

      const thickness = cleanNum(cols[7]);
      
      const spec1Raw = cleanValue(cols[8]);
      const spec2Raw = cleanValue(cols[9]);
      
      const spec1 = cleanNum(spec1Raw);
      const spec1Note = extractNote(spec1Raw);
      
      const spec2 = cleanNum(spec2Raw);
      const spec2Note = extractNote(spec2Raw);

      const quota = cleanNum(cols[10]);
      const weightRaw = cleanNum(cols[11]);
      const piecesRaw = cleanNum(cols[12]);
      
      let weight = 0;

      // CRITICAL LOGIC: Shortage must be stored as NEGATIVE.
      if (piecesRaw > 0) {
          const pieces = Math.round(piecesRaw); // Integer pieces
          if (quota > 0) {
              weight = -(pieces * quota); // Make Negative
          } else {
              weight = weightRaw > 0 ? -weightRaw : weightRaw;
          }
      } else {
          weight = weightRaw > 0 ? -weightRaw : weightRaw;
      }
      
      const batchId = cleanValue(cols[13]);

      if (!matCode || !thickness) return; 

      const isSpecial = matCode.includes('*C') || matCode.includes('*L') || model.includes('*C') || !!spec1Note || !!spec2Note;

      materials.push({
        id: generateId(),
        batchId,
        client,
        model,
        materialCode: matCode,
        sheetMetalCode: sheetMetalCode,
        name,
        quota,
        grade,
        coating,
        surface,
        thickness,
        spec1,
        spec1Note,
        spec2,
        spec2Note,
        isSpecial,
        requiredWeight: weight,
        allowOverProduction: false
      });
    } catch (e) {
      console.warn("Failed to parse row:", row, e);
    }
  });

  return materials;
};

// --- Coil Bulk Import ---
export const parseBulkCoilText = (text: string): Coil[] => {
  const rows = text.trim().split('\n');
  const coils: Coil[] = [];

  rows.forEach(row => {
    const cols = row.split(/\t|,/).map(c => c.trim());
    
    // Expecting at least 6 columns
    // [0] MotherCoilId, [1] Grade, [2] Coating, [3] Surface, [4] Thickness, [5] Width, [6] Weight
    if (cols.length < 6 || !cols[0] || cols[0].includes('卷号')) return;

    try {
        const motherCoilId = cleanValue(cols[0]);
        const gradeStr = cleanValue(cols[1]);
        const coatingStr = cleanValue(cols[2]); // Can be "80", "Z80", "180"
        const surfaceStr = cleanValue(cols[3]); // Can be "Y", "FY"
        
        const grade = parseGradeOnly(gradeStr);
        const coating = parseCoatingOnly(coatingStr);
        const surface = parseSurfaceOnly(surfaceStr);

        const thickness = cleanNum(cols[4]);
        const width = cleanNum(cols[5]);
        const weight = cleanNum(cols[6]);

        if (motherCoilId && thickness > 0 && width > 0 && weight > 0) {
            coils.push({
                id: generateId(),
                motherCoilId,
                grade,
                coating,
                surface,
                thickness,
                width,
                totalWeight: weight,
                remainingWeight: weight, // Initially full
                entryDate: new Date().toISOString().split('T')[0],
            });
        }
    } catch (e) {
        console.warn("Failed to parse coil row:", row, e);
    }
  });

  return coils;
};
