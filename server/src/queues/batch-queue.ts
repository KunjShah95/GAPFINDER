import { Queue } from 'bullmq';
import { config } from '../config.js';
import { getBullConnection } from './redis.js';

export const BATCH_QUEUE = 'llm-batch';

export type BatchJobType =
    | 'bulk-gap-analysis'
    | 'nightly-ingestion'
    | 'knowledge-graph-update'
    | 'classification';

export interface BatchItem {
    id: string;
    type: BatchJobType;
    payload: Record<string, unknown>;
}

export interface BatchJobPayload {
    jobType: BatchJobType;
    items: BatchItem[];
    provider?: string;
    model?: string;
    userId?: string;
    batchId?: string;
}

export interface BatchResultItem {
    id: string;
    success: boolean;
    result?: unknown;
    error?: string;
}

let batchQueue: Queue<BatchJobPayload> | null = null;

function getBatchQueue(): Queue<BatchJobPayload> {
    if (!batchQueue) {
        batchQueue = new Queue<BatchJobPayload>(BATCH_QUEUE, {
            connection: getBullConnection(),
            prefix: config.queuePrefix,
            defaultJobOptions: {
                attempts: 3,
                removeOnComplete: 200,
                removeOnFail: 200,
                backoff: {
                    type: 'exponential',
                    delay: config.queueBackoffDelayMs,
                },
            },
        });
    }
    return batchQueue;
}

export async function enqueueBatchJob(payload: BatchJobPayload): Promise<string> {
    const job = await getBatchQueue().add(
        payload.jobType,
        payload,
        {
            jobId: payload.batchId,
        }
    );
    return String(job.id);
}

export async function getBatchJobStatus(jobId: string): Promise<{
    status: string;
    progress?: number;
    result?: BatchResultItem[];
} | null> {
    const job = await getBatchQueue().getJob(jobId);
    if (!job) return null;

    return {
        status: job.progress === 100 ? 'completed' : job.failedReason ? 'failed' : 'processing',
        progress: typeof job.progress === 'number' ? job.progress : undefined,
        result: job.returnvalue as BatchResultItem[] | undefined,
    };
}

export async function closeBatchQueue(): Promise<void> {
    if (batchQueue) {
        await batchQueue.close();
        batchQueue = null;
    }
}
