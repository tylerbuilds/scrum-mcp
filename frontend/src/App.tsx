import { useState, useEffect } from 'react';
import { ControlRoomPage } from './pages/ControlRoomPage';
import { BoardPage } from './pages/BoardPage';
import { TaskPage } from './pages/TaskPage';
import { MetricsPage } from './pages/MetricsPage';

type Route =
  | { type: 'control' }
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

  return { type: 'control' };
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
      case 'control':
      default:
        return <ControlRoomPage />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0a08] text-stone-100">
      {renderPage()}
    </div>
  );
}
