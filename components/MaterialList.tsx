
import React, { useState, useMemo } from 'react';
import { Material, MaterialGrade, SurfaceType } from '../types';
import { Upload, Sparkles, Filter, FileSpreadsheet, Info, Trash2, ChevronRight, ChevronDown, CheckSquare, Square, X, Search, RefreshCw } from 'lucide-react';
import { generateId, calculatePieces, parseBulkText } from '../utils';
import { parseMaterialPaste } from '../services/geminiService';

interface Props {
  materials: Material[];
  setMaterials: React.Dispatch<React.SetStateAction<Material[]>>;
}

const MaterialRow: React.FC<{ m: Material, onDelete: (id: string) => void, onToggleOverProduction: (id: string) => void }> = ({ m, onDelete, onToggleOverProduction }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  
  // DIRECT DISPLAY: Shortage is Negative.
  const displayWeight = m.requiredWeight;
  const displayPieces = calculatePieces(m.requiredWeight, m.quota);

  const isShortage = displayWeight < -0.01;

  return (
    <tr className={`hover:bg-slate-50 group border-b border-slate-50 last:border-0 transition-colors ${m.allowOverProduction ? 'bg-blue-50/30' : ''}`}>
      <td 
        className="p-4 cursor-pointer align-top" 
        onClick={() => setIsExpanded(!isExpanded)}
        title="点击展开/收起详细编码"
      >
        <div className="flex items-start gap-1">
           <div className={`flex flex-col transition-all duration-200 ${isExpanded ? '' : 'max-w-[100px]'}`}>
              <div 
                className={`font-medium text-slate-900 ${isExpanded ? 'break-all whitespace-normal' : 'truncate'}`} 
              >
                {m.materialCode}
              </div>
              {m.sheetMetalCode && (
                <div 
                  className={`text-xs text-slate-400 font-normal mt-0.5 ${isExpanded ? 'break-all whitespace-normal' : 'truncate'}`}
                >
                  {m.sheetMetalCode}
                </div>
              )}
              {m.isSpecial && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded w-fit mt-1 whitespace-nowrap">特殊规格</span>}
           </div>
           <div className="text-slate-300 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
           </div>
        </div>
      </td>
      <td className="p-4 align-top">
        <div className="text-slate-900 font-medium">{m.model}</div>
        <div className="text-slate-500 text-xs">{m.client}</div>
        {m.batchId && (
          <div className="text-[10px] text-indigo-500 font-mono mt-1 bg-indigo-50 inline-block px-1 rounded">
            批:{m.batchId}
          </div>
        )}
      </td>
      <td className="p-4 align-top text-sm text-slate-700 max-w-[150px] whitespace-normal">
        {m.name || '-'}
      </td>
      <td className="p-4 align-top">
        <span className={`px-2 py-1 rounded text-xs font-mono whitespace-nowrap ${
          m.grade === MaterialGrade.DX54D ? 'bg-purple-100 text-purple-700' : 
          m.grade === MaterialGrade.DX53D ? 'bg-blue-100 text-blue-700' : 'bg-slate-100'
        }`}>
          {m.grade}+{m.coating}-{m.surface}
        </span>
      </td>
      <td className="p-4 align-top">{m.thickness}</td>
      <td className="p-4 align-top font-medium text-slate-700 font-mono">
        {m.spec1 > 0 ? (
          <span>
            {m.spec1}
            {m.spec1Note && <span className="text-red-600 font-bold ml-0.5">{m.spec1Note}</span>}
          </span>
        ) : '-'}
      </td>
      <td className="p-4 align-top text-slate-600 font-mono">
        {m.spec2 > 0 ? (
          <span>
            {m.spec2}
            {m.spec2Note && <span className="text-red-600 font-bold ml-0.5">{m.spec2Note}</span>}
          </span>
        ) : '-'}
      </td>
      <td className="p-4 align-top">{m.quota}</td>
      <td className={`p-4 text-right font-mono align-top font-bold ${isShortage ? 'text-red-600' : 'text-green-600'}`}>
         {displayPieces > 0 ? '+' : ''}{displayPieces.toLocaleString()}
      </td>
      <td className={`p-4 text-right align-top text-xs ${isShortage ? 'text-red-600' : 'text-green-600'}`}>
         {displayWeight > 0 ? '+' : ''}{displayWeight.toLocaleString()}
      </td>
      <td className="p-4 text-center align-top">
         <button 
           onClick={() => onToggleOverProduction(m.id)}
           className={`flex items-center justify-center gap-1 text-xs px-2 py-1 rounded border transition-all ${
             m.allowOverProduction 
               ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
               : 'bg-white text-slate-400 border-slate-200 hover:border-blue-300'
           }`}
           title={m.allowOverProduction ? "已允许做库存 (上限1500kg)" : "点击允许做库存"}
         >
           {m.allowOverProduction ? <CheckSquare size={14} /> : <Square size={14} />}
           {m.allowOverProduction ? '可多开' : '不可'}
         </button>
      </td>
      <td className="p-4 text-center align-top">
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirming) {
               onDelete(m.id);
               setConfirming(false);
            } else {
               setConfirming(true);
               setTimeout(() => setConfirming(false), 3000);
            }
          }}
          className={`p-2 rounded transition-all duration-200 flex items-center justify-center mx-auto ${
              confirming 
              ? "bg-red-600 text-white w-20 shadow-md animate-pulse" 
              : "text-slate-400 hover:text-red-500 hover:bg-red-50 w-10"
          }`}
          title={confirming ? "确认删除?" : "删除"}
        >
          <Trash2 size={16} />
          {confirming && <span className="text-xs font-bold ml-1 whitespace-nowrap">确认?</span>}
        </button>
      </td>
    </tr>
  );
};

