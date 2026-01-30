export type Commit = {
  id: string;
  parents: string[]; // 0~n 个父节点（merge 就是 >1）
  message: string;
  author?: string;
  date?: string;
};

type NodeLayout = { id: string; lane: number; row: number };
type EdgeLayout = { from: string; to: string };

export function layoutCommits(commits: Commit[]) {
  const lanes: (string | null)[] = [];
  const nodes: NodeLayout[] = [];
  const idToRow = new Map<string, number>();

  for (let row = 0; row < commits.length; row++) {
    const c = commits[row];
    idToRow.set(c.id, row);

    // 找到该 commit 在哪个 lane 上；找不到就开新 lane
    let lane = lanes.indexOf(c.id);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(c.id);
    }

    nodes.push({ id: c.id, lane, row });

    const [p0, ...rest] = c.parents;

    // 当前 lane 往下接第一个 parent
    lanes[lane] = p0 ?? null;

    // 其余 parent（merge）插入新 lane（粗略模拟 git graph）
    let insertAt = lane + 1;
    for (const p of rest) {
      lanes.splice(insertAt, 0, p);
      insertAt++;
    }

    // 去掉末尾空 lane，避免无限增长
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
  }

  // 边：commit -> parent
  const edges: EdgeLayout[] = [];
  for (const c of commits) {
    for (const p of c.parents) {
      if (idToRow.has(p)) edges.push({ from: c.id, to: p });
    }
  }

  const idToLane = new Map(nodes.map((n) => [n.id, n.lane] as const));
  const laneCount = Math.max(0, ...nodes.map((n) => n.lane)) + 1;

  return { nodes, edges, idToRow, idToLane, laneCount };
}
