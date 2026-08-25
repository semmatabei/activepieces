import { z } from 'zod';

export const PASSGRAD_PIECE_NAMES = [
  '@activepieces/piece-passgrad-table',
  '@activepieces/piece-passgrad-form',
] as const;

export const PASSGRAD_OPERATION_REGISTRY = {
  'form.list': { pieces: ['@activepieces/piece-passgrad-form'] },
  'table.get-record': { pieces: ['@activepieces/piece-passgrad-table'] },
  'table.get-records-by-ids': { pieces: ['@activepieces/piece-passgrad-table'] },
  'table.create-record': {
    pieces: [
      '@activepieces/piece-passgrad-table',
      '@activepieces/piece-passgrad-form',
    ],
  },
  'table.update-record': { pieces: ['@activepieces/piece-passgrad-table'] },
  'table.create-trigger': { pieces: ['@activepieces/piece-passgrad-table'] },
  'table.delete-trigger': { pieces: ['@activepieces/piece-passgrad-table'] },
  'table.list-records': { pieces: ['@activepieces/piece-passgrad-table'] },
  'table.list': { pieces: ['@activepieces/piece-passgrad-table'] },
  'table.get-fields': { pieces: ['@activepieces/piece-passgrad-table'] },
  'form.get-submission': { pieces: ['@activepieces/piece-passgrad-form'] },
  'form.create-trigger': { pieces: ['@activepieces/piece-passgrad-form'] },
  'form.delete-trigger': { pieces: ['@activepieces/piece-passgrad-form'] },
  'form.list-submissions': { pieces: ['@activepieces/piece-passgrad-form'] },
  'form.open-workflow-session': {
    pieces: ['@activepieces/piece-passgrad-form'],
  },
  'form.project-workflow-run': {
    pieces: ['@activepieces/piece-passgrad-form'],
  },
  'task.open-workflow-approval': {
    pieces: ['@activepieces/piece-passgrad-form'],
  },
  'user.list': { pieces: ['@activepieces/piece-passgrad-form'] },
  'group.list': { pieces: ['@activepieces/piece-passgrad-form'] },
  'workflow.list': { pieces: ['@activepieces/piece-passgrad-form'] },
} as const;

export const PASSGRAD_OPERATION_SCHEMA = z.enum(
  Object.keys(PASSGRAD_OPERATION_REGISTRY) as [
    PassgradOperation,
    ...PassgradOperation[]
  ]
);

export function isPassgradOperationAllowed(
  pieceName: string,
  operation: string
): operation is PassgradOperation {
  const definition =
    PASSGRAD_OPERATION_REGISTRY[operation as PassgradOperation];
  return (
    definition?.pieces.some((allowedPiece) => allowedPiece === pieceName) ??
    false
  );
}

export type PassgradOperation = keyof typeof PASSGRAD_OPERATION_REGISTRY;

export type PassgradPieceName = (typeof PASSGRAD_PIECE_NAMES)[number];
