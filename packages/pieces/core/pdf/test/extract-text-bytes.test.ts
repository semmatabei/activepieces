/// <reference types="vitest/globals" />

import { createMockActionContext } from '@activepieces/pieces-framework';

const unpdf = vi.hoisted(() => ({
  extractText: vi.fn(),
  getDocumentProxy: vi.fn(),
}));

vi.mock('unpdf', () => unpdf);

import { extractText } from '../src/lib/actions/extract-text';

function inlineFile(data: Buffer) {
  return { filename: 'inline.pdf', extension: 'pdf', data };
}

describe('extractText inline file bytes', () => {
  beforeEach(() => {
    unpdf.getDocumentProxy.mockResolvedValue({});
    unpdf.extractText.mockResolvedValue({ text: 'inline pdf text', totalPages: 1 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('passes an exactly-sized transferable Uint8Array to pdf.js', async () => {
    // A Buffer below half the pool size shares the 64 KiB pool ArrayBuffer. pdf.js
    // transfers the view's buffer to its worker, so a pooled buffer fails with the
    // DataCloneError reported in BUG-026.
    const file = Buffer.allocUnsafe(64);
    expect(() => structuredClone(file.buffer, { transfer: [file.buffer] })).toThrow(/unsupported type/);

    const ctx = createMockActionContext({ propsValue: { file: inlineFile(file) } });

    await expect(extractText.run(ctx)).resolves.toBe('inline pdf text');

    const bytes = unpdf.getDocumentProxy.mock.calls[0][0] as Uint8Array;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(bytes)).toBe(false);
    expect(Buffer.from(bytes).equals(file)).toBe(true);
    expect(bytes.buffer).not.toBe(file.buffer);
    expect(bytes.buffer.byteLength).toBe(file.byteLength);
    expect(unpdf.extractText).toHaveBeenCalledWith(expect.anything(), { mergePages: true });
  });

  test('copies only the file view, not the whole pooled buffer', async () => {
    const backing = Buffer.alloc(256, 0x2a);
    const view = backing.subarray(128, 192);

    const ctx = createMockActionContext({ propsValue: { file: inlineFile(view) } });

    await extractText.run(ctx);

    const bytes = unpdf.getDocumentProxy.mock.calls[0][0] as Uint8Array;
    expect(bytes.byteLength).toBe(view.byteLength);
    expect(Buffer.from(bytes).equals(view)).toBe(true);
    // Keep this last: a successful transfer detaches the source ArrayBuffer.
    expect(() => structuredClone(bytes.buffer, { transfer: [bytes.buffer] })).not.toThrow();
  });
});
