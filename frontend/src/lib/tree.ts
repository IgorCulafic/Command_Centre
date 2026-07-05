import type { Space } from "./api"

/** A space plus its resolved children — the shape the sidebar tree renders. */
export interface SpaceNode extends Space {
  children: SpaceNode[]
}

/**
 * Turn the flat adjacency-list rows from the API into a nested tree.
 * Top-level spaces (no parent, or a parent that isn't present) become roots.
 * Siblings are ordered by `position` at every level.
 */
export function buildSpaceTree(spaces: Space[]): SpaceNode[] {
  const byId = new Map<number, SpaceNode>()
  for (const s of spaces) byId.set(s.id, { ...s, children: [] })

  const roots: SpaceNode[] = []
  for (const node of byId.values()) {
    const parent =
      node.parent_id != null ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRec = (nodes: SpaceNode[]) => {
    nodes.sort((a, b) => a.position - b.position)
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}
