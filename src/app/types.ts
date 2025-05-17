// src/app/components/types.ts

export type Cell = {
    id: string;
    code: string;
    output: string | null;
    isLoading: boolean;
    isExecuted: boolean;
  };
  
  export type HistoryItem = {
    code: string;
    result: string;
    timestamp: string;
    provider: string;
    model: string;
    method: string;
    query: string;
  };
  
  export type ModelProvider = {
    label: string;
    models: {
      label: string;
      methods: string[];
    }[];
  };