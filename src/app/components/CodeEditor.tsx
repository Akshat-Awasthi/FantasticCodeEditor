/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';
import dynamic from 'next/dynamic';
import { useRef, useState, useEffect } from 'react';
import { Play, Copy, Settings, ChevronDown, XCircle, RotateCw, Plus, Trash2 } from 'lucide-react';

import { callRunApi, updateHistory } from './cellUtils';
import { monacoInitAutocomplete, handleEditorDidMount } from './editorUtils';
import type { Cell, HistoryItem, ModelProvider } from '../types';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { ssr: false }
);

const MODEL_PROVIDERS: ModelProvider[] = [
  {
    label: 'OpenAI',
    models: [
      { label: 'gpt-4o', methods: ['chat', 'completion', 'vision', 'web_search'] },
      { label: 'gpt-4-turbo', methods: ['chat', 'completion', 'web_search'] },
      { label: 'gpt-3.5-turbo', methods: ['chat', 'completion'] },
      { label: 'dall-e-3', methods: ['image_creation'] },
    ],
  },
  {
    label: 'Gemini',
    models: [
      { label: 'gemini-1.5-flash', methods: ['chat', 'completion', 'think'] },
      { label: 'gemini-2.0-flash', methods: ['chat', 'completion', 'think'] },
      { label: 'gemini-2.0-flash-lite', methods: ['chat', 'completion', 'think'] },
    ],
  },
  {
    label: 'Claude',
    models: [
      { label: 'claude-3-opus', methods: ['chat', 'completion', 'vision', 'analyze'] },
      { label: 'claude-3-sonnet', methods: ['chat', 'completion', 'vision'] },
      { label: 'claude-3-haiku', methods: ['chat', 'completion'] },
    ],
  },
  {
    label: 'Grok',
    models: [
      { label: 'grok-2', methods: ['chat', 'completion', 'reasoning', 'web_search'] },
      { label: 'grok-1.5', methods: ['chat', 'completion'] },
    ],
  },
];

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

function parseCall(code: string) {
  const match = /(\w+)\.([\w\-.]+)\.(\w+)\("([^"]*)"\)/.exec(code);
  if (!match) throw new Error('Invalid call syntax. Expected format: Provider.Model.method("query")');
  return {
    provider: match[1],
    model: match[2],
    method: match[3],
    query: match[4]
  };
}

