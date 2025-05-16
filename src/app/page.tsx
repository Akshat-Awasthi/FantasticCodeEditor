import CodeEditor from "./components/CodeEditor";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 p-4 text-white flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-4">The Fantastic Code Editor</h1>
      <div className="w-full max-w-4xl">
        <CodeEditor />
      </div>
    </main>
  );
}