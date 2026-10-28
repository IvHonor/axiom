// Scope the actual desktop rules so the public website keeps its own styling.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
const root = new URL('../../', import.meta.url), output = new URL('../src/components/terminal/desktop-planner.generated.css', import.meta.url);
const scope = '.desktop-planner';
function stylesheet(path, filter) {
  const css = postcss.parse(readFileSync(new URL(path, root), 'utf8'));
  css.walkAtRules('import', rule => rule.remove());
  css.walkRules(rule => {
    if (rule.parent.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return;
    if (filter && !filter.test(rule.selector)) { rule.remove(); return; }
    const selectors = rule.selectors.filter(selector => !['html', 'body', '#root'].includes(selector.trim())).map(selector => {
      if (selector.startsWith(':root')) return selector.replace(':root', scope);
      if (/^\[data-/.test(selector)) return scope + selector;
      return `${scope} ${selector}`;
    });
    if (!selectors.length) rule.remove(); else rule.selectors = selectors;
  });
  return css.toString();
}
const common = /\.(?:btn\b|btn-|icon-btn|dropdown|menu-|field-|form-|panel\b|panel-|stat-|section\b|section-|nav-item|sidebar-head\b|sidebar-body\b|row\b|switch|modal)/;
const source = `/* Generated from desktop CSS by scripts/desktop-planner-styles.mjs. */\n${stylesheet('src/styles/theme.css')}\n/* Undo the public site's element styles before applying desktop rules. */\n.desktop-planner :is(h1, h2, h3, h4) { font-family: inherit; font-weight: bold; line-height: inherit; letter-spacing: normal; }\n.desktop-planner :is(h3, h4) { margin: revert; }\n.desktop-planner p { text-wrap: wrap; }\n.desktop-planner svg { vertical-align: baseline; }\n.desktop-planner .section { padding: 0; }\n${stylesheet('src/styles/shell.css', common)}\n${stylesheet('src/features/project_board/board.css', /\.pb-(?:segmented|insights|stat|chart|grid|axis|line|direct|crosshair|dot|legend|key|tooltip|bar)/)}\n${stylesheet('src/features/daily_plan/plan.css')}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== source) throw new Error('Desktop planner CSS is stale. Run npm run desktop:styles in site.');
} else writeFileSync(fileURLToPath(output), source);
