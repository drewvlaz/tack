const MS_PER_SECOND = 1000;

export function nowSec(): number {
  return Math.floor(Date.now() / MS_PER_SECOND);
}
