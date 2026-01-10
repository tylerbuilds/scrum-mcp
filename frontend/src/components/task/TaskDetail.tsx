import { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Hash,
  Tag,
  Clock,
  Target,
  FileCheck,
  MessageSquare,
  AlertTriangle,
  FileCode,
  Terminal,
  ChevronDown,
  ChevronUp,
  Link2,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { AgentBadge } from '../lobby/AgentBadge';
import { CommentThread, Comment } from './CommentThread';
import { BlockerList, Blocker } from './BlockerList';
import { DependencyList, Dependencies } from './DependencyList';

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
}

export interface Intent {
  id: string;
  agentId: string;
  taskId: string;
  action: string;
  files: string[];
  createdAt: number;
}

export interface Evidence {
  id: string;
  agentId: string;
  taskId: string;
  command: string;
  output: string;
  outputLength: number;
  createdAt: number;
}

interface TaskDetailProps {
  task: Task;
  intents: Intent[];
  evidence: Evidence[];
  comments: Comment[];
  blockers: Blocker[];
  unresolvedBlockersCount: number;
  dependencies?: Dependencies;
  ready?: boolean;
  onBack: () => void;
  onBlockingTaskClick?: (taskId: string) => void;
}

type TabType = 'comments' | 'blockers' | 'dependencies' | 'intents' | 'evidence';

