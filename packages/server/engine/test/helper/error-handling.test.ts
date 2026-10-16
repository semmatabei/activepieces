import { FlowRunStatus } from '@activepieces/shared'
import { FlowExecutorContext } from '../../src/lib/handler/context/flow-execution-context'
import { applyDeclaredRetry, runWithExponentialBackoff } from '../../src/lib/helper/error-handling'
import { buildCodeAction, generateMockEngineConstants } from '../handler/test-helper'

describe('runWithExponentialBackoff', () => {
    const executionState = FlowExecutorContext.empty()
    const action = buildCodeAction({
        name: 'runtime',
        input: {},
        errorHandlingOptions: {
            continueOnFailure: {
                value: false,
            },
            retryOnFailure: {
                value: true,
            },
        },
    })
    const constants = generateMockEngineConstants()
    const requestFunction = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterAll(() => {
        vi.clearAllMocks()
    })

    it('should return resultExecutionState when verdict is not FAILED', async () => {
        const resultExecutionState = FlowExecutorContext.empty().setVerdict({
            status: FlowRunStatus.SUCCEEDED,
            stopResponse: undefined,
        })
        requestFunction.mockResolvedValue(resultExecutionState)

        const output = await runWithExponentialBackoff(executionState, action, constants, requestFunction)

        expect(output).toEqual(resultExecutionState)
        expect(requestFunction).toHaveBeenCalledWith({ action, executionState, constants })
    })


    it('should retry and return resultExecutionState when verdict is FAILED and retry is enabled', async () => {
        const resultExecutionState = FlowExecutorContext.empty().setVerdict({
            status: FlowRunStatus.FAILED,
            failedStep: {
                name: 'runtime',
                displayName: 'runtime',
                message: 'Custom Runtime Error',
            },
        })

        requestFunction.mockResolvedValue(resultExecutionState)

        const output = await runWithExponentialBackoff(executionState, action, constants, requestFunction)

        expect(output).toEqual(resultExecutionState)
        // Mock applies for the first attempt and second attempt is a real call which return success
        expect(requestFunction).toHaveBeenCalledTimes(2)
        expect(requestFunction).toHaveBeenCalledWith({ action, executionState, constants })
        expect(requestFunction).toHaveBeenCalledWith({ action, executionState, constants })
    })

    it('should not retry when the failure is marked permanent, even though retry is enabled', async () => {
        const resultExecutionState = FlowExecutorContext.empty().setVerdict({
            status: FlowRunStatus.FAILED,
            failedStep: {
                name: 'runtime',
                displayName: 'runtime',
                message: 'Passgrad capability request failed with status 422',
                permanent: true,
            },
        })

        requestFunction.mockResolvedValue(resultExecutionState)

        const output = await runWithExponentialBackoff(executionState, action, constants, requestFunction)

        expect(output).toEqual(resultExecutionState)
        expect(requestFunction).toHaveBeenCalledTimes(1)
    })

    it('should not retry and return resultExecutionState when verdict is FAILED but retry is disabled', async () => {
        const resultExecutionState = FlowExecutorContext.empty().setVerdict({
            status: FlowRunStatus.FAILED,
            failedStep: {
                name: 'runtime',
                displayName: 'runtime',
                message: 'Custom Runtime Error',
            },
        })

        requestFunction.mockResolvedValue(resultExecutionState)


        const actionWithDisabledRetry = buildCodeAction({
            name: 'runtime',
            input: {},
            errorHandlingOptions: {
                continueOnFailure: {
                    value: false,
                },
                retryOnFailure: {
                    value: false,
                },
            },
        })

        const output = await runWithExponentialBackoff(executionState, actionWithDisabledRetry, constants, requestFunction)

        expect(output).toEqual(resultExecutionState)
        expect(requestFunction).toHaveBeenCalledTimes(1)
        expect(requestFunction).toHaveBeenCalledWith({ action: actionWithDisabledRetry, executionState, constants })

    })

})
describe('applyDeclaredRetry', () => {
    const buildAction = (retry: boolean) => buildCodeAction({
        name: 'runtime',
        input: {},
        errorHandlingOptions: {
            continueOnFailure: { value: false },
            retryOnFailure: { value: retry },
        },
    })

    it('uses the piece default when the switch is hidden, whatever the step stored', () => {
        const action = buildAction(false)
        const applied = applyDeclaredRetry(action, { hide: true, defaultValue: true })
        expect(applied.settings.errorHandlingOptions?.retryOnFailure?.value).toBe(true)
        expect(applied.settings.errorHandlingOptions?.continueOnFailure?.value).toBe(false)
        expect(action.settings.errorHandlingOptions?.retryOnFailure?.value).toBe(false)
    })

    it('leaves the step alone when the switch is visible or nothing is declared', () => {
        const action = buildAction(true)
        expect(applyDeclaredRetry(action, { hide: false, defaultValue: false })).toBe(action)
        expect(applyDeclaredRetry(action, { hide: true })).toBe(action)
        expect(applyDeclaredRetry(action, undefined)).toBe(action)
    })
})
