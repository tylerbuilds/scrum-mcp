import { AlertTriangle, CheckCircle, Clock, Link2, ExternalLink } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { AgentBadge } from '../lobby/AgentBadge';

export interface Blocker {
  id: string;
  taskId: string;
  description: string;
  blockingTaskId?: string;
  resolvedAt?: number;
  createdAt: number;
  createdBy: string;
}

interface BlockerListProps {
  blockers: Blocker[];
  unresolvedCount: number;
  onBlockingTaskClick?: (taskId: string) => void;
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

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BlockerItem({
  blocker,
  onBlockingTaskClick,
}: {
  blocker: Blocker;
  onBlockingTaskClick?: (taskId: string) => void;
}) {
  const isResolved = !!blocker.resolvedAt;

  return (
    <div
      className={`py-3 border-b border-slate-700/50 last:border-0 ${
        isResolved ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          {isResolved ? (
            <div className="p-1 bg-green-500/20 rounded-full">
              <CheckCircle className="w-4 h-4 text-green-400" />
            </div>
          ) : (
            <div className="p-1 bg-red-500/20 rounded-full">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm ${
              isResolved ? 'text-slate-400 line-through' : 'text-slate-200'
            }`}
          >
            {blocker.description}
          </p>

          {blocker.blockingTaskId && (
            <button
              onClick={() => onBlockingTaskClick?.(blocker.blockingTaskId!)}
              className="mt-2 flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <Link2 className="w-3 h-3" />
              <span>Blocked by task</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-2">
            <AgentBadge agentId={blocker.createdBy} size="sm" />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(blocker.createdAt)}
            </span>
            {isResolved && blocker.resolvedAt && (
              <span className="text-xs text-green-400/80">
                Resolved {formatDate(blocker.resolvedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="p-3 bg-green-500/10 rounded-full mb-3">
        <CheckCircle className="w-6 h-6 text-green-500" />
      </div>
      <p className="text-slate-400 text-sm">No blockers</p>
      <p className="text-slate-500 text-xs mt-1">This task has no blocking issues</p>
    </div>
  );
}

export function BlockerList({ blockers, unresolvedCount, onBlockingTaskClick }: BlockerListProps) {
  if (blockers.length === 0) {
    return <EmptyState />;
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-medium text-slate-200">
              Blockers ({blockers.length})
            </h3>
          </div>
          {unresolvedCount > 0 && (
            <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">
              {unresolvedCount} unresolved
            </Badge>
          )}
        </div>
        <div className="divide-y divide-slate-700/50">
          {blockers.map((blocker) => (
            <BlockerItem
              key={blocker.id}
              blocker={blocker}
              onBlockingTaskClick={onBlockingTaskClick}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
