/**
 * GRADES-hydroDL Discharge Ingestion Module
 *
 * Daily modeled discharge for ~2.94M reaches worldwide.
 * License Guardrail: CC BY-NC 4.0 (Non-commercial research & education only).
 */

export interface GradesDischargeRecord {
  reachId: string;
  meanDailyDischargeM3s: number;
  q10FloodM3s: number;
  q100FloodM3s: number;
  dataLicense: 'CC BY-NC 4.0';
  isCommercialAllowed: false;
}

export function parseGradesRecord(raw: any): GradesDischargeRecord {
  return {
    reachId: String(raw.reach_id),
    meanDailyDischargeM3s: Number(raw.q_mean || 100),
    q10FloodM3s: Number(raw.q_10 || 350),
    q100FloodM3s: Number(raw.q_100 || 650),
    dataLicense: 'CC BY-NC 4.0',
    isCommercialAllowed: false,
  };
}
