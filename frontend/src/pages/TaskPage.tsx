import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { apiFetch } from '../config/api';
import { Card } from '../components/ui/card';
import { TaskDetail, Task, Intent, Evidence, Comment, Blocker, Dependencies } from '../components/task';

interface TaskDetailResponse {
  task: Task;
  intents: Intent[];
  evidence: Evidence[];
  comments: Comment[];
  blockers: Blocker[];
  unresolvedBlockersCount: number;
  dependencies?: Dependencies;
  ready?: boolean;
}

interface TaskPageProps {
  taskId: string;
}

export function TaskPage({ taskId }: TaskPageProps) {
  const [data, setData] = useState<TaskDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch<TaskDetailResponse>(`/api/tasks/${taskId}`);
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const handleBack = () => {
    window.location.hash = '#/board';
  };

  const handleBlockingTaskClick = (blockingTaskId: string) => {
    window.location.hash = `#/task/${blockingTaskId}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
          <p className="text-slate-400">Loading task...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="bg-red-500/10 border-red-500/30 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <div>
              <p className="text-red-400 font-medium">Failed to load task</p>
              <p className="text-red-400/80 text-sm mt-1">{error}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleBack}
                className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 bg-slate-800 rounded-md hover:bg-slate-700 transition-colors"
              >
                Back to Board
              </button>
              <button
                onClick={fetchTask}
                className="px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 rounded-md hover:bg-cyan-500/20 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <TaskDetail
        task={data.task}
        intents={data.intents}
        evidence={data.evidence}
        comments={data.comments}
        blockers={data.blockers}
        unresolvedBlockersCount={data.unresolvedBlockersCount}
        dependencies={data.dependencies}
        ready={data.ready}
        onBack={handleBack}
        onBlockingTaskClick={handleBlockingTaskClick}
      />
    </div>
  );
}
