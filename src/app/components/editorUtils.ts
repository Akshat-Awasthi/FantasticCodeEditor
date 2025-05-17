// src/app/components/editorUtils.ts

import type * as monacoEditor from 'monaco-editor';
import type { ModelProvider } from '../types';

export function monacoInitAutocomplete(monaco: any, MODEL_PROVIDERS: ModelProvider[]) {
  if (!monaco) return;

  monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['.', '(', '"'],
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
      const emptyOrStartingMatch = /^(\w*)$/.exec(code);
      const providerMatch = /^(\w+)\.$/.exec(code);
      const modelMatch = /^(\w+)\.([\w\-.]+)\.$/.exec(code);
      const methodMatch = /^(\w+)\.([\w\-.]+)\.(\w+)\($/.exec(code);
      const queryMatch = /^(\w+)\.([\w\-.]+)\.(\w+)\("\s*$/.exec(code);

      if (code === '' || emptyOrStartingMatch) {
        // Suggest all providers when the editor is empty or just starting to type
        suggestions = MODEL_PROVIDERS.map(provider => ({
          label: provider.label,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: provider.label,
          detail: `AI Provider`,
          documentation: `${provider.models.length} available models`,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column - (emptyOrStartingMatch ? emptyOrStartingMatch[1].length : 0),
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        }));
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
      } else if (methodMatch || queryMatch) {
        // For empty query or just starting a query, provide example prompts
        const provider = methodMatch ? methodMatch[1] : queryMatch?.[1];
        const model = methodMatch ? methodMatch[2] : queryMatch?.[2];
        const method = methodMatch ? methodMatch[3] : queryMatch?.[3];

        let examplePrompts: string[] = [];
        switch (method) {
          case 'chat':
            examplePrompts = [
              'Explain quantum computing in simple terms',
              'Write a short story about a robot discovering emotions',
              'Summarize the key principles of machine learning'
            ];
            break;
          case 'vision':
            examplePrompts = [
              'Describe what you see in this image',
              'Analyze the content of this picture',
              'What objects are present in this photo?'
            ];
            break;
          case 'web_search':
            examplePrompts = [
              'What are the latest developments in fusion energy?',
              'Find recent research on climate change solutions',
              'Search for information about quantum computing breakthroughs'
            ];
            break;
          case 'image_creation':
            examplePrompts = [
              'A beautiful sunset over mountains with a lake in the foreground',
              'A futuristic cityscape with flying cars and holographic billboards',
              'A photorealistic portrait of a cyberpunk character'
            ];
            break;
          default:
            examplePrompts = [
              'How does machine learning work?',
              'Explain the theory of relativity',
              'What is the importance of biodiversity?'
            ];
        }

        suggestions = examplePrompts.map((prompt, index) => ({
          label: prompt,
          kind: monaco.languages.CompletionItemKind.Text,
          insertText: prompt + '")',
          detail: `Example ${index + 1}`,
          documentation: `A sample prompt for ${method}`,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        }));
      }

      return { suggestions };
    },
  });
}

export function handleEditorDidMount(
  editor: any,
  monaco: any,
  cellId: string,
  editorInstances: { [key: string]: any },
  setEditorInstances: (instances: { [key: string]: any }) => void,
  setActiveCell: (id: string) => void,
  runCell: (id: string) => void,
  monacoInitAutocomplete: (monaco: any) => void
) {
  // Store editor instance for keyboard shortcuts
  const updatedInstances = { ...editorInstances };
  updatedInstances[cellId] = editor;
  setEditorInstances(updatedInstances);

  // Set active cell when editor is focused
  editor.onDidFocusEditorWidget(() => {
    setActiveCell(cellId);
  });

  // Add Shift+Enter shortcut to run cell
  editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
    runCell(cellId);
  });

  monacoInitAutocomplete(monaco);
}