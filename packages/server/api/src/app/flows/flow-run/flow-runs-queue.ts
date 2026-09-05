import {
    apId,
    FlowRun,
    FlowRunStatus,
    isFlowRunStateTerminal,
    isNil,
    spreadIfDefined,
    UploadRunLogsRequest,
} from '@activepieces/shared'
import { Queue, Worker } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import { transaction } from '../../core/db/transaction'
import {
    distributedLock,
    distributedStore,
    redisConnections,
} from '../../database/redis-connections'
import { domainHelper } from '../../helper/domain-helper'
import { exceptionHandler } from '../../helper/exception-handler'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import {
    PassgradLifecycleOutboxEntity,
    PassgradLifecycleOutboxStatus,
} from '../../passgrad/passgrad-lifecycle-outbox.entity'
import {
    QueueName,
    redisMetadataKey,
    RunsMetadataJobData,
    RunsMetadataQueueConfig,
    runsMetadataQueueFactory,
    RunsMetadataUpsertData,
} from '../../workers/job'
import { flowService } from '../flow/flow.service'
import { flowRunRepo } from './flow-run-service'
import { flowRunSideEffects } from './flow-run-side-effects'
import { resumeService } from './waitpoint/resume-service'
import { waitpointService } from './waitpoint/waitpoint-service'
import { WaitpointStatus } from './waitpoint/waitpoint-types'

let runsMetadataWorker: Worker<RunsMetadataJobData> | undefined = undefined

const queue = runsMetadataQueueFactory({
    createRedisConnection: redisConnections.create,
    distributedStore,
})

