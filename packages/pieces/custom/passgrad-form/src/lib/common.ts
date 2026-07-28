import { PieceAuth, Property } from '@activepieces/pieces-framework'

export const passgradAuth = PieceAuth.None()

export const formIdProperty = Property.ShortText({
  displayName: 'Form ID',
  description: 'Passgrad form ID',
  required: true,
})
