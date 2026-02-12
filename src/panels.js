// panels.js — Generates canvas-based textures for each war room panel
import { INCIDENT, RESPONDERS, TASKS, TIMELINE, MONITORING } from './mock-data.js';

const PANEL_W = 1024;
const PANEL_H = 768;
const BG       = '#0a1929';
const BORDER   = '#64ffda';
const TEXT      = '#e0e0e0';
const HEADING   = '#64ffda';
const ACCENT    = '#1e3a5f';

// ── helpers ──────────────────────────────────────────────────────────
function ctx(canvas) {
  canvas.width  = PANEL_W;
  canvas.height = PANEL_H;
  const c = canvas.getContext('2d');
  // background
  c.fillStyle = BG;
  c.fillRect(0, 0, PANEL_W, PANEL_H);
  // border
  c.strokeStyle = BORDER;
  c.lineWidth = 4;
  c.strokeRect(2, 2, PANEL_W - 4, PANEL_H - 4);
  return c;
}

function heading(c, text, y = 40) {
  c.fillStyle = HEADING;
  c.font = 'bold 32px Inter, sans-serif';
  c.fillText(text, 30, y);
  c.strokeStyle = BORDER;
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(30, y + 10); c.lineTo(PANEL_W - 30, y + 10); c.stroke();
  return y + 40;
}

function label(c, key, value, x, y, keyColor = '#90caf9') {
  c.font = 'bold 20px Inter, sans-serif';
  c.fillStyle = keyColor;
  c.fillText(key, x, y);
  c.font = '20px Inter, sans-serif';
  c.fillStyle = TEXT;
  c.fillText(value, x + c.measureText(key).width + 10, y);
}

function statusColor(status) {
  const s = status.toLowerCase();
  if (s === 'down')                          return '#ff5252';
  if (s === 'degraded')                      return '#ffab40';
  if (s === 'operational')                   return '#69f0ae';
  if (s === 'completed')                     return '#69f0ae';
  if (s === 'in progress')                   return '#ffab40';
  if (s === 'not started')                   return '#90a4ae';
  if (s === 'active')                        return '#69f0ae';
  if (s === 'standby')                       return '#90a4ae';
  return TEXT;
}

// ── panel renderers ──────────────────────────────────────────────────
export function renderStatusPanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  INCIDENT STATUS');

  y += 10;
  const pairs = [
    ['Number:',      INCIDENT.number],
    ['Priority:',    INCIDENT.priority],
    ['State:',       INCIDENT.state],
    ['Impact:',      INCIDENT.impact],
    ['Urgency:',     INCIDENT.urgency],
    ['Opened:',      INCIDENT.openedAt],
    ['Group:',       INCIDENT.assignmentGroup],
    ['Assigned To:', INCIDENT.assignedTo],
  ];
  pairs.forEach(([k, v]) => { label(c, k, v, 40, y); y += 34; });

  y += 20;
  c.fillStyle = ACCENT;
  c.fillRect(30, y, PANEL_W - 60, 180);
  y += 30;
  c.fillStyle = HEADING;
  c.font = 'bold 22px Inter, sans-serif';
  c.fillText('Description', 50, y);
  y += 30;
  c.fillStyle = TEXT;
  c.font = '20px Inter, sans-serif';
  // word-wrap the description
  const words = INCIDENT.shortDescription.split(' ');
  let line = '';
  words.forEach(w => {
    const test = line + w + ' ';
    if (c.measureText(test).width > PANEL_W - 120) {
      c.fillText(line.trim(), 50, y); y += 26; line = w + ' ';
    } else { line = test; }
  });
  if (line.trim()) c.fillText(line.trim(), 50, y);

  return canvas;
}

export function renderRespondersPanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  ACTIVE RESPONDERS');

  // column headers
  y += 10;
  c.fillStyle = '#90caf9';
  c.font = 'bold 18px Inter, sans-serif';
  c.fillText('Name',   40, y);
  c.fillText('Role',   260, y);
  c.fillText('Team',   520, y);
  c.fillText('Status', 780, y);
  y += 8;
  c.strokeStyle = '#334155'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(30, y); c.lineTo(PANEL_W - 30, y); c.stroke();
  y += 28;

  RESPONDERS.forEach(r => {
    // row bg
    c.fillStyle = ACCENT;
    c.fillRect(30, y - 20, PANEL_W - 60, 36);
    c.font = '19px Inter, sans-serif';
    c.fillStyle = TEXT;
    c.fillText(r.name,  40, y);
    c.fillText(r.role,  260, y);
    c.fillText(r.team,  520, y);
    c.fillStyle = statusColor(r.status);
    c.fillText(r.status, 780, y);
    y += 44;
  });

  // participant count
  y += 30;
  c.fillStyle = HEADING;
  c.font = 'bold 24px Inter, sans-serif';
  c.fillText(`Total participants: ${RESPONDERS.length}`, 40, y);

  return canvas;
}

