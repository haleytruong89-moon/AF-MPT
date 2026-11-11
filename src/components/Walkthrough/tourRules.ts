// Pure rules for the walkthrough (unit-tested; no Firebase imports).

export type DismissReason = 'skip' | 'done' | 'backdrop';

/** Only an explicit Skip / Done marks the tour as seen; a backdrop click just closes it. */
export function dismissMarksSeen(reason: DismissReason): boolean {
  return reason === 'skip' || reason === 'done';
}

/** First visit starts the tour regardless of how many tasks the project has. */
export function shouldCheckAutoStart(args: {
  ready: boolean;
  uid: string | null | undefined;
  localSeen: boolean;
}): boolean {
  return !!args.ready && !!args.uid && !args.localSeen;
}

/** True when the user doc has no tourCompletedAt yet (or no doc at all). */
export function isFirstVisit(userData: { tourCompletedAt?: unknown } | null | undefined): boolean {
  return !userData || userData.tourCompletedAt == null;
}
