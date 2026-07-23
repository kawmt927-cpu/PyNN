/** 服务端/客户端首次渲染可复现的序号 key（避免 Math.random 导致 hydration mismatch） */
let seq = 0;

export function nextClientKey(prefix = "k"): string {
  seq += 1;
  return `${prefix}-${seq}`;
}
