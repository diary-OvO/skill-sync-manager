import type { LogEntry } from "./types";

type Listener = (entry: LogEntry) => void;

const listeners = new Set<Listener>();
const history: LogEntry[] = [];
const MAX_HISTORY = 500;

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function push(result: LogEntry["result"], action: string, message: string): LogEntry {
  const entry: LogEntry = {
    timestamp: formatTimestamp(new Date()),
    action,
    result,
    message,
  };
  history.push(entry);
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // ignore listener errors
    }
  }
  // Mirror to console for devtools.
  const consoleLine = `[${entry.timestamp}] ${action}: ${message}`;
  if (result === "error") {
    console.error(consoleLine);
  } else {
    console.log(consoleLine);
  }
  return entry;
}

export const logger = {
  info(action: string, message: string): LogEntry {
    return push("info", action, message);
  },
  success(action: string, message: string): LogEntry {
    return push("success", action, message);
  },
  error(action: string, message: string): LogEntry {
    return push("error", action, message);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  history(): LogEntry[] {
    return history.slice();
  },
};
