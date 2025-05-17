// src/app/components/cellUtils.ts

import type { HistoryItem } from '../types';

// Helper: Call the /api/run endpoint
export async function callRunApi(
  provider: string,
  model: string,
  method: string,
  query: string
) {
  const response = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, method, query }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API error');
  }

  return response.json();
}

// Helper: Update history state and localStorage
export function updateHistory(
  cellCode: string,
  apiResponse: string,
  provider: string,
  model: string,
  method: string,
  query: string,
  history: HistoryItem[],
  setHistory: (h: HistoryItem[]) => void
) {
  const newHistoryItem: HistoryItem = {
    code: cellCode,
    result: apiResponse,
    timestamp: new Date().toISOString(),
    provider,
    model,
    method,
    query,
  };

  const updatedHistory = [newHistoryItem, ...(history ? history.slice(0, 9) : [])];
  setHistory(updatedHistory);
  localStorage.setItem('codeEditorHistory', JSON.stringify(updatedHistory));
}