import { create } from 'zustand';
import { toast } from 'sonner';
import { Task, Agent, Claim, BoardMetrics, ScrumEvent } from '../types/scrum';

interface ScrumState {
  tasks: Task[];
  agents: Agent[];
  claims: Claim[];
  metrics: BoardMetrics | null;
  isConnected: boolean;
  lastUpdate: number;

  fetchInitialState: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
}

export const useScrumStore = create<ScrumState>((set, get) => {
  let socket: WebSocket | null = null;
  let reconnectTimer: any = null;

  return {
    tasks: [],
    agents: [],
    claims: [],
    metrics: null,
    isConnected: false,
    lastUpdate: 0,

    fetchInitialState: async () => {
      try {
        const [tasksRes, agentsRes, claimsRes, metricsRes] = await Promise.all([
          fetch('/api/tasks?limit=100'),
          fetch('/api/agents'),
          fetch('/api/claims'),
          fetch('/api/metrics')
        ]);

        const tasks = await tasksRes.json();
        const agents = await agentsRes.json();
        const claims = await claimsRes.json();
        const metrics = await metricsRes.json();

        set({
          tasks: tasks.data || [],
          agents: agents.data?.agents || [],
          claims: claims.data || [],
          metrics: metrics.data || null,
          lastUpdate: Date.now()
        });
      } catch (err) {
        console.error('Failed to fetch initial state:', err);
        toast.error('Failed to connect to SCRUM server', {
          description: 'Check if the backend is running on port 4177',
        });
      }
    },

    connect: () => {
      if (socket) return;

      // Fetch initial state immediately, don't wait for WebSocket
      get().fetchInitialState();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; // handling proxy
      const wsUrl = `${protocol}//${host}/ws`;

      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          console.log('Connected to ScrumMCP WebSocket');
          set({ isConnected: true });
          toast.success('Connected to SCRUM server', {
            description: 'Real-time updates enabled',
            duration: 2000,
          });
        };

        socket.onclose = () => {
          console.log('Disconnected from ScrumMCP WebSocket');
          set({ isConnected: false });
          socket = null;
          toast.warning('Disconnected from server', {
            description: 'Attempting to reconnect...',
            duration: 3000,
          });
          // Reconnect logic
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => get().connect(), 3000);
        };

        socket.onerror = (err) => {
          console.error('WebSocket error:', err);
          set({ isConnected: false });
          toast.error('Connection error', {
            description: 'Unable to maintain real-time connection',
          });
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as ScrumEvent;
            handleEvent(msg, set, get);
          } catch (err) {
            console.error('Failed to parse WS message:', err);
          }
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        set({ isConnected: false });
        toast.error('Failed to initialize connection', {
          description: 'Please refresh the page to try again',
        });
      }
    },

    disconnect: () => {
      if (socket) {
        socket.close();
        socket = null;
      }
      clearTimeout(reconnectTimer);
    }
  };
});

const FEED_EVENT_TYPES = new Set([
  'task.created',
  'task.updated',
  'intent.posted',
  'evidence.attached',
  'claim.created',
  'claim.released',
  'claim.extended',
  'claim.conflict',
  'changelog.logged',
]);

function handleEvent(evt: ScrumEvent, set: any, _get: any) {
  // const state = get() as ScrumState;
  if (FEED_EVENT_TYPES.has(evt.type)) {
    set({ lastUpdate: Date.now() });
  }

  switch (evt.type) {
    case 'task.created':
    case 'task.updated':
      // Optimistic or simple refetch. For now, let's refetch single task or all.
      // Ideally we get the full task in the event, but we only have ID.
      // So we fetch the single task.
      fetch(`/api/tasks/${evt.taskId}`).then(r => r.json()).then(res => {
        if (res.ok && res.data?.task) {
          const newTask = res.data.task;
          set((s: ScrumState) => ({
             tasks: [...s.tasks.filter(t => t.id !== newTask.id), newTask]
          }));
        }
      });
      break;

    case 'agent.registered':
    case 'agent.heartbeat':
      // Refetch agents
      fetch('/api/agents').then(r => r.json()).then(res => {
        if (res.ok) set({ agents: res.data.agents });
      });
      break;

    case 'claim.created':
    case 'claim.released':
    case 'claim.extended':
       // Refetch claims
       fetch('/api/claims').then(r => r.json()).then(res => {
         if (res.ok) set({ claims: res.data });
       });
       break;
    
    // For other events, we might just trigger a refresh of specific parts or notification
  }
}
