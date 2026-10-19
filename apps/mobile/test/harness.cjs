const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, mocks = {}, suffix = '') {
  const source = fs.readFileSync(file, 'utf8') + suffix;
  const js = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    URL,
    Response,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    console,
    require: (id) => {
      if (!(id in mocks)) throw new Error(`Unexpected dependency: ${id}`);
      return mocks[id];
    },
  });
  return exports;
}

function hooks() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[i].value,
        (v) => {
          slots[i].value = typeof v === 'function' ? v(slots[i].value) : v;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      slots[i] ??= { current: initial };
      return slots[i];
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: factory(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => {
          slots[i].cleanup = fn();
        });
      }
    },
  };
  return {
    react,
    render(fn) {
      cursor = 0;
      effects = [];
      return fn();
    },
    effects() {
      effects.splice(0).forEach((fn) => fn());
    },
    unmount() {
      slots.forEach((slot) => slot.cleanup?.());
    },
  };
}

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
module.exports = { compile, hooks, jsx, tick, deferred };
