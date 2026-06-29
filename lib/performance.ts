type Measurement = {
  route: string;
  durationMs: number;
  status?: number;
  at: string;
};

const globalForPerformance = globalThis as unknown as {
  approvlineMeasurements?: Measurement[];
};

function measurements() {
  globalForPerformance.approvlineMeasurements ??= [];
  return globalForPerformance.approvlineMeasurements;
}

export function recordPerformance(route: string, durationMs: number, status?: number) {
  const entry = { route, durationMs: Math.round(durationMs), status, at: new Date().toISOString() };
  const store = measurements();
  store.push(entry);
  if (store.length > 200) store.splice(0, store.length - 200);
  if (durationMs > 750) {
    console.warn(`[performance] ${route} took ${Math.round(durationMs)}ms${status ? ` status=${status}` : ''}`);
  } else {
    console.info(`[performance] ${route} ${Math.round(durationMs)}ms${status ? ` status=${status}` : ''}`);
  }
}

export async function measure<T>(label: string, fn: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    recordPerformance(label, Date.now() - startedAt);
    return result;
  } catch (error) {
    recordPerformance(label, Date.now() - startedAt, 500);
    throw error;
  }
}

export function slowestMeasurements(limit = 10) {
  return [...measurements()]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

export async function withTimeout<T>(label: string, promise: Promise<T>, timeoutMs = 2500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}
