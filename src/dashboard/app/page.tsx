import QueueStats from "../components/QueueStats";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-transparent px-4 py-10 text-gray-100 md:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Foreman</h1>
          <p className="text-gray-300">Job Queue Monitor</p>
        </header>
        <QueueStats />
      </div>
    </main>
  );
}