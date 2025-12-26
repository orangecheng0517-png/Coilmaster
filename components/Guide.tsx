
import React from 'react';
import { BookOpen, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const Guide: React.FC = () => {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-800">分条作业操作指南</h1>
        <p className="text-slate-500">空调板金工厂 · 数字化管理系统</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Logic */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="flex items-center text-xl font-semibold text-blue-600 mb-4">
            <Info className="w-5 h-5 mr-2" /> 核心匹配逻辑
          </h2>
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex items-start">
              <span className="font-bold mr-2 text-blue-700">1. 牌号替代 (Grade):</span>
              <span>
                允许 <span className="font-bold text-green-600">高牌号替低牌号</span> (如 53D → 51D)。
                <br/>
                <span className="font-bold text-red-500">禁止</span> 低牌号替高牌号 (如 51D → 53D)。
                <br/>
                <span className="text-xs text-slate-500">等级: DX54D &gt; DX53D &gt; DX52D &gt; DX51D</span>
              </span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2 text-blue-700">2. 锌层/表面 (Coating):</span>
              <span>
                锌层 (80/180) 和 表面处理 (Y/FY) 必须 <span className="font-bold text-red-600">严格匹配</span>。
              </span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2 text-blue-700">3. 厚度公差 (Thickness):</span>
              <span>
                钢卷厚度与产品需求偏差必须 <span className="font-bold">≤ 0.05mm</span>。
                <br/>
                <span className="text-xs text-slate-500">例: 0.6产品可用 0.58 或 0.65，不可用 0.75。</span>
              </span>
            </li>
          </ul>
        </div>

        {/* Operational Limits */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="flex items-center text-xl font-semibold text-amber-600 mb-4">
            <AlertTriangle className="w-5 h-5 mr-2" /> 作业限制
          </h2>
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex items-center">
              <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
              单卷利用率目标 ≥ 97.5%
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
              纵向分段: 最多 3 段
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
              横向分条: 单次最多 9 条
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
              特殊规格: 带 "*C" 或 "*L" 的产品必须对应匹配
            </li>
          </ul>
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
        <h2 className="flex items-center text-xl font-semibold text-blue-800 mb-4">
          <CheckCircle className="w-5 h-5 mr-2" /> 系统操作流程
        </h2>
        <div className="flex flex-col md:flex-row justify-between text-sm text-blue-900 gap-4">
          <div className="flex-1">
            <span className="font-bold block mb-1">Step 1: 登记库存</span>
            新卷回厂时，在“钢卷库存”中录入批次、材质、规格及重量信息。
          </div>
          <div className="hidden md:block text-blue-300">→</div>
          <div className="flex-1">
            <span className="font-bold block mb-1">Step 2: 导入欠料</span>
            导入或更新BOM欠料表。系统自动识别 13 列数据，并关联材质要求。
          </div>
          <div className="hidden md:block text-blue-300">→</div>
          <div className="flex-1">
            <span className="font-bold block mb-1">Step 3: 智能排产</span>
            系统基于上述匹配规则 (0.05mm厚度, 高代低牌号, 锌层匹配) 自动计算最优分条组合。
          </div>
        </div>
      </div>
    </div>
  );
};

export default Guide;