function getStatusConfig(status: Task['status']) {
  switch (status) {
    case 'backlog':
      return { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Backlog' };
    case 'todo':
      return { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'To Do' };
    case 'in_progress':
      return { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'In Progress' };
    case 'review':
      return { color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', label: 'Review' };
    case 'done':
      return { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Done' };
    case 'cancelled':
      return { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Cancelled' };
    default:
      return { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Unknown' };
  }
}

function getPriorityConfig(priority: Task['priority']) {
  switch (priority) {
    case 'critical':
      return { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Critical' };
    case 'high':
      return { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'High' };
    case 'medium':
      return { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Medium' };
    case 'low':
      return { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Low' };
    default:
      return { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Unknown' };
  }
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

function IntentItem({ intent }: { intent: Intent }) {
  const [showFiles, setShowFiles] = useState(false);

  return (
    <div className="py-3 border-b border-slate-700/50 last:border-0">
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-purple-500/20 rounded-full flex-shrink-0">
          <Target className="w-4 h-4 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200">{intent.action}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <AgentBadge agentId={intent.agentId} size="sm" />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(intent.createdAt)}
            </span>
          </div>
          {intent.files.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowFiles(!showFiles)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300"
              >
                <FileCode className="w-3 h-3" />
                <span>{intent.files.length} file(s)</span>
                {showFiles ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showFiles && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {intent.files.map((file, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono"
                      title={file}
                    >
                      {file.split('/').pop()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const [showOutput, setShowOutput] = useState(false);

  return (
    <div className="py-3 border-b border-slate-700/50 last:border-0">
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-green-500/20 rounded-full flex-shrink-0">
          <FileCheck className="w-4 h-4 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-slate-200 font-mono bg-slate-800/50 px-2 py-1 rounded">
            <Terminal className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="truncate">{evidence.command}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <AgentBadge agentId={evidence.agentId} size="sm" />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(evidence.createdAt)}
            </span>
          </div>
          {evidence.output && (
            <div className="mt-2">
              <button
                onClick={() => setShowOutput(!showOutput)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300"
              >
                <Terminal className="w-3 h-3" />
                <span>Output ({evidence.outputLength} chars)</span>
                {showOutput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showOutput && (
                <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-300 overflow-x-auto max-h-40 overflow-y-auto font-mono">
                  {evidence.output}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntentsPanel({ intents }: { intents: Intent[] }) {
  if (intents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="p-3 bg-slate-800/50 rounded-full mb-3">
          <Target className="w-6 h-6 text-slate-500" />
        </div>
        <p className="text-slate-400 text-sm">No intents declared</p>
        <p className="text-slate-500 text-xs mt-1">Agent intents will appear here</p>
      </div>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-slate-200">
            Intents ({intents.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-700/50">
          {intents.map((intent) => (
            <IntentItem key={intent.id} intent={intent} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function EvidencePanel({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="p-3 bg-slate-800/50 rounded-full mb-3">
          <FileCheck className="w-6 h-6 text-slate-500" />
        </div>
        <p className="text-slate-400 text-sm">No evidence attached</p>
        <p className="text-slate-500 text-xs mt-1">Verification evidence will appear here</p>
      </div>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <FileCheck className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-medium text-slate-200">
            Evidence ({evidence.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-700/50">
          {evidence.map((e) => (
            <EvidenceItem key={e.id} evidence={e} />
          ))}
        </div>
      </div>
    </Card>
  );
}

export function TaskDetail({
  task,
  intents,
  evidence,
  comments,
  blockers,
  unresolvedBlockersCount,
  dependencies,
  ready = true,
  onBack,
  onBlockingTaskClick,
}: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('comments');
  const statusConfig = getStatusConfig(task.status);
  const priorityConfig = getPriorityConfig(task.priority);

  const dependencyCount = dependencies
    ? dependencies.blockedBy.length + dependencies.blocking.length
    : 0;

  const tabs: { id: TabType; label: string; icon: typeof MessageSquare; count: number }[] = [
    { id: 'comments', label: 'Comments', icon: MessageSquare, count: comments.length },
    { id: 'blockers', label: 'Blockers', icon: AlertTriangle, count: blockers.length },
    { id: 'dependencies', label: 'Dependencies', icon: Link2, count: dependencyCount },
    { id: 'intents', label: 'Intents', icon: Target, count: intents.length },
    { id: 'evidence', label: 'Evidence', icon: FileCheck, count: evidence.length },
  ];

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-slate-400 hover:text-slate-200">
        <ArrowLeft className="w-4 h-4" />
        Back to Board
      </Button>

      {/* Header Card */}
      <Card className="bg-slate-800/50 border-slate-700">
        <div className="p-6">
          {/* Status and Priority Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge className={`${statusConfig.color} border`}>{statusConfig.label}</Badge>
            <Badge className={`${priorityConfig.color} border`}>{priorityConfig.label}</Badge>
            {unresolvedBlockersCount > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {unresolvedBlockersCount} blocker{unresolvedBlockersCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {dependencies && !ready && dependencies.blockedBy.length > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Link2 className="w-3 h-3 mr-1" />
                Waiting on dependencies
              </Badge>
            )}
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-slate-100 mb-4">{task.title}</h1>

          {/* Description */}
          {task.description && (
            <div className="mb-6">
              <p className="text-slate-300 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-700">
            {/* Assigned Agent */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Assigned To</p>
              {task.assignedAgent ? (
                <AgentBadge agentId={task.assignedAgent} size="sm" />
              ) : (
                <span className="text-sm text-slate-400 italic">Unassigned</span>
              )}
            </div>

            {/* Due Date */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Due Date</p>
              {task.dueDate ? (
                <div className="flex items-center gap-1 text-sm text-slate-300">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {formatDate(task.dueDate)}
                </div>
              ) : (
                <span className="text-sm text-slate-400 italic">Not set</span>
              )}
            </div>

            {/* Story Points */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Story Points</p>
              {task.storyPoints !== undefined ? (
                <div className="flex items-center gap-1 text-sm text-slate-300">
                  <Hash className="w-4 h-4 text-slate-400" />
                  {task.storyPoints}
                </div>
              ) : (
                <span className="text-sm text-slate-400 italic">Not estimated</span>
              )}
            </div>

            {/* Created Date */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Created</p>
              <div className="flex items-center gap-1 text-sm text-slate-300">
                <Clock className="w-4 h-4 text-slate-400" />
                {formatDate(task.createdAt)}
              </div>
            </div>
          </div>

          {/* Labels */}
          {task.labels.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-500 mb-2">Labels</p>
              <div className="flex flex-wrap gap-2">
                {task.labels.map((label, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded"
                  >
                    <Tag className="w-3 h-3" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const hasUnresolved = tab.id === 'blockers' && unresolvedBlockersCount > 0;
            const hasPendingDeps = tab.id === 'dependencies' && dependencies && !ready && dependencies.blockedBy.length > 0;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-cyan-400 border-cyan-400'
                    : 'text-slate-400 border-transparent hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                <Icon className={`w-4 h-4 ${hasUnresolved ? 'text-red-400' : hasPendingDeps ? 'text-amber-400' : ''}`} />
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      hasUnresolved
                        ? 'bg-red-500/20 text-red-400'
                        : hasPendingDeps
                        ? 'bg-amber-500/20 text-amber-400'
                        : isActive
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'comments' && <CommentThread comments={comments} />}
        {activeTab === 'blockers' && (
          <BlockerList
            blockers={blockers}
            unresolvedCount={unresolvedBlockersCount}
            onBlockingTaskClick={onBlockingTaskClick}
          />
        )}
        {activeTab === 'dependencies' && dependencies && (
          <DependencyList
            dependencies={dependencies}
            ready={ready}
            onTaskClick={onBlockingTaskClick}
          />
        )}
        {activeTab === 'dependencies' && !dependencies && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-slate-800/50 rounded-full mb-3">
              <Link2 className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm">Dependencies not available</p>
            <p className="text-slate-500 text-xs mt-1">
              Dependency information could not be loaded
            </p>
          </div>
        )}
        {activeTab === 'intents' && <IntentsPanel intents={intents} />}
        {activeTab === 'evidence' && <EvidencePanel evidence={evidence} />}
      </div>
    </div>
  );
}
