// Mock ServiceNow incident data — will be replaced with REST API calls in Phase 2

export const INCIDENT = {
  number: 'INC0012345',
  priority: 'P1 - Critical',
  state: 'In Progress',
  shortDescription: 'Customer Portal Login Failure - All Users Affected',
  openedAt: '2025-11-24 14:23:00',
  impact: 'High',
  urgency: 'High',
  assignmentGroup: 'Application Support',
  assignedTo: 'Mike Johnson',
};

export const RESPONDERS = [
  { name: 'Sarah Chen',   role: 'Incident Manager', team: 'Major Incident',   status: 'Active'  },
  { name: 'Mike Johnson',  role: 'Tech Lead',        team: 'Application Team', status: 'Active'  },
  { name: 'Priya Patel',   role: 'Network Engineer', team: 'Infrastructure',   status: 'Active'  },
  { name: 'James Wilson',  role: 'Database Admin',   team: 'Database Team',    status: 'Standby' },
];

export const TASKS = [
  { id: 1, task: 'Check authentication service logs',   assignedTo: 'Mike Johnson',  status: 'In Progress',  priority: 'High'   },
  { id: 2, task: 'Verify database connection pool',     assignedTo: 'James Wilson',  status: 'Completed',    priority: 'High'   },
  { id: 3, task: 'Review load balancer configuration',  assignedTo: 'Priya Patel',   status: 'In Progress',  priority: 'Medium' },
  { id: 4, task: 'Prepare customer communication',      assignedTo: 'Sarah Chen',    status: 'Not Started',  priority: 'Medium' },
];

export const TIMELINE = [
  { time: '14:23', event: 'Incident opened — Multiple customer reports received' },
  { time: '14:25', event: 'P1 severity assigned — All users affected' },
  { time: '14:27', event: 'War room bridge established' },
  { time: '14:30', event: 'Application team engaged' },
  { time: '14:35', event: 'Database connectivity confirmed normal' },
  { time: '14:38', event: 'Authentication service logs show timeout errors' },
  { time: '14:42', event: 'Investigation ongoing — Load balancer review in progress' },
];

export const MONITORING = [
  { service: 'Customer Portal',      status: 'Down',        metric: '0% available',   lastCheck: '14:42' },
  { service: 'Auth Service',         status: 'Degraded',    metric: '47% timeout',    lastCheck: '14:41' },
  { service: 'API Gateway',          status: 'Operational', metric: '99.8% uptime',   lastCheck: '14:40' },
  { service: 'Database Cluster',     status: 'Operational', metric: '12ms latency',   lastCheck: '14:39' },
  { service: 'CDN',                  status: 'Operational', metric: '100% available',  lastCheck: '14:42' },
];
