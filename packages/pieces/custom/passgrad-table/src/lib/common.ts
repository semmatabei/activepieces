import { PieceAuth, Property } from '@activepieces/pieces-framework'

export const passgradAuth = PieceAuth.None()

export const tableIdProperty = Property.ShortText({
  displayName: 'Table ID',
  description: 'Passgrad table ID',
  required: true,
})

export const recordFieldsProperty = Property.Json({
  displayName: 'Fields',
  description: 'Record field values keyed by field ID',
  required: true,
})
