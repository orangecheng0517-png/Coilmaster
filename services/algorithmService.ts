
import { Coil, Material, AIPlanOption, AIStrip, PlanSegment } from '../types';
import { isCoilCompatible } from '../utils';

// Configuration
const MAX_STRIPS = 9; 
const MAX_SEGMENTS = 3; 
const TIMEOUT_MS = 3000; 
const OVERSTOCK_LIMIT = 1.10; // Max 10% overstock allowed
const ALLOWED_STOCK_LIMIT = 1500; // Max kg for stock allowed materials
const EFFICIENCY_THRESHOLD = 96.0; // Relaxed from 97.5 to ensure more options appear

interface OptimizationRequest {
  mode: 'stock' | 'urgent';
  targetCoil: Coil;
  urgentMaterial?: Material;
  compatibleMaterials: Material[];
}

interface PatternResult {
  strips: AIStrip[];
  efficiency: number;
  totalUsedWidth: number;
  priorityScore: number;
  dominantMaterialId?: string;
  hasUrgent?: boolean; // New flag to track urgent material presence
}

const solveSingleSegmentPatterns = (
  targetCoil: Coil, // CHANGED: Pass full coil object for grade checking
  materials: Material[],
  urgentMatId: string | undefined
): PatternResult[] => {
  
  const coilWidth = targetCoil.width;

  // 1. Filter candidates for THIS segment
  const candidates = materials.filter(m => {
    // UPDATED: Shortage is negative, so look for values < -0.1
    const needsProduction = m.requiredWeight < -0.1 || m.allowOverProduction;
    const fitW1 = m.spec1 > 0 && m.spec1 <= coilWidth;
    const fitW2 = m.spec2 > 0 && m.spec2 <= coilWidth;
    return needsProduction && (fitW1 || fitW2);
  });

  if (candidates.length === 0) return [];

  // 2. Normalize to Width Options
  interface WidthOption {
    width: number;
    material: Material;
    priorityScore: number;
    isUrgent: boolean;
  }

  const options: WidthOption[] = [];
  candidates.forEach(m => {
    const isUrgent = !!(urgentMatId && m.id === urgentMatId);
    
    // BASE SCORE: Magnitude of shortage
    let score = m.requiredWeight < 0 ? Math.abs(m.requiredWeight) : 1;
    
    // BOOST 1: Urgent Material (Highest Priority)
    if (isUrgent) score += 10_000_000;

    // BOOST 2: Grade Match (High Priority)
    // If Coil is DX53D and Material is DX53D, prioritize it over DX51D material.
    // This prevents "wasting" high-grade coils on low-grade products unless necessary.
    if (m.grade === targetCoil.grade) {
        score += 5000; 
    }

    const note1 = m.spec1Note ? m.spec1Note.toUpperCase() : '';
    const note2 = m.spec2Note ? m.spec2Note.toUpperCase() : '';
    const isStrict1 = note1.includes('*C') || note1.includes('*L');
    const isStrict2 = note2.includes('*C') || note2.includes('*L');
    const hasAnyStrict = isStrict1 || isStrict2;

    let allowSpec1 = true;
    let allowSpec2 = true;
    if (hasAnyStrict) {
        allowSpec1 = isStrict1;
        allowSpec2 = isStrict2;
    }

    if (allowSpec1 && m.spec1 > 0 && m.spec1 <= coilWidth) {
      options.push({ width: m.spec1, material: m, priorityScore: score, isUrgent });
    }
    if (allowSpec2 && m.spec2 > 0 && m.spec2 <= coilWidth) {
      options.push({ width: m.spec2, material: m, priorityScore: score, isUrgent });
    }
  });

  // Sort by priority then width
  options.sort((a, b) => b.priorityScore - a.priorityScore || b.width - a.width);

  // Dedupe
  const widthMap = new Map<number, WidthOption[]>();
  options.forEach(opt => {
    if (!widthMap.has(opt.width)) widthMap.set(opt.width, []);
    widthMap.get(opt.width)?.push(opt);
  });
  const uniqueWidths = Array.from(widthMap.keys()).sort((a, b) => b - a);

  // 3. Generate Patterns
  const results: PatternResult[] = [];
  const seenSigs = new Set<string>();

  // A. Greedy Strategy
  // Increased search space from 20 to 40 to ensure we find 3 plans even if top ones are similar
  const topOptions = options.slice(0, 40); 

  for (const opt of topOptions) {
     const maxPossible = Math.floor(coilWidth / opt.width);
     const count = Math.min(maxPossible, MAX_STRIPS);
     if (count <= 0) continue;

     const usedWidth = count * opt.width;
     const strips: AIStrip[] = [{
       materialId: opt.material.id,
       materialCode: opt.material.materialCode,
       width: opt.width,
       count: count,
       usageType: 'PRODUCT'
     }];

     let remainder = coilWidth - usedWidth;
     let currentCount = count;
     
     // Fill remainder with other high priority items
     for (const filler of options) {
       if (currentCount >= MAX_STRIPS) break;
       if (filler.width <= remainder) {
         const canFit = Math.floor(remainder / filler.width);
         const take = Math.min(canFit, MAX_STRIPS - currentCount);
         if (take > 0) {
           strips.push({
             materialId: filler.material.id,
             materialCode: filler.material.materialCode,
             width: filler.width,
             count: take,
             usageType: 'PRODUCT'
           });
           remainder -= (take * filler.width);
           currentCount += take;
         }
       }
     }

     if (remainder > 0) {
       strips.push({ materialId: null, materialCode: '余边', width: Number(remainder.toFixed(1)), count: 1, usageType: 'SCRAP' });
     }

     const consolidated = consolidateStrips(strips);
     const sig = getPatternSig(consolidated);
     
     if (!seenSigs.has(sig)) {
       seenSigs.add(sig);
       const hasUrgent = consolidated.some(s => s.materialId === urgentMatId);
       results.push({
         strips: consolidated,
         efficiency: Number(((coilWidth - remainder) / coilWidth * 100).toFixed(2)),
         totalUsedWidth: coilWidth - remainder,
         priorityScore: opt.priorityScore,
         dominantMaterialId: opt.material.id,
         hasUrgent
       });
     }
  }

  // B. DFS Strategy (Global Best)
  // If urgent is present, we try to force it in the DFS search space
  let globalBestPlan: number[] = [];
  let globalBestEff = 0;
  const startTime = performance.now();
  let timedOut = false;

  function dfs(currentWidth: number, currentStrips: number[], startIndex: number) {
    if (timedOut) return;
    if (performance.now() - startTime > TIMEOUT_MS) { timedOut = true; return; }
    
    const eff = currentWidth / coilWidth;
    if (eff > globalBestEff) {
      globalBestEff = eff;
      globalBestPlan = [...currentStrips];
    }
    if (currentStrips.length >= MAX_STRIPS || eff >= 0.999) return;

    for (let i = startIndex; i < uniqueWidths.length; i++) {
      const w = uniqueWidths[i];
      if (currentWidth + w <= coilWidth) {
        dfs(currentWidth + w, [...currentStrips, w], i);
      }
    }
  }
  
  if (uniqueWidths.length > 0) dfs(0, [], 0);

  if (globalBestPlan.length > 0) {
     const strips: AIStrip[] = [];
     let currentUsed = 0;
     globalBestPlan.forEach(w => {
        currentUsed += w;
        const matches = widthMap.get(w);
        if (matches && matches.length > 0) {
           // Prefer Urgent OR Grade Match
           const bestMatch = matches.sort((a,b) => b.priorityScore - a.priorityScore)[0];
           strips.push({
             materialId: bestMatch.material.id,
             materialCode: bestMatch.material.materialCode,
             width: w,
             count: 1,
             usageType: 'PRODUCT'
           });
        }
     });
     const waste = coilWidth - currentUsed;
     if (waste > 0) strips.push({ materialId: null, materialCode: '余边', width: Number(waste.toFixed(1)), count: 1, usageType: 'SCRAP' });
     
     const consolidated = consolidateStrips(strips);
     const sig = getPatternSig(consolidated);
     if (!seenSigs.has(sig)) {
        const hasUrgent = consolidated.some(s => s.materialId === urgentMatId);
        results.push({
          strips: consolidated,
          efficiency: Number((currentUsed / coilWidth * 100).toFixed(2)),
          totalUsedWidth: currentUsed,
          priorityScore: hasUrgent ? 1000000 : 0, 
          dominantMaterialId: undefined,
          hasUrgent
        });
     }
  }

  // SORT RESULTS:
  // 1. Must contain Urgent Material (if requested)
  // 2. High Efficiency
  // 3. High Priority Score (Tie breaker: Grade Match wins)
  return results.sort((a, b) => {
    if (urgentMatId) {
        if (a.hasUrgent && !b.hasUrgent) return -1;
        if (!a.hasUrgent && b.hasUrgent) return 1;
    }
    if (Math.abs(b.efficiency - a.efficiency) > 0.1) {
        return b.efficiency - a.efficiency;
    }
    return b.priorityScore - a.priorityScore;
  });
};


