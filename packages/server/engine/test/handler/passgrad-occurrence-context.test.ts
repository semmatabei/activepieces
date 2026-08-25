import { FlowRunStatus } from '@activepieces/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowExecutorContext } from '../../src/lib/handler/context/flow-execution-context'
import { flowExecutor } from '../../src/lib/handler/flow-executor'
import { pieceExecutor } from '../../src/lib/handler/piece-executor'
import { buildPieceAction, buildSimpleLoopAction, generateMockEngineConstants } from './test-helper'

type CapturedPassgradCapabilityParams = {
    executionPath?: readonly [string, number][]
}

const capturedCapabilityParams: CapturedPassgradCapabilityParams[] = []

vi.mock('../../src/lib/piece-context/passgrad', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/lib/piece-context/passgrad')>()
    return {
        createPassgradCapability:
            (...args: Parameters<typeof actual.createPassgradCapability>) => {
                capturedCapabilityParams.push({ executionPath: args[0]?.executionPath })
                return actual.createPassgradCapability(...args)
            },
    }
})

describe('passgrad occurrence context', () => {
    beforeEach(() => {
        capturedCapabilityParams.length = 0
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('passes an empty trusted path for non-loop execution', async () => {
        const result = await pieceExecutor.handle({
            action: buildPieceAction({
                name: 'data_mapper',
                pieceName: '@activepieces/piece-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
            executionState: FlowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })

        expect(result.verdict.status).toBe(FlowRunStatus.RUNNING)
        expect(capturedCapabilityParams.length).toBe(1)
        expect(capturedCapabilityParams[0].executionPath).toEqual([])
    })

    it('passes exact per-iteration paths across loop iterations', async () => {
        const result = await flowExecutor.execute({
            action: buildSimpleLoopAction({
                name: 'loop',
                loopItems: '{{ [4,5] }}',
                firstLoopAction: buildPieceAction({
                    name: 'data_mapper',
                    pieceName: '@activepieces/piece-data-mapper',
                    actionName: 'advanced_mapping',
                    input: {
                        mapping: {
                            'key': '{{ 1 }}',
                        },
                    },
                }),
            }),
            executionState: FlowExecutorContext.empty(),
            constants: generateMockEngineConstants({ stepNames: ['loop'] }),
        })

        expect(result.verdict.status).toBe(FlowRunStatus.RUNNING)
        expect(capturedCapabilityParams.map((params) => params.executionPath)).toEqual([
            [['loop', 0]],
            [['loop', 1]],
        ])
    })

    it('preserves nested loop order in trusted paths', async () => {
        const result = await flowExecutor.execute({
            action: buildSimpleLoopAction({
                name: 'outer',
                loopItems: '{{ [1,2] }}',
                firstLoopAction: buildSimpleLoopAction({
                    name: 'inner',
                    loopItems: '{{ ["a","b"] }}',
                    firstLoopAction: buildPieceAction({
                        name: 'data_mapper',
                        pieceName: '@activepieces/piece-data-mapper',
                        actionName: 'advanced_mapping',
                        input: {
                            mapping: {
                                'key': '{{ 1 }}',
                            },
                        },
                    }),
                }),
            }),
            executionState: FlowExecutorContext.empty(),
            constants: generateMockEngineConstants({ stepNames: ['outer', 'inner'] }),
        })

        expect(result.verdict.status).toBe(FlowRunStatus.RUNNING)
        expect(capturedCapabilityParams.map((params) => params.executionPath)).toEqual([
            [['outer', 0], ['inner', 0]],
            [['outer', 0], ['inner', 1]],
            [['outer', 1], ['inner', 0]],
            [['outer', 1], ['inner', 1]],
        ])
    })

    it('reuses the original path across exponential retry of the same execution state', async () => {
        const result = await pieceExecutor.handle({
            action: buildPieceAction({
                name: 'send_http',
                pieceName: '@activepieces/piece-http',
                actionName: 'send_request',
                input: {
                    'method': 'GET',
                    'url': 'https://cloud.activepieces.com/api/v1/asd',
                    'headers': {},
                    'queryParams': {},
                    'body_type': 'none',
                    'body': {},
                },
                errorHandlingOptions: {
                    continueOnFailure: { value: false },
                    retryOnFailure: { value: true },
                },
            }),
            executionState: FlowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })

        expect(result.verdict.status).toBe(FlowRunStatus.FAILED)
        expect(capturedCapabilityParams.length).toBe(2)
        expect(capturedCapabilityParams[0].executionPath).toEqual([])
        expect(capturedCapabilityParams[1].executionPath).toEqual([])
    }, 30000)
})
