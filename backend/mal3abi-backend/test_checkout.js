const fetch = require('node-fetch'); // or use native fetch in node 22

async function test() {
  try {
    // 1. Login to get a token
    const loginRes = await fetch('http://localhost:4000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'manager@mal3bk.com', password: 'password123' }) // Assuming manager or player exists
    });
    
    if (!loginRes.ok) {
      console.log('Login failed:', await loginRes.text());
      // try player
      const loginRes2 = await fetch('http://localhost:4000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'player@mal3bk.com', password: 'password123' })
      });
      if (!loginRes2.ok) {
         console.log('Player login failed:', await loginRes2.text());
         return;
      }
      var { token } = await loginRes2.json();
    } else {
      var { token } = await loginRes.json();
    }

    console.log('Got token, creating checkout session...');
    
    const checkoutRes = await fetch('http://localhost:4000/api/v1/payments/create-checkout-session', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({
        courtId: '00000000-0000-0000-0000-000000000000', // Dummy
        date: '2026-08-16',
        startTime: '10:00',
        endTime: '11:00'
      })
    });
    
    console.log('Status:', checkoutRes.status);
    console.log('Response:', await checkoutRes.text());

  } catch (e) {
    console.error('Script error:', e);
  }
}
test();
