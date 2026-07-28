import { createAction, Property } from "@activepieces/pieces-framework";
import { passgradAuth, formIdProperty } from "../common";

/**
 * Action: Get Submission
 *
 * Retrieves a specific form submission by ID.
 * Useful as a mid-flow step to read submitted data from a previous
 * form trigger, or to verify submission status.
 */
export const getSubmission = createAction({
  auth: passgradAuth,
  name: "get_submission",
  displayName: "Get Submission",
  description: "Retrieve a specific form submission by its ID.",
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

    const response = await context.passgrad.request<{
      data: {
        data: Record<string, unknown>;
        formId: string;
        formVersionId: string;
        id: string;
        submittedAt: string;
        submittedByUserId: string | null;
      };
    }>({ operation: "form.get-submission", resourceId: form_id, payload: { submissionId: submission_id } });

    return response.data;
  },
});
