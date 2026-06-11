export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'system-ui, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
    }}>
      <div style={{
        maxWidth: '600px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: 'bold',
          marginBottom: '16px',
        }}>
          Bearable Senior
        </h1>
        <p style={{
          fontSize: '20px',
          marginBottom: '32px',
          opacity: 0.9,
        }}>
          Daily wellness check-ins + medication reminders + caretaker peace of mind.
        </p>
        <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          marginTop: '40px',
        }}>
          <a
            href="/auth"
            style={{
              padding: '12px 32px',
              background: 'white',
              color: '#667eea',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '16px',
            }}
          >
            Sign In
          </a>
          <a
            href="https://github.com/LeviathanTX/bearable-senior"
            style={{
              padding: '12px 32px',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '16px',
            }}
          >
            View on GitHub
          </a>
        </div>
        <div style={{
          marginTop: '60px',
          padding: '24px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '12px',
          textAlign: 'left',
        }}>
          <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Features</h2>
          <ul style={{ lineHeight: '2', listStyle: 'none', padding: 0 }}>
            <li>✅ Daily wellness check-ins via SMS</li>
            <li>✅ Natural language medication reminders</li>
            <li>✅ Multi-agent health escalation (2/3 consensus)</li>
            <li>✅ Privacy-first: PII redaction + de-identification</li>
            <li>✅ Family dashboard with peace-of-mind updates</li>
            <li>✅ HIPAA-eligible architecture</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