export function renderTasksPanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  ACTION ITEMS');

  y += 10;
  TASKS.forEach(t => {
    // card bg
    c.fillStyle = ACCENT;
    c.fillRect(30, y - 18, PANEL_W - 60, 100);

    c.font = 'bold 20px Inter, sans-serif';
    c.fillStyle = TEXT;
    c.fillText(`#${t.id}  ${t.task}`, 50, y + 4);

    c.font = '17px Inter, sans-serif';
    c.fillStyle = '#90caf9';
    c.fillText(`Assigned: ${t.assignedTo}`, 50, y + 32);

    c.fillStyle = statusColor(t.status);
    c.fillText(`Status: ${t.status}`, 50, y + 58);

    c.fillStyle = t.priority === 'High' ? '#ff5252' : '#ffab40';
    c.fillText(`Priority: ${t.priority}`, 500, y + 58);

    y += 120;
  });
  return canvas;
}

export function renderTimelinePanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  INCIDENT TIMELINE');

  y += 10;
  TIMELINE.forEach((e, i) => {
    // time marker
    const dotX = 60;
    c.fillStyle = HEADING;
    c.beginPath(); c.arc(dotX, y + 4, 6, 0, Math.PI * 2); c.fill();
    // vertical line
    if (i < TIMELINE.length - 1) {
      c.strokeStyle = '#334155'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(dotX, y + 12); c.lineTo(dotX, y + 62); c.stroke();
    }
    c.font = 'bold 20px Inter, sans-serif';
    c.fillStyle = HEADING;
    c.fillText(e.time, 80, y + 8);
    c.font = '18px Inter, sans-serif';
    c.fillStyle = TEXT;
    // word-wrap event text
    const words = e.event.split(' ');
    let line = '', lx = 170, ly = y + 8;
    words.forEach(w => {
      const test = line + w + ' ';
      if (c.measureText(test).width > PANEL_W - lx - 40) {
        c.fillText(line.trim(), lx, ly); ly += 22; line = w + ' ';
      } else { line = test; }
    });
    if (line.trim()) c.fillText(line.trim(), lx, ly);
    y += 70;
  });
  return canvas;
}

export function renderMonitoringPanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  SERVICE MONITORING');

  y += 10;
  c.fillStyle = '#90caf9';
  c.font = 'bold 18px Inter, sans-serif';
  c.fillText('Service',     40, y);
  c.fillText('Status',      340, y);
  c.fillText('Metric',      540, y);
  c.fillText('Last Check',  780, y);
  y += 8;
  c.strokeStyle = '#334155'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(30, y); c.lineTo(PANEL_W - 30, y); c.stroke();
  y += 30;

  MONITORING.forEach(m => {
    c.fillStyle = ACCENT;
    c.fillRect(30, y - 20, PANEL_W - 60, 38);
    c.font = '19px Inter, sans-serif';
    c.fillStyle = TEXT;
    c.fillText(m.service,   40, y);
    c.fillStyle = statusColor(m.status);
    c.font = 'bold 19px Inter, sans-serif';
    c.fillText(m.status,    340, y);
    c.font = '19px Inter, sans-serif';
    c.fillStyle = TEXT;
    c.fillText(m.metric,    540, y);
    c.fillText(m.lastCheck, 780, y);
    y += 50;
  });

  // overall summary
  const down = MONITORING.filter(m => m.status === 'Down').length;
  const degraded = MONITORING.filter(m => m.status === 'Degraded').length;
  y += 30;
  c.font = 'bold 22px Inter, sans-serif';
  c.fillStyle = down > 0 ? '#ff5252' : '#69f0ae';
  c.fillText(`▸ ${down} Down   ▸ ${degraded} Degraded   ▸ ${MONITORING.length - down - degraded} Operational`, 40, y);

  return canvas;
}
