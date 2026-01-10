import { useState, useEffect } from 'react';
import { LobbyPage } from './pages/LobbyPage';
import { BoardPage } from './pages/BoardPage';
import { TaskPage } from './pages/TaskPage';
import { MetricsPage } from './pages/MetricsPage';

type Route =
  | { type: 'lobby' }
  | { type: 'board' }
  | { type: 'task'; taskId: string }
  | { type: 'metrics' };

function getRouteFromHash(): Route {
  const hash = window.location.hash;
  if (hash === '#/board') return { type: 'board' };
  if (hash === '#/metrics') return { type: 'metrics' };

  // Match #/task/:id pattern
  const taskMatch = hash.match(/^#\/task\/(.+)$/);
  if (taskMatch) {
    return { type: 'task', taskId: taskMatch[1] };
  }

  return { type: 'lobby' };
}

export function App() {
  const [route, setRoute] = useState<Route>(getRouteFromHash);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getRouteFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const renderPage = () => {
    switch (route.type) {
      case 'board':
        return <BoardPage />;
      case 'task':
        return <TaskPage taskId={route.taskId} />;
      case 'metrics':
        return <MetricsPage />;
      case 'lobby':
      default:
        return <LobbyPage />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {renderPage()}
    </div>
  );
}
