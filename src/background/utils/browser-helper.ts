// src/background/utils/browser-helper.ts

/**
 * Get browser API (Firefox/Chrome compatible)
 */
export const getBrowserAPI = () => {
  if (typeof (globalThis as any).browser !== "undefined") {
    return (globalThis as any).browser;
  }
  if (typeof chrome !== "undefined") {
    return chrome;
  }
  throw new Error("No browser API available");
};

/**
 * Execute script in tab (Firefox + Chrome compatible)
 */
export const executeScript = async (
  tabId: number,
  func: Function,
  args?: any[]
): Promise<any> => {
  const browserAPI = getBrowserAPI();

  // Chrome/Chromium - use chrome.scripting
  if (browserAPI.scripting && browserAPI.scripting.executeScript) {
    const result = await browserAPI.scripting.executeScript({
      target: { tabId },
      func: func,
      args: args,
    });
    return result[0]?.result ?? null;
  }

  // Firefox - use browser.tabs.executeScript
  if (browserAPI.tabs && browserAPI.tabs.executeScript) {
    const funcString = args
      ? `(${func.toString()})(${args
          .map((arg) => JSON.stringify(arg))
          .join(", ")})`
      : `(${func.toString()})()`;

    const result = await browserAPI.tabs.executeScript(tabId, {
      code: funcString,
    });

    return result && result.length > 0 ? result[0] : null;
  }

  throw new Error("No script execution API available");
};
