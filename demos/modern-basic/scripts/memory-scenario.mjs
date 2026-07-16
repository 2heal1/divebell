export default {
  async setup({ page }) {
    await page.waitEval('window.location.pathname === "/"');
    await page.waitEval('document.querySelector(\'a[href="/orders"]\') !== null');
  },

  async run({ page }) {
    await navigate(page, "/orders");
    await navigate(page, "/");
    await delay(450);
  }
};

async function navigate(page, pathname) {
  await page.waitEval(
    `document.querySelector('a[href="${pathname}"]') !== null`
  );
  await page.eval(
    `document.querySelector('a[href="${pathname}"]').click()`
  );
  await page.waitEval(
    `window.location.pathname === ${JSON.stringify(pathname)}`
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
