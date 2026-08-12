const STACK_EVIDENCE_KEY = "__DIVEBELL_RSTACK_STACK_EVIDENCE__";

export interface RstackStackEvidence {
  schemaVersion: 1;
  dataRspackScriptCount: number;
  hotUpdateScriptCount: number;
  observedAt?: number;
}

export function createRstackStackDetectionInitScript(): string {
  return `(() => {
    const key = ${JSON.stringify(STACK_EVIDENCE_KEY)};
    if (globalThis[key]) return;

    const state = {
      schemaVersion: 1,
      dataRspackScriptCount: 0,
      hotUpdateScriptCount: 0
    };
    Object.defineProperty(globalThis, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: state
    });

    let bootstrapObserver;
    let headObserver;

    const stop = () => {
      bootstrapObserver?.disconnect();
      headObserver?.disconnect();
      globalThis.removeEventListener?.("load", stop);
    };

    const captureScript = (node) => {
      if (
        !node
        || node.nodeType !== 1
        || String(node.tagName).toUpperCase() !== "SCRIPT"
        || typeof node.getAttribute !== "function"
      ) {
        return false;
      }
      const marker = node.getAttribute("data-rspack");
      if (marker === null) return false;
      const source = typeof node.src === "string"
        ? node.src
        : node.getAttribute("src") || "";
      state.dataRspackScriptCount += 1;
      if (/\\.hot-update\\.js(?:[?#]|$)/i.test(source)) {
        state.hotUpdateScriptCount += 1;
      }
      state.observedAt = Date.now();
      stop();
      return true;
    };

    const captureTree = (node) => {
      if (captureScript(node)) return true;
      if (!node || typeof node.querySelectorAll !== "function") return false;
      for (const script of node.querySelectorAll("script[data-rspack]")) {
        if (captureScript(script)) return true;
      }
      return false;
    };

    const captureRecords = (records) => {
      for (const record of records) {
        for (const node of record.addedNodes || []) {
          if (captureTree(node)) return true;
        }
      }
      return false;
    };

    const observeHead = () => {
      const head = document.head;
      if (!head) return false;
      bootstrapObserver?.disconnect();
      for (const script of head.querySelectorAll("script[data-rspack]")) {
        if (captureScript(script)) return true;
      }
      headObserver = new MutationObserver((records) => {
        captureRecords(records);
      });
      headObserver.observe(head, {
        childList: true,
        subtree: false,
        attributes: false
      });
      return true;
    };

    bootstrapObserver = new MutationObserver((records) => {
      if (captureRecords(records)) return;
      observeHead();
    });

    if (!observeHead()) {
      bootstrapObserver.observe(document, {
        childList: true,
        subtree: true,
        attributes: false
      });
    }
    if (document.readyState === "complete") {
      stop();
    } else {
      globalThis.addEventListener?.("load", stop, { once: true });
    }
  })()`;
}

export async function openRstackStackDetection(): Promise<{
  scripts: string[];
}> {
  return { scripts: [createRstackStackDetectionInitScript()] };
}

export function readRstackStackEvidenceExpression(): string {
  return `globalThis[${JSON.stringify(STACK_EVIDENCE_KEY)}] ?? null`;
}