export const runsMetadataQueue = (log: FastifyBaseLogger) => ({
    async init(): Promise<void> {
        const queueName = QueueName.RUNS_METADATA

        const config: RunsMetadataQueueConfig = {
            redisFailedJobRetentionDays: system.getNumberOrThrow(
                AppSystemProp.REDIS_FAILED_JOB_RETENTION_DAYS,
            ),
            redisFailedJobRetentionMaxCount: system.getNumberOrThrow(
                AppSystemProp.REDIS_FAILED_JOB_RETENTION_MAX_COUNT,
            ),
        }
        await queue.init(config)
        runsMetadataWorker = new Worker<RunsMetadataJobData>(
            queueName,
            async (job) => {
                log.info(
                    {
                        job: { id: job.id },
                        flowRun: { id: job.data.runId },
                    },
                    '[runsMetadataQueue#worker] Saving runs metadata',
                )
                const key = redisMetadataKey(job.data.runId)
                await distributedLock(log).runExclusive({
                    key: `runs_metadata_${job.data.runId}`,
                    timeoutInSeconds: 30,
                    fn: async () => {
                        try {
                            await runsMetadataQueue(log)
                                .get()
                                .removeDeduplicationKey(job.data.runId)
                            const runMetadata =
                await distributedStore.hgetJson<RunsMetadataUpsertData>(key)
                            if (isNil(runMetadata) || Object.keys(runMetadata).length === 0) {
                                log.info(
                                    {
                                        job: { id: job.id },
                                        flowRun: { id: job.data.runId },
                                    },
                                    '[runsMetadataQueue#worker] Runs metadata not found, skipping job',
                                )
                                return
                            }

                            const existingFlowRun = await flowRunRepo().findOneBy({
                                id: job.data.runId,
                            })
                            let savedFlowRun: FlowRun
                            if (!isNil(existingFlowRun)) {
                                await flowRunRepo().update(job.data.runId, {
                                    ...spreadIfDefined('projectId', runMetadata.projectId),
                                    ...spreadIfDefined('flowId', runMetadata.flowId),
                                    ...spreadIfDefined(
                                        'flowVersionId',
                                        runMetadata.flowVersionId,
                                    ),
                                    ...spreadIfDefined('environment', runMetadata.environment),
                                    ...spreadIfDefined('startTime', runMetadata.startTime),
                                    ...spreadIfDefined('finishTime', runMetadata.finishTime),
                                    ...spreadIfDefined('status', runMetadata.status),
                                    ...spreadIfDefined('tags', runMetadata.tags),
                                    ...spreadIfDefined('failedStep', runMetadata.failedStep),
                                    ...spreadIfDefined(
                                        'stepNameToTest',
                                        runMetadata.stepNameToTest,
                                    ),
                                    ...spreadIfDefined('parentRunId', runMetadata.parentRunId),
                                    ...spreadIfDefined(
                                        'failParentOnFailure',
                                        runMetadata.failParentOnFailure,
                                    ),
                                    ...spreadIfDefined('logsFileId', runMetadata.logsFileId),
                                    ...spreadIfDefined('updated', runMetadata.updated),
                                    ...spreadIfDefined('stepsCount', runMetadata.stepsCount),
                                })
                                const updatedFlowRun = await flowRunRepo().findOneBy({
                                    id: job.data.runId,
                                })
                                if (isNil(updatedFlowRun)) {
                                    log.info(
                                        {
                                            job: { id: job.id },
                                            flowRun: { id: job.data.runId },
                                        },
                                        '[runsMetadataQueue#worker] Flow run was deleted during update, skipping job',
                                    )
                                    return
                                }
                                savedFlowRun = updatedFlowRun
                            }
                            else {
                                const flowId = runMetadata.flowId
                                const flowExists =
                  !isNil(flowId) && (await flowService(log).exists(flowId))
                                if (!flowExists) {
                                    log.info(
                                        {
                                            job: { id: job.id },
                                            flowRun: { id: job.data.runId },
                                        },
                                        '[runsMetadataQueue#worker] Flow does not exist (deleted), skipping job',
                                    )
                                    return
                                }
                                savedFlowRun = await flowRunRepo().save(runMetadata)
                            }

                            const parentRunId = savedFlowRun.parentRunId
                            const shouldMarkParentAsFailed =
                savedFlowRun.failParentOnFailure &&
                !isNil(parentRunId) &&
                ![
                    FlowRunStatus.SUCCEEDED,
                    FlowRunStatus.RUNNING,
                    FlowRunStatus.PAUSED,
                    FlowRunStatus.QUEUED,
                ].includes(savedFlowRun.status)
                            if (shouldMarkParentAsFailed) {
                                await markParentRunAsFailed({
                                    parentRunId,
                                    childRunId: savedFlowRun.id,
                                    projectId: savedFlowRun.projectId,
                                    log,
                                })
                            }

                            if (!isNil(runMetadata.requestId)) {
                                await distributedStore.deleteKeyIfFieldValueMatches(
                                    key,
                                    'requestId',
                                    runMetadata.requestId,
                                )
                            }
                            if (!isNil(runMetadata.finishTime)) {
                                await flowRunSideEffects(log).onFinish(savedFlowRun)
                            }

                            if (savedFlowRun.status === FlowRunStatus.PAUSED) {
                                const latestWaitpoint = await waitpointService(
                                    log,
                                ).getByFlowRunId(savedFlowRun.id)
                                const isPreCompleted =
                  !isNil(latestWaitpoint) &&
                  latestWaitpoint.status === WaitpointStatus.COMPLETED
                                if (isPreCompleted) {
                                    await resumeService(log).resumeFromWaitpoint({
                                        flowRunId: savedFlowRun.id,
                                        waitpointId: latestWaitpoint.id,
                                        resumePayload: latestWaitpoint.resumePayload,
                                    })
                                }
                            }
                        }
                        catch (error) {
                            log.error(
                                {
                                    error,
                                    data: job.data,
                                },
                                '[runsMetadataQueue#worker] Error saving runs metadata',
                            )
                            exceptionHandler.handle(error, log)
                            throw error
                        }
                    },
                })
            },
            {
                connection: await redisConnections.create(),
                concurrency: system.getNumberOrThrow(
                    AppSystemProp.RUNS_METADATA_UPDATE_CONCURRENCY,
                ),
                autorun: true,
            },
        )

        await runsMetadataWorker.waitUntilReady()
    },

    async add(params: RunsMetadataUpsertData): Promise<void> {
        log.info(
            {
                flowRun: { id: params.id },
                project: { id: params.projectId },
            },
            '[runsMetadataQueue#add] Adding runs metadata to queue',
        )
        await queue.add(params)
    },

    get(): Queue<RunsMetadataJobData> {
        return queue.get()
    },
    async close(): Promise<void> {
        if (queue.get()) {
            await queue.get().close()
        }

        if (runsMetadataWorker) {
            await runsMetadataWorker.close()
        }
    },
})

