
import React, { useState } from 'react';
import { Coil, MaterialGrade, SurfaceType } from '../types';
import { Plus, Trash2, CheckCircle2, AlertCircle, CalendarClock, Flame, Upload, FileSpreadsheet, Info } from 'lucide-react';
import { generateId, parseBulkCoilText } from '../utils';

interface Props {
  coils: Coil[];
  setCoils: React.Dispatch<React.SetStateAction<Coil[]>>;
}

// Sub-component for individual coil rows to manage "Confirming" state locally
const CoilRow: React.FC<{ coil: Coil, onDelete: (id: string) => void }> = ({ coil, onDelete }) => {
  const [confirming, setConfirming] = useState(false);

  const usedWeight = coil.totalWeight - coil.remainingWeight;
  const usagePercent = (usedWeight / coil.totalWeight) * 100;
  
  let statusBadge;
  let rowClass = "hover:bg-slate-50";

  if (coil.remainingWeight <= 10) { 
      statusBadge = <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200"><CheckCircle2 size={12}/> 已耗尽</span>;
      rowClass = "bg-slate-50 hover:bg-slate-100 opacity-70";
  } else if (usedWeight > 0.1) {
      statusBadge = <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 shadow-sm"><Flame size={12}/> 已投产</span>;
      rowClass = "bg-indigo-50/20 hover:bg-indigo-50/50";
  } else {
      statusBadge = <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold border border-green-200"><AlertCircle size={12}/> 全新</span>;
  }

  return (
    <tr className={`transition-colors ${rowClass}`}>
      <td className="p-4">{statusBadge}</td>
      <td className="p-4 font-medium text-slate-900">{coil.motherCoilId}</td>
      <td className="p-4">
        <span className="px-2 py-1 bg-slate-100 rounded text-xs font-mono">
          {coil.grade}+{coil.coating}-{coil.surface}
        </span>
      </td>
      <td className="p-4">{coil.thickness.toFixed(2)} x {coil.width}</td>
      <td className="p-4">
        <div className="flex flex-col gap-1">
          {/* Progress Bar */}
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                coil.remainingWeight <= 10 ? 'bg-slate-400' :
                usagePercent > 80 ? 'bg-red-500' : 
                usagePercent > 0 ? 'bg-blue-500' : 'bg-green-500'
              }`} 
              style={{width: `${(coil.remainingWeight/coil.totalWeight)*100}%`}}
            ></div>
          </div>
          
          {/* Text Details */}
          <div className="flex justify-between text-xs mt-1">
             <span className="font-bold text-slate-700">剩: {coil.remainingWeight.toFixed(0)} kg</span>
             <span className={`${usedWeight > 0.1 ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>
                {usedWeight > 0.1 ? `已用: -${usedWeight.toFixed(0)} kg` : '未动'}
             </span>
          </div>
        </div>
      </td>
      <td className="p-4 text-xs text-slate-500">
         <div title="入库日期">入: {coil.entryDate}</div>
         {coil.lastUsedDate && (
           <div className="text-indigo-600 font-bold mt-1 flex items-center gap-1" title="最近投产时间">
             <CalendarClock size={12} /> {coil.lastUsedDate}
           </div>
         )}
      </td>
      <td className="p-4 text-center align-middle">
        <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirming) {
                  onDelete(coil.id);
                  setConfirming(false);
              } else {
                  setConfirming(true);
                  setTimeout(() => setConfirming(false), 3000);
              }
            }}
            className={`p-2 rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center mx-auto ${
                confirming 
                ? "bg-red-600 text-white w-24 shadow-md ring-2 ring-red-100 animate-pulse" 
                : "text-slate-400 hover:text-red-600 hover:bg-red-50 w-10"
            }`}
            title={confirming ? "再次点击以确认删除" : "删除钢卷"}
        >
          <Trash2 size={18} />
          {confirming && <span className="text-xs font-bold ml-1 animate-fade-in whitespace-nowrap">确认删除?</span>}
        </button>
      </td>
    </tr>
  );
};

