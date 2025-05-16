'use client';
import dynamic from 'next/dynamic';
import { useRef, useState, useEffect } from 'react';
import { Play, Copy, Save, Settings, ChevronDown, XCircle, RotateCw } from 'lucide-react';
import type * as monacoEditor from 'monaco-editor';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { ssr: false }
);

const MODEL_PROVIDERS = [
  {
    label: 'Gemini',
    models: [
      {
        label: 'gemini-2.0-flash',
        methods: ['chat', 'completion'],
      },
      {
        label: 'gemini-2.0-flash-lite',
        methods: ['chat', 'completion', 'vision'],
      },
      {
        label: 'gemini-1.5-flash',
        methods: ['chat', 'completion'],
      },
      {
        label: 'gemini-1.5-flash-8b',
        methods: ['chat', 'completion'],
      },
    ],
  },
];

type HistoryItem = {
  code: string;
  result: string;
  timestamp: string;
  provider: string;
  model: string;
  method: string;
};

function parseCall(code: string) {
  // Match: <Provider>.<Model>.<method>("query"), allowing dashes and dots in model
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
  const [value, setValue] = useState(
    `Gemini.gemini-2.0-flash.chat("What is the capital of France?")`
  );
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [theme, setTheme] = useState('vs-dark');
  const [fontSize, setFontSize] = useState(14);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Load previous state from localStorage if available
    const savedCode = localStorage.getItem('codeEditorValue');
    if (savedCode) setValue(savedCode);

    const savedHistory = localStorage.getItem('codeEditorHistory');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  function handleEditorDidMount() {
    monacoInitAutocomplete();
  }

  function monacoInitAutocomplete() {
    // @ts-expect-error: Type mismatch due to third-party types
    const monaco: typeof monacoEditor | undefined = window.monaco;
    if (!monaco) return;

    // @ts-expect-error: Type mismatch due to third-party types
    window.monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.', '('],
      provideCompletionItems: (
        model: monacoEditor.editor.ITextModel,
        position: monacoEditor.Position
      ) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // Remove whitespace for easier parsing
        const code = textUntilPosition.replace(/\s/g, '');
        let suggestions: monacoEditor.languages.CompletionItem[] = [];

        // Regex to match the current context
        // 1. Provider.
        const providerMatch = /^(\w+)\.$/.exec(code);
        // 2. Provider.Model.
        const modelMatch = /^(\w+)\.([\w\-.]+)\.$/.exec(code);
        // 3. Provider.Model.method(
        const methodMatch = /^(\w+)\.([\w\-.]+)\.(\w+)\($/.exec(code);

        if (!code || code === '' || code === '.') {
          // Suggest only the first provider ("Gemini") when the editor is empty
          const firstProvider = MODEL_PROVIDERS[0];
          suggestions = [
            {
              label: firstProvider.label,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: firstProvider.label,
              detail: `AI Provider`,
              documentation: `${firstProvider.models.length} available models`,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            },
          ];
        } else if (providerMatch) {
          // Suggest models for the provider
          const provider = MODEL_PROVIDERS.find((p) => p.label === providerMatch[1]);
          if (provider) {
            suggestions = provider.models.map((m) => ({
              label: m.label,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: m.label,
              detail: `${provider.label} Model`,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
              documentation: `Supports: ${m.methods.join(', ')}`,
            }));
          }
        } else if (modelMatch) {
          // Suggest methods for the model
          const provider = MODEL_PROVIDERS.find((p) => p.label === modelMatch[1]);
          const modelObj = provider?.models.find((m) => m.label === modelMatch[2]);
          if (modelObj) {
            suggestions = modelObj.methods.map((method) => ({
              label: method,
              kind: monaco.languages.CompletionItemKind.Method,
              insertText: `${method}("`,
              detail: `${method} method`,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
              documentation: `Call the ${method} API with your prompt`,
            }));
          }
        } else if (methodMatch) {
          // Suggest a placeholder for the query
          suggestions = [
            {
              label: 'Enter your query here',
              kind: monaco.languages.CompletionItemKind.Text,
              insertText: 'Your question here")',
              detail: 'Query',
              documentation: 'Type your question or prompt for the model',
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            },
          ];
        }

        return { suggestions };
      },
    });
  }

  const callAPI = async () => {
    setLoading(true);
    setOutput("Calling API, please wait...");
    try {
      const { provider, model, method, query } = parseCall(value);
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider,
          model,
          method,
          query
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      // Save to history
      const newHistoryItem: HistoryItem = {
        code: value,
        result: data.response,
        timestamp: new Date().toISOString(),
        provider,
        model,
        method
      };

      const updatedHistory: HistoryItem[] = [newHistoryItem, ...(history ? history.slice(0, 9) : [])];
      setHistory(updatedHistory);
      localStorage.setItem('codeEditorHistory', JSON.stringify(updatedHistory));

      // Save current code to localStorage
      localStorage.setItem('codeEditorValue', value);

      setOutput(data.response ?? null);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setOutput(e.message ? e.message : null);
      } else if (typeof e === "string") {
        setOutput(e);
      } else {
        setOutput(null);
      }
      console.error(e);
    } finally {
      setLoading(false);
      if (
        outputRef.current &&
        typeof outputRef.current.scrollIntoView === "function"
      ) {
        outputRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const loadHistoryItem = (item: { code: string }) => {
    setValue(item.code);
    setDropdownOpen(false);
  };

  const clearOutput = () => {
    setOutput(null);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100 p-4 rounded-lg shadow-xl">
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            AI Model Explorer
          </h2>
          <p className="text-gray-400 text-sm">
            Interactive API testing environment with autocompletion
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
                        <div className="truncate text-sm">{(item as any).query || "Query"}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
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

      <div className="relative">
        <MonacoEditor
          height="40vh"
          defaultLanguage="javascript"
          value={value}
          theme={theme}
          onMount={handleEditorDidMount}
          onChange={(newVal) => setValue(newVal || '')}
          options={{
            automaticLayout: true,
            fontSize: fontSize,
            tabSize: 2,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            glyphMargin: true,
            folding: true,
            lineDecorationsWidth: 10,
          }}
        />

        <div className="absolute top-2 right-2 flex gap-1">
          <button
            className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs flex items-center gap-1"
            onClick={() => {
              localStorage.setItem('codeEditorValue', value);
            }}
            title="Save to local storage"
          >
            <Save size={14} />
          </button>
          <button
            className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs flex items-center gap-1"
            onClick={() => copyToClipboard(value)}
            title="Copy code"
          >
            <Copy size={14} />
          </button>
        </div>
      </div>

      <div className="flex justify-between mt-3">
        <button
          className={`px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ${
            loading
              ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          onClick={callAPI}
          disabled={loading}
        >
          {loading ? <RotateCw className="animate-spin" size={16} /> : <Play size={16} />}
          {loading ? 'Running...' : 'Run Query'}
          <span className="ml-1 opacity-75 text-xs">(Shift+Enter)</span>
        </button>

        {output && (
          <button
            className="px-3 py-2 text-gray-400 hover:text-gray-200 text-sm flex items-center gap-1"
            onClick={clearOutput}
          >
            <XCircle size={14} /> Clear output
          </button>
        )}
      </div>

      {output && (
        <div ref={outputRef} className="mt-4 border border-gray-700 bg-gray-800 rounded-lg overflow-hidden">
          <div className="bg-gray-800 p-2 border-b border-gray-700 flex justify-between items-center">
            <span className="font-medium text-green-400">Response</span>
            <button
              onClick={() => copyToClipboard(output)}
              className="text-gray-400 hover:text-white p-1 rounded"
              title="Copy response"
            >
              <Copy size={14} />
            </button>
          </div>
          <div className="p-4 bg-gray-900 text-green-300 whitespace-pre-wrap overflow-auto max-h-96">
            {output}
          </div>
        </div>
      )}
    </div>
  );
}