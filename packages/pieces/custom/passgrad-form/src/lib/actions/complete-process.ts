import { randomUUID } from 'node:crypto';

import { createAction, Property } from '@activepieces/pieces-framework';

export const completeProcess = createAction({
  name: 'complete_process',
  displayName: 'Complete Process',
  description:
    'Record the business resolution for the source submission process.',
  props: {
    source_submission_id: Property.ShortText({
      displayName: 'Source Submission ID',
      required: true,
    }),
    resolution: Property.StaticDropdown({
      displayName: 'Resolution',
      required: true,
      options: {
        disabled: false,
        options: [
          { label: 'Approved', value: 'approved' },
          { label: 'Rejected', value: 'rejected' },
          { label: 'Cancelled', value: 'cancelled' },
        ],
      },
    }),
    summary: Property.LongText({ displayName: 'Summary', required: false }),
    data: Property.Json({ displayName: 'Data', required: false }),
  },
  async run(context) {
    const response = await context.passgrad.request<{ data: unknown }>({
      operation: 'workflow.complete-process',
      payload: {
        type: 'workflow.process.completed.v1',
        eventId: randomUUID(),
        sourceSubmissionId: context.propsValue.source_submission_id,
        resolution: context.propsValue.resolution,
        summary: context.propsValue.summary ?? '',
        data: context.propsValue.data ?? {},
      },
    });
    return response.data;
  },
});