export default function CodeEditor() {
  const [cells, setCells] = useState<Cell[]>([
    {
      id: generateId(),
      code: `Gemini.gemini-1.5-flash.chat("What is the capital of India?")`,
      output: null,
      isLoading: false,
      isExecuted: false
    }
  ]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [theme, setTheme] = useState('vs-dark');
  const [fontSize, setFontSize] = useState(14);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cellRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [editorInstances, setEditorInstances] = useState<{[key: string]: any}>({});

  useEffect(() => {
    if (!activeCell) return;
    const editor = editorInstances[activeCell];
    if (!editor) return;
    editor.focus();
    const currentValue = editor.getValue();
    if (!currentValue || currentValue.trim() === '') {
      editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
    }
  }, [activeCell, editorInstances]);

  useEffect(() => {
    const savedCells = localStorage.getItem('jupyterCells');
    if (savedCells) {
      try {
        const parsedCells = JSON.parse(savedCells);
        setCells(parsedCells);
      } catch (e) {
        console.error('Failed to parse saved cells', e);
      }
    }
    const savedHistory = localStorage.getItem('codeEditorHistory');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse saved history', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('jupyterCells', JSON.stringify(cells));
  }, [cells]);

  const updateCellCode = (cellId: string, newCode: string) => {
    setCells(prevCells =>
      prevCells.map(cell =>
        cell.id === cellId ? { ...cell, code: newCode } : cell
      )
    );
  };

  const runCell = async (cellId: string) => {
    const cellIndex = cells.findIndex(cell => cell.id === cellId);
    if (cellIndex === -1) return;
    const cell = cells[cellIndex];
    setCells(prevCells =>
      prevCells.map(c =>
        c.id === cellId ? { ...c, isLoading: true, output: "Running..." } : c
      )
    );
    try {
      const { provider, model, method, query } = parseCall(cell.code);
      const res = await callRunApi(provider, model, method, query);
      updateHistory(cell.code, res.response, provider, model, method, query, history, setHistory);
      setCells(prevCells =>
        prevCells.map(c =>
          c.id === cellId ? { ...c, output: res.response, isLoading: false, isExecuted: true } : c
        )
      );
      if (cellIndex === cells.length - 1) {
        const newCellId = generateId();
        setCells(prevCells => [
          ...prevCells,
          {
            id: newCellId,
            code: '',
            output: null,
            isLoading: false,
            isExecuted: false
          }
        ]);
        setTimeout(() => {
          if (editorInstances[newCellId]) {
            editorInstances[newCellId].focus();
          }
        }, 100);
      }
      setTimeout(() => {
        if (cellRefs.current[cellId]) {
          cellRefs.current[cellId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    } catch (e: unknown) {
      let errorMessage = "An error occurred";
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === "string") {
        errorMessage = e;
      }
      setCells(prevCells =>
        prevCells.map(c =>
          c.id === cellId ? { ...c, output: `Error: ${errorMessage}`, isLoading: false, isExecuted: true } : c
        )
      );
      console.error(e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const loadHistoryItem = (item: { code: string }) => {
    if (activeCell) {
      updateCellCode(activeCell, item.code);
    } else if (cells.length > 0) {
      updateCellCode(cells[cells.length - 1].id, item.code);
    }
    setDropdownOpen(false);
  };

  const addNewCell = () => {
    const newCellId = generateId();
    setCells(prevCells => [
      ...prevCells,
      {
        id: newCellId,
        code: '',
        output: null,
        isLoading: false,
        isExecuted: false
      }
    ]);
    setTimeout(() => {
      if (editorInstances[newCellId]) {
        editorInstances[newCellId].focus();
      }
    }, 100);
  };

  const deleteCell = (cellId: string) => {
    if (cells.length <= 1) return;
    setCells(prevCells => prevCells.filter(cell => cell.id !== cellId));
  };

  const clearOutput = (cellId: string) => {
    setCells(prevCells =>
      prevCells.map(cell =>
        cell.id === cellId ? { ...cell, output: null, isExecuted: false } : cell
      )
    );
  };

  const clearAllCells = () => {
    const firstCellId = generateId();
    setCells([{
      id: firstCellId,
      code: '',
      output: null,
      isLoading: false,
      isExecuted: false
    }]);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100 p-4 rounded-lg shadow-xl">
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Jupyter-Style code editor
          </h2>
          <p className="text-gray-400 text-sm">
            Interactive notebook for testing AI models with autocompletion
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-2 rounded hover:bg-gray-700 transition-colors"
            title="Editor Settings"
          >
            <Settings size={18} />
          </button>
          <div className="relative">
            <button
              className="flex items-center gap-1 p-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              History <ChevronDown size={16} />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10">
                {history.length === 0 ? (
                  <div className="p-3 text-gray-400 italic text-sm">No history yet</div>
                ) : (
                  <ul>
                    {history.map((item, index) => (
                      <li
                        key={index}
                        className="p-2 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none"
                        onClick={() => loadHistoryItem(item)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-blue-400">
                            {item.provider ?? "?"}.{item.model ?? "?"}.{item.method ?? "?"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {item && item.timestamp
                              ? new Date(item.timestamp).toLocaleTimeString()
                              : "--:--:--"}
                          </span>
                        </div>
                        <div className="truncate text-sm">{item.query || "Query"}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button
            onClick={clearAllCells}
            className="p-2 rounded bg-red-600 hover:bg-red-700 transition-colors text-sm"
            title="Clear All Cells"
          >
            Clear All
          </button>
        </div>
      </div>
      {settingsOpen && (
        <div className="mb-4 p-3 bg-gray-800 rounded flex gap-4 items-center">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Theme</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-gray-700 rounded p-1 text-sm"
            >
              <option value="vs-dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Font Size</label>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="bg-gray-700 rounded p-1 text-sm"
            >
              {[12, 14, 16, 18, 20].map(size => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="flex-grow overflow-y-auto space-y-4 pb-4">
        {cells.map((cell, index) => (
          <div
            key={cell.id}
            className="cell-container border border-gray-700 rounded-lg overflow-hidden"
            ref={(ref) => { cellRefs.current[cell.id] = ref; }}
          >
            <div className="bg-gray-800 p-2 border-b border-gray-700 flex justify-between items-center">
              <span className="font-medium text-blue-400">In [{index + 1}]</span>
              <div className="flex gap-1">
                <button
                  onClick={() => runCell(cell.id)}
                  className={`p-1 rounded text-xs flex items-center ${
                    cell.isLoading
                      ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  disabled={cell.isLoading}
                  title="Run Cell (Shift+Enter)"
                >
                  {cell.isLoading ? <RotateCw className="animate-spin" size={14} /> : <Play size={14} />}
                </button>
                <button
                  onClick={() => deleteCell(cell.id)}
                  className="p-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs flex items-center"
                  title="Delete Cell"
                  disabled={cells.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="relative">
              <MonacoEditor
                height="120px"
                defaultLanguage="javascript"
                value={cell.code}
                theme={theme}
                onMount={(editor, monaco) =>
                  handleEditorDidMount(
                    editor,
                    monaco,
                    cell.id,
                    editorInstances,
                    setEditorInstances,
                    setActiveCell,
                    runCell,
                    (m) => monacoInitAutocomplete(m, MODEL_PROVIDERS)
                  )
                }
                onChange={(newVal) => updateCellCode(cell.id, newVal || '')}
                options={{
                  automaticLayout: true,
                  fontSize: fontSize,
                  tabSize: 2,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  glyphMargin: false,
                  folding: true,
                  lineDecorationsWidth: 10,
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8
                  }
                }}
              />
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  className="p-1 bg-gray-800 hover:bg-gray-700 rounded text-xs flex items-center"
                  onClick={() => copyToClipboard(cell.code)}
                  title="Copy code"
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>
            {cell.output && (
              <div className="border-t border-gray-700">
                <div className="bg-gray-800 p-2 border-b border-gray-700 flex justify-between items-center">
                  <span className="font-medium text-green-400">Out [{index + 1}]</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(cell.output || '')}
                      className="p-1 rounded text-gray-400 hover:text-white text-xs"
                      title="Copy output"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={() => clearOutput(cell.id)}
                      className="p-1 rounded text-gray-400 hover:text-white text-xs"
                      title="Clear output"
                    >
                      <XCircle size={12} />
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-gray-900 text-green-300 whitespace-pre-wrap overflow-auto max-h-96">
                  {cell.output}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        <button
          onClick={addNewCell}
          className="px-3 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
        >
          <Plus size={16} /> Add Cell
        </button>
      </div>
    </div>
  );
}