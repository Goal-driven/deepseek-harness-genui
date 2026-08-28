export type WorkOsLocale = 'sv-SE' | 'en';
export type ObjectiveStatus = 'on-track' | 'at-risk' | 'off-track' | 'done';
export type TaskColumn = 'backlog' | 'doing' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export interface KeyResult {
    id: string;
    title: string;
    current: number;
    target: number;
    unit: string;
}
export interface Objective {
    id: string;
    title: string;
    owner: string;
    period: string;
    status: ObjectiveStatus;
    keyResults: KeyResult[];
}
export interface WorkTask {
    id: string;
    title: string;
    column: TaskColumn;
    objectiveId?: string;
    keyResultId?: string;
    assignee?: string;
    priority: TaskPriority;
    dueDate?: string;
    order: number;
}
export interface WorkOsState {
    schemaVersion: 1;
    revision: number;
    locale: WorkOsLocale;
    updatedAt: string;
    objectives: Objective[];
    tasks: WorkTask[];
}
export interface ReplaceWorkOsState {
    expectedRevision: number;
    locale: WorkOsLocale;
    objectives: Objective[];
    tasks: WorkTask[];
}
export declare class WorkOsConflictError extends Error {
    readonly currentRevision: number;
    constructor(currentRevision: number);
}
export declare class WorkOsStore {
    readonly root: string;
    private current;
    private pending;
    constructor(root: string);
    init(): Promise<void>;
    read(): Promise<WorkOsState>;
    replace(input: ReplaceWorkOsState): Promise<WorkOsState>;
    private persist;
    private statePath;
}
//# sourceMappingURL=store.d.ts.map