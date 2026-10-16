import { CodeAction, FlowRunStatus, isNil, PieceAction } from '@activepieces/shared'
import { EngineConstants } from '../handler/context/engine-constants'
import {  FlowExecutorContext } from '../handler/context/flow-execution-context'

export async function runWithExponentialBackoff<T extends CodeAction | PieceAction>(
    executionState: FlowExecutorContext,
    action: T,
    constants: EngineConstants,
    requestFunction: RequestFunction<T>,
    attemptCount = 1,
): Promise<FlowExecutorContext> {
    const resultExecutionState = await requestFunction({ action, executionState, constants })
    const retryEnabled = action.settings.errorHandlingOptions?.retryOnFailure?.value
    if (
        executionFailedWithRetryableError(resultExecutionState) &&
        attemptCount < constants.retryConstants.maxAttempts &&
        retryEnabled &&
        isNil(constants.stepNameToTest)
    ) {
        const backoffTime = Math.pow(constants.retryConstants.retryExponential, attemptCount) * constants.retryConstants.retryInterval
        await new Promise(resolve => setTimeout(resolve, backoffTime))
        return runWithExponentialBackoff(executionState, action, constants, requestFunction, attemptCount + 1)
    }

    return resultExecutionState
}

/**
 * What a piece action declares for retry on failure. A hidden switch is not the builder's to set:
 * the piece decides, so its default applies to every step of that action, including steps saved
 * before the piece declared one.
 */
export type DeclaredRetryOption = { hide?: boolean, defaultValue?: boolean } | undefined

export function applyDeclaredRetry<T extends CodeAction | PieceAction>(action: T, declared: DeclaredRetryOption): T {
    if (isNil(declared) || declared.hide !== true || typeof declared.defaultValue !== 'boolean') {
        return action
    }
    return {
        ...action,
        settings: {
            ...action.settings,
            errorHandlingOptions: {
                ...action.settings.errorHandlingOptions,
                retryOnFailure: { value: declared.defaultValue },
            },
        },
    }
}

export async function continueIfFailureHandler(
    executionState: FlowExecutorContext,
    action: CodeAction | PieceAction,
    constants: EngineConstants,
): Promise<FlowExecutorContext> {
    const continueOnFailure = action.settings.errorHandlingOptions?.continueOnFailure?.value

    if (
        executionState.verdict.status === FlowRunStatus.FAILED &&
        continueOnFailure &&
        isNil(constants.stepNameToTest)
    ) {
        return executionState
            .setVerdict({ status: FlowRunStatus.RUNNING })
    }

    return executionState
}


const executionFailedWithRetryableError = (flowExecutorContext: FlowExecutorContext): boolean => {
    const verdict = flowExecutorContext.verdict
    if (verdict.status !== FlowRunStatus.FAILED) {
        return false
    }
    // A failure marked permanent (a rejected request, an invalid value) is not worth repeating.
    return verdict.failedStep?.permanent !== true
}

type Request<T extends CodeAction | PieceAction> = {
    action: T
    executionState: FlowExecutorContext
    constants: EngineConstants
}

type RequestFunction<T extends CodeAction | PieceAction> = (request: Request<T>) => Promise<FlowExecutorContext>

