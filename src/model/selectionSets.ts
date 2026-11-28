/** Stable intersection: absent restrictions keep the input set; an empty restriction removes it. */
export function intersectById<T extends {id:string}>(candidates:readonly T[],restrictions:readonly (readonly {id:string}[])[]):T[] {
 const sets=restrictions.map(values=>new Set(values.map(value=>value.id)));
 return candidates.filter(candidate=>sets.every(ids=>ids.has(candidate.id)));
}
