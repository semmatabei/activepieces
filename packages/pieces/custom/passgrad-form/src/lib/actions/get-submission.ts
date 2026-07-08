import { createAction, Property } from "@activepieces/pieces-framework";
import { passgradAuth, formIdProperty, passgradRequest } from "../common";
import { HttpMethod } from "@activepieces/pieces-common";

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

    const response = await passgradRequest<{
      id: string;
      form_id: string;
      submitted_by: string;
      submitted_at: string;
      data: Record<string, unknown>;
      ap_run_id?: string;
    }>(context.auth, HttpMethod.GET, `/forms/${form_id}/submissions/${submission_id}`);

    return response.body;
  },
});
