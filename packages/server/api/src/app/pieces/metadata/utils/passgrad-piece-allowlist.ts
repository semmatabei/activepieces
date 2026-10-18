import { isNil } from '@activepieces/shared'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'

/*
    Passgrad runs a curated piece catalog. `AP_PIECES_SYNC_MODE=PASSGRAD` keeps only the
    pieces named in `AP_PASSGRAD_PIECES` and drops every other official piece, so the
    catalog is re-derived by the scheduled sync instead of being edited by hand.
*/

// An unset or empty list returns null, which callers must read as "no curation configured"
// rather than "curate everything away".
export function passgradAllowlistFromEnv(): string[] | null {
    const raw = system.get<string>(AppSystemProp.PASSGRAD_PIECES)
    const names = (raw ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    return names.length > 0 ? [...new Set(names)] : null
}

const CORE_PIECE_SCOPE = '@activepieces/piece-'

// Registry and database names are scoped (`@activepieces/piece-http`), while the catalog query and
// the environment template read better without the scope. Accept either spelling.
export function canonicalPieceName(name: string): string {
    return name.includes('/') ? name : `${CORE_PIECE_SCOPE}${name}`
}

export function filterPiecesByName<T extends { name: string }>(pieces: T[], allowedNames: string[] | null): T[] {
    if (isNil(allowedNames)) {
        return pieces
    }
    const allowed = new Set(allowedNames.map(canonicalPieceName))
    return pieces.filter((piece) => allowed.has(piece.name))
}

// A list that matches nothing is a configuration mistake to report, not an instruction to empty the
// catalog, so callers must not delete pieces when this is true.
export function allowlistMatchedNoPieces(allowedNames: string[] | null, matchedPieces: unknown[]): boolean {
    return !isNil(allowedNames) && allowedNames.length > 0 && matchedPieces.length === 0
}
