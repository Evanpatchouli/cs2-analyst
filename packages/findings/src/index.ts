export interface Finding {
  id: string;
  severity: 'low' | 'medium' | 'high';
  evidence: unknown[];
}
