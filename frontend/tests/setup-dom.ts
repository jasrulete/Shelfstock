import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only auto-cleans when Vitest globals are enabled, and they
// are not here - the server suite imports describe/it/expect explicitly.
// Without this, a mounted component from one test is still in document.body
// during the next, and queries start matching the wrong element.
afterEach(() => {
  cleanup();
});
