import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, User, AlertTriangle, Layers, Clock, ArrowRight } from 'lucide-react';
import { useScrumStore } from '../../store/useScrumStore';
import { Task, Agent, Claim } from '../../types/scrum';

type ResultType = 'task' | 'agent' | 'claim' | 'action';

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  data?: Task | Agent | Claim;
  action?: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACTIONS: SearchResult[] = [
  {
    id: 'action-board',
    type: 'action',
    title: 'Go to Board',
    subtitle: 'View Kanban board',
    icon: <Layers className="w-4 h-4" />,
    action: () => { window.location.hash = '#/board'; },
  },
  {
    id: 'action-metrics',
    type: 'action',
    title: 'Go to Metrics',
    subtitle: 'View analytics and charts',
    icon: <Clock className="w-4 h-4" />,
    action: () => { window.location.hash = '#/metrics'; },
  },
  {
    id: 'action-home',
    type: 'action',
    title: 'Go to Control Room',
    subtitle: 'Main dashboard',
    icon: <ArrowRight className="w-4 h-4" />,
    action: () => { window.location.hash = '#/'; },
  },
];

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState<ResultType | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { tasks, agents, claims } = useScrumStore();

  // Build search results
  const results = useMemo((): SearchResult[] => {
    const q = query.toLowerCase().trim();
    const items: SearchResult[] = [];

    // Parse filter syntax: type:task, status:in_progress, etc.
    let effectiveQuery = q;
    let statusFilter: string | null = null;
    let typeFilter: ResultType | 'all' = filter;

    const typeMatch = q.match(/^type:(\w+)\s*/);
    if (typeMatch) {
      const t = typeMatch[1];
      if (['task', 'agent', 'claim', 'action'].includes(t)) {
        typeFilter = t as ResultType;
      }
      effectiveQuery = q.replace(typeMatch[0], '').trim();
    }

    const statusMatch = effectiveQuery.match(/status:(\w+)\s*/);
    if (statusMatch) {
      statusFilter = statusMatch[1];
      effectiveQuery = effectiveQuery.replace(statusMatch[0], '').trim();
    }

    // Search tasks
    if (typeFilter === 'all' || typeFilter === 'task') {
      const filteredTasks = tasks.filter((task) => {
        const matchesQuery = !effectiveQuery ||
          task.title.toLowerCase().includes(effectiveQuery) ||
          task.id.toLowerCase().includes(effectiveQuery) ||
          task.description?.toLowerCase().includes(effectiveQuery);
        const matchesStatus = !statusFilter || task.status === statusFilter;
        return matchesQuery && matchesStatus;
      });

      items.push(
        ...filteredTasks.slice(0, 10).map((task): SearchResult => ({
          id: `task-${task.id}`,
          type: 'task',
          title: task.title,
          subtitle: `${task.status} · ${task.priority} priority`,
          icon: <FileText className="w-4 h-4" />,
          data: task,
          action: () => { window.location.hash = `#/task/${task.id}`; },
        }))
      );
    }

    // Search agents
    if (typeFilter === 'all' || typeFilter === 'agent') {
      const filteredAgents = agents.filter((agent) => {
        const matchesQuery = !effectiveQuery ||
          agent.agentId.toLowerCase().includes(effectiveQuery) ||
          agent.capabilities.some(c => c.toLowerCase().includes(effectiveQuery));
        return matchesQuery;
      });

      items.push(
        ...filteredAgents.slice(0, 5).map((agent): SearchResult => ({
          id: `agent-${agent.agentId}`,
          type: 'agent',
          title: agent.agentId,
          subtitle: `${agent.status} · ${agent.capabilities.slice(0, 2).join(', ')}`,
          icon: <User className="w-4 h-4" />,
          data: agent,
        }))
      );
    }

    // Search claims
    if (typeFilter === 'all' || typeFilter === 'claim') {
      const filteredClaims = claims.filter((claim) => {
        const matchesQuery = !effectiveQuery ||
          claim.agentId.toLowerCase().includes(effectiveQuery) ||
          claim.files.some(f => f.toLowerCase().includes(effectiveQuery));
        return matchesQuery;
      });

      items.push(
        ...filteredClaims.slice(0, 5).map((claim): SearchResult => ({
          id: `claim-${claim.agentId}-${claim.createdAt}`,
          type: 'claim',
          title: `Claim by ${claim.agentId}`,
          subtitle: claim.files.slice(0, 2).join(', ') + (claim.files.length > 2 ? ` +${claim.files.length - 2}` : ''),
          icon: <AlertTriangle className="w-4 h-4" />,
          data: claim,
        }))
      );
    }

    // Add actions when no query or matches action names
    if (typeFilter === 'all' || typeFilter === 'action') {
      const filteredActions = ACTIONS.filter((action) =>
        !effectiveQuery || action.title.toLowerCase().includes(effectiveQuery)
      );
      items.push(...filteredActions);
    }

    return items;
  }, [query, tasks, agents, claims, filter]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected?.action) {
          selected.action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [isOpen, results, selectedIndex, onClose]);

  // Register keyboard listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector(`[data-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const typeColors: Record<ResultType, string> = {
    task: 'text-amber-400 bg-amber-500/10',
    agent: 'text-lime-400 bg-lime-500/10',
    claim: 'text-orange-400 bg-orange-500/10',
    action: 'text-stone-400 bg-stone-500/10',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50"
          >
            <div className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-800">
                <Search className="w-5 h-5 text-stone-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder="Search tasks, agents, or type commands..."
                  className="flex-1 bg-transparent text-stone-100 placeholder-stone-500 outline-none text-sm"
                />
                <div className="flex items-center gap-1">
                  {filter !== 'all' && (
                    <button
                      onClick={() => setFilter('all')}
                      className="px-2 py-0.5 text-xs rounded bg-stone-800 text-stone-400 hover:bg-stone-700"
                    >
                      {filter} ×
                    </button>
                  )}
                  <kbd className="px-1.5 py-0.5 text-xs rounded bg-stone-800 text-stone-500 font-mono">
                    esc
                  </kbd>
                </div>
              </div>

              {/* Filter chips */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-stone-800">
                {(['all', 'task', 'agent', 'claim', 'action'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                      filter === f
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                        : 'bg-stone-800 text-stone-400 hover:bg-stone-700 border border-transparent'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
                  </button>
                ))}
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-80 overflow-y-auto">
                {results.length === 0 ? (
                  <div className="px-4 py-8 text-center text-stone-500">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No results found</p>
                    <p className="text-xs mt-1">Try &quot;type:task&quot; or &quot;status:in_progress&quot;</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {results.map((result, index) => (
                      <button
                        key={result.id}
                        data-index={index}
                        onClick={() => {
                          if (result.action) {
                            result.action();
                            onClose();
                          }
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          index === selectedIndex
                            ? 'bg-stone-800'
                            : 'hover:bg-stone-800/50'
                        }`}
                      >
                        <span className={`p-1.5 rounded-md ${typeColors[result.type]}`}>
                          {result.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-stone-100 truncate">
                            {result.title}
                          </div>
                          {result.subtitle && (
                            <div className="text-xs text-stone-500 truncate">
                              {result.subtitle}
                            </div>
                          )}
                        </div>
                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${typeColors[result.type]}`}>
                          {result.type}
                        </span>
                        {index === selectedIndex && (
                          <kbd className="px-1.5 py-0.5 text-xs rounded bg-stone-700 text-stone-400 font-mono">
                            ↵
                          </kbd>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-stone-800 flex items-center justify-between text-xs text-stone-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-stone-800 font-mono">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-stone-800 font-mono">↵</kbd>
                    select
                  </span>
                </div>
                <span>{results.length} results</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook to use command palette globally
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}
