/** Must run before any module that reads `window` at import time (e.g. executor-telemetry). */
import { installNodeDomShim } from "./install-node-dom-shim";

installNodeDomShim();
