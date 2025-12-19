import { useState } from 'react';
import {
  ClipboardList,
  Target,
  FileCheck,
  Lock,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCode,
  Terminal,
  MessageSquare,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { AgentBadge } from './AgentBadge';

interface FeedItem {
  id: string;
  type: 'task' | 'intent' | 'evidence' | 'claim';
  title: string;
  content: string | null;
  agent_id: string | null;
  task_id: string | null;
  created_at: number;
  metadata: Record<string, unknown>;
}

interface FeedCardProps {
  item: FeedItem;
  onTaskClick?: (taskId: string) => void;
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

function getTypeConfig(type: string) {
  switch (type) {
    case 'task':
      return {
        icon: ClipboardList,
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/10',
        borderColor: 'border-cyan-500/30',
        label: 'Task',
        labelColor: 'bg-cyan-500/20 text-cyan-400',
      };
    case 'intent':
      return {
        icon: Target,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/30',
        label: 'Intent',
        labelColor: 'bg-purple-500/20 text-purple-400',
      };
    case 'evidence':
      return {
        icon: FileCheck,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        label: 'Evidence',
        labelColor: 'bg-green-500/20 text-green-400',
      };
    case 'claim':
      return {
        icon: Lock,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/30',
        label: 'Claim',
        labelColor: 'bg-orange-500/20 text-orange-400',
      };
    default:
      return {
        icon: MessageSquare,
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/10',
        borderColor: 'border-slate-500/30',
        label: 'Activity',
        labelColor: 'bg-slate-500/20 text-slate-400',
      };
  }
}

function FileList({ files }: { files: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayFiles = showAll ? files : files.slice(0, 3);
  const hasMore = files.length > 3;

  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center gap-1 text-xs text-slate-400">
        <FileCode className="w-3 h-3" />
        <span>
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {displayFiles.map((file, idx) => (
          <span
            key={idx}
            className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono"
            title={file}
          >
            {file.split('/').pop()}
          </span>
        ))}
        {hasMore && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-0.5"
          >
            +{files.length - 3} more
          </button>
        )}
        {hasMore && showAll && (
          <button
            onClick={() => setShowAll(false)}
            className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-0.5"
          >
            show less
          </button>
        )}
      </div>
    </div>
  );
}

function EvidenceOutput({ output, outputLength }: { output: string; outputLength: number }) {
  const [expanded, setExpanded] = useState(false);

  if (!output) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300"
      >
        <Terminal className="w-3 h-3" />
        <span>Output ({outputLength} chars)</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-300 overflow-x-auto max-h-40 overflow-y-auto font-mono">
          {output}
        </pre>
      )}
    </div>
  );
}

function ClaimTimer({ expiresAt }: { expiresAt: number }) {
  const now = Date.now();
  const remaining = expiresAt - now;

  if (remaining <= 0) {
    return <span className="text-xs text-red-400">Expired</span>;
  }

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <span className="text-xs text-orange-400">
      Expires in {minutes}m {seconds}s
    </span>
  );
}

export function FeedCard({ item, onTaskClick }: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = getTypeConfig(item.type);
  const Icon = config.icon;

  return (
    <Card
      className={`${config.bgColor} ${config.borderColor} border hover:border-opacity-60 transition-all duration-200`}
    >
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`${config.color} flex-shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-slate-200 truncate">{item.title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {item.agent_id && <AgentBadge agentId={item.agent_id} size="sm" />}
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(item.created_at)}
                </span>
              </div>
            </div>
          </div>
          <Badge className={`${config.labelColor} border-0 flex-shrink-0`}>{config.label}</Badge>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {item.content && (
          <div className="mt-2">
            {item.type === 'evidence' ? (
              <div className="flex items-center gap-2 text-sm text-slate-300 font-mono bg-slate-800/50 px-2 py-1 rounded">
                <Terminal className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="truncate">{item.content}</span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                {expanded || item.content.length < 200
                  ? item.content
                  : `${item.content.slice(0, 200)}...`}
              </p>
            )}
            {item.content.length > 200 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-cyan-400 hover:text-cyan-300 mt-1"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {item.type === 'intent' && !!item.metadata.files && (
          <FileList files={item.metadata.files as string[]} />
        )}

        {item.type === 'evidence' && !!item.metadata.output && (
          <EvidenceOutput
            output={item.metadata.output as string}
            outputLength={item.metadata.output_length as number}
          />
        )}

        {item.type === 'claim' && !!item.metadata.expires_at && (
          <div className="mt-2 flex items-center gap-2">
            <Lock className="w-3 h-3 text-orange-400" />
            <ClaimTimer expiresAt={item.metadata.expires_at as number} />
          </div>
        )}

        {item.type === 'claim' && !!item.metadata.files && (
          <FileList files={item.metadata.files as string[]} />
        )}

        {item.task_id && item.type !== 'task' && onTaskClick && (
          <button
            onClick={() => onTaskClick(item.task_id!)}
            className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            <ClipboardList className="w-3 h-3" />
            View task
          </button>
        )}
      </div>
    </Card>
  );
}
