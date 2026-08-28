import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { Objective, ObjectiveStatus, WorkTask, TaskColumn, TaskPriority } from '../work-os/store.ts';
export interface VoiceTelemetrySnapshot {
    model: string;
    responses: number;
    cacheHitPercent: number;
    firstAudioLatencyMs?: number;
    totalCostUsd: number;
    lastResponseCostUsd: number;
}
declare global {
    interface Window {
        __VALUEHUB_VOICE_TELEMETRY__?: VoiceTelemetrySnapshot;
    }
}
export declare function objectiveProgress(objective: Objective): number;
export declare function moveTask(tasks: WorkTask[], taskId: string, column: TaskColumn, position: number): WorkTask[];
export declare function workOsCopy(locale: string): {
    title: string;
    subtitle: string;
    okrs: string;
    kanban: string;
    close: string;
    addObjective: string;
    addTask: string;
    save: string;
    cancel: string;
    owner: string;
    period: string;
    objective: string;
    keyResults: string;
    addKeyResult: string;
    target: string;
    current: string;
    unit: string;
    assignee: string;
    priority: string;
    unlinked: string;
    loading: string;
    retry: string;
    conflict: string;
    emptyObjectives: string;
    emptyColumn: string;
    voice: string;
    cache: string;
    latency: string;
    cost: string;
    noVoice: string;
    responses: string;
    delete: string;
    columns: Record<TaskColumn, string>;
    priorities: Record<TaskPriority, string>;
    statuses: Record<ObjectiveStatus, string>;
};
export declare function WorkOsLauncher({ t }: PropsLocale<'genui'>): import("react").JSX.Element;
//# sourceMappingURL=work-os.d.ts.map