const CoilInventory: React.FC<Props> = ({ coils, setCoils }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isImporting, setIsImporting] = useState(false); // For bulk import toggle
  const [pasteContent, setPasteContent] = useState('');
  
  // State for Clear All Confirmation
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  
  const [newCoil, setNewCoil] = useState<Partial<Coil>>({
    grade: MaterialGrade.DX51D,
    coating: 80,
    surface: SurfaceType.Y,
    width: 1250,
    thickness: 0.8,
  });

  const handleAdd = () => {
    if (!newCoil.motherCoilId || !newCoil.totalWeight) {
      alert("请填写完整信息");
      return;
    }
    const coil: Coil = {
      id: generateId(),
      motherCoilId: newCoil.motherCoilId,
      grade: newCoil.grade as MaterialGrade,
      coating: newCoil.coating as 80 | 180,
      surface: newCoil.surface as SurfaceType,
      thickness: Number(newCoil.thickness),
      width: Number(newCoil.width),
      totalWeight: Number(newCoil.totalWeight),
      remainingWeight: Number(newCoil.totalWeight), // Initially full
      entryDate: new Date().toISOString().split('T')[0],
    };
    setCoils(prev => [...prev, coil]);
    setIsAdding(false);
    setNewCoil({ ...newCoil, motherCoilId: '', totalWeight: undefined });
  };

  const handleBulkImport = () => {
    if (!pasteContent) return;
    const parsedCoils = parseBulkCoilText(pasteContent);
    if (parsedCoils.length > 0) {
        setCoils(prev => [...prev, ...parsedCoils]);
        setIsImporting(false);
        setPasteContent('');
        alert(`成功导入 ${parsedCoils.length} 卷库存`);
    } else {
        alert("未识别到有效数据，请检查格式。");
    }
  };

  // Robust Delete with Try-Catch
  const handleDelete = (id: string) => {
    try {
        setCoils(prev => prev.filter(c => c.id !== id));
    } catch (e: any) {
        alert("删除失败，系统错误: " + e.message);
    }
  };

  // Robust Clear All with Try-Catch
  const handleClearAll = () => {
      try {
        if (confirmClearAll) {
            setCoils([]);
            setConfirmClearAll(false);
        } else {
            setConfirmClearAll(true);
            setTimeout(() => setConfirmClearAll(false), 3000);
        }
      } catch (e: any) {
          alert("清空失败: " + e.message);
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">钢卷库存登记</h2>
            <p className="text-sm text-slate-500 mt-1">管理工厂的所有母卷库存，实时追踪分条消耗情况。</p>
        </div>
        <div className="flex gap-2">
            {coils.length > 0 && (
                <button 
                  type="button"
                  onClick={handleClearAll}
                  className={`border px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 ${
                      confirmClearAll 
                        ? 'bg-red-600 text-white border-red-600 animate-pulse' 
                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  }`}
                  title="清空所有库存"
                >
                  <Trash2 size={18} />
                  {confirmClearAll && <span className="text-sm font-bold">确认清空?</span>}
                </button>
            )}
            <button
              onClick={() => { setIsImporting(!isImporting); setIsAdding(false); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
            >
              <Upload size={18} />
              <span>Excel 导入</span>
            </button>
            <button
              onClick={() => { setIsAdding(!isAdding); setIsImporting(false); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus size={18} />
              <span>单卷入库</span>
            </button>
        </div>
      </div>

      {/* Bulk Import Panel */}
      {isImporting && (
          <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 animate-fade-in">
              <div className="mb-4">
                  <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                    <FileSpreadsheet size={20} />
                    批量粘贴库存数据
                  </h3>
                  <div className="mt-3 bg-white p-3 rounded border border-indigo-200 text-xs text-slate-600">
                      <div className="flex items-center gap-2 font-bold text-indigo-800 mb-2 border-b border-indigo-100 pb-1">
                          <Info size={14} /> 请从 Excel 复制以下 7 列数据 (顺序必须一致):
                      </div>
                      <div className="grid grid-cols-7 gap-2 font-mono text-center">
                          <div className="bg-slate-100 p-1 rounded">1.母卷号</div>
                          <div className="bg-slate-100 p-1 rounded">2.牌号</div>
                          <div className="bg-slate-100 p-1 rounded">3.锌层(80)</div>
                          <div className="bg-slate-100 p-1 rounded">4.表面(Y)</div>
                          <div className="bg-slate-100 p-1 rounded">5.厚度</div>
                          <div className="bg-slate-100 p-1 rounded">6.宽度</div>
                          <div className="bg-slate-100 p-1 rounded">7.重量(kg)</div>
                      </div>
                      <div className="mt-2 text-slate-400">例如: MC-202401  DX51D  80  Y  0.8  1250  5000</div>
                  </div>
              </div>
              <textarea
                className="w-full h-40 p-4 rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-500 text-sm font-mono whitespace-pre bg-white"
                placeholder="在此处粘贴 Excel 数据..."
                value={pasteContent}
                onChange={e => setPasteContent(e.target.value)}
              ></textarea>
              <div className="mt-4 flex justify-end">
                  <button 
                    onClick={handleBulkImport}
                    disabled={!pasteContent}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
                  >
                    确认导入
                  </button>
              </div>
          </div>
      )}

      {/* Manual Add Panel */}
      {isAdding && (
        <div className="bg-white p-6 rounded-xl shadow-md border border-blue-100 grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">母卷号 (Mother Coil ID)</label>
            <input 
              type="text" 
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
              value={newCoil.motherCoilId || ''} 
              onChange={e => setNewCoil({...newCoil, motherCoilId: e.target.value})}
              placeholder="例如: MC-231005-01"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">牌号</label>
            <select 
              className="w-full border p-2 rounded"
              value={newCoil.grade}
              onChange={e => setNewCoil({...newCoil, grade: e.target.value as MaterialGrade})}
            >
              {Object.values(MaterialGrade).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">锌层</label>
            <select 
              className="w-full border p-2 rounded"
              value={newCoil.coating}
              onChange={e => setNewCoil({...newCoil, coating: Number(e.target.value) as 80|180})}
            >
              <option value={80}>Z80</option>
              <option value={180}>Z180</option>
            </select>
          </div>
           <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">表面</label>
            <select 
              className="w-full border p-2 rounded"
              value={newCoil.surface}
              onChange={e => setNewCoil({...newCoil, surface: e.target.value as SurfaceType})}
            >
              <option value={SurfaceType.Y}>Y (非钝化)</option>
              <option value={SurfaceType.FY}>FY (钝化)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">厚度 (mm)</label>
            <input type="number" step="0.01" className="w-full border p-2 rounded" value={newCoil.thickness} onChange={e => setNewCoil({...newCoil, thickness: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">宽度 (mm)</label>
            <input type="number" className="w-full border p-2 rounded" value={newCoil.width} onChange={e => setNewCoil({...newCoil, width: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">总重 (kg)</label>
            <input type="number" className="w-full border p-2 rounded" value={newCoil.totalWeight || ''} onChange={e => setNewCoil({...newCoil, totalWeight: Number(e.target.value)})} />
          </div>
          <div className="flex items-end">
            <button onClick={handleAdd} className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700">确认入库</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
            <tr>
              <th className="p-4">库存状态</th>
              <th className="p-4">母卷号</th>
              <th className="p-4">规格 (牌号-锌-表)</th>
              <th className="p-4">尺寸 (厚x宽)</th>
              <th className="p-4 w-64">库存消耗情况 (剩余 / 已用)</th>
              <th className="p-4">日期信息</th>
              <th className="p-4 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {coils.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">暂无库存钢卷</td></tr>
            ) : (
              coils.map(coil => (
                <CoilRow key={coil.id} coil={coil} onDelete={handleDelete} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CoilInventory;
