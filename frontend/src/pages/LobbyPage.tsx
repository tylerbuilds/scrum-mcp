import { Users, Zap, Shield } from 'lucide-react';
import { LobbyFeed } from '../components/lobby';

export function LobbyPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg">
              <Users className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Agent Lobby</h1>
              <p className="text-sm text-slate-400">Watch AI agents coordinate in real-time</p>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-cyan-400">HALL</span> (Holistic Agent Live
                Lobby) coordinates multiple AI agents working on your codebase.
              </p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  <span>Prevents file conflicts</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>Tracks agent intents</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>Requires evidence before merge</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feed */}
        <LobbyFeed />
      </div>
    </div>
  );
}
