
import React, { useState } from 'react';
import { Layers, List, Settings, BookOpen, Scissors, History } from 'lucide-react';
import Guide from './components/Guide';
import CoilInventory from './components/CoilInventory';
import MaterialList from './components/MaterialList';
import Planner from './components/Planner';
import HistoryLog from './components/HistoryLog';
import { Coil, Material, AIPlanOption, ExecutedPlan, PlanImpact } from './types';
import { generateId, calculateAdjustedQuota } from './utils';

// Start with empty data
const INITIAL_COILS: Coil[] = [];
const INITIAL_MATERIALS: Material[] = [];

enum Tab {
  GUIDE = 'guide',
  COILS = 'coils',
  MATERIALS = 'materials',
  PLANNER = 'planner',
  HISTORY = 'history'
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.GUIDE);
  const [coils, setCoils] = useState<Coil[]>(INITIAL_COILS);
  const [materials, setMaterials] = useState<Material[]>(INITIAL_MATERIALS);
  const [executedPlans, setExecutedPlans] = useState<ExecutedPlan[]>([]);

  // --- EXECUTION LOGIC ---
  const handleExecutePlan = (plan: AIPlanOption, coilId: string) => {
    const targetCoil = coils.find(c => c.id === coilId);
    if (!targetCoil) return;

    // 1. Prepare Data
    const recordId = generateId();
    const impacts: PlanImpact[] = [];
    const usedWeight = plan.processingWeight;
    let totalPiecesProduced = 0;

    // 2. Calculate Impacts on Materials with Piece Precision
    const updatedMaterials = materials.map(m => {
      let producedPhysicalWeight = 0;

      plan.segments.forEach(seg => {
         const matchingStrips = seg.strips.filter(s => s.materialId === m.id && s.usageType === 'PRODUCT');
         matchingStrips.forEach(strip => {
            const ratio = strip.width / targetCoil.width; 
            const stripWeight = seg.processingWeight * ratio * strip.count;
            producedPhysicalWeight += stripWeight;
         });
      });

      // CORE UPGRADE: Calculate Pieces FIRST based on ACTUAL thickness
      // This ensures we respect the physical reality of the coil
      let pieces = 0;
      let standardWeightDeduction = 0;

      if (producedPhysicalWeight > 0) {
          // Adjusted Quota = Standard Quota * (Actual Thickness / Standard Thickness)
          // This is the physical weight of ONE piece using THIS coil.
          const actualQuota = calculateAdjustedQuota(m.quota, m.thickness, targetCoil.thickness);
          
          if (actualQuota > 0) {
              // Floor ensures we don't count partial pieces
              pieces = Math.floor(producedPhysicalWeight / actualQuota);
              // The BOM Deduction is based on STANDARD weight
              standardWeightDeduction = pieces * m.quota;
          } else {
              // Fallback for missing quota data (pure weight mode)
              standardWeightDeduction = producedPhysicalWeight;
          }
      }

      // Record impact
      if (standardWeightDeduction > 0.001 || pieces > 0) {
          const deducted = Number(standardWeightDeduction.toFixed(2));
          totalPiecesProduced += pieces;
          
          impacts.push({
              materialId: m.id,
              materialCode: m.materialCode, 
              materialName: m.name,         
              weightDeducted: deducted,
              piecesDeducted: pieces // Store exact pieces
          });
          
          // Shortage is Negative. Production is Positive.
          // New Balance = Current Shortage + Production
          const newRequired = m.requiredWeight + deducted; 
          return { ...m, requiredWeight: Number(newRequired.toFixed(2)) };
      }
      return m;
    });

    // 3. Update Coil State
    setCoils(prev => prev.map(c => {
      if (c.id === coilId) {
        let newRemaining = c.remainingWeight - usedWeight;
        if (newRemaining < 0.1) newRemaining = 0; 
        
        return { 
          ...c, 
          remainingWeight: Number(newRemaining.toFixed(1)),
          lastUsedDate: new Date().toLocaleString('zh-CN', { hour12: false }) 
        };
      }
      return c;
    }));

    // 4. Update Materials
    setMaterials(updatedMaterials);

    // 5. Record History
    const newRecord: ExecutedPlan = {
        id: recordId,
        timestamp: new Date().toISOString(),
        originalPlanName: plan.name,
        coilId: targetCoil.id,
        coilMotherId: targetCoil.motherCoilId,
        totalConsumedWeight: usedWeight,
        efficiency: plan.efficiency,
        segments: plan.segments,
        impacts: impacts
    };
    
    setExecutedPlans(prev => [...prev, newRecord]);

    // 6. Direct Feedback & Navigation
    setTimeout(() => {
        alert(
            `✅ 投产成功 (精确入账)\n\n` +
            `单号: #${recordId.slice(-6)}\n` +
            `实耗库存: ${usedWeight} kg\n` +
            `----------------\n` +
            `产出总件数: ${totalPiecesProduced} 件\n` +
            `抵扣欠料: ${impacts.length} 项`
        );
        setActiveTab(Tab.HISTORY); 
    }, 50);
  };

  // --- ROLLBACK LOGIC ---
  const handleRevokePlan = (record: ExecutedPlan) => {
    try {
        if (!record) throw new Error("无效的记录对象");

        const coilExists = coils.some(c => c.id === record.coilId);
        let msg = `✅ 撤销成功\n\n`;

        // 1. Restore Coil Weight
        if (coilExists) {
            setCoils(prev => prev.map(c => {
                if (c.id === record.coilId) {
                    const restoredWeight = c.remainingWeight + record.totalConsumedWeight;
                    return { 
                        ...c, 
                        remainingWeight: Number(restoredWeight.toFixed(1)) 
                    };
                }
                return c;
            }));
            msg += `1. 钢卷库存：已恢复 +${record.totalConsumedWeight}kg\n`;
        } else {
            msg += `1. 钢卷库存：原钢卷已删除，无法恢复 (跳过)\n`;
        }

        // 2. Restore Material Shortage
        const impactsToRestore = record.impacts || [];
        
        if (impactsToRestore.length > 0) {
            setMaterials(prev => {
                return prev.map(m => {
                    const impact = impactsToRestore.find(i => i.materialId === m.id);
                    if (impact) {
                        // Undo the production addition
                        const restoredRequired = m.requiredWeight - impact.weightDeducted;
                        return { ...m, requiredWeight: Number(restoredRequired.toFixed(2)) };
                    }
                    return m;
                });
            });
        }
        msg += `2. 欠料数据：已回滚 ${impactsToRestore.length} 项记录`;

        // 3. Remove from History
        setExecutedPlans(prev => prev.filter(p => p.id !== record.id));

        setTimeout(() => {
            alert(msg);
        }, 50);
    } catch (e: any) {
        alert(`❌ 撤销失败: ${e.message}\n请截图联系管理员。`);
        console.error("Revoke Error:", e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-10 print:hidden">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-bold text-xl">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <Scissors size={18} />
            </div>
            CoilMaster
          </div>
          <p className="text-xs text-slate-500 mt-2">智能分条管理系统 v2.4</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab(Tab.GUIDE)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === Tab.GUIDE ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800'}`}
          >
            <BookOpen size={20} />
            <span>操作指南</span>
          </button>

          <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">资源管理</div>
          
          <button 
            onClick={() => setActiveTab(Tab.COILS)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === Tab.COILS ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800'}`}
          >
            <Layers size={20} />
            <span>钢卷库存</span>
            <span className="ml-auto bg-slate-800 text-xs py-0.5 px-2 rounded-full">{coils.length}</span>
          </button>
          
          <button 
            onClick={() => setActiveTab(Tab.MATERIALS)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === Tab.MATERIALS ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800'}`}
          >
            <List size={20} />
            <span>欠料清单</span>
            <span className="ml-auto bg-slate-800 text-xs py-0.5 px-2 rounded-full">{materials.length}</span>
          </button>

          <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">生产计划</div>

          <button 
            onClick={() => setActiveTab(Tab.PLANNER)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === Tab.PLANNER ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
          >
            <Settings size={20} />
            <span>智能分条</span>
          </button>
          
          <button 
            onClick={() => setActiveTab(Tab.HISTORY)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === Tab.HISTORY ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800'}`}
          >
            <History size={20} />
            <span>分条记录</span>
            {executedPlans.length > 0 && <span className="ml-auto bg-slate-800 text-xs py-0.5 px-2 rounded-full font-bold text-white shadow-sm">{executedPlans.length}</span>}
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-600 text-center">
          &copy; 2024 Factory OS
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8 print:ml-0 print:p-0">
        <header className="flex justify-between items-center mb-8 print:hidden">
          <h1 className="text-2xl font-bold text-slate-800">
            {activeTab === Tab.GUIDE && '操作指南'}
            {activeTab === Tab.COILS && '钢卷库存管理'}
            {activeTab === Tab.MATERIALS && 'BOM 欠料明细'}
            {activeTab === Tab.PLANNER && '智能分条排产'}
            {activeTab === Tab.HISTORY && '作业记录回溯'}
          </h1>
          <div className="flex items-center gap-4">
             <div className="bg-white px-4 py-1.5 rounded-full border border-slate-200 text-xs text-slate-500 shadow-sm">
               工厂状态: <span className="text-green-600 font-bold">● 正常运行</span>
             </div>
          </div>
        </header>

        <div className="animate-fade-in-up">
          <div className={activeTab === Tab.GUIDE ? 'block' : 'hidden'}>
            <Guide />
          </div>

          <div className={activeTab === Tab.COILS ? 'block' : 'hidden'}>
            <CoilInventory coils={coils} setCoils={setCoils} />
          </div>

          <div className={activeTab === Tab.MATERIALS ? 'block' : 'hidden'}>
            <MaterialList materials={materials} setMaterials={setMaterials} />
          </div>

          <div className={activeTab === Tab.PLANNER ? 'block' : 'hidden'}>
            <Planner 
              coils={coils} 
              materials={materials} 
              onExecutePlan={handleExecutePlan} 
            />
          </div>

          <div className={activeTab === Tab.HISTORY ? 'block' : 'hidden'}>
            <HistoryLog 
                history={executedPlans} 
                materials={materials} 
                onRevoke={handleRevokePlan} 
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
