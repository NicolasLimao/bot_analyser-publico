import type { Page } from '@playwright/test';

// Editor regression cases start inside an existing demonstration session.
// The connection-first flow is covered separately in entry.spec.ts and live.spec.ts.
export async function prepareEditorSession(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('bot-analyser:offline') === null) {
      sessionStorage.setItem('bot-analyser:offline', 'true');
      sessionStorage.setItem('bot-analyser:workspace-open', 'true');
    }
  });
}
