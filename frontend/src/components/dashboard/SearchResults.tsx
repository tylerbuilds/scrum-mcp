import { useScrumStore } from '../../store/useScrumStore';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { ClipboardList, Bot, Lock, Target, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SearchResultsProps {
  query: string;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  type: 'task' | 'agent' | 'claim';
  title: string;
  subtitle?: string;
  onClick: () => void;
}

export function SearchResults({ query, onClose }: SearchResultsProps) {
  const { tasks, agents, claims } = useScrumStore();

  const lowerQuery = query.toLowerCase();

  const results: SearchResult[] = [];

  // Search tasks
  tasks.forEach(task => {
    const title = task.title || '';
    const description = task.description || '';
    const id = task.id || '';
    if (title.toLowerCase().includes(lowerQuery) ||
        description.toLowerCase().includes(lowerQuery) ||
        id.toLowerCase().includes(lowerQuery)) {
      results.push({
        id: `task-${task.id}`,
        type: 'task',
        title,
        subtitle: `${task.status} • ${formatDistanceToNow(task.createdAt, { addSuffix: true })}`,
        onClick: () => {
          window.location.hash = `#/task/${task.id}`;
        }
      });
    }
  });

  // Search agents
  agents.forEach(agent => {
    const agentId = agent.agentId || '';
    if (agentId.toLowerCase().includes(lowerQuery)) {
      results.push({
        id: `agent-${agent.agentId}`,
        type: 'agent',
        title: agentId,
        subtitle: `Last seen ${formatDistanceToNow(agent.lastHeartbeat, { addSuffix: true })}`,
        onClick: () => {}
      });
    }
  });

  // Search claims
  claims.forEach(claim => {
    const agentId = claim.agentId || '';
    const files = claim.files || [];
    const fileStr = files.join(' ').toLowerCase();
    if (agentId.toLowerCase().includes(lowerQuery) || fileStr.includes(lowerQuery)) {
      results.push({
        id: `claim-${claim.agentId}`,
        type: 'claim',
        title: `Claim: ${agentId}`,
        subtitle: `${files.length} file${files.length !== 1 ? 's' : ''} • expires ${formatDistanceToNow(claim.expiresAt, { addSuffix: true })}`,
        onClick: () => {}
      });
    }
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'task': return ClipboardList;
      case 'agent': return Bot;
      case 'claim': return Lock;
      default: return Target;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'task': return 'text-amber-400';
      case 'agent': return 'text-lime-400';
      case 'claim': return 'text-orange-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-100">
          Search Results for "{query}"
        </h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {results.length === 0 ? (
        <Card className="bg-stone-900/70 border-stone-700">
          <CardContent className="p-8 text-center">
            <Target className="w-12 h-12 text-stone-600 mx-auto mb-4" />
            <p className="text-stone-400">No results found for "{query}"</p>
            <p className="text-sm text-stone-500 mt-2">Try a different search term</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {results.map(result => {
            const Icon = getIcon(result.type);
            return (
              <Card
                key={result.id}
                className="bg-stone-900/80 border-stone-700 hover:border-stone-500 cursor-pointer transition-colors"
                onClick={result.onClick}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-stone-950 ${getTypeColor(result.type)}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-stone-100 truncate">{result.title}</h3>
                        <Badge variant="secondary" className="text-xs bg-stone-900 text-stone-200 border border-stone-700">
                          {result.type}
                        </Badge>
                      </div>
                      {result.subtitle && (
                        <p className="text-sm text-stone-400 truncate">{result.subtitle}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
