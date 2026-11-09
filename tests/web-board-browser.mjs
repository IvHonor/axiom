// The desktop's own Project Board, on the web, syncing in the desktop's format.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export async function checkBoard({ page, accounts, area, until, today, tomorrow }) {
  const rows = table => [...accounts.get('a').rows.values()].filter(row => row.table === 'project_board_' + table && !row.data.deleted_at);
  const main = page.locator('main.main');
  const drawer = page.getByRole('complementary', { name: 'Task details' });
  const field = name => drawer.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) }).locator('select, input');
  const card = title => main.getByRole('button', { name: new RegExp(`^${title}\\. Enter to open`) });
  const view = name => main.getByRole('tablist', { name: 'Board view' }).getByRole('tab', { name, exact: true });

  // A project, with the desktop's four columns.
  await area('Project Board');
  const name = main.getByPlaceholder('Project name');
  if (!(await name.isVisible())) await main.getByRole('button', { name: 'New project', exact: true }).first().click();
  await name.fill('Web release');
  await name.press('Enter');
  await until(() => rows('projects').some(row => row.data.name === 'Web release'), 'the project did not sync');
  const project = rows('projects').find(row => row.data.name === 'Web release');
  await until(() => rows('columns').filter(row => row.data.project_id === project.id).length === 4, 'the default columns did not sync');
  const column = name => rows('columns').find(row => row.data.project_id === project.id && row.data.name === name);

  // A card, and its details in the drawer.
  await main.getByRole('button', { name: 'Add a card', exact: true }).first().click();
  await main.getByPlaceholder('Enter a title for this card').fill('Build the browser board');
  await main.getByRole('button', { name: 'Add card', exact: true }).click();
  await main.getByRole('button', { name: 'Cancel', exact: true }).click();
  await until(() => rows('tasks').some(row => row.data.project_id === project.id && row.data.title === 'Build the browser board'), 'the new card did not sync');
  const task = () => rows('tasks').find(row => row.data.project_id === project.id && row.data.title === 'Build the browser board');
  await card('Build the browser board').click();
  await drawer.waitFor();
  await field('Priority').selectOption('3');
  await field('Start').fill(today);
  await field('Due').fill(tomorrow);
  await field('Estimate (h)').fill('1.5'); await field('Estimate (h)').blur();
  await field('Repeat').selectOption('weekly');
  await until(() => task().data.priority === 3 && task().data.due_date === tomorrow && task().data.estimate === 1.5 && task().data.recurrence === 'weekly', 'the card details did not sync');
  for (const text of ['Review changes', 'Ship changes']) {
    await drawer.getByPlaceholder('Add an item').fill(text);
    await drawer.getByPlaceholder('Add an item').press('Enter');
    await until(() => rows('checklist_items').some(row => row.data.task_id === task().id && row.data.text === text), `the checklist item "${text}" did not sync`);
  }
  console.log('PASS: board project, columns, card details and checklist sync');

  // Finished: moved to Done, it's completed; a repeating card comes back for next time.
  await field('Status').selectOption(column('Done').id);
  await until(() => rows('tasks').some(row => row.id === task()?.id && row.data.column_id === column('Done').id && !!row.data.completed_at)
    || rows('tasks').some(row => row.data.project_id === project.id && row.data.title === 'Build the browser board' && row.data.column_id === column('Done').id && !!row.data.completed_at), 'moving to Done did not complete the card');
  await until(() => rows('tasks').filter(row => row.data.project_id === project.id && row.data.title === 'Build the browser board').length === 2, 'completing a repeating card did not make the next one');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();

  // Every view opens.
  for (const name of ['Table', 'Timeline', 'Activity', 'Insights', 'Archive', 'Board']) {
    await view(name).click();
    await until(async () => (await view(name).getAttribute('aria-selected')) === 'true', `the ${name} view did not open`);
  }
  console.log('PASS: completing and repeating cards, and every board view');

  // Still there after a real reload, and the board stays inside a phone's width.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await card('Build the browser board').first().waitFor();
  await mkdir('.qa.local/terminal', { recursive: true });
  await page.screenshot({ path: '.qa.local/terminal/project-board.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.activitybar').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the board scrolls inside the page on phones');
  await page.screenshot({ path: '.qa.local/terminal/project-board-phone.png' });
  await page.setViewportSize({ width: 1440, height: 960 });
  console.log('PASS: the board after a reload, and at phone width');
}
