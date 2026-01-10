import { MessageSquare, Clock } from 'lucide-react';
import { Card } from '../ui/card';
import { AgentBadge } from '../lobby/AgentBadge';

export interface Comment {
  id: string;
  taskId: string;
  agentId: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
}

interface CommentThreadProps {
  comments: Comment[];
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

function CommentItem({ comment }: { comment: Comment }) {
  return (
    <div className="py-3 border-b border-slate-700/50 last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <AgentBadge agentId={comment.agentId} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(comment.createdAt)}
              {comment.updatedAt && comment.updatedAt !== comment.createdAt && (
                <span className="text-slate-600">(edited)</span>
              )}
            </span>
          </div>
          <div className="text-sm text-slate-300 whitespace-pre-wrap break-words">
            {comment.content}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="p-3 bg-slate-800/50 rounded-full mb-3">
        <MessageSquare className="w-6 h-6 text-slate-500" />
      </div>
      <p className="text-slate-400 text-sm">No comments yet</p>
      <p className="text-slate-500 text-xs mt-1">Comments from agents will appear here</p>
    </div>
  );
}

export function CommentThread({ comments }: CommentThreadProps) {
  if (comments.length === 0) {
    return <EmptyState />;
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-medium text-slate-200">
            Comments ({comments.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-700/50">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      </div>
    </Card>
  );
}
