// panels.js — Generates canvas-based textures for each war room panel
import { INCIDENT, RESPONDERS, TASKS, TIMELINE, MONITORING } from './mock-data.js';

const PANEL_W = 1024;
const PANEL_H = 768;
const BG       = '#06101c';
const BORDER   = '#80ffea';
const TEXT      = '#ffffff';
const HEADING   = '#80ffea';
const ACCENT    = '#122240';
const KEY_LABEL = '#a0d4ff';

// ── helpers ──────────────────────────────────────────────────────────
function ctx(canvas) {
  canvas.width  = PANEL_W;
  canvas.height = PANEL_H;
  const c = canvas.getContext('2d');
  c.fillStyle = BG;
  c.fillRect(0, 0, PANEL_W, PANEL_H);
  c.strokeStyle = BORDER;
  c.lineWidth = 4;
  c.strokeRect(2, 2, PANEL_W - 4, PANEL_H - 4);
  return c;
}

function heading(c, text, y = 44) {
  c.fillStyle = HEADING;
  c.font = '700 34px Inter, sans-serif';
  c.fillText(text, 30, y);
  c.strokeStyle = BORDER;
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(30, y + 12); c.lineTo(PANEL_W - 30, y + 12); c.stroke();
  return y + 44;
}

function label(c, key, value, x, y) {
  c.font = '700 22px Inter, sans-serif';
  c.fillStyle = KEY_LABEL;
  c.fillText(key, x, y);
  c.font = '22px Inter, sans-serif';
  c.fillStyle = TEXT;
  c.fillText(value, x + c.measureText(key).width + 12, y);
}

function statusColor(status) {
  const s = status.toLowerCase();
  if (s === 'down')            return '#ff6b6b';
  if (s === 'degraded')        return '#ffc145';
  if (s === 'operational')     return '#69f0ae';
  if (s === 'completed')       return '#69f0ae';
  if (s === 'in progress')     return '#ffc145';
  if (s === 'not started')     return '#b0bec5';
  if (s === 'active')          return '#69f0ae';
  if (s === 'standby')         return '#b0bec5';
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
  pairs.forEach(([k, v]) => { label(c, k, v, 40, y); y += 36; });

  y += 20;
  c.fillStyle = ACCENT;
  c.fillRect(30, y, PANEL_W - 60, 180);
  y += 32;
  c.fillStyle = HEADING;
  c.font = '700 24px Inter, sans-serif';
  c.fillText('Description', 50, y);
  y += 32;
  c.fillStyle = TEXT;
  c.font = '22px Inter, sans-serif';
  const words = INCIDENT.shortDescription.split(' ');
  let line = '';
  words.forEach(w => {
    const test = line + w + ' ';
    if (c.measureText(test).width > PANEL_W - 120) {
      c.fillText(line.trim(), 50, y); y += 28; line = w + ' ';
    } else { line = test; }
  });
  if (line.trim()) c.fillText(line.trim(), 50, y);

  return canvas;
}

export function renderRespondersPanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  ACTIVE RESPONDERS');

  y += 10;
  c.fillStyle = KEY_LABEL;
  c.font = '700 20px Inter, sans-serif';
  c.fillText('Name',   40, y);
  c.fillText('Role',   260, y);
  c.fillText('Team',   520, y);
  c.fillText('Status', 780, y);
  y += 10;
  c.strokeStyle = '#3a5070'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(30, y); c.lineTo(PANEL_W - 30, y); c.stroke();
  y += 28;

  RESPONDERS.forEach(r => {
    c.fillStyle = ACCENT;
    c.fillRect(30, y - 20, PANEL_W - 60, 38);
    c.font = '21px Inter, sans-serif';
    c.fillStyle = TEXT;
    c.fillText(r.name,  40, y);
    c.fillText(r.role,  260, y);
    c.fillText(r.team,  520, y);
    c.fillStyle = statusColor(r.status);
    c.font = '700 21px Inter, sans-serif';
    c.fillText(r.status, 780, y);
    y += 48;
  });

  y += 30;
  c.fillStyle = HEADING;
  c.font = '700 26px Inter, sans-serif';
  c.fillText(`Total participants: ${RESPONDERS.length}`, 40, y);

  return canvas;
}

