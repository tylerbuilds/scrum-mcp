import { useMemo } from 'react';
import { useScrumStore } from '../../store/useScrumStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Shield, AlertTriangle, FileCode } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function ConflictRadar() {
  const { claims } = useScrumStore();

  const fileClaims = useMemo(() => {
    const map = new Map<string, string[]>(); // file -> agentIds
    claims.forEach(c => {
      c.files.forEach(f => {
        const agents = map.get(f) || [];
        agents.push(c.agentId);
        map.set(f, agents);
      });
    });
    return map;
  }, [claims]);

  const conflicts = useMemo(() => {
    return Array.from(fileClaims.entries())
      .filter(([_, agents]) => agents.length > 1)
      .map(([file, agents]) => ({ file, agents }));
  }, [fileClaims]);

  return (
    <Card className="bg-stone-950/70 border-stone-800 h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber-400" />
          File Claims
          {conflicts.length > 0 && (
            <span className="ml-auto text-xs px-2 py-1 rounded bg-red-900/50 text-red-200 border border-red-800 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {conflicts.length} Conflicts
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {conflicts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Conflicts Detected</h4>
            {conflicts.map(c => (
              <div key={c.file} className="p-3 rounded bg-red-950/30 border border-red-900/50">
                <div className="flex items-center gap-2 text-red-200 text-sm font-medium">
                  <FileCode className="w-4 h-4" />
                  {c.file}
                </div>
                <div className="mt-1 text-xs text-red-400">
                  Claimed by: {c.agents.join(', ')}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
           <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Active Locks</h4>
           <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
             {claims.map((claim, i) => (
               <div key={`${claim.agentId}-${i}`} className="p-3 rounded bg-stone-950/50 border border-stone-800/50 hover:bg-stone-950">
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-sm font-medium text-amber-300">{claim.agentId}</span>
                   <span className="text-xs text-stone-500">
                     expires {formatDistanceToNow(claim.expiresAt, { addSuffix: true })}
                   </span>
                 </div>
                 <div className="space-y-1">
                   {claim.files.slice(0, 3).map(f => (
                     <div key={f} className="text-xs text-stone-400 truncate pl-2 border-l-2 border-stone-700">
                       {f}
                     </div>
                   ))}
                   {claim.files.length > 3 && (
                     <div className="text-xs text-stone-500 pl-2">
                       + {claim.files.length - 3} more files
                     </div>
                   )}
                 </div>
               </div>
             ))}
             {claims.length === 0 && (
               <div className="text-center py-8">
                 <Shield className="w-12 h-12 text-stone-700 mx-auto mb-3" />
                 <p className="text-sm text-stone-600 mb-1">No active file claims</p>
                 <p className="text-xs text-stone-700">
                   Agents claim files when working on tasks
                 </p>
               </div>
             )}
           </div>
        </div>
      </CardContent>
    </Card>
  );
}
