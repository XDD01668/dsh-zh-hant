/*!
 * dsh-zh-hant v0.1.0
 * Invertible Simplified -> Hong Kong Traditional DOM transformer for DeepSeek Harness.
 * Includes opencc-js 1.4.2 (MIT AND Apache-2.0) and OpenCC dictionary data (Apache-2.0).
 * https://github.com/nk2028/opencc-js  |  https://github.com/BYVoid/OpenCC
 * Full license texts: THIRD_PARTY_LICENSES.md and LICENSES/.
 */
(function () {
  var MODULE_ID = '@local/dsh-zh-hant';
  var VERSION = '0.1.0';
  var STORAGE_KEY = 'dsh-zh-hant:enabled';

  // ---------------------------------------------------------------------------
  // Vendored opencc-js UMD (s2hk). The build script replaces the marker with
  // vendor/opencc.cn2t.umd.cjs. This capture gives the UMD a CommonJS
  // `module`/`exports` pair without leaking to window.
  // ---------------------------------------------------------------------------
  var OpenCC = (function () {
    var module = { exports: {} };
    (function (module, exports) {
/*__OPENCC_UMD__*/
    })(module, module.exports);
    return module.exports;
  })();

  var TEXT_SKIP = [
    'pre', 'code', 'kbd', 'samp', 'textarea', 'input', 'script', 'style',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="textbox"]',
    '[data-zh-hant-ignore]',
    '.monaco-editor', '.xterm', '.cm-editor'
  ].join(', ');

  var ATTR_SKIP = 'script, style, [data-zh-hant-ignore]';
  var ATTRS = [
    'title', 'aria-label', 'aria-description', 'aria-placeholder',
    'placeholder', 'alt', 'aria-valuetext'
  ];
  var VALUE_TYPES = { button: true, submit: true, reset: true };

  var ZH = {
    title: '繁體中文轉換',
    description: '將介面與對話內容中的簡體中文轉為繁體（香港字形），可隨時還原。',
    preparing: '正在準備轉換引擎…',
    turnOn: '啟用繁體中文轉換',
    turnOff: '停用繁體中文轉換',
    enabled: '已啟用',
    disabled: '已停用'
  };

  var EN = {
    title: 'Traditional Chinese conversion',
    description: 'Converts visible Simplified Chinese in the DSH interface to Hong Kong Traditional Chinese. Reversible at any time.',
    preparing: 'Preparing the conversion engine…',
    turnOn: 'Enable Traditional Chinese conversion',
    turnOff: 'Disable Traditional Chinese conversion',
    enabled: 'Enabled',
    disabled: 'Disabled'
  };

  function createSignal(initial) {
    var value = initial;
    var listeners = new Set();
    return {
      get: function () { return value; },
      set: function (next) {
        if (next === value) return;
        value = next;
        listeners.forEach(function (listener) {
          try { listener(); } catch (error) { /* one bad listener must not break others */ }
        });
      },
      subscribe: function (listener) {
        listeners.add(listener);
        return function () { listeners.delete(listener); };
      }
    };
  }

  function readInitialEnabled(urlMode) {
    if (urlMode === '0' || urlMode === 'off' || urlMode === 'false') return false;
    if (urlMode === '1' || urlMode === 'on' || urlMode === 'true') return true;
    if (urlMode === 'selftest' || urlMode === 'audit') return true;
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '0') return false;
      if (stored === '1') return true;
    } catch (error) { /* storage may be unavailable */ }
    return true;
  }

  function createPrefStore(initial) {
    var signal = createSignal(initial);
    return {
      get: signal.get,
      subscribe: signal.subscribe,
      set: function (next) {
        next = !!next;
        if (next === signal.get()) return;
        signal.set(next);
        try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch (error) { /* ignore */ }
      },
      setExternal: function (next) {
        next = !!next;
        if (next === signal.get()) return;
        signal.set(next);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // DOM engine. One instance per observed root. Every write stores the exact
  // pre-write string; disable() restores only while the current value is still
  // the value this engine wrote. No reverse conversion is ever performed.
  // ---------------------------------------------------------------------------
  function createEngine(options) {
    var convert = options.convert;
    var root = options.root || document.documentElement;
    var textRecords = new WeakMap();
    var attrRecords = new WeakMap();
    var observer = null;
    var active = false;
    var writes = 0;
    var failures = 0;
    var warned = false;
    var pendingTexts = new Set();

    function parentElementOf(node) {
      if (!node) return null;
      if (node.nodeType === 1) return node;
      return node.parentElement || null;
    }

    function isTextSkipped(node) {
      var element = parentElementOf(node);
      return !!(element && element.closest && element.closest(TEXT_SKIP));
    }

    function isAttrSkipped(node) {
      var element = parentElementOf(node);
      return !!(element && element.closest && element.closest(ATTR_SKIP));
    }

    function safeConvert(text) {
      try {
        return convert(text);
      } catch (error) {
        failures += 1;
        if (!warned) {
          warned = true;
          console.error('[dsh-zh-hant] conversion failed; leaving text unchanged', error);
        }
        return text;
      }
    }

    function preview(text) {
      return text.length > 120 ? text.slice(0, 117) + '...' : text;
    }

    // Reports text that still changes when converted. Used by the opt-in
    // ?zh-hant=audit mode to find gaps without writing anything to the page.
    function audit() {
      var hits = [];
      function considerText(node) {
        if (!node.data || isTextSkipped(node)) return;
        var out = safeConvert(node.data);
        if (out === node.data) return;
        hits.push({
          kind: 'text',
          parent: node.parentElement ? node.parentElement.tagName : '',
          value: preview(node.data),
          converted: preview(out)
        });
      }
      function considerAttr(element, name) {
        var current = element.getAttribute(name);
        if (current === null || current === '') return;
        var out = safeConvert(current);
        if (out === current) return;
        hits.push({
          kind: 'attr',
          name: name,
          parent: element.tagName,
          value: preview(current),
          converted: preview(out)
        });
      }
      function considerElement(element) {
        if (!element.hasAttributes || !element.hasAttributes() || isAttrSkipped(element)) return;
        for (var i = 0; i < ATTRS.length; i += 1) considerAttr(element, ATTRS[i]);
        if (element.tagName === 'INPUT') {
          var type = (element.getAttribute('type') || '').toLowerCase();
          if (VALUE_TYPES[type]) considerAttr(element, 'value');
        }
      }
      if (!root) return { hits: hits, count: 0, truncated: false };
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
      var current;
      while ((current = walker.nextNode())) {
        if (current.nodeType === 3) considerText(current);
        else if (current.nodeType === 1) considerElement(current);
      }
      var truncated = hits.length > 80;
      return { hits: hits.slice(0, 80), count: hits.length, truncated: truncated };
    }

    function convertText(node) {
      if (!node || node.nodeType !== 3) return;
      if (isTextSkipped(node)) return;
      var record = textRecords.get(node);
      var current = node.data;
      if (record && current === record.out) return;
      var out = safeConvert(current);
      if (out === current) {
        textRecords.delete(node);
        return;
      }
      textRecords.set(node, { src: current, out: out });
      node.data = out;
      writes += 1;
    }

    function convertAttr(element, name) {
      if (!element || element.nodeType !== 1) return;
      if (isAttrSkipped(element)) return;
      if (name === 'value') {
        if (element.tagName !== 'INPUT') return;
        var type = (element.getAttribute('type') || '').toLowerCase();
        if (!VALUE_TYPES[type]) return;
      } else if (ATTRS.indexOf(name) === -1) {
        return;
      }
      var current = element.getAttribute(name);
      if (current === null) {
        var stale = attrRecords.get(element);
        if (stale) {
          delete stale[name];
          if (Object.keys(stale).length === 0) attrRecords.delete(element);
        }
        return;
      }
      var map = attrRecords.get(element);
      var record = map && map[name];
      if (record && current === record.out) return;
      var out = safeConvert(current);
      if (out === current) {
        if (map) {
          delete map[name];
          if (Object.keys(map).length === 0) attrRecords.delete(element);
        }
        return;
      }
      if (!map) {
        map = Object.create(null);
        attrRecords.set(element, map);
      }
      map[name] = { src: current, out: out };
      element.setAttribute(name, out);
      writes += 1;
    }

    function convertAttrs(element) {
      if (!element.hasAttributes || !element.hasAttributes()) return;
      for (var i = 0; i < ATTRS.length; i += 1) convertAttr(element, ATTRS[i]);
      if (element.tagName === 'INPUT') {
        var type = (element.getAttribute('type') || '').toLowerCase();
        if (VALUE_TYPES[type]) convertAttr(element, 'value');
      }
    }

    function scan(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        convertText(node);
        return;
      }
      if (node.nodeType !== 1) return;
      convertAttrs(node);
      var walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
      var current;
      while ((current = walker.nextNode())) {
        if (current.nodeType === 3) convertText(current);
        else convertAttrs(current);
      }
    }

    function flushTexts() {
      if (pendingTexts.size === 0) return;
      var nodes = Array.from(pendingTexts);
      pendingTexts.clear();
      for (var i = 0; i < nodes.length; i += 1) convertText(nodes[i]);
    }

    function onMutations(records) {
      if (!active) return;
      try {
        for (var i = 0; i < records.length; i += 1) {
          var record = records[i];
          if (record.type === 'characterData') {
            if (!isTextSkipped(record.target)) pendingTexts.add(record.target);
          } else if (record.type === 'attributes') {
            if (!isAttrSkipped(record.target)) convertAttr(record.target, record.attributeName);
          } else if (record.type === 'childList') {
            var removed = record.removedNodes;
            for (var k = 0; k < removed.length; k += 1) restoreSubtree(removed[k]);
            var added = record.addedNodes;
            for (var j = 0; j < added.length; j += 1) scan(added[j]);
          }
        }
        flushTexts();
      } catch (error) {
        failures += 1;
        if (!warned) {
          warned = true;
          console.error('[dsh-zh-hant] mutation handling failed; keeping DOM stable', error);
        }
      }
    }

    function restoreText(node) {
      var record = textRecords.get(node);
      if (!record) return;
      if (node.data === record.out) node.data = record.src;
      textRecords.delete(node);
    }

    function restoreAttrs(element) {
      var map = attrRecords.get(element);
      if (!map) return;
      Object.keys(map).forEach(function (name) {
        var record = map[name];
        if (element.getAttribute(name) === record.out) element.setAttribute(name, record.src);
      });
      attrRecords.delete(element);
    }

    function restoreSubtree(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        restoreText(node);
        return;
      }
      if (node.nodeType !== 1) return;
      restoreAttrs(node);
      var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
      var current;
      while ((current = walker.nextNode())) {
        if (current.nodeType === 3) restoreText(current);
        else if (current.nodeType === 1) restoreAttrs(current);
      }
    }

    function restoreAll() {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
      var current;
      while ((current = walker.nextNode())) {
        if (current.nodeType === 3) restoreText(current);
        else if (current.nodeType === 1) restoreAttrs(current);
      }
      if (root.nodeType === 3) restoreText(root);
      else if (root.nodeType === 1) restoreAttrs(root);
      textRecords = new WeakMap();
      attrRecords = new WeakMap();
    }

    function enable() {
      if (active) return;
      active = true;
      writes = 0;
      failures = 0;
      warned = false;
      try {
        observer = new MutationObserver(onMutations);
        observer.observe(root, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ATTRS.concat(['value'])
        });
      } catch (error) {
        active = false;
        observer = null;
        throw error;
      }
      scan(root);
    }

    function disable() {
      if (!active) return;
      active = false;
      pendingTexts.clear();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      restoreAll();
    }

    function dispose() {
      disable();
      root = null;
    }

    return {
      enable: enable,
      disable: disable,
      dispose: dispose,
      isEnabled: function () { return active; },
      stats: function () { return { enabled: active, writes: writes, failures: failures }; },
      audit: audit
    };
  }

  // ---------------------------------------------------------------------------
  // Root path of the module loader. Everything else lives inside apply() so
  // factories stay side-effect free until the loader mounts the plugin.
  // ---------------------------------------------------------------------------
  var load = window.__ModuleLoader__;
  if (!load || typeof load.load !== 'function') {
    console.error('[dsh-zh-hant] __ModuleLoader__ is unavailable; plugin not loaded');
    return;
  }

  load.load({
    id: MODULE_ID,
    factory: function (require) {
      'use strict';
      var React = require('react');
      var module = { exports: {} };
      var exports = module.exports;

      function useStoreValue(store) {
        var state = React.useState(store.get());
        React.useEffect(function () {
          var unsubscribe = store.subscribe(function () { state[1](store.get()); });
          state[1](store.get());
          return unsubscribe;
        }, [store]);
        return state[0];
      }

      function Switch(props) {
        var checked = !!props.checked;
        return React.createElement('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          'aria-labelledby': props.labelledBy,
          'aria-label': props.label,
          onClick: function () { props.onChange(!checked); },
          style: {
            position: 'relative',
            flex: '0 0 auto',
            width: 40,
            height: 22,
            padding: 0,
            border: 'none',
            borderRadius: 11,
            cursor: 'pointer',
            background: checked
              ? 'var(--dsw-alias-brand-primary, #4f46e5)'
              : 'var(--dsw-alias-bg-layer-2, #d1d5db)',
            transition: 'background 140ms ease'
          }
        }, React.createElement('span', {
          'aria-hidden': 'true',
          style: {
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.28)',
            transition: 'left 140ms ease'
          }
        }));
      }

      function apply(ctx) {
        var existing = window.__dshZhHant;
        if (existing && typeof existing.dispose === 'function') {
          try { existing.dispose(); } catch (error) { /* stale instance */ }
        }

        var query = null;
        try { query = new URLSearchParams(window.location.search); } catch (error) { /* ignore */ }
        var urlMode = query ? query.get('zh-hant') : null;
        var selftestMode = urlMode === 'selftest';
        var auditMode = urlMode === 'audit';

        var disposed = false;
        var readyResolve;
        var ready = new Promise(function (resolve) { readyResolve = resolve; });
        var readySignal = createSignal(false);
        var converter = null;

        function convert(text) {
          if (!converter) converter = OpenCC.Converter({ from: 'cn', to: 'hk' });
          return converter(text);
        }

        var store = createPrefStore(readInitialEnabled(urlMode));
        var engine = createEngine({ convert: convert, root: document.documentElement });

        function translate(key) {
          try {
            var bound = ctx.locale.bind('zh-hant');
            var value = bound(key);
            if (value) return value;
          } catch (error) { /* fall through */ }
          return ZH[key] || EN[key] || key;
        }

        function useLocale() {
          var tick = React.useState(0);
          React.useEffect(function () {
            return ctx.locale.subscribe(function () {
              tick[1](function (value) { return value + 1; });
            });
          }, []);
          return translate;
        }

        function Row() {
          var t = useLocale();
          var enabled = useStoreValue(store);
          var isReady = useStoreValue(readySignal);
          var titleId = (React.useId || function () { return 'zh-hant-title'; })();
          return React.createElement('div', {
            'data-zh-hant-ignore': '',
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: '10px 0'
            }
          }, React.createElement('div', { style: { minWidth: 0 } },
            React.createElement('div', {
              id: titleId,
              style: {
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--dsw-alias-label-primary, #111827)'
              }
            }, t('title')),
            React.createElement('div', {
              style: {
                marginTop: 2,
                fontSize: 12,
                lineHeight: 1.45,
                color: 'var(--dsw-alias-label-secondary, #6b7280)'
              }
            }, isReady ? t('description') : t('preparing'))
          ), React.createElement(Switch, {
            checked: enabled,
            labelledBy: titleId,
            label: enabled ? t('turnOff') : t('turnOn'),
            onChange: function (next) { store.set(next); }
          }));
        }

        function initConverter() {
          if (disposed) {
            readyResolve();
            return;
          }
          try {
            convert('');
          } catch (error) {
            console.error('[dsh-zh-hant] failed to build the OpenCC converter', error);
          }
          readySignal.set(true);
          readyResolve();
          if (selftestMode) {
            setTimeout(function () {
              runSelfTest().then(function (result) {
                console.info('[dsh-zh-hant] selfTest ' + JSON.stringify(result));
                if (!result.pass) console.error('[dsh-zh-hant] selfTest failed', result);
              }).catch(function (error) {
                console.error('[dsh-zh-hant] selfTest crashed', error);
              });
            }, 0);
          }
          if (auditMode) {
            setTimeout(function () {
              try {
                var report = api.audit();
                console.info('[dsh-zh-hant] audit ' + JSON.stringify(report));
              } catch (error) {
                console.error('[dsh-zh-hant] audit crashed', error);
              }
            }, 700);
          }
        }

        function sync() {
          var generation = (sync.generation = (sync.generation || 0) + 1);
          if (disposed) return;
          if (!store.get()) {
            try { engine.disable(); } catch (error) { /* ignore */ }
            return;
          }
          ready.then(function () {
            if (disposed || generation !== sync.generation) return;
            if (!store.get()) {
              try { engine.disable(); } catch (error) { /* ignore */ }
              return;
            }
            try { engine.enable(); } catch (error) {
              console.error('[dsh-zh-hant] could not enable DOM conversion', error);
            }
          });
        }

        function onStorage(event) {
          if (event.key !== STORAGE_KEY) return;
          store.setExternal(event.newValue !== '0');
        }

        function runSelfTest() {
          return ready.then(function () {
            var cases = [];
            function check(name, got, want) {
              cases.push({ name: name, pass: got === want, got: got, want: want });
            }
            var host = document.createElement('div');
            host.innerHTML = [
              '<p data-case="text">新建会话</p>',
              '<p data-case="title" title="设置">English 123</p>',
              '<pre data-case="code"><code>简体</code></pre>',
              '<textarea data-case="textarea">简体</textarea>',
              '<input data-case="input" value="简体">',
              '<p data-case="aria" aria-label="删除">x</p>',
              '<a data-case="link" href="https://example.com/设置" data-x="简体" title="设置">链接</a>',
              '<p data-case="ignore" data-zh-hant-ignore>设置</p>',
              '<p data-case="mixed">已经繁體 😀 123</p>'
            ].join('');
            var pristine = host.cloneNode(true);
            var testEngine = createEngine({ convert: convert, root: host });
            try {
              testEngine.enable();
              check('text', host.querySelector('[data-case="text"]').textContent, '新建會話');
              var title = host.querySelector('[data-case="title"]');
              check('title.text', title.textContent, 'English 123');
              check('title.attr', title.getAttribute('title'), '設置');
              check('code', host.querySelector('[data-case="code"]').textContent, '简体');
              check('textarea', host.querySelector('[data-case="textarea"]').textContent, '简体');
              check('input', host.querySelector('[data-case="input"]').getAttribute('value'), '简体');
              check('aria', host.querySelector('[data-case="aria"]').getAttribute('aria-label'), '刪除');
              var link = host.querySelector('[data-case="link"]');
              check('link.text', link.textContent, '鏈接');
              check('link.title', link.getAttribute('title'), '設置');
              check('link.href', link.getAttribute('href'), 'https://example.com/设置');
              check('link.data', link.getAttribute('data-x'), '简体');
              check('ignore', host.querySelector('[data-case="ignore"]').textContent, '设置');
              check('mixed', host.querySelector('[data-case="mixed"]').textContent, '已經繁體 😀 123');

              var added = document.createElement('p');
              added.textContent = '任务';
              host.appendChild(added);
              return new Promise(function (resolve) {
                setTimeout(function () {
                  check('observer', added.textContent, '任務');
                  host.removeChild(added);
                  testEngine.disable();
                  testEngine.dispose();
                  var restored = host.isEqualNode(pristine);
                  check('restore', restored, true);
                  resolve({
                    pass: cases.every(function (item) { return item.pass; }),
                    cases: cases,
                    restored: restored
                  });
                }, 0);
              });
            } catch (error) {
              try { testEngine.dispose(); } catch (ignored) { /* ignore */ }
              cases.push({ name: 'exception', pass: false, got: String(error), want: 'no exception' });
              return { pass: false, cases: cases, restored: false };
            }
          });
        }

        function dispose() {
          if (disposed) return;
          disposed = true;
          try { window.removeEventListener('storage', onStorage); } catch (error) { /* ignore */ }
          try { engine.dispose(); } catch (error) { /* ignore */ }
          if (window.__dshZhHant === api) {
            try { delete window.__dshZhHant; } catch (error) { window.__dshZhHant = null; }
          }
        }

        var api = {
          version: VERSION,
          enable: function () { if (!disposed) store.set(true); },
          disable: function () { if (!disposed) store.set(false); },
          toggle: function () { if (!disposed) store.set(!store.get()); },
          isEnabled: function () { return store.get(); },
          isReady: function () { return readySignal.get(); },
          stats: function () {
            var state = engine.stats();
            return {
              enabled: state.enabled,
              ready: readySignal.get(),
              writes: state.writes,
              failures: state.failures,
              mode: 's2hk'
            };
          },
          selfTest: function () { return runSelfTest(); },
          audit: function () { return engine.audit(); },
          dispose: dispose
        };

        ctx.effect(function () {
          var disposers = [];
          try { disposers.push(ctx.locale.register('zh-hant', 'zh', ZH)); } catch (error) {
            console.warn('[dsh-zh-hant] could not register the zh dictionary', error);
          }
          try { disposers.push(ctx.locale.register('zh-hant', 'en', EN)); } catch (error) {
            console.warn('[dsh-zh-hant] could not register the en dictionary', error);
          }
          return function () {
            disposers.forEach(function (disposeDictionary) {
              try { disposeDictionary(); } catch (error) { /* ignore */ }
            });
          };
        }, 'dsh-zh-hant: locale dictionaries');

        ctx.effect(function () {
          return ctx.slots.inject('settings.general.item', function () {
            return ctx.slots.register({
              name: 'settings.general.item',
              id: 'zh-hant',
              order: 12
            }, Row);
          });
        }, 'dsh-zh-hant: settings row');

        ctx.effect(function () {
          var unsubscribe = store.subscribe(sync);
          window.addEventListener('storage', onStorage);
          sync();
          return function () {
            try { unsubscribe(); } catch (error) { /* ignore */ }
            dispose();
          };
        }, 'dsh-zh-hant: engine lifecycle');

        window.__dshZhHant = api;

        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(initConverter, { timeout: 800 });
        } else {
          window.setTimeout(initConverter, 50);
        }
      }

      exports.inject = ['slots', 'locale'];
      exports.apply = apply;
      return module.exports;
    }
  });
})();
