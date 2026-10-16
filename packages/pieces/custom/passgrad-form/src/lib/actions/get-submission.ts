import { createAction, Property } from "@activepieces/pieces-framework";
import { formIdProperty, passgradRequest } from "../common";

/**
 * Action: Get Submission
 *
 * Retrieves a specific form submission by ID.
 * Useful as a mid-flow step to read submitted data from a previous
 * form trigger, or to verify submission status.
 */
export const getSubmission = createAction({
  name: "get_submission",
  displayName: "Get Submission",
  description: "Retrieve a specific form submission by its ID.",
  // Safe to repeat (read-only, or replay-safe by occurrence): a transient failure is retried by the
  // engine, a permanent one (a refused request) is not. Not the builder's to set, so no switch.
  errorHandlingOptions: {
    continueOnFailure: { hide: true, defaultValue: false },
    retryOnFailure: { hide: true, defaultValue: true },
  },
  props: {
    form_id: formIdProperty,
    submission_id: Property.ShortText({
      displayName: "Submission ID",
      description: "The ID of the submission to retrieve",
      required: true,
    }),
  },
  async run(context) {
    const { form_id, submission_id } = context.propsValue;

    const response = await passgradRequest<{
      data: {
        data: Record<string, unknown>;
        formId: string;
        formVersionId: string;
        id: string;
        submittedAt: string;
        submittedByUserId: string | null;
      };
    }>(context, {
      operation: "form.get-submission",
      payload: { submissionId: submission_id },
      resourceId: form_id,
    });

    return response.data;
  },
});
