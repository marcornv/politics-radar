/**
 * Reads JSON a model is still writing: closes the open string, arrays and objects and parses what is there.
 * Returns null while there is no object yet, or when the cut falls somewhere it can't be closed (an escape,
 * a half-written number); the next delta usually fixes it. Safe in the browser.
 */
export function lerParcial<T extends object>(texto: string): Partial<T> | null {
  // Same cleanup as `ler_json` in ia/radar_ia/provedores.py, also for a <think> block still open.
  const limpo = texto.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/```(?:json)?/g, "");
  const i = limpo.indexOf("{");
  if (i < 0) return null;
  let base = limpo.slice(i);

  const abertos: string[] = [];
  let naString = false;
  let escape = false;
  for (const c of base) {
    if (naString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') naString = false;
    } else if (c === '"') naString = true;
    else if (c === "{") abertos.push("}");
    else if (c === "[") abertos.push("]");
    else if (c === "}" || c === "]") abertos.pop();
  }
  if (escape) base = base.slice(0, -1);
  if (naString) base += '"';
  const fecho = abertos.reverse().join("");

  // As is; without a trailing comma; without a key that has no value yet.
  for (const tentativa of [base, base.replace(/,\s*$/, ""), base.replace(/,?\s*"[^"]*"\s*:?\s*$/, "")]) {
    try {
      const v: unknown = JSON.parse(tentativa + fecho);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<T>) : null;
    } catch {
      // try the next cut
    }
  }
  return null;
}
