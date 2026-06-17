import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// testing-library auto-registers cleanup with jest globals but NOT with
// vitest. Without this, components from one test leak into the next via
// document.body, and queryByRole / getByText pick up nodes from prior
// renders. (Hit on the TextCard autoEdit-vs-canEdit pair — second test
// was finding the first test's textarea.)
afterEach(cleanup);
