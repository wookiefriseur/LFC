#!/usr/bin/env node
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.WEBVIEW_ROOT || path.join(HERE, '../../docs'));
const OUT = path.resolve(process.env.RESPONSIVE_OUTPUT || path.join(os.tmpdir(), 'lfc-responsive'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jsonl': 'application/x-ndjson', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(ROOT, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
    if (!file.startsWith(ROOT + path.sep)) throw new Error('outside root');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
let browser;
const results = [];
const errors = [];
const overflow = page => page.evaluate(() => {
  const width = document.documentElement.clientWidth;
  return { width, scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.right > width + 2 && getComputedStyle(e).position !== 'fixed';
    }).slice(0, 15).map(e => ({ tag: e.tagName, id: e.id, class: e.className, right: Math.round(e.getBoundingClientRect().right) })) };
});
try {
  await fs.mkdir(OUT, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', r => new URL(r.url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  const tab = async id => {
    const menu = await page.$('#nav-toggle');
    if (menu && await menu.isVisible() && !await page.$eval('#tab-bar', e => e.matches(':popover-open'))) await page.click('#nav-toggle');
    await page.click(`#tab-${id}`);
    if (menu && await menu.isVisible() && await page.$eval('#tab-bar', e => e.matches(':popover-open'))) throw new Error('Navigation did not close after choosing ' + id);
    await page.waitForSelector(`#panel-${id}:not([hidden])`);
  };
  const click = selector => page.$eval(selector, e => e.click());
  const resultsPanel = async () => {
    const back = await page.$('#batch-show-results');
    if (back && await back.isVisible()) await page.click('#batch-show-results');
  };
  const openFilters = async () => {
    if (await page.$('#batch-filters') && !await page.$eval('#batch-filters', e => e.open)) await page.click('#batch-filters summary');
  };
  const fill = (selector, value) => page.$eval(selector, (e, value) => { e.value = value; e.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  const capture = async (name, width) => {
    await page.evaluate(name => {
      const selectors = { 'luxury-preview': '#lux-preview-wrap', 'batch-loaded-form': '#detail', 'names-pending': '#names-table', maintenance: '#maint-body', advanced: '#panel-advanced table' };
      if (selectors[name]) document.querySelector(selectors[name])?.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 0);
    }, name);
    await new Promise(resolve => setTimeout(resolve, 100));
    const measured = await overflow(page);
    const details = await page.evaluate(() => {
      const visible = e => !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
      const tables = [...document.querySelectorAll('table')].filter(visible).map(t => ({
        id: t.id, display: getComputedStyle(t).display, responsive: t.classList.contains('responsive-table'),
        rowDisplay: t.querySelector('tbody tr:not(.spacer)') ? getComputedStyle(t.querySelector('tbody tr:not(.spacer)')).display : null,
        unlabeled: [...t.querySelectorAll('tbody tr:not(.spacer) td')].filter(c => !c.hasAttribute('data-label')).length,
      }));
      const clipped = [...document.querySelectorAll('button,input,select,textarea')].filter(visible).flatMap(e => {
        const r = e.getBoundingClientRect();
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          const style = getComputedStyle(a), b = a.getBoundingClientRect();
          if (['hidden','clip'].includes(style.overflowX) && (r.left < b.left - 2 || r.right > b.right + 2))
            return [{ id: e.id, tag: e.tagName, ancestor: a.id || a.className }];
        }
        return [];
      });
      const desktop = [];
      if (innerWidth >= 1280) {
        const menu = document.querySelector('#nav-toggle');
        if (menu && visible(menu)) desktop.push('Mobile navigation button visible on desktop');
        if (document.querySelector('#tab-bar').hasAttribute('popover')) desktop.push('Desktop navigation still uses popover');
        for (const table of tables) if (table.display !== 'table' || (table.rowDisplay !== null && table.rowDisplay !== 'table-row')) desktop.push('Desktop table became cards: ' + table.id);
        const panel = document.querySelector('#panel-advanced');
        if (panel && visible(panel)) {
          const list = panel.querySelector('.table-pane').getBoundingClientRect();
          const edit = panel.querySelector('#detail').getBoundingClientRect();
          if (list.right > edit.left + 2 || Math.abs(list.top - edit.top) > 2) desktop.push('Batch panes are not side by side');
          for (const id of ['filter-type','filter-version','search','btn-add']) {
            const e = document.getElementById(id), r = e.getBoundingClientRect();
            if (!visible(e) || r.width < 40 || r.height < 20 || r.left < 0 || r.right > innerWidth) desktop.push('Desktop filter/control unavailable: ' + id);
          }
        }
      }
      return { tables, clipped, desktop };
    });
    await page.screenshot({ path: path.join(OUT, `${width}-${name}.png`), fullPage: true });
    const cards = width > 900 || process.env.RESPONSIVE_BASELINE === '1' || details.tables.every(t => t.responsive && !t.unlabeled && (t.rowDisplay === null || t.rowDisplay === 'flex'));
    const result = { name, ...measured, ...details, pass: measured.scrollWidth <= measured.width + 2 && !details.clipped.length && !details.desktop.length && cards };
    results.push(result);
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${width} ${name}: ${measured.scrollWidth}px`);
  };
  for (const width of (process.env.RESPONSIVE_WIDTHS || '375,768,1280').split(',').map(Number)) {
    await page.setViewport({ width, height: Number(process.env.RESPONSIVE_HEIGHT || 900) });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__proto?.ready);
    await page.evaluate(() => { localStorage.clear(); window.__proto.forgetPending(); });
    // Prove that this detector catches actual page overflow, even if the app hides overflow.
    await page.evaluate(() => {
      const e = document.createElement('div'); e.id = 'overflow-probe';
      e.style.cssText = 'position:absolute;left:0;top:0;width:4000px;height:1px'; document.body.append(e);
    });
    if ((await overflow(page)).scrollWidth < 4000) throw new Error('Overflow detector failed its positive control');
    await page.$eval('#overflow-probe', e => e.remove());
    if (width <= 900) {
      await page.click('#nav-toggle');
      await capture('navigation-open', width);
      await page.keyboard.press('Escape');
      if (await page.$eval('#tab-bar', e => e.matches(':popover-open'))) errors.push('Escape did not dismiss navigation');
    }
    for (const id of ['luxury', 'crown-store', 'browse', 'advanced', 'maintenance', 'names', 'about']) {
      await tab(id);
      if (id === 'advanced') {
        await page.waitForSelector('#panel-advanced tbody tr:not(.spacer)');
        if (width <= 1000 && await page.$eval('#batch-filters', e => e.open)) errors.push('Mobile Batch filters start expanded');
        if (width <= 1000) {
          await page.click('#batch-filters summary'); await capture('batch-filters-open', width);
          await page.click('#batch-filters summary');
        }
      }
      if (id === 'browse') {
        await page.waitForSelector('.browse-card');
        if (await page.$eval('#browse-filters summary', e => e.textContent.trim()) !== 'Category filter') errors.push('Browse does not label the category filter');
      }
      await capture(id, width);
    }
    await click('#subtab-crown-store-crate-seasons');
    await tab('crown-store');
    await capture('crown-crates', width);
    await click('#crate-new-open');
    await capture('crown-new-crate', width);
    await tab('maintenance');
    await click('#maint-tab-sources'); await capture('maintenance-sources', width);
    await click('#maint-tab-vocab'); await capture('maintenance-vocabulary', width);
    await tab('names');
    await page.waitForSelector('#names-table tbody tr');
    await page.evaluate(() => (document.querySelector('#names-table tbody tr .names-edit-button') || document.querySelector('#names-table tbody tr td:nth-child(2)')).click());
    await page.waitForSelector('.names-edit');
    await fill('.names-edit', 'A contributor name with a deliberately long description');
    await page.keyboard.press('Enter');
    await capture('names-pending', width);
    const namesFilters = await page.$eval('#names-filters', e => e.open);
    if (!namesFilters) await page.click('#names-filters summary');
    await page.click('#names-lists [data-list="vocab:events"]');
    await page.waitForSelector('#names-table .names-id');
    await page.$eval('#names-table .names-id', e => e.scrollIntoView({ block: 'center' }));
    const symbol = await page.$eval('#names-table .names-id', e => {
      const range = document.createRange(); range.selectNodeContents(e);
      const cell = e.getBoundingClientRect(), text = range.getBoundingClientRect();
      const x = Math.min(innerWidth - 2, Math.max(1, text.left + Math.min(8, text.width / 2))), y = text.top + text.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { text: e.textContent, cellWidth: cell.width, textWidth: text.width,
        fits: text.left >= cell.left - 1 && text.right <= cell.right + 1,
        exposed: hit === e || e.contains(hit) };
    });
    if (!symbol.text || !symbol.fits || !symbol.exposed) errors.push('Names symbol occluded: ' + JSON.stringify(symbol));
    await capture('names-symbol', width);
    if (!namesFilters) await page.click('#names-filters summary');
    await tab('advanced');
    await click('#panel-advanced tbody tr:not(.spacer) td:nth-child(3)');
    await page.waitForSelector('#panel-advanced [name="source.type"]');
    await capture('batch-loaded-form', width);
    if (width <= 1000) {
      const listHidden = await page.$eval('#panel-advanced .table-pane', e => !e.checkVisibility());
      const editorVisible = await page.$eval('#detail', e => e.checkVisibility());
      if (!listHidden || !editorVisible) errors.push('Mobile Batch list and editor are not exclusive');
      const field = '#detail [data-field="source.note"]';
      await fill(field, 'Unsaved mobile navigation draft');
      const before = await page.$eval(field, e => e.value);
      await page.click('#batch-show-results');
      if (!await page.$eval('#panel-advanced .table-pane', e => e.checkVisibility()) || await page.$eval('#detail', e => e.checkVisibility())) errors.push('Back to results did not restore exclusive list');
      await capture('batch-back-to-results', width);
      await page.click('#batch-show-editor');
      if (await page.$eval(field, e => e.value) !== before) errors.push('Returning to editor lost draft');
      await capture('batch-continue-editing', width);
      await page.click('#batch-show-results');
      await page.click('#panel-advanced tbody tr:not(.spacer) td:nth-child(3)');
      if (await page.$eval(field, e => e.value) !== before) errors.push('Selecting the same row lost the mobile draft');
      const discardEnabled = await page.$$eval('#detail button', buttons => buttons.some(b => /discard/i.test(b.textContent) && !b.disabled));
      if (!discardEnabled) errors.push('Selecting the same row disabled Discard for an unsaved draft');
      await capture('batch-reselect-draft', width);
    }
    await tab('browse');
    await click('.browse-card');
    await page.waitForSelector('#browse-detail:not([hidden])');
    await capture('browse-detail', width);
    await page.$$eval('#browse-detail button', buttons => buttons.find(b => /Quick Edit/.test(b.textContent)).click());
    await page.waitForSelector('.qe-backdrop');
    await capture('browse-quick-edit', width);
    await page.keyboard.press('Escape');
    await tab('luxury');
    await fill('#lux-date', '2026-10-16');
    await fill('#lux-paste', '126560, 50000, Dwarven Fountain\n126561, 99999, Second furnishing');
    await click('#lux-parse');
    await page.waitForSelector('#lux-preview-body tr');
    await capture('luxury-preview', width);
    await click('#lux-commit');
    await capture('luxury-saved', width);
    await click('#btn-submit');
    await page.waitForSelector('#modal-close');
    await capture('review-submit', width);
    await click('#modal-close');
    await page.evaluate(() => window.__proto.forgetPending());
  }
  // Resize an already mounted virtualized table, then reach its final record.
  await tab('advanced');
  await resultsPanel();
  await page.setViewport({ width: 1280, height: Number(process.env.RESPONSIVE_HEIGHT || 900) });
  await page.setViewport({ width: 375, height: Number(process.env.RESPONSIVE_HEIGHT || 900) });
  await page.waitForFunction(() => matchMedia('(max-width: 760px)').matches);
  await resultsPanel();
  await new Promise(resolve => setTimeout(resolve, 150));
  await capture('batch-resized-mobile', 375);
  const virtual = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#panel-advanced tbody tr:not(.spacer)')];
    const pitch = rows.length > 1 ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : 0;
    const scroller = rows[0]?.closest('.table-scroll') || [...document.querySelectorAll('#panel-advanced *')].find(e => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight);
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    return { pitch, scroller: !!scroller };
  });
  await new Promise(resolve => setTimeout(resolve, 200));
  await capture('batch-last-record', 375);
  const reachedEnd = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#panel-advanced tbody tr')];
    return rows.length > 0 && !rows.at(-1).classList.contains('spacer');
  });
  if (!reachedEnd) errors.push('Mobile batch final record not rendered after scrolling to end');
  if (process.env.RESPONSIVE_BASELINE !== '1' && (Math.abs(virtual.pitch - 304) > 2 || !virtual.scroller)) errors.push('Mobile batch virtual row pitch/end reachability failed: ' + JSON.stringify(virtual));
  const packRecord = await page.evaluate(() => window.__proto.records().find(r => r.source?.packs?.length === 2));
  await resultsPanel();
  await openFilters();
  await fill('#search', String(packRecord.id));
  await new Promise(resolve => setTimeout(resolve, 400));
  await page.waitForSelector('#table-body tr:not(.spacer) td:nth-child(3)');
  await click('#table-body tr:not(.spacer) td:nth-child(3)');
  await page.waitForSelector('#detail .pack-list .pack-row select');
  await capture('batch-source-packs', 375);
  await page.$$eval('#detail .pack-list .pack-row .clear-link', buttons => buttons[1].click());
  const note = '#detail [data-field="source.note"]';
  await page.waitForSelector(note);
  await fill(note, 'Mobile contributor verification source note');
  await page.$$eval('#detail button', buttons => buttons.find(b => /save to the change list/i.test(b.textContent)).click());
  await click('#btn-submit');
  await page.waitForSelector('#modal-diff');
  const diff = await page.$eval('#modal-diff', e => e.value);
  if (!diff.includes('Mobile contributor verification source note') || !diff.includes(packRecord.source.packs[0])) errors.push('Mobile source/pack edits missing from submitted diff');
  await capture('batch-source-packs-saved', 375);
  await click('#modal-close');
  await page.evaluate(() => window.__proto.forgetPending());
} catch (error) { errors.push(error.stack); }
finally {
  await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`${results.length} screenshots; ${results.filter(r => !r.pass).length} overflow failures; ${errors.length} errors. Artifacts: ${OUT}`);
if (errors.length) console.error(errors.join('\n'));
if (errors.length || results.some(r => !r.pass)) process.exitCode = 1;
