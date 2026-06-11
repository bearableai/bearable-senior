'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface CheckInSummary {
  id: string;
  feelingOk: boolean;
  createdAt: string;
  caretakerNotified: boolean;
}

interface Senior {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  label: string | null;
  relationshipStatus: string;
  recentCheckIns: CheckInSummary[];
}

type StatusColor = 'green' | 'yellow' | 'red';

function getStatusFromCheckIns(checkIns: CheckInSummary[]): StatusColor {
  if (checkIns.length === 0) return 'yellow'; // No data = advisory

  const recent = checkIns.slice(0, 3);
  const allBad = recent.length >= 2 && recent.every(c => !c.feelingOk);
  if (allBad) return 'red';

  const anyBad = recent.some(c => !c.feelingOk);
  if (anyBad) return 'yellow';

  return 'green';
}

function getStatusLabel(status: StatusColor): string {
  switch (status) {
    case 'green': return 'Everything looks good';
    case 'yellow': return 'Worth keeping an eye on';
    case 'red': return 'Needs attention';
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <div
      className={`w-3 h-3 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`}
      title={ok ? 'Good day' : 'Tough day'}
    />
  );
}

function StatusBadge({ status }: { status: StatusColor }) {
  const colors = {
    green: 'bg-green-100 border-green-300 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-300 text-yellow-800',
    red: 'bg-red-50 border-red-300 text-red-800',
  };

  const dotColors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${colors[status]}`}>
      <div className={`w-3 h-3 rounded-full ${dotColors[status]}`} />
      <span className="text-sm font-medium">{getStatusLabel(status)}</span>
    </div>
  );
}

function SeniorCard({ senior }: { senior: Senior }) {
  const [expanded, setExpanded] = useState(false);
  const status = getStatusFromCheckIns(senior.recentCheckIns);
  const lastCheckIn = senior.recentCheckIns[0];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Main card content */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {senior.fullName || senior.email}
            </h3>
            {senior.label && (
              <p className="text-sm text-gray-500">{senior.label}</p>
            )}
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Reassuring default state */}
        <p className="text-gray-600 text-sm mb-4">
          {lastCheckIn
            ? `Last check-in: ${timeAgo(lastCheckIn.createdAt)} — ${lastCheckIn.feelingOk ? 'feeling good' : 'had a tough moment'}`
            : 'No check-ins yet — they will appear here once started'}
        </p>

        {/* Weekly dots */}
        {senior.recentCheckIns.length > 0 && (
          <div className="flex items-center gap-1 mb-3">
            <span className="text-xs text-gray-400 mr-2">Last 7 days:</span>
            {senior.recentCheckIns.slice(0, 7).reverse().map((c, i) => (
              <StatusDot key={i} ok={c.feelingOk} />
            ))}
            {senior.recentCheckIns.length < 7 && (
              Array.from({ length: 7 - Math.min(senior.recentCheckIns.length, 7) }).map((_, i) => (
                <div key={`empty-${i}`} className="w-3 h-3 rounded-full bg-gray-200" title="No data" />
              ))
            )}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {expanded ? 'Hide details' : 'View details'}
        </button>
      </div>

      {/* Expandable detail section */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Check-Ins</h4>
          {senior.recentCheckIns.length === 0 ? (
            <p className="text-sm text-gray-500">No check-ins recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {senior.recentCheckIns.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {new Date(c.createdAt).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className={c.feelingOk ? 'text-green-600' : 'text-red-600'}>
                    {c.feelingOk ? 'Feeling good' : 'Tough day'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Link to notification preferences */}
          <div className="mt-4 pt-3 border-t border-gray-200">
            <a
              href="#"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Notification preferences
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CaretakerDashboard() {
  const router = useRouter();
  const [seniors, setSeniors] = useState<Senior[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSeniors();
  }, []);

  const fetchSeniors = async () => {
    try {
      const res = await fetch('/api/caretaker/seniors');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/auth');
          return;
        }
        throw new Error('Failed to load');
      }
      const data = await res.json();
      setSeniors(data.seniors || []);
    } catch (err) {
      setError('Unable to load your family members. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Bearable</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main content — mobile-first max width */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Reassuring header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Your Family</h2>
          <p className="text-gray-500 text-sm mt-1">
            At a glance — how your loved ones are doing
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {seniors.length === 0 && !error ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-gray-500 mb-4">
              No family members linked yet.
            </p>
            <p className="text-sm text-gray-400">
              Ask your loved one to send you an invite from their account.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {seniors.map((senior) => (
              <SeniorCard key={senior.id} senior={senior} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