const MaterialList: React.FC<Props> = ({ materials, setMaterials }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [importMode, setImportMode] = useState<'excel' | 'ai'>('excel');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  
  // Advanced Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    global: '',
    materialCode: '',
    sheetMetalCode: '',
    name: '',
    client: '',
    model: '',
    batchId: '',
    grade: '',
    thickness: '',
    coating: '',
    surface: ''
  });

  // Calculate unique options for dropdowns based on existing data
  const uniqueOptions = useMemo(() => {
    const clients = new Set<string>();
    const models = new Set<string>();
    const batches = new Set<string>();
    const thicknesses = new Set<number>();
    
    materials.forEach(m => {
        if (m.client) clients.add(m.client);
        if (m.model) models.add(m.model);
        if (m.batchId) batches.add(m.batchId);
        if (m.thickness) thicknesses.add(m.thickness);
    });

    return {
        clients: Array.from(clients).sort(),
        models: Array.from(models).sort(),
        batches: Array.from(batches).sort(),
        thicknesses: Array.from(thicknesses).sort((a,b) => a-b)
    };
  }, [materials]);

  const handleExcelParse = () => {
    if (!pasteContent) return;
    setIsParsing(true);
    try {
      const parsed = parseBulkText(pasteContent);
      if (parsed.length > 0) {
        setMaterials(prev => [...prev, ...parsed]);
        setIsImporting(false);
        setPasteContent('');
        alert(`成功导入 ${parsed.length} 条数据`);
      } else {
        alert("未识别到有效数据。请确保您复制了 Excel 内容，并检查列顺序是否符合要求。");
      }
    } catch (e) {
      alert("解析出错");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSmartParse = async () => {
    if (!pasteContent) return;
    setIsParsing(true);
    try {
      let parsed = await parseMaterialPaste(pasteContent);
      
      if (!parsed || parsed.length === 0) {
        alert("AI 未能识别到有效数据。\n请检查您的 API Key 配置，或尝试使用标准 Excel 模式。");
      } else {
        parsed = parsed.map((p: any) => ({
            ...p, 
            id: generateId(), 
            requiredWeight: p.requiredWeight || 0,
            spec1: p.spec1 || 0,
            spec2: p.spec2 || 0,
            quota: p.quota || 0,
            thickness: p.thickness || 0,
            allowOverProduction: false
        }));
        setMaterials(prev => [...prev, ...parsed]);
        setIsImporting(false);
        setPasteContent('');
        alert(`AI 成功识别并导入 ${parsed.length} 条数据`);
      }
    } catch (e) {
      console.error(e);
      alert("AI 服务连接出错，请稍后重试。");
    } finally {
      setIsParsing(false);
    }
  };

  const handleDelete = (id: string) => {
    try {
        setMaterials(prev => prev.filter(m => m.id !== id));
    } catch (e: any) {
        alert("删除失败: " + e.message);
    }
  };

  const handleToggleOverProduction = (id: string) => {
    setMaterials(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, allowOverProduction: !m.allowOverProduction };
      }
      return m;
    }));
  };

  const handleClearAll = () => {
    try {
        if (materials.length === 0) return;
        if (confirmClearAll) {
            setMaterials([]);
            setConfirmClearAll(false);
        } else {
            setConfirmClearAll(true);
            setTimeout(() => setConfirmClearAll(false), 3000);
        }
    } catch (e: any) {
        alert("清空失败: " + e.message);
    }
  };

  const resetFilters = () => {
      setFilters({
        global: '',
        materialCode: '',
        sheetMetalCode: '',
        name: '',
        client: '',
        model: '',
        batchId: '',
        grade: '',
        thickness: '',
        coating: '',
        surface: ''
      });
  };

  const filteredMaterials = materials.filter(m => {
    // 1. Global Search (matches widely)
    if (filters.global) {
        const lowerGlobal = filters.global.toLowerCase();
        const globalMatch = 
            m.materialCode.toLowerCase().includes(lowerGlobal) || 
            m.sheetMetalCode.toLowerCase().includes(lowerGlobal) ||
            m.model.toLowerCase().includes(lowerGlobal) ||
            (m.name && m.name.toLowerCase().includes(lowerGlobal));
        if (!globalMatch) return false;
    }

    // 2. Specific Field Filters
    if (filters.materialCode && !m.materialCode.toLowerCase().includes(filters.materialCode.toLowerCase())) return false;
    if (filters.sheetMetalCode && !m.sheetMetalCode.toLowerCase().includes(filters.sheetMetalCode.toLowerCase())) return false;
    if (filters.name && !m.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
    
    // Exact Matches for Dropdowns
    if (filters.client && m.client !== filters.client) return false;
    if (filters.model && m.model !== filters.model) return false;
    if (filters.batchId && m.batchId !== filters.batchId) return false;
    if (filters.grade && m.grade !== filters.grade) return false;
    if (filters.thickness && m.thickness !== Number(filters.thickness)) return false;
    if (filters.coating && m.coating !== Number(filters.coating)) return false;
    if (filters.surface && m.surface !== filters.surface) return false;

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">欠料明细 (BOM)</h2>
          <p className="text-slate-500 text-sm">共 {materials.length} 个物料需求</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="快速搜索..." 
              className="pl-9 pr-4 py-2 border rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={filters.global}
              onChange={e => setFilters({...filters, global: e.target.value})}
            />
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shadow-sm text-sm whitespace-nowrap border transition-all ${
                showFilters || Object.values(filters).some((v, i) => i > 0 && v !== '') // Check if any specific filter is active
                ? 'bg-blue-50 text-blue-600 border-blue-200 ring-1 ring-blue-200' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
             <Filter size={16} />
             <span className="hidden md:inline">筛选</span>
          </button>

          {materials.length > 0 && (
            <button 
              type="button"
              onClick={handleClearAll}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 shadow-sm text-sm whitespace-nowrap transition-all duration-200 ${
                  confirmClearAll 
                    ? 'bg-red-600 text-white animate-pulse' 
                    : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
              }`}
              title="清空所有数据"
            >
              <Trash2 size={16} />
              <span className="hidden md:inline">{confirmClearAll ? '确认清空?' : '清空'}</span>
            </button>
          )}

          <button 
            onClick={() => setIsImporting(!isImporting)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm text-sm whitespace-nowrap"
          >
            <Upload size={16} />
            导入欠料
          </button>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      {showFilters && (
          <div className="bg-slate-50 p-4 rounded-xl border border-blue-100 shadow-inner animate-fade-in">
              <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-2">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
                      <Filter size={14} /> 高级筛选条件
                  </h3>
                  <div className="flex gap-2">
                      <button 
                        onClick={resetFilters} 
                        className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                      >
                          <RefreshCw size={12} /> 重置
                      </button>
                      <button 
                        onClick={() => setShowFilters(false)} 
                        className="text-xs flex items-center gap-1 text-slate-400 hover:text-slate-600"
                      >
                          <X size={14} /> 收起
                      </button>
                  </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                   {/* Inputs for Fuzzy Search */}
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">物料编码</label>
                       <input 
                         type="text" 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none" 
                         placeholder="输入部分编码..."
                         value={filters.materialCode}
                         onChange={e => setFilters({...filters, materialCode: e.target.value})}
                       />
                   </div>
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">钣金编码</label>
                       <input 
                         type="text" 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none" 
                         placeholder="输入部分编码..."
                         value={filters.sheetMetalCode}
                         onChange={e => setFilters({...filters, sheetMetalCode: e.target.value})}
                       />
                   </div>
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">名称</label>
                       <input 
                         type="text" 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none" 
                         placeholder="如: 底盘..."
                         value={filters.name}
                         onChange={e => setFilters({...filters, name: e.target.value})}
                       />
                   </div>

                   {/* Dropdowns for Exact Match */}
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">客户</label>
                       <select 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                         value={filters.client}
                         onChange={e => setFilters({...filters, client: e.target.value})}
                       >
                           <option value="">全部</option>
                           {uniqueOptions.clients.map(c => <option key={c} value={c}>{c}</option>)}
                       </select>
                   </div>
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">机型</label>
                       <select 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                         value={filters.model}
                         onChange={e => setFilters({...filters, model: e.target.value})}
                       >
                           <option value="">全部</option>
                           {uniqueOptions.models.map(m => <option key={m} value={m}>{m}</option>)}
                       </select>
                   </div>
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">批次号</label>
                       <select 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                         value={filters.batchId}
                         onChange={e => setFilters({...filters, batchId: e.target.value})}
                       >
                           <option value="">全部</option>
                           {uniqueOptions.batches.map(b => <option key={b} value={b}>{b}</option>)}
                       </select>
                   </div>
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">牌号</label>
                       <select 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                         value={filters.grade}
                         onChange={e => setFilters({...filters, grade: e.target.value})}
                       >
                           <option value="">全部</option>
                           {Object.values(MaterialGrade).map(g => <option key={g} value={g}>{g}</option>)}
                       </select>
                   </div>
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">厚度 (mm)</label>
                       <select 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                         value={filters.thickness}
                         onChange={e => setFilters({...filters, thickness: e.target.value})}
                       >
                           <option value="">全部</option>
                           {uniqueOptions.thicknesses.map(t => <option key={t} value={t}>{t}</option>)}
                       </select>
                   </div>
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">锌层</label>
                       <select 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                         value={filters.coating}
                         onChange={e => setFilters({...filters, coating: e.target.value})}
                       >
                           <option value="">全部</option>
                           <option value="80">80</option>
                           <option value="180">180</option>
                       </select>
                   </div>
                   <div>
                       <label className="block text-xs font-semibold text-slate-500 mb-1">表面状态</label>
                       <select 
                         className="w-full text-xs p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                         value={filters.surface}
                         onChange={e => setFilters({...filters, surface: e.target.value})}
                       >
                           <option value="">全部</option>
                           <option value={SurfaceType.Y}>Y (非钝化)</option>
                           <option value={SurfaceType.FY}>FY (钝化)</option>
                       </select>
                   </div>
              </div>
          </div>
      )}

      {isImporting && (
        <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 animate-fade-in">
          <div className="mb-4 flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                <FileSpreadsheet size={20} />
                Excel 批量导入
              </h3>
              <p className="text-xs text-indigo-700 mt-1">直接从 Excel 复制数据区域（不含表头），粘贴到下方即可。</p>
            </div>
            
            <div className="flex bg-white rounded-lg p-1 border border-indigo-200 shadow-sm">
              <button 
                onClick={() => setImportMode('excel')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${importMode === 'excel' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                标准模式 (高准确率)
              </button>
              <button 
                onClick={() => setImportMode('ai')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${importMode === 'ai' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                AI 智能识别 (列序不限)
              </button>
            </div>

            <button onClick={() => setIsImporting(false)} className="text-slate-400 hover:text-slate-600 self-start">×</button>
          </div>

          {/* Guide for Excel Mode */}
          {importMode === 'excel' && (
            <div className="mb-4 bg-white p-4 rounded-lg border border-indigo-200 text-xs text-slate-600 shadow-sm">
              <div className="font-bold flex items-center gap-2 mb-3 text-indigo-800 border-b border-indigo-100 pb-2">
                <Info size={14} />
                为了保证 100% 准确，请确保 Excel 列顺序如下 (共14列)：
              </div>
              <div className="grid grid-cols-4 md:grid-cols-7 lg:grid-cols-14 gap-1 font-mono text-center">
                <div className="bg-slate-100 p-2 rounded border border-slate-200">
                  <span className="block text-slate-400 scale-75">1</span>
                  <span className="font-bold text-slate-800">客户</span>
                </div>
                <div className="bg-slate-100 p-2 rounded border border-slate-200">
                   <span className="block text-slate-400 scale-75">2</span>
                   <span className="font-bold text-slate-800">机型</span>
                </div>
                <div className="bg-slate-100 p-2 rounded border border-slate-200">
                   <span className="block text-slate-400 scale-75">3</span>
                   物料编码
                </div>
                <div className="bg-slate-100 p-2 rounded border border-slate-200">
                   <span className="block text-slate-400 scale-75">4</span>
                   钣金编码
                </div>
                <div className="bg-yellow-50 p-2 rounded border border-yellow-200 text-yellow-800">
                   <span className="block text-slate-400 scale-75">5</span>
                   名称
                </div>
                <div className="bg-blue-50 p-2 rounded border border-blue-200 text-blue-800">
                   <span className="block text-slate-400 scale-75">6</span>
                   牌号
                </div>
                <div className="bg-blue-50 p-2 rounded border border-blue-200 text-blue-800">
                   <span className="block text-slate-400 scale-75">7</span>
                   规格(80-W-FY)
                </div>
                <div className="bg-slate-100 p-2 rounded border border-slate-200">
                   <span className="block text-slate-400 scale-75">8</span>
                   <span className="font-bold text-slate-800">厚度</span>
                </div>
                <div className="bg-slate-100 p-2 rounded border border-slate-200">
                   <span className="block text-slate-400 scale-75">9</span>
                   规格1
                </div>
                <div className="bg-slate-100 p-2 rounded border border-slate-200">
                   <span className="block text-slate-400 scale-75">10</span>
                   规格2
                </div>
                <div className="bg-slate-100 p-2 rounded border border-slate-200">
                   <span className="block text-slate-400 scale-75">11</span>
                   定额(kg)
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-400">
                   <span className="block text-slate-400 scale-75">12</span>
                   欠重(可选)
                </div>
                <div className="bg-green-100 p-2 rounded border border-green-300 text-green-900 border-2">
                   <span className="block text-slate-500 scale-75">13</span>
                   <span className="font-bold text-xs">欠数(优先)</span>
                </div>
                <div className="bg-indigo-50 p-2 rounded border border-indigo-200 text-indigo-800">
                   <span className="block text-slate-400 scale-75">14</span>
                   批次号
                </div>
              </div>
              <div className="mt-2 text-center text-indigo-600 bg-indigo-50 p-1 rounded font-bold">
                 ⚡️ 重要：如果填写了“第13列 欠数”，系统将完全以欠数（件）为准，自动忽略第12列的重量。
              </div>
            </div>
          )}

          <textarea
            className="w-full h-64 p-4 rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-500 text-sm font-mono whitespace-pre overflow-auto bg-white"
            placeholder={importMode === 'excel' 
              ? `请直接粘贴数据 (自动去除"客户名："等前缀)...\n\n示例:\n客户名：Gree\t机型：KFR-35\t编码：1000582\t钣金：SM-001\t名称：底盘\t牌号：DX51D\t规格：80-W-FY\t厚度：0.8\t726\t0\t1.5\t0\t100\t2601-01...` 
              : `粘贴任何格式的文本或表格，AI 将尝试自动提取字段...`}
            value={pasteContent}
            onChange={e => setPasteContent(e.target.value)}
          ></textarea>
          
          <div className="mt-4 flex justify-between items-center">
            <span className="text-xs text-slate-400">
              {importMode === 'excel' ? '提示：列顺序必须完全一致，但内容可以包含“机型：”等标签，系统会自动清洗。' : '提示：AI 模式可能需要几秒钟，适合临时粘贴非标准数据。'}
            </span>
            {importMode === 'excel' ? (
              <button 
                onClick={handleExcelParse}
                disabled={isParsing || !pasteContent}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {isParsing ? '解析中...' : <><FileSpreadsheet size={16} /> 解析 Excel 数据</>}
              </button>
            ) : (
              <button 
                onClick={handleSmartParse}
                disabled={isParsing || !pasteContent}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {isParsing ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> : <Sparkles size={16} />}
                AI 智能识别
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
            <tr>
              <th className="p-4 w-[140px]">物料编码 / 钣金编码</th>
              <th className="p-4">机型/客户/批次</th>
              <th className="p-4">名称</th>
              <th className="p-4">材质需求</th>
              <th className="p-4">厚度</th>
              <th className="p-4">规格1 (mm)</th>
              <th className="p-4">规格2 (mm)</th>
              <th className="p-4">定额 (kg/件)</th>
              <th className="p-4 text-right">库存/欠数 (件)</th>
              <th className="p-4 text-right">库存/欠重 (kg)</th>
              <th className="p-4 text-center">可多开</th>
              <th className="p-4 text-center w-16">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMaterials.map(m => (
              <MaterialRow key={m.id} m={m} onDelete={handleDelete} onToggleOverProduction={handleToggleOverProduction} />
            ))}
            {materials.length === 0 && (
              <tr><td colSpan={12} className="p-8 text-center text-slate-400">暂无欠料信息，请先导入</td></tr>
            )}
            {materials.length > 0 && filteredMaterials.length === 0 && (
               <tr><td colSpan={12} className="p-8 text-center text-slate-400">
                 <div className="flex flex-col items-center gap-2">
                   <Filter size={32} className="opacity-20" />
                   <span>没有找到符合筛选条件的物料</span>
                   <button onClick={resetFilters} className="text-blue-600 hover:underline text-xs">清除所有筛选</button>
                 </div>
               </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MaterialList;
