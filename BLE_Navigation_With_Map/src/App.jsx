import React, { useState, useRef, useEffect } from 'react';

const LOCATIONS = {
  "AbhishekRoom": { top: '38%', left: '25%', label: "Abhishek's Room" },
  "LivingRoom": { top: '46%', left: '73%', label: "Living Room" }
};

function App() {
  const [activeBeacons, setActiveBeacons] = useState({});
  const [currentPos, setCurrentPos] = useState(null);
  
  const beaconDataRef = useRef({});

  useEffect(() => {
    
    const timer = setInterval(() => {
      const live = Object.values(beaconDataRef.current);
      
      const newState = {};
      live.forEach(b => { newState[b.name] = b; });
      setActiveBeacons(newState);

      
      if (live.length > 0) {
        const best = live.reduce((prev, curr) => (prev.rssi > curr.rssi) ? prev : curr);
        setCurrentPos(LOCATIONS[best.name]);
      } else {
        setCurrentPos(null);
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const connectBeacon = async () => {
    try {
      
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'AbhishekRoom' }, { name: 'LivingRoom' }]
      });

      
      device.addEventListener('advertisementreceived', (event) => {
        const deviceName = device.name;
        if (LOCATIONS[deviceName]) {
          beaconDataRef.current[deviceName] = {
            name: deviceName,
            rssi: event.rssi,
            lastSeen: Date.now() 
          };
        }
      });

      await device.watchAdvertisements();
      console.log(`✅ Successfully connected and watching: ${device.name}`);
      
    } catch (err) {
      console.error("Connection error:", err);
    }
  };

  return (
    <div style={{ display: 'flex', backgroundColor: '#05070a', minHeight: '100vh', color: '#00d4ff', fontFamily: 'monospace' }}>
      
      {/* Left side beacon list */}
      <div style={{ width: '280px', backgroundColor: '#0a0e14', padding: '20px', borderRight: '1px solid #1a2635' }}>
        <h3>Connected Beacons</h3>
        <hr border="1" color="#1a2635" />
        
        {Object.keys(activeBeacons).length === 0 && <p style={{color: '#444'}}>No beacons connected.</p>}
        
        {Object.values(activeBeacons).map(b => (
          <div key={b.name} style={{ background: '#111821', padding: '15px', margin: '10px 0', borderLeft: '4px solid #00ffcc' }}>
            <b style={{color: '#00ffcc'}}>{b.name}</b><br/>
            <span style={{fontSize: '22px'}}>{b.rssi}</span> dBm
          </div>
        ))}
      </div>

      {/* දකුණු පැත්තේ මැප් එක */}
      <div style={{ flex: 1, padding: '20px', textAlign: 'center' }}>
        <h1>BLE Based Indoor Navigation System</h1>
        
        <button onClick={connectBeacon} style={{ padding: '15px 30px', background: '#00ffcc', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', borderRadius: '5px', margin: '10px' }}>
          + ADD BEACON
        </button>

        <p style={{fontSize: '12px', color: '#666'}}>
          select 1st beacon after that select 2nd beacon.
        </p>

        <div style={{ position: 'relative', maxWidth: '800px', margin: '40px auto', border: '1px solid #1a2635', background: '#0d1117', height: '500px' }}>
          <svg viewBox="0 0 800 500" style={{ width: '100%' }}>
            <rect x="50" y="50" width="320" height="400" fill="none" stroke="#1a2635" strokeWidth="2" strokeDasharray="5,5" />
            <rect x="430" y="50" width="320" height="400" fill="none" stroke="#1a2635" strokeWidth="2" strokeDasharray="5,5" />
            <text x="210" y="30" fill="#00d4ff" textAnchor="middle">ABHISHEK'S ROOM</text>
            <text x="590" y="30" fill="#00d4ff" textAnchor="middle">LIVING ROOM</text>
          </svg>
          
          {currentPos && (
            <div style={{ position: 'absolute', width: '30px', height: '30px', background: '#00ffcc', borderRadius: '50%', top: currentPos.top, left: currentPos.left, transform: 'translate(-50%, -50%)', boxShadow: '0 0 30px #00ffcc', transition: 'all 0.8s ease' }}>
              <span style={{ position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', whiteSpace: 'nowrap', fontWeight: 'bold', color: '#00ffcc' }}>{currentPos.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;