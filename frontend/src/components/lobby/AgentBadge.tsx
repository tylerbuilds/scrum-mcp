import { Bot, Cpu } from 'lucide-react';

interface AgentBadgeProps {
  agentId: string;
  size?: 'sm' | 'md' | 'lg';
}

// Generate a consistent color from agent ID
function getAgentColor(agentId: string): string {
  const colors = [
    'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'bg-lime-500/20 text-lime-300 border-lime-500/30',
    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    'bg-orange-500/20 text-orange-300 border-orange-500/30',
    'bg-rose-500/20 text-rose-300 border-rose-500/30',
    'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    'bg-red-500/20 text-red-300 border-red-500/30',
    'bg-stone-500/20 text-stone-300 border-stone-500/30',
  ];

  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Get display name from agent ID
function getDisplayName(agentId: string): string {
  if (agentId.startsWith('claude-code')) return 'Claude Code';
  if (agentId.startsWith('cursor')) return 'Cursor';
  if (agentId.startsWith('windsurf')) return 'Windsurf';
  if (agentId.startsWith('copilot')) return 'Copilot';
  if (agentId.startsWith('agent-')) return `Agent ${agentId.slice(6, 10)}`;

  const name = agentId.split('-')[0];
  return name.charAt(0).toUpperCase() + name.slice(1, 12);
}

export function AgentBadge({ agentId, size = 'md' }: AgentBadgeProps) {
  const colorClass = getAgentColor(agentId);
  const displayName = getDisplayName(agentId);

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-sm px-2 py-1 gap-1.5',
    lg: 'text-base px-3 py-1.5 gap-2',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <div
      className={`inline-flex items-center rounded-full border ${colorClass} ${sizeClasses[size]} font-medium`}
      title={agentId}
    >
      {agentId.includes('claude') || agentId.includes('opus') ? (
        <Bot className={iconSizes[size]} />
      ) : (
        <Cpu className={iconSizes[size]} />
      )}
      <span>{displayName}</span>
    </div>
  );
}
