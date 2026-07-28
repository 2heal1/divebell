export default {
  async setup({ page }) {
    await page.waitEval(
      'document.querySelector(\'[data-action="memory-cycle"]\') !== null || document.querySelector(\'[data-section="memory"]\') !== null'
    );
    await page.eval(
      'document.querySelector(\'[data-section="memory"]\')?.click()'
    );
    await page.waitEval(
      'document.querySelector(\'[data-action="memory-cycle"]\') !== null'
    );
  },

  async run({ page }) {
    await page.eval(
      `(() => {
        window.__divebellQuickStartMemoryCycle =
          Number(document.querySelector('.activity-count')?.textContent ?? 0);
        document.querySelector('[data-action="memory-cycle"]')?.click();
      })()`
    );
    await page.waitEval(
      `Number(document.querySelector('.activity-count')?.textContent ?? 0) >
        Number(window.__divebellQuickStartMemoryCycle ?? -1)`
    );
  }
};
