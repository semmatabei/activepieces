import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'
import { allowlistMatchedNoPieces, filterPiecesByName, passgradAllowlistFromEnv } from '../../../../src/app/pieces/metadata/utils/passgrad-piece-allowlist'

describe('passgrad piece allowlist', () => {
    let allowlistEnv: string | undefined

    beforeEach(() => {
        allowlistEnv = undefined
        vi.spyOn(system, 'get').mockImplementation((prop) =>
            prop === AppSystemProp.PASSGRAD_PIECES ? allowlistEnv : undefined,
        )
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('trims, drops blanks, and de-duplicates the configured names', () => {
        allowlistEnv = ' crypto , date-helper, ,crypto '
        expect(passgradAllowlistFromEnv()).toEqual(['crypto', 'date-helper'])
    })

    it('treats unset, empty, and whitespace-only lists as no curation', () => {
        expect(passgradAllowlistFromEnv()).toBeNull()

        allowlistEnv = ''
        expect(passgradAllowlistFromEnv()).toBeNull()

        allowlistEnv = '   ,  '
        expect(passgradAllowlistFromEnv()).toBeNull()
    })
})

describe('filterPiecesByName', () => {
    const pieces = [
        { name: '@activepieces/piece-http', version: '0.11.19' },
        { name: '@activepieces/piece-http', version: '0.11.18' },
        { name: '@activepieces/piece-tables', version: '0.2.0' },
    ]

    it('keeps every version of an allowlisted piece', () => {
        expect(filterPiecesByName(pieces, ['@activepieces/piece-http'])).toEqual([
            { name: '@activepieces/piece-http', version: '0.11.19' },
            { name: '@activepieces/piece-http', version: '0.11.18' },
        ])
    })

    it('passes the registry list through when no allowlist is configured', () => {
        expect(filterPiecesByName(pieces, null)).toEqual(pieces)
    })

    it('drops pieces whose names are off the list', () => {
        expect(filterPiecesByName(pieces, ['@activepieces/piece-csv'])).toEqual([])
    })

    it('accepts names written without the piece scope', () => {
        expect(filterPiecesByName(pieces, ['http'])).toEqual([
            { name: '@activepieces/piece-http', version: '0.11.19' },
            { name: '@activepieces/piece-http', version: '0.11.18' },
        ])
    })
})

describe('allowlistMatchedNoPieces', () => {
    it('reports a list that matched nothing, so the sync can refuse to delete', () => {
        expect(allowlistMatchedNoPieces(['crypto', 'http'], [])).toBe(true)
    })

    it('stays quiet once any entry matched', () => {
        expect(allowlistMatchedNoPieces(['http'], [{ name: '@activepieces/piece-http' }])).toBe(false)
    })

    it('stays quiet when no curation is configured', () => {
        expect(allowlistMatchedNoPieces(null, [])).toBe(false)
    })
})
