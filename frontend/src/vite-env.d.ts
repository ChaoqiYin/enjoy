// Vite's own types, and the only thing they are here for is the one `?raw`
// import in this repository: `acceptance/plugins.ts` reads the example plugin's
// interface as text, so that the interface a walkthrough mounts is the plugin
// that ships rather than a second copy of it. Everything else this project
// imports is a module Vite resolves normally.
/// <reference types="vite/client" />
