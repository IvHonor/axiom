import { useState } from "react";
import { createRoot } from "react-dom/client";
import { api as journal } from "../src/features/journal/api";
import { api as notes } from "../src/features/notes/api";
import { JournalSummary } from "../src/features/journal/JournalSummary";
import { NotesSummary } from "../src/features/notes/NotesSummary";
import { useNotesUi } from "../src/features/notes/notesUi";
import { useJournalUi } from "../src/features/journal/journalUi";
import { ResizableTile, TileGrid } from "../src/shell/ui/ResizableTile";
import { Panel } from "../src/shell/ui/Panel";
import { applyTheme } from "../src/shell/theme/applyTheme";
import { modernThemes } from "../src/themes/modern_themes";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/journal/journal.css";
import "../src/features/notes/notes.css";
const q = new URLSearchParams(location.search);
applyTheme(modernThemes.themes![q.has('light') ? 1 : 0]);
const title = q.has('long') ? 'UnbrokenTitle'.repeat(40) : 'A thought worth keeping';
const entry = { id:'entry-1', day:'2025-10-24', title, mood:null, energy:null, tags:[], prompt:'', excerpt:title, words:123, createdAt:'2025-10-24T10:00:00Z', updatedAt:'2025-10-24T10:00:00Z' };
journal.prompts = async () => [[], title];
journal.stats = async () => {
  if(q.has('fail')) throw Error('Offline');
  return {streak:17, longestStreak:24, writtenToday:q.has('written'), entries:83, words:45000, calendar:[], onThisDay:q.has('empty') ? [] : Array.from({length:4},(_,i)=>({yearsAgo:i+1,entry:{...entry,id:`e${i}`}})), averageMood:null, averageEnergy:null,tags:[]};
};
notes.list = async filter => {
  if(q.has('fail')) throw Error('Offline');
  if(filter.shelf === 'overview') return [];
  return Array.from({length:q.has('empty') ? 0 : 39},(_,i)=>({id:`n${i}`,folderId:null,title:`${title} ${i}`,tags:[],excerpt:title,words:321,pinned:i%2===0,sticky:false,color:'yellow',onOverview:false,trashedAt:null,createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-24T10:00:00Z'}));
};
function Fixture() {
  const [size,setSize]=useState({w:4,h:4});
  const n=useNotesUi(), j=useJournalUi();
  const Summary=q.has('notes') ? NotesSummary : JournalSummary;
  return <main style={{padding:24}}><label>Width<input aria-label="Width" type="number" value={size.w} onChange={e=>setSize({...size,w:+e.target.value})}/></label><label>Height<input aria-label="Height" type="number" value={size.h} onChange={e=>setSize({...size,h:+e.target.value})}/></label><output>{n.note}/{j.page}/{j.entry}</output><TileGrid><ResizableTile size={size} onResize={setSize} label="Writing"><Panel className="tile tile-fitted" title="Writing"><Summary onOpen={()=>{}}/></Panel></ResizableTile></TileGrid></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
