
import { GoogleGenAI } from "@google/genai";
import { Coil, Material, AIPlanOption } from "../types";

const apiKey = process.env.API_KEY || ''; 

const ai = new GoogleGenAI({ apiKey });

export interface OptimizationRequest {
  mode: 'stock' | 'urgent';
  targetCoil?: Coil;
  urgentMaterial?: Material;
  compatibleMaterials: Material[];
  allCoils?: Coil[]; 
}

export interface OptimizationResponse {
  plans: AIPlanOption[];
  analysis: string;
}

export const getSmartOptimization = async (request: OptimizationRequest): Promise<OptimizationResponse> => {
  if (!apiKey) {
    return {
      plans: [],
      analysis: "API Key未配置。请在代码环境中配置 process.env.API_KEY。",
    };
  }

  // Build a clean summary list for the prompt
  const matSummary = request.compatibleMaterials
    .map(m => JSON.stringify({
      id: m.id,
      code: m.materialCode,
      model: m.model,
      widths: [m.spec1, m.spec2].filter(w => w > 0),
      shortage: m.requiredWeight,
      quota: m.quota
    }))
    .join('\n');

  let context = "";
  if (request.mode === 'stock' && request.targetCoil) {
    context = `
      Current Task: SLITTING PLAN OPTIMIZATION (Stock Based)
      Target Coil: ID ${request.targetCoil.motherCoilId}, Width ${request.targetCoil.width}mm, Weight ${request.targetCoil.remainingWeight}kg.
    `;
  } else if (request.mode === 'urgent' && request.urgentMaterial && request.targetCoil) {
    context = `
      Current Task: URGENT ORDER MATCHING
      Target Coil (Selected from Stock): ID ${request.targetCoil.motherCoilId}, Width ${request.targetCoil.width}mm, Weight ${request.targetCoil.remainingWeight}kg.
      Urgent Material (MUST INCLUDE): ${request.urgentMaterial.materialCode} (ID: ${request.urgentMaterial.id}), Widths: [${request.urgentMaterial.spec1}, ${request.urgentMaterial.spec2}], Shortage: ${request.urgentMaterial.requiredWeight}kg.
    `;
  }

  const prompt = `
    ${context}

    Available Materials (Fillers/Shortage List):
    ${matSummary}

    **GOAL**: 
    Generate 3 distinct slitting plans (Plan A, Plan B, Plan C) to cut the coil width into narrower strips.
    
    **CONSTRAINTS**:
    1. Sum of all strip widths must be <= Coil Width (${request.targetCoil?.width} mm).
    2. Max 9 strips per cut.
    3. Efficiency = (Sum of Used Widths) / Coil Width. Target >= 97.5%.
    4. **CRITICAL**: Use ONLY materials from the provided lists. Do not invent new materials.
    5. "materialId" in the output must strictly match the ID provided in the list.
    6. **IF NO MATERIAL FITS**: If you have leftover width but no valid material matches it, you MUST set "materialId": null and "usageType": "SCRAP". Do NOT invent a material ID to fill the gap.

    **OUTPUT FORMAT**:
    Strictly return a JSON object with this structure. Do not use Markdown code blocks.
    {
      "analysis": "Short text summary of the strategy used...",
      "plans": [
        {
          "id": 1,
          "name": "Plan A: High Efficiency",
          "description": "Focus on max width utilization...",
          "efficiency": 99.2,
          "totalUsedWidth": 1240,
          "strips": [
            { "materialId": "ID_FROM_LIST", "materialCode": "CODE_FROM_LIST", "width": 312, "count": 2, "usageType": "PRODUCT" },
            { "materialId": null, "materialCode": "Scrap", "width": 10, "count": 1, "usageType": "SCRAP" }
          ]
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const jsonStr = response.text || '{}';
    const cleanJson = jsonStr.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      plans: parsed.plans || [],
      analysis: parsed.analysis || "Analysis complete."
    };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return {
      plans: [],
      analysis: "AI计算失败，请检查网络或数据格式。"
    };
  }
};

export const parseMaterialPaste = async (text: string) => {
  if (!apiKey) {
    console.error("No API Key found for parsing.");
    return [];
  }

  const prompt = `
    Role: Data Extraction Specialist for Steel Manufacturing.
    Task: Parse the input text (which is likely copied from an Excel spreadsheet or a table) into a structured JSON array of materials.
    
    Fields required for each item: 
    - materialCode (String, required. Look for codes like "1000582", "W12345")
    - sheetMetalCode (String. Look for codes like "SM-01", "PJ-22". Often next to material code.)
    - name (String. e.g. "底盘体", "外壳")
    - client (String. e.g. "Gree", "Midea")
    - model (String. e.g. "KFR-35GW")
    - grade (Enum: "DX51D", "DX52D", "DX53D", "DX54D". Default to DX51D if unsure)
    - coating (Number: 80 or 180. Default 80)
    - surface (Enum: "Y" or "FY". Look for "钝化"->FY, "不钝化"->Y. Default Y)
    - thickness (Number, in mm, e.g., 0.8, 1.2. Required)
    - spec1 (Number, width in mm)
    - spec2 (Number, width in mm, default 0)
    - quota (Number, kg/piece)
    - requiredWeight (Number, shortage in kg)
    - isSpecial (Boolean, true if code or model contains "*C" or "*L")

    Input Text (Raw Excel Copy):
    """
    ${text}
    """
    
    Instructions:
    1. Identify the rows. The input usually has tab-separated values.
    2. Heuristically identify which column corresponds to which field based on the data format (e.g. 0.8 is likely thickness, large integers like 1250 or 312 are widths).
    3. Return ONLY the JSON array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });
    
    const jsonStr = response.text || '[]';
    const cleanJson = jsonStr.replace(/```json|```/g, '').trim();
    
    return JSON.parse(cleanJson);
  } catch (error: any) {
    console.error("AI Parse error:", error);
    return [];
  }
}
