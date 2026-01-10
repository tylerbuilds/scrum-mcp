import { Clock, Tag, Hash, Link2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { AgentBadge } from '../lobby/AgentBadge';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignedAgent?: string;
  dueDate?: number;
  labels: string[];
  storyPoints?: number;
  createdAt: number;
  hasUnmetDependencies?: boolean;
}

interface TaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
}

function getPriorityConfig(priority: Task['priority']) {
  switch (priority) {
    case 'critical':
      return {
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        label: 'Critical',
      };
    case 'high':
      return {
        color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        label: 'High',
      };
    case 'medium':
      return {
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        label: 'Medium',
      };
    case 'low':
      return {
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        label: 'Low',
      };
    default:
      return {
        color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        label: 'Unknown',
      };
  }
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const priorityConfig = getPriorityConfig(task.priority);
  const hasBlockedIndicator = task.hasUnmetDependencies;

  return (
    <Card
      className={`bg-slate-800 border-slate-700 hover:border-slate-600 transition-all duration-200 cursor-pointer ${
        hasBlockedIndicator ? 'border-l-2 border-l-amber-500' : ''
      }`}
      onClick={() => onClick?.(task)}
    >
      <div className="p-3 space-y-2">
        {/* Header with priority, blocked indicator, and story points */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Badge className={`${priorityConfig.color} border text-xs`}>
              {priorityConfig.label}
            </Badge>
            {hasBlockedIndicator && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 bg-amber-500/20 rounded"
                title="Waiting on dependencies"
              >
                <Link2 className="w-3 h-3 text-amber-400" />
              </span>
            )}
          </div>
          {task.storyPoints !== undefined && (
            <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded">
              <Hash className="w-3 h-3" />
              <span>{task.storyPoints}</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium text-slate-200 line-clamp-2" title={task.title}>
          {task.title}
        </h4>

        {/* Labels */}
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.labels.slice(0, 3).map((label, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-0.5 text-xs bg-slate-700/50 text-slate-300 px-1.5 py-0.5 rounded"
              >
                <Tag className="w-2.5 h-2.5" />
                {label}
              </span>
            ))}
            {task.labels.length > 3 && (
              <span className="text-xs text-slate-500">+{task.labels.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer with agent and time */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {task.assignedAgent ? (
            <AgentBadge agentId={task.assignedAgent} size="sm" />
          ) : (
            <span className="text-xs text-slate-500 italic">Unassigned</span>
          )}
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimeAgo(task.createdAt)}
          </span>
        </div>
      </div>
    </Card>
  );
}
