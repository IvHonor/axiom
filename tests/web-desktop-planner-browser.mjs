import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export async function checkDesktopPlanner({ page, accounts, today, tomorrow, until, rowWithTitle }) {
  const main = page.locator('.desktop-planner-main'), quick = main.locator('.dp-quick input');
  const row = title => main.locator('.dp-row').filter({ has: page.getByText(title, { exact: true }) });
  const tab = name => main.getByRole('tab', { name, exact: true });
  const add = async title => { await quick.fill(title); await quick.press('Enter'); await quick.press('Escape'); };
  await row('Task from the desktop').waitFor();
  await mkdir('.qa.local/terminal', { recursive: true });
  await page.screenshot({ path: '.qa.local/terminal/desktop-daily-initial.png' });
  const layout = await main.evaluate(node => { const bar = node.querySelector('.dp-toolbar'), body = node.querySelector('.dp-body'), panel = node.querySelector('.dp-panel'); return { padding: getComputedStyle(bar).padding, gap: getComputedStyle(body).gap, taskWidth: panel.getBoundingClientRect().width, height: node.getBoundingClientRect().height, hasOldHero: !!node.querySelector('h1'), font: getComputedStyle(node).fontSize }; });
  assert.equal(layout.padding, '10px 20px'); assert.equal(layout.gap, '16px'); assert.equal(layout.taskWidth, 400); assert.equal(layout.hasOldHero, false); assert.equal(layout.font, '13px');
  await row('Task from the desktop').getByRole('checkbox').click();
  await until(() => !!rowWithTitle('Task from the desktop').data.done_at, 'desktop UI completion did not sync');
  await add('Write the web terminal tests 30m !');
  await until(() => !!rowWithTitle('Write the web terminal tests'), 'desktop quick-add did not sync');
  const task = rowWithTitle('Write the web terminal tests'); assert.equal(task.data.focus_rank, 1); assert.equal(task.data.estimate_minutes, 30);
  await row(task.data.title).getByRole('button', { name: 'Start a timer', exact: true }).click();
  await until(() => !!task.data.timer_started_at, 'desktop timer did not start');
  await main.locator('.dp-focusbar').getByRole('button', { name: 'Focus', exact: true }).click();
  const focus = page.getByRole('dialog', { name: 'Focus: Write the web terminal tests', exact: true });
  await focus.getByPlaceholder('Jot down anything you need for this task.').fill('Notes from the shared desktop focus view.');
  await focus.getByRole('button', { name: 'Pause', exact: true }).click();
  await until(() => task.data.notes === 'Notes from the shared desktop focus view.' && !task.data.timer_started_at, 'focus notes/timer did not save');
  await focus.getByRole('button', { name: 'Leave focus mode (Esc)', exact: true }).click();
  await add('Scheduled web task 45m 2pm');
  await until(() => !!rowWithTitle('Scheduled web task'), 'scheduled task did not save');
  const scheduled = rowWithTitle('Scheduled web task');
  await until(() => [...accounts.get('a').rows.values()].some(row => row.table === 'daily_plan_blocks' && row.data.task_id === scheduled.id && row.data.start_minute === 840), 'linked block did not save');
  assert.equal(await main.locator('.dp-block').filter({ hasText: 'Scheduled web task' }).count(), 1);
  await main.getByRole('button', { name: 'Planner settings', exact: true }).click();
  await main.locator('.dp-settings').getByLabel('Starts', { exact: true }).fill('09:00');
  await main.locator('.dp-settings').getByLabel('Ends', { exact: true }).fill('17:00');
  await main.locator('.dp-settings').getByRole('button', { name: 'Save', exact: true }).click();
  await until(() => accounts.get('a').rows.get('daily_plan_settings/settings')?.data.day_end_minute === 1020, 'desktop working-day controls did not save');
  for (const name of ['Week', 'Month', 'Year', 'Insights', 'Day']) { await tab(name).click(); await until(async () => await tab(name).getAttribute('aria-selected') === 'true', `${name} view did not open`); }
  // Native navigation, rather than the previous web-only date picker.
  await quick.focus(); await quick.press('Escape'); await page.keyboard.press('ArrowRight');
  await add('Web next-day task 20m');
  await until(() => rowWithTitle('Web next-day task')?.data.day === tomorrow, 'date arrows did not select tomorrow');
  await quick.press('Escape'); await page.keyboard.press('t');
  await row('Write the web terminal tests').waitFor();
  const sidebar = page.locator('.desktop-planner-sidebar');
  await sidebar.getByRole('button', { name: 'Add a routine', exact: true }).click();
  const routines = page.getByRole('dialog', { name: 'Routines', exact: true });
  const bounds = await routines.boundingBox(); assert.equal(Math.round(bounds.x + bounds.width / 2), 720, 'native dialogs centre in the full app window');
  await routines.getByRole('button', { name: 'Add a routine', exact: true }).click();
  await routines.getByPlaceholder('e.g. Gym, Lunch, Weekly review').fill('Desktop routine');
  await routines.getByLabel('Start', { exact: true }).fill('11:00');
  await routines.getByLabel('Length', { exact: true }).fill('30m');
  for (const name of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) { const button = routines.getByRole('button', { name, exact: true }); if (await button.getAttribute('aria-pressed') !== 'true') await button.click(); }
  await routines.getByRole('button', { name: 'Add routine', exact: true }).click();
  await until(() => !!rowWithTitle('Desktop routine'), 'desktop routine form did not save');
  await routines.getByRole('button', { name: 'Close', exact: true }).click();
  await main.locator('.dp-block').filter({ hasText: 'Desktop routine' }).waitFor();
  // Calendar file tools remain available inside the shared desktop calendar dialog.
  await main.getByRole('button', { name: 'Planner settings', exact: true }).click();
  await main.getByRole('button', { name: 'Calendars…', exact: true }).click();
  const calendars = page.getByRole('dialog', { name: 'Calendars', exact: true });
  await calendars.getByText('Import / export calendar files', { exact: true }).click();
  const date = today.replaceAll('-', ''), source = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:web-event',`DTSTART:${date}T090000`,`DTEND:${date}T100000`,'SUMMARY:Web imported meeting','URL:https://calendar.example.test/event','END:VEVENT','END:VCALENDAR'].join('\r\n');
  await calendars.getByLabel('Calendar name', { exact: true }).fill('Web calendar');
  await calendars.getByLabel('iCalendar file', { exact: true }).setInputFiles({ name: 'fixture.ics', mimeType: 'text/calendar', buffer: Buffer.from(source) });
  await calendars.getByRole('button', { name: 'Import calendar', exact: true }).click();
  await calendars.getByRole('checkbox', { name: 'Show Web calendar', exact: true }).waitFor();
  const downloadPromise = page.waitForEvent('download'); await calendars.getByRole('button', { name: 'Export plan (.ics)', exact: true }).click(); assert.match((await downloadPromise).suggestedFilename(), /\.ics$/);
  await calendars.getByRole('button', { name: 'Close', exact: true }).click();
  await main.locator('.dp-event').filter({ hasText: 'Web imported meeting' }).waitFor();
  await main.locator('.dp-event').filter({ hasText: 'Web imported meeting' }).click();
  const details = main.getByRole('region', { name: 'Event: Web imported meeting', exact: true });
  await page.context().route('https://calendar.example.test/**', route => route.fulfill({ contentType: 'text/html', body: 'Fixture calendar event' }));
  const opened = page.waitForEvent('popup'); await details.getByRole('button', { name: 'Open in Calendar link', exact: true }).click();
  const popup = await opened; await popup.getByText('Fixture calendar event', { exact: true }).waitFor(); await popup.close();
  await details.getByRole('button', { name: 'Close', exact: true }).click();
  await page.screenshot({ path: '.qa.local/terminal/desktop-daily-dark.png' });
  console.log('PASS: shared desktop layout, tasks, priorities, quick-add, scheduling, focus/timers/notes, settings, calendar views, routines and calendar file tools');
}
