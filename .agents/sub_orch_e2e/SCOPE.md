# Scope: M2: E2E Testing Track

## Architecture
- **Test Runner**: Vitest (or Jest if needed, but Vitest fits well with Vite projects).
- **Environment**: JSDOM to simulate browser DOM for React components.
- **Mocks**: A mock implementation of Chrome Extension APIs (e.g. `chrome.runtime`, `chrome.tabs`, `chrome.storage`) since tests run in Node/JSDOM.
- **Components under test**: `src/sidepanel/App.tsx` and custom keyboard listeners if any.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Infrastructure Setup | Install vitest, jsdom, testing-library. Write chrome mock and test entry point. | None | PLANNED |
| 2 | Tier 1 Tests | Feature coverage: at least 5 tests for /h, 5 for /p, 5 for placeholder. | 1 | PLANNED |
| 3 | Tier 2 Tests | Edge/Boundary cases: at least 5 tests per feature (cursor caret, empty check, triggers in/start of word). | 1 | PLANNED |
| 4 | Tier 3 Tests | Cross-Feature combinations: slash commands + placeholder toggle interaction. | 2 | PLANNED |
| 5 | Tier 4 Tests | Real-World scenarios: continuous typing, various offsets. | 3 | PLANNED |
| 6 | Publish TEST_READY.md | Create and write TEST_READY.md at project root. | 2, 3, 4, 5 | PLANNED |

## Interface Contracts
- **Test Runner Entry Point**: `npm run test` or `npx vitest` executable in the root directory.
- **Mock Chrome API**:
  - `chrome.runtime.sendMessage` and `chrome.runtime.onMessage.addListener`
  - `chrome.tabs.query`
  - `chrome.runtime.getURL` returning a dummy/mock URL string.
- **IndexedDB / Storage Mock**:
  - The sidepanel React app imports functions from `@/storage/repository`. These must be mocked or clean database setups must be provided.
