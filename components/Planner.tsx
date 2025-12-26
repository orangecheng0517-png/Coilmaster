
import React, { useState, useMemo } from 'react';
import { Coil, Material, AIPlanOption, CalculatedStrip, PlanSegment } from '../types';
import { isCoilCompatible, calculateAdjustedQuota } from '../utils';
import { generateDeterministicPlan } from '../services/algorithmService';
import { Calculator, Search, Package, AlertOctagon, CheckCircle2, Download, Printer, Scissors, Save, Layers, Clock, Scale, Sparkles, Box } from 'lucide-react';

interface Props {
  coils: Coil[];
  materials: Material[];
  onExecutePlan: (plan: AIPlanOption, coilId: string) => void;
}

type PlannerMode = 'STOCK' | 'URGENT';

const Planner: React.FC<Props> = ({ coils, materials, onExecutePlan }) => {
  const [mode, setMode] = useState<PlannerMode>('STOCK');
  
  // Stock Mode State
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedCoilId, setSelectedCoilId] = useState<string>('');

  // Urgent Mode State
  const [urgentMaterialId, setUrgentMaterialId] = useState<string>('');
  const [urgentMatchedCoil, setUrgentMatchedCoil] = useState<Coil | null>(null);
  const [urgentCoilReason, setUrgentCoilReason] = useState<string>(''); // Explain why this coil was chosen

  // Results State
  const [generatedPlans, setGeneratedPlans] = useState<AIPlanOption[]>([]);
  const [analysis, setAnalysis] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  // --- Helpers ---
  const coilSpecs = useMemo(() => {
    const specs = new Set<string>();
    // Filter Rule: Only show coils with > 10kg remaining (hide empty/used coils)
    const validCoils = coils.filter(c => c.remainingWeight > 10);
    
    validCoils.forEach(c => specs.add(`${c.grade}|${c.coating}|${c.surface}|${c.thickness}`));
    return Array.from(specs).map(s => {
      const [g, c, surf, t] = s.split('|');
      return { grade: g, coating: c, surface: surf, thickness: t, label: `${g}+Z${c}-${surf} (${t}mm)` };
    });
  }, [coils]);

  const filteredCoils = useMemo(() => {
    if (!selectedGrade) return [];
    const [g, c, surf, t] = selectedGrade.split('|');
    // Filter Rule: Match specs AND ensure > 10kg remaining (Double check logic)
    return coils.filter(coil => 
      coil.grade === g && 
      String(coil.coating) === c && 
      coil.surface === surf && 
      String(coil.thickness) === t &&
      coil.remainingWeight > 10
    );
  }, [selectedGrade, coils]);

  const findBestCoilForMaterial = (mat: Material) => {
    // 1. Filter Compatible
    const validCoils = coils.filter(c => c.remainingWeight > 10 && isCoilCompatible(c, mat) === null);
    
    if (validCoils.length === 0) return { coil: null, reason: "无兼容钢卷" };

    // 2. Score Coils
    // Score based on how well the coil width fits the material width (Remainder)
    // Also consider if there are OTHER shortage materials that can fill the gap? (Too complex for here, rely on algorithm)
    // Heuristic: Smallest modulo remainder is usually best for a single dominant order.
    const scoredCoils = validCoils.map(c => {
        let score = 0;
        let reason = "";

        const width1 = mat.spec1;
        const width2 = mat.spec2;
        
        // Calculate best fit for this coil
        let bestRemainder = c.width;
        let fitType = "none";

        // Try Width 1
        if (width1 > 0) {
            const rem1 = c.width % width1;
            if (rem1 < bestRemainder) { bestRemainder = rem1; fitType = "spec1"; }
        }
        // Try Width 2
        if (width2 > 0) {
            const rem2 = c.width % width2;
            if (rem2 < bestRemainder) { bestRemainder = rem2; fitType = "spec2"; }
        }

        // Scoring Logic
        // Perfect fit (remainder < 10mm) gets huge score
        if (bestRemainder < 10) {
            score += 100;
            reason = "完美宽度匹配";
        } else if (bestRemainder < 50) {
            score += 50;
            reason = "高利用率匹配";
        } else {
            // Larger remainder: check if it matches other shortages?
            // Simple fallback: prefer coils that are 'Used' (clearing stock)
            if (c.totalWeight - c.remainingWeight > 100) {
                score += 10;
                reason = "优先消耗尾卷";
            } else {
                score += 5;
                reason = "兼容库存";
            }
        }
        
        // Tie-breaker: Prefer exact grade match over substitution
        if (c.grade === mat.grade) score += 2;

        return { coil: c, score, reason, remainder: bestRemainder };
    });

    // Sort Descending
    scoredCoils.sort((a, b) => b.score - a.score || a.remainder - b.remainder);

    return { 
        coil: scoredCoils[0].coil, 
        reason: `${scoredCoils[0].reason} (余宽${scoredCoils[0].remainder.toFixed(0)}mm)` 
    };
  };

  const handleUrgentMaterialChange = (matId: string) => {
    setUrgentMaterialId(matId);
    setUrgentMatchedCoil(null);
    setUrgentCoilReason('');
    setGeneratedPlans([]); 
    
    if (!matId) return;

    const mat = materials.find(m => m.id === matId);
    if (!mat) return;

    const result = findBestCoilForMaterial(mat);
    if (result.coil) {
        setUrgentMatchedCoil(result.coil);
        setUrgentCoilReason(result.reason);
    }
  };

  // --- Core Calculation Logic ---
  const calculatePlanDetails = (plan: AIPlanOption, coil: Coil): CalculatedStrip[] => {
    const flatDetails: CalculatedStrip[] = [];
    
    // First pass: Calculate total production per material in this plan (Aggregated across segments)
    const planTotalProduction = new Map<string, number>();

    plan.segments.forEach(seg => {
        seg.strips.forEach(strip => {
            if (strip.usageType === 'PRODUCT' && strip.materialId) {
                const mat = materials.find(m => m.id === strip.materialId);
                if (mat) {
                     const ratio = strip.width / coil.width;
                     const totalWeight = seg.processingWeight * ratio * strip.count;
                     // Recalculate Quota based on Thickness Difference
                     const adjQuota = calculateAdjustedQuota(mat.quota, mat.thickness, coil.thickness);
                     const pieces = adjQuota > 0 ? Math.floor(totalWeight / adjQuota) : 0;
                     const stdWeight = pieces * mat.quota;
                     
                     const current = planTotalProduction.get(mat.id) || 0;
                     planTotalProduction.set(mat.id, current + stdWeight);
                }
            }
        });
    });

    // Second pass: Generate rows
    plan.segments.forEach(seg => {
        const activeWeight = seg.processingWeight;
        
        seg.strips.forEach(strip => {
            const weightPerStrip = activeWeight * (strip.width / coil.width);
            const totalStripWeight = weightPerStrip * strip.count;

            let mat = materials.find(m => m.id === strip.materialId);
            let displayCode = strip.materialCode;
            let widthLabel = `${strip.width}`;

            if (!mat && strip.usageType === 'PRODUCT') {
                displayCode = '未知物料';
            } else if (mat) {
                displayCode = mat.materialCode;
                if (strip.width === mat.spec1 && mat.spec1Note) {
                    widthLabel += mat.spec1Note;
                } else if (strip.width === mat.spec2 && mat.spec2Note) {
                    widthLabel += mat.spec2Note;
                }
            }

            let expectedPieces = 0;
            let remainingShortage = 0;
            let originalShortage = 0;
            let adjustedQuota = 0;

            if (mat) {
                adjustedQuota = calculateAdjustedQuota(mat.quota, mat.thickness, coil.thickness);
                expectedPieces = adjustedQuota > 0 ? Math.floor(totalStripWeight / adjustedQuota) : 0;
                
                originalShortage = mat.requiredWeight;
                
                // Use the PLAN TOTAL production to show the final status
                const totalProducedStdWeight = planTotalProduction.get(mat.id) || 0;
                // LOGIC CHANGE: Balance (Negative) + Production (Positive)
                remainingShortage = mat.requiredWeight + totalProducedStdWeight;
            }

            flatDetails.push({
                ...strip,
                weightPerStrip,
                totalWeight: totalStripWeight,
                expectedPieces,
                originalShortage,
                remainingShortage, // This now represents "Status after Plan Execution"
                client: mat?.client || '-',
                model: mat?.model || '-',
                sheetMetalCode: mat?.sheetMetalCode || '-',
                name: mat?.name || '-',
                batchId: mat?.batchId || '-',
                materialCode: displayCode,
                widthLabel,
                segmentOrdinal: seg.ordinal
            });
        });
    });

    return flatDetails;
  };

  const handleGeneratePlan = () => {
    setGeneratedPlans([]);
    setSelectedPlanId(null);
    setAnalysis('');

    let targetCoil: Coil | undefined;
    let urgentMat: Material | undefined;

    if (mode === 'STOCK') {
      targetCoil = coils.find(c => c.id === selectedCoilId);
      if (!targetCoil) return;
    } else {
      urgentMat = materials.find(m => m.id === urgentMaterialId);
      if (!urgentMat || !urgentMatchedCoil) {
        alert("请选择急单物料，并确保有匹配的库存钢卷。");
        return;
      }
      targetCoil = urgentMatchedCoil;
    }

    // CRITICAL FIX: Explicitly filter compatible materials BEFORE passing to algorithm.
    // This ensures we strictly obey the 0.05mm thickness rule.
    const validMaterials = materials.filter(m => {
        const isCompat = isCoilCompatible(targetCoil!, m) === null;
        const needsProd = m.requiredWeight < -0.1 || m.allowOverProduction;
        return isCompat && needsProd;
    });
    const compatibleCount = validMaterials.length;

    const plans = generateDeterministicPlan({
      mode: mode === 'STOCK' ? 'stock' : 'urgent',
      targetCoil: targetCoil,
      urgentMaterial: urgentMat,
      compatibleMaterials: validMaterials // Pass ONLY filtered list
    });

    if (plans.length === 0) {
       let advice = "";
       if (compatibleCount === 0) {
         advice = "没有找到任何兼容的欠料。请检查：\n1. 欠料清单中是否有欠重 < 0 的物料？\n2. 牌号/锌层是否匹配？\n3. 厚度差异是否 > 0.05mm？";
       } else {
         advice = `找到 ${compatibleCount} 个兼容物料，但未能生成满足 >97.5% 利用率的方案。\n请尝试更换宽度更合适的钢卷。`;
       }
       setAnalysis(`计算完毕，未生成有效方案。\n(系统已自动过滤低于 97.5% 利用率的方案)\n\n${advice}`);
    } else {
       setAnalysis(`计算成功！为您生成了 ${plans.length} 种高利用率方案 (>97.5%)。\n系统已自动尝试多段计算，尽可能消耗整卷。`);
       setGeneratedPlans(plans);
       setSelectedPlanId(plans[0].id);
    }
  };

  const handleExecute = (plan: AIPlanOption, coil: Coil) => {
    onExecutePlan(plan, coil.id);
    setGeneratedPlans([]);
    setSelectedPlanId(null);
    setAnalysis('方案已执行，欠料与库存已更新。');
  };

  // Re-used visualizer component for segments
  const StripVisualizer = ({ strips, width, efficiency }: { strips: any[], width: number, efficiency: number }) => (
    <div className="w-full h-12 bg-slate-100 rounded-lg flex overflow-hidden border border-slate-300 relative">
        {strips.map((s, i) => (
        <div 
            key={i} 
            className={`h-full flex items-center justify-center text-xs font-bold text-white border-r border-white/20 relative group ${s.usageType === 'SCRAP' ? 'bg-red-400' : 'bg-blue-500'}`}
            style={{width: `${(s.width * s.count / width) * 100}%`}}
        >
            <span className="truncate px-1">
            {s.width}*{s.count}
            </span>
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 text-white text-xs p-2 rounded whitespace-nowrap z-10">
                {s.materialCode} ({s.width}mm)
            </div>
        </div>
        ))}
        {efficiency < 100 && (
        <div className="flex-1 bg-slate-200 h-full flex items-center justify-center text-[10px] text-slate-400">
            余边
        </div>
        )}
    </div>
  );

  const activeCoil = mode === 'STOCK' ? coils.find(c => c.id === selectedCoilId) : urgentMatchedCoil;

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Top Navigation */}
      <div className="flex justify-center print:hidden">
        <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm inline-flex">
          <button
            onClick={() => { setMode('STOCK'); setGeneratedPlans([]); setUrgentMatchedCoil(null); }}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'STOCK' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            按库存选卷排产
          </button>
          <button
            onClick={() => { setMode('URGENT'); setGeneratedPlans([]); setSelectedCoilId(''); }}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'URGENT' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            按急单智能匹配
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
        {/* LEFT PANEL */}
        <div className="lg:col-span-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6 print:hidden">
          {mode === 'STOCK' ? (
            <div className="space-y-4">
               <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <Package className="w-5 h-5 mr-2 text-blue-600" /> 选卷排产
                </h3>
                <select 
                  className="w-full p-3 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={selectedGrade}
                  onChange={e => { setSelectedGrade(e.target.value); setSelectedCoilId(''); }}
                >
                  <option value="">-- 第一步: 选择材质规格 --</option>
                  {coilSpecs.map((spec, idx) => (
                    <option key={idx} value={`${spec.grade}|${spec.coating}|${spec.surface}|${spec.thickness}`}>
                      {spec.label}
                    </option>
                  ))}
                </select>
                {selectedGrade && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-sm font-semibold text-slate-500 flex justify-between">
                        <span>第二步: 选择钢卷</span>
                        <span className="text-xs text-slate-400">已隐藏耗尽卷</span>
                    </p>
                    {filteredCoils.length === 0 && <p className="text-xs text-slate-400 p-2 border border-dashed rounded bg-slate-50 text-center">当前规格无可用库存</p>}
                    {filteredCoils.map(coil => (
                      <div 
                        key={coil.id}
                        onClick={() => setSelectedCoilId(coil.id)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedCoilId === coil.id ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'hover:border-blue-300'
                        }`}
                      >
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>{coil.motherCoilId}</span>
                          <span className={coil.remainingWeight < coil.totalWeight ? "text-amber-600" : "text-green-600"}>
                              {coil.remainingWeight}kg
                          </span>
                        </div>
                        {/* FULL COIL DETAILS DISPLAY */}
                        <div className="text-xs text-slate-600 mt-2 grid grid-cols-2 gap-1 bg-slate-50 p-2 rounded border border-slate-100">
                           <span className="col-span-2 flex justify-between">
                               <span>牌号: <b>{coil.grade}</b></span>
                               <span>锌层: Z{coil.coating}</span>
                           </span>
                           <span className="col-span-2 flex justify-between">
                               <span>表面: {coil.surface}</span>
                               <span>厚度: {coil.thickness}mm</span>
                           </span>
                           <span className="col-span-2 border-t border-slate-200 mt-1 pt-1 flex justify-between text-slate-500">
                               <span className="flex items-center gap-1"><Scale size={10} /> {coil.width}mm</span>
                               <span>初始: {coil.totalWeight}kg</span>
                           </span>
                        </div>
                        {coil.lastUsedDate && (
                            <div className="text-xs text-blue-600 font-medium flex items-center justify-end gap-1 mt-1 bg-blue-50 px-2 py-1 rounded">
                                <Clock size={10} /> 最近使用: {coil.lastUsedDate}
                            </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          ) : (
            <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <AlertOctagon className="w-5 h-5 mr-2 text-amber-600" /> 急单匹配
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                  <select
                    className="w-full pl-10 p-3 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none appearance-none"
                    value={urgentMaterialId}
                    onChange={e => handleUrgentMaterialChange(e.target.value)}
                  >
                    <option value="">-- 第一步: 选择急需物料 --</option>
                    {materials.filter(m => m.requiredWeight < -0.1).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.materialCode} ({m.model}) - 当前欠: {m.requiredWeight}kg
                      </option>
                    ))}
                  </select>
                </div>
                {urgentMatchedCoil && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 animate-fade-in relative">
                    <div className="text-xs text-amber-600 font-bold uppercase mb-1 flex items-center gap-1">
                        <Sparkles size={12} />
                        系统自动推荐库存:
                    </div>
                    <div className="font-medium text-slate-800">{urgentMatchedCoil.motherCoilId}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {urgentMatchedCoil.grade} | Z{urgentMatchedCoil.coating}-{urgentMatchedCoil.surface} | {urgentMatchedCoil.thickness}mm
                    </div>
                    <div className="text-xs text-slate-500">
                      宽{urgentMatchedCoil.width}mm | 剩{urgentMatchedCoil.remainingWeight}kg
                    </div>
                    {urgentCoilReason && (
                         <div className="mt-2 text-xs bg-white/80 p-1.5 rounded border border-amber-100 text-amber-700 font-medium">
                            💡 推荐理由: {urgentCoilReason}
                         </div>
                    )}
                  </div>
                )}
                {urgentMaterialId && !urgentMatchedCoil && (
                     <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-red-600 text-xs text-center">
                         未找到任何兼容库存，请检查材质/厚度。
                     </div>
                )}
            </div>
          )}

          <button
            disabled={(!selectedCoilId && mode === 'STOCK') || (!urgentMatchedCoil && mode === 'URGENT')}
            onClick={handleGeneratePlan}
            className={`w-full py-3 rounded-lg font-medium shadow-lg text-white flex justify-center items-center gap-2 transition-all ${
               mode === 'STOCK' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-900/20' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-900/20'
            } disabled:opacity-50`}
          >
            <Calculator size={18} />
            开始智能计算 (算法)
          </button>
          
          {analysis && (
            <div className={`bg-slate-50 p-4 rounded-lg text-sm border italic whitespace-pre-line ${generatedPlans.length > 0 ? 'text-green-700 border-green-200 bg-green-50' : 'text-slate-600 border-slate-100'}`}>
               {analysis}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Plans Display */}
        <div className="lg:col-span-8 space-y-6">
          {!activeCoil || generatedPlans.length === 0 ? (
            <div className="h-full bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 p-12">
               <Calculator size={48} className="mb-4 text-slate-300" />
               <p className="text-lg">请在左侧选择资源并开始计算</p>
               <p className="text-sm mt-2">系统将支持多段排产，力求无余卷</p>
            </div>
          ) : (
            <>
              {/* Plan Selection Tabs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
                {generatedPlans.map(plan => (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all relative overflow-hidden ${
                      selectedPlanId === plan.id 
                        ? 'bg-white border-blue-500 ring-2 ring-blue-500 shadow-md' 
                        : 'bg-white border-slate-200 hover:border-blue-300'
                    }`}
                  >
                     <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-800">{plan.name}</span>
                        <div className="flex gap-1">
                          {plan.segments.length > 1 && (
                            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-bold flex items-center">
                               <Layers size={10} className="mr-1" /> {plan.segments.length}段
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${plan.efficiency >= 97.5 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {plan.efficiency}%
                          </span>
                        </div>
                     </div>
                     <p className="text-xs text-slate-500 mt-2 line-clamp-2">{plan.description}</p>
                     
                     {/* Mini Preview of Segment 1 */}
                     <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-slate-100 w-full opacity-70">
                       {plan.segments[0].strips.map((s, i) => (
                         <div key={i} className={`${s.usageType === 'SCRAP' ? 'bg-red-400' : 'bg-blue-400'}`} style={{width: `${(s.width * s.count / activeCoil.width) * 100}%`}}></div>
                       ))}
                     </div>
                  </div>
                ))}
              </div>

              {/* Detailed Plan View */}
              {selectedPlanId && (() => {
                const plan = generatedPlans.find(p => p.id === selectedPlanId)!;
                const details = calculatePlanDetails(plan, activeCoil);
                
                return (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in print:shadow-none print:border-none">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between md:items-start bg-slate-50/50 gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <CheckCircle2 className="text-green-500" />
                            {plan.name}
                          </h2>
                        </div>
                        <div className="flex flex-wrap gap-4 mt-3 text-sm">
                          <div className="bg-white px-3 py-1.5 rounded border border-slate-200">
                             <span className="text-slate-500 mr-2">母卷:</span>
                             <b className="text-slate-800">{activeCoil.motherCoilId}</b>
                          </div>
                          <div className="bg-white px-3 py-1.5 rounded border border-slate-200">
                             <span className="text-slate-500 mr-2">总投产:</span>
                             <b className="text-slate-800">{plan.processingWeight} kg</b>
                             <span className="text-xs text-slate-400 ml-1">/ {activeCoil.remainingWeight} kg</span>
                          </div>
                          {plan.remainingCoilWeight > 0 ? (
                            <div className="bg-amber-50 px-3 py-1.5 rounded border border-amber-200 text-amber-700">
                               <span className="mr-2">预计余卷:</span>
                               <b>{plan.remainingCoilWeight.toFixed(1)} kg</b>
                            </div>
                          ) : (
                             <div className="bg-green-50 px-3 py-1.5 rounded border border-green-200 text-green-700">
                               <span className="mr-2">完美利用 (无余卷)</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 print:hidden">
                        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-slate-50 text-slate-600 text-sm">
                          <Printer size={16} /> <span className="hidden sm:inline">打印</span>
                        </button>
                        <button onClick={() => handleExecute(plan, activeCoil)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm shadow-md">
                          <Save size={16} /> 确认投产
                        </button>
                      </div>
                    </div>

                    {/* Segments Display */}
                    <div className="p-6 space-y-8">
                       {plan.segments.map((seg) => (
                           <div key={seg.ordinal}>
                               <div className="flex justify-between items-end mb-2">
                                   <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                       <span className="bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">{seg.ordinal}</span>
                                       第 {seg.ordinal} 段
                                       <span className="text-slate-400 font-normal ml-2">({seg.processingWeight}kg)</span>
                                   </h4>
                                   <span className="text-xs text-slate-500">利用率: {seg.efficiency}%</span>
                               </div>
                               <StripVisualizer strips={seg.strips} width={activeCoil.width} efficiency={seg.efficiency} />
                               
                               {/* Mini Table for this segment */}
                               <div className="mt-2 overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                                        <tr>
                                            <th className="p-2 whitespace-nowrap">类型</th>
                                            <th className="p-2 whitespace-nowrap">客户/批次</th>
                                            <th className="p-2 whitespace-nowrap">物料编码</th>
                                            <th className="p-2 whitespace-nowrap">钣金编码</th>
                                            <th className="p-2 whitespace-nowrap">名称</th>
                                            <th className="p-2 text-right whitespace-nowrap">宽度</th>
                                            <th className="p-2 text-right whitespace-nowrap">条数</th>
                                            <th className="p-2 text-right whitespace-nowrap">实产(件)</th>
                                            <th className="p-2 text-right whitespace-nowrap">生产后状态</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {details.filter(d => d.segmentOrdinal === seg.ordinal).map((row, idx) => (
                                            <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/80">
                                                <td className="p-2 text-blue-600 font-medium">
                                                    {row.usageType === 'PRODUCT' ? '成品' : '废料'}
                                                </td>
                                                <td className="p-2 text-slate-600">
                                                    <div>{row.client}</div>
                                                    {row.batchId !== '-' && <div className="text-[10px] text-slate-400">{row.batchId}</div>}
                                                </td>
                                                <td className="p-2 font-mono text-slate-700">{row.materialCode}</td>
                                                <td className="p-2 font-mono text-slate-500">{row.sheetMetalCode}</td>
                                                <td className="p-2 text-slate-700 max-w-[100px] truncate" title={row.name}>{row.name}</td>
                                                <td className="p-2 text-right font-medium">{row.widthLabel}</td>
                                                <td className="p-2 text-right">{row.count}</td>
                                                <td className="p-2 text-right font-bold text-indigo-600 flex justify-end items-center gap-1">
                                                    {row.expectedPieces > 0 ? <><Box size={10} /> {row.expectedPieces}</> : '-'}
                                                </td>
                                                <td className="p-2 text-right">
                                                   {row.usageType === 'PRODUCT' ? (
                                                       row.remainingShortage < -0.1 ? (
                                                           <span className="text-red-500 font-bold">仍欠 {row.remainingShortage.toFixed(0)}</span>
                                                       ) : (
                                                           <span className="text-green-600 font-bold">库存 +{row.remainingShortage.toFixed(0)}</span>
                                                       )
                                                   ) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                               </div>
                           </div>
                       ))}
                    </div>

                    {/* Footer Summary */}
                    <div className="bg-slate-50 p-4 border-t border-slate-200 text-right text-sm">
                        <span className="text-slate-500 mr-4">总平均利用率: <b className="text-slate-800">{plan.efficiency}%</b></span>
                        <span className="text-slate-500">总重量: <b className="text-slate-800">{plan.processingWeight} kg</b></span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Planner;
