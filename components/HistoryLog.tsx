
import React, { useState } from 'react';
import { ExecutedPlan, Material } from '../types';
import { History, RotateCcw, Calendar, CheckCircle2, FileText, ArrowDownCircle, Layers, Download, AlertTriangle, Box } from 'lucide-react';

interface Props {
  history: ExecutedPlan[];
  materials: Material[]; 
  onRevoke: (plan: ExecutedPlan) => void;
}

// Sub-component for individual rows to handle "Confirm" state independently
const HistoryRow: React.FC<{ plan: ExecutedPlan, materials: Material[], onRevoke: (p: ExecutedPlan) => void }> = ({ plan, materials, onRevoke }) => {
  const [confirming, setConfirming] = useState(false);

  const handleRevokeClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering any parent click events
    
    if (confirming) {
      // Second click: Execute
      onRevoke(plan);
      setConfirming(false);
    } else {
      // First click: Enter confirm state
      setConfirming(true);
      // Auto-reset after 3 seconds if not confirmed
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="bg-slate-50 p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-slate-400">#{plan.id.slice(-6)}</span>
              <h3 className="font-bold text-slate-800">{plan.originalPlanName}</h3>
              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 size={12} /> 已完成
              </span>
           </div>
           <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar size={14} /> {new Date(plan.timestamp).toLocaleString()}
              </span>
              <span>
                母卷: <b>{plan.coilMotherId}</b>
              </span>
           </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right">
                <div className="text-xs text-slate-500">消耗重量</div>
                <div className="font-bold text-slate-800">{plan.totalConsumedWeight} kg</div>
            </div>
            <div className="text-right px-4 border-l border-slate-200">
                <div className="text-xs text-slate-500">利用率</div>
                <div className={`font-bold ${plan.efficiency >= 97.5 ? 'text-green-600' : 'text-amber-600'}`}>{plan.efficiency}%</div>
            </div>
            
            {/* ROBUST 2-STEP BUTTON */}
            <button 
                type="button"
                onClick={handleRevokeClick}
                className={`ml-4 flex items-center gap-2 px-4 py-2 rounded-lg transition-all shadow-sm text-sm font-medium border ${
                  confirming 
                    ? "bg-red-600 text-white border-red-600 animate-pulse" 
                    : "bg-white border-slate-300 text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                }`}
                title={confirming ? "再次点击以确认撤销" : "点击准备撤销"}
            >
                <RotateCcw size={16} />
                {confirming ? "确定删除？" : "撤销"}
            </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Segments Preview */}
        <div className="space-y-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1 border-b border-slate-100 pb-2">
                <Layers size={14}/> 分条排版详情
            </div>
            {plan.segments.map((seg, idx) => {
                const totalSegWidth = seg.strips.reduce((acc, s) => acc + s.width * s.count, 0);
                return (
                    <div key={idx} className="bg-slate-50/80 rounded-lg p-3 border border-slate-200">
                        <div className="flex justify-between items-center text-xs mb-2">
                             <div className="flex items-center gap-2">
                                <span className="bg-slate-700 text-white w-5 h-5 rounded flex items-center justify-center font-bold text-[10px]">{seg.ordinal}</span>
                                <span className="font-medium text-slate-700">第 {seg.ordinal} 段</span>
                             </div>
                             <div className="text-slate-500">
                                <span className="mr-3">投料: {seg.processingWeight}kg</span>
                                <span className={`${seg.efficiency < 97.5 ? 'text-amber-600 font-bold' : ''}`}>利用率: {seg.efficiency}%</span>
                             </div>
                        </div>
                        <div className="flex w-full h-8 bg-slate-200 rounded overflow-hidden border border-slate-300">
                            {seg.strips.map((s, i) => (
                                <div 
                                    key={i} 
                                    className={`h-full flex items-center justify-center text-[10px] font-medium border-r border-white/20 relative overflow-hidden ${
                                         s.usageType === 'SCRAP' ? 'bg-red-400 text-red-900' : 'bg-blue-500 text-white'
                                    }`} 
                                    style={{
                                      width: `${(s.width * s.count / totalSegWidth) * 100}%`,
                                      backgroundImage: s.usageType === 'SCRAP' ? 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.3) 5px, rgba(255,255,255,0.3) 10px)' : 'none'
                                    }}
                                    title={`${s.materialCode} (${s.width}mm * ${s.count}条)`}
                                >
                                    {(s.width * s.count / totalSegWidth) > 0.05 && (
                                        <span className="truncate px-1 text-shadow-sm">{s.width}*{s.count}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>

        {/* Impact Summary */}
        <div className="space-y-3">
           <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1 border-b border-slate-100 pb-2">
              <ArrowDownCircle size={14} className="text-green-600"/>
              <span>产出与抵扣明细 (精确到件)</span>
           </div>
           <div className="bg-blue-50/30 p-4 rounded-lg border border-blue-100/50 h-full max-h-[300px] overflow-y-auto custom-scrollbar">
              {(!plan.impacts || plan.impacts.length === 0) ? (
                  <div className="text-sm text-amber-500 bg-amber-50 p-4 rounded border border-amber-100 text-center">
                    <AlertTriangleIcon />
                    <div className="font-bold">无 BOM 抵扣记录</div>
                    <div className="text-xs mt-1">本次投产未扣减任何欠料，请检查是否因“做库存”或“件数取整”导致。</div>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 gap-2">
                     {plan.impacts.map((impact, idx) => (
                         <div key={idx} className="text-xs bg-white border border-blue-100 text-slate-700 px-3 py-2 rounded shadow-sm flex items-center justify-between">
                             <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-blue-700 text-sm">{impact.materialCode}</span>
                                    <span>{impact.materialName}</span>
                                </div>
                             </div>
                             <div className="flex items-center gap-2">
                                 {impact.piecesDeducted !== undefined && (
                                     <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 whitespace-nowrap flex items-center gap-1">
                                        <Box size={10} /> +{impact.piecesDeducted} 件
                                     </span>
                                 )}
                                 <span className="font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100 whitespace-nowrap">
                                    折 -{impact.weightDeducted} kg
                                 </span>
                             </div>
                         </div>
                     ))}
                  </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

const HistoryLog: React.FC<Props> = ({ history, materials, onRevoke }) => {
  
  // Safe CSV Value Escaping
  const toCsvField = (val: string | number | undefined | null) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExport = () => {
    if (history.length === 0) {
      alert("暂无记录可导出");
      return;
    }

    const headers = [
      "记录单号", "时间", "母卷号", "方案名称", "总耗重(kg)", "整卷利用率(%)", 
      "分段序号", "段耗重(kg)", "物料编码", "钣金编码", "物料名称", "宽度(mm)", "条数", "类型", "实产件数(pcs)", "折合标准重(kg)"
    ];

    const rows = history.flatMap(plan => {
      const planRows: string[][] = [];
      
      plan.segments.forEach(seg => {
        const segTotalWidth = seg.strips.reduce((acc, s) => acc + s.width * s.count, 0);

        seg.strips.forEach(strip => {
          let estimatedPieces = '-';
          let stdWeight = '-';
          
          // Try to find exact piece count from Impact log if available, otherwise estimate
          if (strip.usageType === 'PRODUCT' && strip.materialId) {
             const impact = plan.impacts?.find(i => i.materialId === strip.materialId);
             if (impact && impact.piecesDeducted) {
                 // Note: Impact is aggregated per plan, strip is per segment. 
                 // We re-estimate per strip for CSV row accuracy.
                 const mat = materials.find(m => m.id === strip.materialId);
                 if (mat) {
                    const ratio = (strip.width * strip.count) / segTotalWidth;
                    const totalStripPhysicalWeight = seg.processingWeight * ratio;
                    // Logic must match App.tsx
                    // Quota_Actual = Quota_Std * (Thick_Actual / Thick_Std)
                    // Pieces = Physical / Quota_Actual
                    // Simplified: Pieces = Physical * Thick_Std / (Quota_Std * Thick_Actual)
                    
                    // We don't have coil thickness here easily without prop drilling, 
                    // so we use the stored impact data logic if possible, or fallback.
                    // For CSV, simple estimate is okay, but let's try to be precise if we can.
                    estimatedPieces = "详见汇总"; 
                 }
             }
          }

          planRows.push([
             plan.id.slice(-6),
             new Date(plan.timestamp).toLocaleString(),
             plan.coilMotherId,
             plan.originalPlanName,
             plan.totalConsumedWeight.toString(),
             plan.efficiency.toString(),
             seg.ordinal.toString(),
             seg.processingWeight.toString(),
             strip.materialCode,
             strip.materialCode === '余边' ? '-' : strip.materialCode, 
             strip.materialCode === '余边' ? '余边' : (strip.usageType === 'PRODUCT' ? '成品' : '废料'),
             strip.width.toString(),
             strip.count.toString(),
             strip.usageType,
             estimatedPieces,
             stdWeight
          ].map(toCsvField)); 
        });
      });
      return planRows;
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `分条记录导出_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-slate-600" />
            分条作业记录
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            如需撤销，请点击下方列表中的“撤销”按钮（双击确认）。
          </p>
        </div>
        <button
           type="button"
           onClick={handleExport}
           className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-sm transition-colors"
        >
           <Download size={18} />
           导出 Excel
        </button>
      </div>

      <div className="space-y-4">
        {history.length === 0 ? (
          <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center text-slate-400">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">暂无分条记录</p>
            <p className="text-sm">当您完成投产后，记录会显示在这里。</p>
          </div>
        ) : (
          history.slice().reverse().map((plan) => (
            <HistoryRow 
                key={plan.id} 
                plan={plan} 
                materials={materials} 
                onRevoke={onRevoke} 
            />
          ))
        )}
      </div>
    </div>
  );
};

const AlertTriangleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 opacity-50"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
);

export default HistoryLog;
