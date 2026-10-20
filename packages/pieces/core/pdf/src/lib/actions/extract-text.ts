import { createAction, Property } from '@activepieces/pieces-framework';
import { extractText as pdfExtractText, getDocumentProxy } from 'unpdf';

export const extractText = createAction({
  audience: 'human',
  name: 'extractText',
  displayName: 'Extract Text',
  description: 'Extract text from PDF file or url',
  props: {
    file: Property.File({
      displayName: 'PDF File or URL',
      required: true,
    }),
  },
  errorHandlingOptions: {
    continueOnFailure: {
      defaultValue: false,
    },
    retryOnFailure: {
      hide: true
    },
  },
  async run(context) {
    const file = context.propsValue.file;
    // `file.data` is a Node Buffer, whose `.buffer` is a pooled ArrayBuffer shared with other
    // allocations. Passing that buffer to pdf.js makes it hand a non-transferable buffer to its
    // worker, which fails with DataCloneError (and would include unrelated bytes anyway). Copy the
    // view so pdf.js owns exactly this document's bytes.
    const bytes = new Uint8Array(file.data);
    const pdf = await getDocumentProxy(bytes);
    const { text } = await pdfExtractText(pdf, { mergePages: true });
    return text;
  },
});
