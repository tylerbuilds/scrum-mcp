import { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, RefreshCw, ArrowLeft, AlertCircle, BarChart3 } from 'lucide-react';
import { apiFetch } from '../config/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { KanbanColumn, Task, ColumnStatus, WipStatusItem } from '../components/board';

interface BoardResponse {
  backlog: Task[];
  todo: Task[];
  in_progress: Task[];
  review: Task[];
  done: Task[];
}

type WipStatusMap = Record<string, WipStatusItem>;

const COLUMN_ORDER: ColumnStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

export function BoardPage() {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [wipStatus, setWipStatus] = useState<WipStatusMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchBoard = useCallback(async () => {
    try {
      const data = await apiFetch<BoardResponse>('/api/board');
      setBoard(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch board data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWipStatus = useCallback(async () => {
    try {
      const data = await apiFetch<WipStatusItem[]>('/api/wip-status');
      // Convert array to map by status
      const statusMap: WipStatusMap = {};
      data.forEach((item) => {
        statusMap[item.status] = item;
      });
      setWipStatus(statusMap);
    } catch (err) {
      // Silently fail for WIP status - it's optional
      console.warn('Failed to fetch WIP status:', err);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
    fetchWipStatus();
  }, [fetchBoard, fetchWipStatus]);

  // Auto-refresh every 5 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchBoard();
      fetchWipStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchBoard, fetchWipStatus]);

  const handleTaskClick = (task: Task) => {
    window.location.hash = `#/task/${task.id}`;
  };

  const totalTasks = board
    ? COLUMN_ORDER.reduce((sum, status) => sum + board[status].length, 0)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
          <p className="text-slate-400">Loading kanban board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-6 pb-4">
        <div className="max-w-full mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <a
                href="#/"
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                title="Back to Lobby"
              >
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              </a>
              <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg">
                <LayoutGrid className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Kanban Board</h1>
                <p className="text-sm text-slate-400">
                  {totalTasks} task{totalTasks !== 1 ? 's' : ''} across {COLUMN_ORDER.length} columns
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a href="#/metrics">
                <Button variant="ghost" size="sm" className="gap-2" title="View Metrics">
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Metrics</span>
                </Button>
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? 'text-green-400' : 'text-slate-400'}
                title={autoRefresh ? 'Auto-refresh enabled (5s)' : 'Auto-refresh disabled'}
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="outline" size="sm" onClick={fetchBoard}>
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex-shrink-0 px-6">
          <Card className="bg-red-500/10 border-red-500/30 p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Board */}
      {board && (
        <div className="flex-1 overflow-x-auto px-6 pb-6">
          <div className="flex gap-4 h-full min-w-max">
            {COLUMN_ORDER.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={board[status]}
                wipStatus={wipStatus[status]}
                onTaskClick={handleTaskClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