export const generateDeterministicPlan = (request: OptimizationRequest): AIPlanOption[] => {
  const { targetCoil, compatibleMaterials, urgentMaterial } = request;
  
  // 1. Initial filter
  const initialCandidates = compatibleMaterials.filter(m => !isCoilCompatible(targetCoil, m));

  // 2. Generate seed patterns (Segment 1 Options)
  // Use targetCoil (full object) to enable grade-matching logic
  const seedPatterns = solveSingleSegmentPatterns(targetCoil, initialCandidates, urgentMaterial?.id);
  
  // Filter out patterns that completely missed the urgent material (unless it's impossible)
  const validSeeds = urgentMaterial 
     ? seedPatterns.filter(p => p.hasUrgent) 
     : seedPatterns;

  const patternsToUse = validSeeds.length > 0 ? validSeeds : seedPatterns;
  if (patternsToUse.length === 0) return [];

  const topSeeds = patternsToUse.slice(0, 3);
  const finalPlans: AIPlanOption[] = [];

  // 3. Simulate full run for top seeds
  topSeeds.forEach((seed, index) => {
     let currentMaterials = initialCandidates.map(m => ({...m})); 
     let remainingCoilWeight = targetCoil.remainingWeight;
     const segments: PlanSegment[] = [];

     // --- Segment 1 ---
     const seg1Weight = calculateSegmentWeight(seed.strips, targetCoil.width, remainingCoilWeight, currentMaterials);
     segments.push({
       ordinal: 1,
       strips: seed.strips,
       processingWeight: seg1Weight,
       efficiency: seed.efficiency,
       totalUsedWidth: seed.totalUsedWidth
     });
     remainingCoilWeight -= seg1Weight;
     updateSimulatedInventory(seed.strips, seg1Weight, targetCoil.width, currentMaterials);

     // --- Segment 2 ---
     if (remainingCoilWeight > 50 && segments.length < MAX_SEGMENTS) {
        // Pass targetCoil to recursive calls
        const nextPatterns = solveSingleSegmentPatterns(targetCoil, currentMaterials, urgentMaterial?.id);
        if (nextPatterns.length > 0) {
           const bestNext = nextPatterns[0];
           const seg2Weight = calculateSegmentWeight(bestNext.strips, targetCoil.width, remainingCoilWeight, currentMaterials);
           
           segments.push({
             ordinal: 2,
             strips: bestNext.strips,
             processingWeight: seg2Weight,
             efficiency: bestNext.efficiency,
             totalUsedWidth: bestNext.totalUsedWidth
           });
           remainingCoilWeight -= seg2Weight;
           updateSimulatedInventory(bestNext.strips, seg2Weight, targetCoil.width, currentMaterials);
        }
     }

     // --- Segment 3 ---
     if (remainingCoilWeight > 50 && segments.length < MAX_SEGMENTS) {
        // Pass targetCoil to recursive calls
        const nextPatterns = solveSingleSegmentPatterns(targetCoil, currentMaterials, urgentMaterial?.id);
        if (nextPatterns.length > 0) {
           const bestNext = nextPatterns[0]; 
           const seg3Weight = calculateSegmentWeight(bestNext.strips, targetCoil.width, remainingCoilWeight, currentMaterials);
           
           segments.push({
             ordinal: 3,
             strips: bestNext.strips,
             processingWeight: seg3Weight,
             efficiency: bestNext.efficiency,
             totalUsedWidth: bestNext.totalUsedWidth
           });
           remainingCoilWeight -= seg3Weight;
        }
     }
     
     const totalProcessingWeight = segments.reduce((sum, s) => sum + s.processingWeight, 0);
     const weightedEff = segments.reduce((sum, s) => sum + (s.efficiency * s.processingWeight), 0) / (totalProcessingWeight || 1);
     
     let name = index === 0 ? "方案 A" : index === 1 ? "方案 B" : "方案 C";
     let desc = index === 0 ? "综合最优" : "备选方案";
     
     if (urgentMaterial && seed.hasUrgent) desc += " · 包含急单";
     
     // Add badge for grade matching
     const dominantId = seed.dominantMaterialId;
     const dominantMat = compatibleMaterials.find(m => m.id === dominantId);
     if (dominantMat && dominantMat.grade === targetCoil.grade) {
         desc += ` · 同级匹配 (${dominantMat.grade})`;
     }

     finalPlans.push({
       id: Math.random(),
       name,
       description: desc,
       segments,
       efficiency: Number(weightedEff.toFixed(2)),
       processingWeight: totalProcessingWeight,
       remainingCoilWeight: remainingCoilWeight < 0 ? 0 : remainingCoilWeight
     });
  });

  // Return ALL generated plans (max 3), even if they are slightly below perfect, 
  // as long as they meet the relaxed threshold (96.0). 
  // This ensures the user gets options.
  return finalPlans
    .filter(p => p.efficiency >= EFFICIENCY_THRESHOLD)
    .sort((a, b) => b.efficiency - a.efficiency);
};


