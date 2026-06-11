'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  userType: string;
}

export default function SeniorDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        router.push('/auth');
        return;
      }
      const data = await res.json();
      setUser(data.user);
    } catch (error) {
      router.push('/auth');
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Bearable Senior</h1>
          <button
            onClick={handleLogout}
            className="text-gray-600 hover:text-gray-900"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, {user?.fullName || 'User'}!</h2>
          <div className="space-y-2 text-gray-600">
            <p><strong>Email:</strong> {user?.email}</p>
            <p><strong>Phone:</strong> {user?.phone || 'Not set'}</p>
            <p><strong>Account Type:</strong> {user?.userType}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-3">Daily Check-In</h3>
            <p className="text-gray-600 mb-4">How are you feeling today?</p>
            <button className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">
              I'm Doing Well
            </button>
            <button className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 mt-2">
              I Need Help
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-3">Medications</h3>
            <p className="text-gray-600 mb-4">Track your daily medications</p>
            <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
              View Medications
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-3">Caretakers</h3>
            <p className="text-gray-600 mb-4">Manage your care team</p>
            <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
              Invite Caretaker
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-3">SMS Updates</h3>
            <p className="text-gray-600 mb-4">
              {user?.phone ? (
                <>Text <strong>{user.phone}</strong> anytime to check in!</>
              ) : (
                'Add your phone number to receive SMS reminders'
              )}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
