// react-konva 19.0.10 + react-reconciler 0.32.0 bug:
// The reconciler reads `rendererVersion` from the HostConfig ($$$config.rendererVersion),
// but react-konva's ReactKonvaHostConfig.js does NOT export it → undefined → '' → DevTools
// semver parse fails: "Invalid argument not valid semver ('' received)".
//
// Fix: patch the React DevTools global hook's `inject` method so that any renderer
// registering with an empty/missing version gets a fallback. This MUST run before
// react-konva's module evaluates (i.e. import this in a chunk that loads earlier).

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ as
    | { inject?: (...args: unknown[]) => unknown; __konva_patched?: boolean }
    | undefined;

  if (hook?.inject && !hook.__konva_patched) {
    const originalInject = hook.inject;
    hook.__konva_patched = true;
    hook.inject = function (renderer: unknown, ...rest: unknown[]) {
      if (
        renderer &&
        typeof renderer === 'object' &&
        'version' in renderer &&
        !(renderer as { version: unknown }).version
      ) {
        renderer = { ...renderer, version: '19.0.0' };
      }
      return originalInject.call(this, renderer, ...rest);
    };
  }
}

export {};