// --- Helpers ---

function consolidateStrips(strips: AIStrip[]): AIStrip[] {
  const map = new Map<string, AIStrip>();
  strips.forEach(s => {
    const key = `${s.materialId}-${s.width}-${s.usageType}`;
    if (map.has(key)) {
      map.get(key)!.count += s.count;
    } else {
      map.set(key, { ...s });
    }
  });
  return Array.from(map.values());
}

function getPatternSig(strips: AIStrip[]): string {
    return strips
      .filter(s => s.usageType === 'PRODUCT')
      .map(s => `${s.materialId}-${s.width}-${s.count}`)
      .sort()
      .join('|');
}

/**
 * Calculates bottleneck weight to prevent overstocking
 */
function calculateSegmentWeight(strips: AIStrip[], coilWidth: number, maxAvailWeight: number, materials: Material[]): number {
    let globalMaxInput = maxAvailWeight;

    strips.forEach(strip => {
      if (strip.usageType === 'PRODUCT' && strip.materialId) {
        const mat = materials.find(m => m.id === strip.materialId);
        if (mat) {
           const ratio = (strip.width * strip.count) / coilWidth;
           if (ratio <= 0) return;

           let allowedOutputWeight = 0;
           
           // Logic Check: Shortage is Negative
           if (mat.requiredWeight < -0.1) {
             // We need to produce enough to cover the NEGATIVE shortage.
             const positiveShortage = Math.abs(mat.requiredWeight);
             const buffer = 200; 
             allowedOutputWeight = Math.max(positiveShortage * OVERSTOCK_LIMIT, positiveShortage + buffer);
           } else if (mat.allowOverProduction) {
             allowedOutputWeight = ALLOWED_STOCK_LIMIT;
           } else {
             allowedOutputWeight = 0;
           }
           
           const impliedInput = allowedOutputWeight / ratio;
           
           if (impliedInput < globalMaxInput) {
             globalMaxInput = impliedInput;
           }
        }
      }
    });

    let w = Math.floor(globalMaxInput / 10) * 10;
    if (w < 0) w = 0;
    
    // If calculated weight is very small but we still have plenty coil, stick to the calculated limit (don't force full coil)
    // Only force full coil if the *remainder* is small.
    if (maxAvailWeight - w < 50) return maxAvailWeight; 
    
    return w;
}

function updateSimulatedInventory(strips: AIStrip[], segmentTotalWeight: number, coilWidth: number, materials: Material[]) {
    strips.forEach(strip => {
        if (strip.usageType === 'PRODUCT' && strip.materialId) {
            const mat = materials.find(m => m.id === strip.materialId);
            if (mat) {
                const ratio = (strip.width * strip.count) / coilWidth;
                const weightConsumed = segmentTotalWeight * ratio;
                // LOGIC CHANGE: ADD consumption to negative shortage
                mat.requiredWeight += weightConsumed;
            }
        }
    });
}
