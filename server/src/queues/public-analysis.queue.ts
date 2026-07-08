import { Queue } from 'bullmq';
import { config } from '../config.js';
import { getBullConnection } from './redis.js';

export const PUBLIC_ANALYSIS_QUEUE = 'public-analysis';

export interface PublicAnalysisJobPayload {
    batchJobId: string;
    userId: string;
    url: string;
    includeGaps: boolean;
    language: string;
}

let publicAnalysisQueue: Queue<PublicAnalysisJobPayload> | null = null;

function getPublicAnalysisQueue(): Queue<PublicAnalysisJobPayload> {
    if (!publicAnalysisQueue) {
        publicAnalysisQueue = new Queue<PublicAnalysisJobPayload>(PUBLIC_ANALYSIS_QUEUE, {
            connection: getBullConnection(),
            prefix: config.queuePrefix,
            defaultJobOptions: {
                attempts: 3,
                removeOnComplete: 500,
                removeOnFail: 500,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
            },
        });
    }

    return publicAnalysisQueue;
}

export async function enqueuePublicAnalysisJob(payload: PublicAnalysisJobPayload): Promise<string> {
    const job = await getPublicAnalysisQueue().add(
        'analyze-url' as any,
        payload,
        {
            jobId: payload.batchJobId,
        }
    );

    return String(job.id);
}

export async function closePublicAnalysisQueue(): Promise<void> {
    if (publicAnalysisQueue) {
        await publicAnalysisQueue.close();
        publicAnalysisQueue = null;
    }
}
