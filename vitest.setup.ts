// Every test runs as Windows unless it says otherwise.
//
// The suite has to give the same answer on every host. Node on macOS reports
// `navigator.platform === "darwin"`, which made `isMac()` true and quietly
// changed what chords parse to, how they are written and which line ending a
// new file gets (spec §13a) — three assertions failed on the first macOS CI
// run for that reason alone.
//
// This is set at module scope as well as before each test: setup files run
// before the test file's imports, and `DEFAULTS` in settings.ts and the
// `macOverrides` table in registry.ts are both applied at import time.

import { beforeEach } from "vitest";
import { setMacForTests } from "./src/app/platform";

setMacForTests(false);

beforeEach(() => setMacForTests(false));
