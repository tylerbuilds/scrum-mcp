import { Link2, CheckCircle, Clock, ArrowRight, ExternalLink } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

export interface DependencyTask {
  id: string;
  title: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
}

export interface DependencyRecord {
  id: string;
  dependentTaskId: string;
  dependsOnTaskId: string;
  createdAt: number;
}

export interface Dependencies {
  blockedBy: DependencyTask[];
  blocking: DependencyTask[];
  records: DependencyRecord[];
}

interface DependencyListProps {
  dependencies: Dependencies;
  ready: boolean;
  onTaskClick?: (taskId: string) => void;
}

function getStatusConfig(status: DependencyTask['status']) {
  switch (status) {
    case 'done':
      return {
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        label: 'Done',
        icon: CheckCircle,
      };
    case 'in_progress':
      return {
        color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        label: 'In Progress',
        icon: Clock,
      };
    case 'review':
      return {
        color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        label: 'Review',
        icon: Clock,
      };
    case 'todo':
      return {
        color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        label: 'To Do',
        icon: Clock,
      };
    case 'backlog':
      return {
        color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        label: 'Backlog',
        icon: Clock,
      };
    case 'cancelled':
      return {
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        label: 'Cancelled',
        icon: Clock,
      };
    default:
      return {
        color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        label: 'Unknown',
        icon: Clock,
      };
  }
}

function DependencyItem({
  task,
  onTaskClick,
}: {
  task: DependencyTask;
  onTaskClick?: (taskId: string) => void;
}) {
  const config = getStatusConfig(task.status);
  const StatusIcon = config.icon;
  const isDone = task.status === 'done';

  return (
    <div
      className={`py-3 border-b border-slate-700/50 last:border-0 ${
        isDone ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <div className={`p-1 rounded-full ${isDone ? 'bg-green-500/20' : 'bg-slate-700/50'}`}>
            <StatusIcon className={`w-4 h-4 ${isDone ? 'text-green-400' : 'text-slate-400'}`} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onTaskClick?.(task.id)}
            className="text-sm text-slate-200 hover:text-cyan-400 transition-colors text-left group flex items-center gap-1.5"
          >
            <span className={isDone ? 'line-through text-slate-400' : ''}>{task.title}</span>
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
          <div className="mt-1.5">
            <Badge className={`${config.color} border text-xs`}>
              {config.label}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptySection({ type }: { type: 'blockedBy' | 'blocking' }) {
  return (
    <div className="py-4 text-center">
      <p className="text-slate-500 text-sm">
        {type === 'blockedBy'
          ? 'No dependencies - this task can start anytime'
          : 'No tasks are waiting on this one'}
      </p>
    </div>
  );
}

function ReadyIndicator() {
  return (
    <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
      <CheckCircle className="w-5 h-5 text-green-400" />
      <div>
        <p className="text-sm font-medium text-green-400">Ready to start</p>
        <p className="text-xs text-green-400/70">All dependencies are satisfied</p>
      </div>
    </div>
  );
}

function NotReadyIndicator({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
      <Clock className="w-5 h-5 text-amber-400" />
      <div>
        <p className="text-sm font-medium text-amber-400">Waiting on dependencies</p>
        <p className="text-xs text-amber-400/70">
          {count} task{count !== 1 ? 's' : ''} must be completed first
        </p>
      </div>
    </div>
  );
}

export function DependencyList({ dependencies, ready, onTaskClick }: DependencyListProps) {
  const { blockedBy, blocking } = dependencies;
  const hasBlockedBy = blockedBy.length > 0;
  const hasBlocking = blocking.length > 0;
  const hasDependencies = hasBlockedBy || hasBlocking;

  // Count incomplete dependencies
  const incompleteCount = blockedBy.filter(
    (t) => t.status !== 'done' && t.status !== 'cancelled'
  ).length;

  if (!hasDependencies) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="p-3 bg-slate-800/50 rounded-full mb-3">
          <Link2 className="w-6 h-6 text-slate-500" />
        </div>
        <p className="text-slate-400 text-sm">No dependencies</p>
        <p className="text-slate-500 text-xs mt-1">
          This task has no dependency relationships
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ready Status Indicator */}
      {hasBlockedBy && (
        ready ? <ReadyIndicator /> : <NotReadyIndicator count={incompleteCount} />
      )}

      {/* Blocked By Section */}
      <Card className="bg-slate-800/50 border-slate-700">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="w-4 h-4 text-orange-400 rotate-180" />
            <h3 className="text-sm font-medium text-slate-200">
              Blocked By ({blockedBy.length})
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Tasks that must be completed before this one can start
          </p>
          {hasBlockedBy ? (
            <div className="divide-y divide-slate-700/50">
              {blockedBy.map((task) => (
                <DependencyItem key={task.id} task={task} onTaskClick={onTaskClick} />
              ))}
            </div>
          ) : (
            <EmptySection type="blockedBy" />
          )}
        </div>
      </Card>

      {/* Blocking Section */}
      <Card className="bg-slate-800/50 border-slate-700">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-medium text-slate-200">
              Blocking ({blocking.length})
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Tasks that are waiting for this one to be completed
          </p>
          {hasBlocking ? (
            <div className="divide-y divide-slate-700/50">
              {blocking.map((task) => (
                <DependencyItem key={task.id} task={task} onTaskClick={onTaskClick} />
              ))}
            </div>
          ) : (
            <EmptySection type="blocking" />
          )}
        </div>
      </Card>
    </div>
  );
}