export async function persistRunMetadataAndPassgradOutbox(
    input: UploadRunLogsRequest,
    _log: FastifyBaseLogger,
): Promise<FlowRun> {
    const runMetadata: RunsMetadataUpsertData = {
        id: input.runId,
        projectId: input.projectId,
        status: input.status,
        tags: input.tags,
        logsFileId: input.logsFileId,
        failedStep: input.failedStep,
        startTime: input.startTime,
        finishTime: input.finishTime,
        stepsCount: input.stepsCount,
        stepNameToTest: input.stepNameToTest,
    }
    const outboxPayload = buildPassgradProjectionPayload(input)
    const now = new Date()

    const savedFlowRun = await transaction(async (entityManager) => {
        const existingFlowRun = await flowRunRepo(entityManager).findOneBy({
            id: input.runId,
        })
        if (isNil(existingFlowRun)) {
            throw new Error(
                `Flow run ${input.runId} not found while persisting worker metadata`,
            )
        }
        await flowRunRepo(entityManager).update(input.runId, {
            ...spreadIfDefined('status', runMetadata.status),
            ...spreadIfDefined('tags', runMetadata.tags),
            ...spreadIfDefined('logsFileId', runMetadata.logsFileId),
            ...spreadIfDefined('failedStep', runMetadata.failedStep),
            ...spreadIfDefined('startTime', runMetadata.startTime),
            ...spreadIfDefined('finishTime', runMetadata.finishTime),
            ...spreadIfDefined('stepsCount', runMetadata.stepsCount),
            ...spreadIfDefined('stepNameToTest', runMetadata.stepNameToTest),
        })
        if (outboxPayload) {
            const repository = entityManager.getRepository(
                PassgradLifecycleOutboxEntity,
            )
            const existingEvent = await repository.findOneBy({
                flowRunId: input.runId,
                eventId: input.passgradEventId!,
            })
            if (isNil(existingEvent)) {
                await repository.save(
                    repository.create({
                        id: apId(),
                        created: now,
                        updated: now,
                        projectId: input.projectId,
                        flowRunId: input.runId,
                        eventId: input.passgradEventId!,
                        apEventSequence: getPassgradEventSequence(input.status),
                        payload: outboxPayload,
                        status: PassgradLifecycleOutboxStatus.PENDING,
                        attempts: 0,
                        nextAttemptAt: now,
                        lockedAt: null,
                        lastError: null,
                    }),
                )
            }
            else if (
                existingEvent.status !== PassgradLifecycleOutboxStatus.COMPLETED
            ) {
                existingEvent.payload = outboxPayload
                existingEvent.updated = now
                existingEvent.status = PassgradLifecycleOutboxStatus.PENDING
                existingEvent.nextAttemptAt = now
                existingEvent.lockedAt = null
                await repository.save(existingEvent)
            }
        }
        return flowRunRepo(entityManager).findOneByOrFail({ id: input.runId })
    })

    return savedFlowRun
}

function buildPassgradProjectionPayload(
    input: UploadRunLogsRequest,
): Record<string, unknown> | undefined {
    if (
        !input.passgradWorkflowId ||
    !input.passgradEventId ||
    !input.passgradTriggerKind
    ) {
        return undefined
    }
    const status =
    input.status === FlowRunStatus.PAUSED
        ? 'waiting'
        : input.status === FlowRunStatus.SUCCEEDED
            ? 'succeeded'
            : input.status === FlowRunStatus.CANCELED
                ? 'cancelled'
                : isFlowRunStateTerminal({
                    status: input.status,
                    ignoreInternalError: false,
                })
                    ? 'failed'
                    : input.status === FlowRunStatus.QUEUED
                        ? 'pending'
                        : 'running'
    return {
        apRunId: input.runId,
        eventId: input.passgradEventId,
        apEventSequence: getPassgradEventSequence(input.status),
        finishedAt: input.finishTime ?? null,
        safeFailureSummary: input.internalError?.message ?? null,
        result: null,
        sourceSubmissionId: input.passgradSourceSubmissionId ?? null,
        startedAt: input.startTime ?? null,
        status,
        triggerKind: input.passgradTriggerKind,
        type: 'workflow.run.projection.v1',
        workflowId: input.passgradWorkflowId,
    }
}

function getPassgradEventSequence(status: FlowRunStatus): number {
    if (status === FlowRunStatus.QUEUED) return 1
    if (status === FlowRunStatus.RUNNING) return 2
    if (status === FlowRunStatus.PAUSED) return 3
    return 4
}

async function markParentRunAsFailed({
    parentRunId,
    childRunId,
    projectId,
    log,
}: MarkParentRunAsFailedParams): Promise<void> {
    const flowRun = await flowRunRepo().findOneBy({
        id: parentRunId,
    })

    if (
        isNil(flowRun) ||
    isFlowRunStateTerminal({
        status: flowRun.status,
        ignoreInternalError: false,
    })
    ) {
        return
    }

    const childRunUrl = await domainHelper.getPublicUrl({
        path: `/projects/${projectId}/runs/${childRunId}`,
    })
    const errorPayload = {
        body: {
            status: 'error',
            data: {
                message: 'Subflow execution failed',
                link: childRunUrl,
            },
        },
        headers: {},
        queryParams: {},
    }

    const existingWaitpoint = await waitpointService(log).getByFlowRunId(
        parentRunId,
    )
    const result = await waitpointService(log).complete({
        flowRunId: parentRunId,
        projectId: flowRun.projectId,
        waitpointId: existingWaitpoint?.id ?? apId(),
        resumePayload: errorPayload,
    })

    if (result.completedExisting && !isNil(result.waitpoint)) {
        await resumeService(log).resumeFromWaitpoint({
            flowRunId: parentRunId,
            waitpointId: result.waitpoint.id,
            resumePayload: result.waitpoint.resumePayload,
        })
    }
}

type MarkParentRunAsFailedParams = {
    parentRunId: string
    childRunId: string
    projectId: string
    log: FastifyBaseLogger
}
