# Mobile verification

Reports and browser verification scripts are versioned. Generated screenshots and measurements are local evidence excluded by `.gitignore`; screenshot links in the reports refer to those local captures.

Run the browser checks using an existing Playwright installation and Google Chrome:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node audit/mobile/verify.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node audit/mobile/harden.cjs
```

These scripts create their output directories, use synthetic data, and substitute Apps Script RPC. They do not access production data. Playwright is a verification prerequisite, not an application dependency.
