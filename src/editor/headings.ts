// Which heading a line sits under. The headings themselves come from the
// read pipeline (`headingsOf`), so both sides agree on the ids; this is only
// the choice, kept apart from the view so it can be tested on its own.

import type { Heading } from "../app/store";

/** The last heading at or above `line`, or null above the first one. */
export function headingAbove(headings: readonly Heading[], line: number): Heading | null {
  let found: Heading | null = null;
  for (const heading of headings) {
    if (heading.line > line) break;
    found = heading;
  }
  return found;
}