export function renderTasksPanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  ACTION ITEMS');

  y += 10;
  TASKS.forEach(t => {
    c.fillStyle = ACCENT;
    c.fillRect(30, y - 18, PANEL_W - 60, 106);

    c.font = '700 22px Inter, sans-serif';
    c.fillStyle = TEXT;
    c.fillText(`#${t.id}  ${t.task}`, 50, y + 6);

    c.font = '19px Inter, sans-serif';
    c.fillStyle = KEY_LABEL;
    c.fillText(`Assigned: ${t.assignedTo}`, 50, y + 34);

    c.fillStyle = statusColor(t.status);
    c.font = '700 19px Inter, sans-serif';
    c.fillText(`Status: ${t.status}`, 50, y + 62);

    c.fillStyle = t.priority === 'High' ? '#ff6b6b' : '#ffc145';
    c.fillText(`Priority: ${t.priority}`, 500, y + 62);

    y += 126;
  });
  return canvas;
}

export function renderTimelinePanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  INCIDENT TIMELINE');

  y += 10;
  TIMELINE.forEach((e, i) => {
    const dotX = 60;
    c.fillStyle = HEADING;
    c.beginPath(); c.arc(dotX, y + 4, 7, 0, Math.PI * 2); c.fill();
    if (i < TIMELINE.length - 1) {
      c.strokeStyle = '#3a5070'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(dotX, y + 14); c.lineTo(dotX, y + 66); c.stroke();
    }
    c.font = '700 22px Inter, sans-serif';
    c.fillStyle = HEADING;
    c.fillText(e.time, 80, y + 10);
    c.font = '20px Inter, sans-serif';
    c.fillStyle = TEXT;
    const words = e.event.split(' ');
    let line = '', lx = 170, ly = y + 10;
    words.forEach(w => {
      const test = line + w + ' ';
      if (c.measureText(test).width > PANEL_W - lx - 40) {
        c.fillText(line.trim(), lx, ly); ly += 24; line = w + ' ';
      } else { line = test; }
    });
    if (line.trim()) c.fillText(line.trim(), lx, ly);
    y += 74;
  });
  return canvas;
}

export function renderMonitoringPanel() {
  const canvas = document.createElement('canvas');
  const c = ctx(canvas);
  let y = heading(c, '■  SERVICE MONITORING');

  y += 10;
  c.fillStyle = KEY_LABEL;
  c.font = '700 20px Inter, sans-serif';
  c.fillText('Service',     40, y);
  c.fillText('Status',      340, y);
  c.fillText('Metric',      540, y);
  c.fillText('Last Check',  780, y);
  y += 10;
  c.strokeStyle = '#3a5070'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(30, y); c.lineTo(PANEL_W - 30, y); c.stroke();
  y += 30;

  MONITORING.forEach(m => {
    c.fillStyle = ACCENT;
    c.fillRect(30, y - 20, PANEL_W - 60, 40);
    c.font = '21px Inter, sans-serif';
    c.fillStyle = TEXT;
    c.fillText(m.service,   40, y);
    c.fillStyle = statusColor(m.status);
    c.font = '700 21px Inter, sans-serif';
    c.fillText(m.status,    340, y);
    c.font = '21px Inter, sans-serif';
    c.fillStyle = TEXT;
    c.fillText(m.metric,    540, y);
    c.fillText(m.lastCheck, 780, y);
    y += 54;
  });

  const down = MONITORING.filter(m => m.status === 'Down').length;
  const degraded = MONITORING.filter(m => m.status === 'Degraded').length;
  y += 30;
  c.font = '700 24px Inter, sans-serif';
  c.fillStyle = down > 0 ? '#ff6b6b' : '#69f0ae';
  c.fillText(`▸ ${down} Down   ▸ ${degraded} Degraded   ▸ ${MONITORING.length - down - degraded} Operational`, 40, y);

  return canvas;
}
