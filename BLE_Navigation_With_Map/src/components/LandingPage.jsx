import React, { useCallback, useEffect, useState } from 'react';
import './LandingPage.css';

const NAV_LINKS = [
  { id: 'hero-screen', label: 'Home', href: '#home' },
  { id: 'features', label: 'Features', href: '#features' },
  { id: 'how-it-works', label: 'How It Works', href: '#how-it-works' },
  { id: 'about', label: 'About', href: '#about' },
  { id: 'team', label: 'Team', href: '#team' },
];

const FEATURE_CARDS = [
  {
    id: 'indoor-nav',
    tag: 'Spatial Accuracy',
    title: 'Indoor Navigation',
    description:
      'Pinpoint real-time position across indoor building corridors, lecture halls, and campus wings where GPS signals drop out.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
      </svg>
    ),
  },
  {
    id: 'turn-by-turn',
    tag: 'Live Heading',
    title: 'Turn-by-Turn Guidance',
    description:
      'Step-by-step shortest corridor routing paired with phone gyroscope heading rotation at each hallway junction.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    ),
  },
  {
    id: 'ble-tech',
    tag: 'Web Bluetooth',
    title: 'BLE Technology',
    description:
      'RSSI signal filtering via 1D Kalman smoothing and path-loss distance estimation from authorized room beacons.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
      </svg>
    ),
  },
  {
    id: 'interactive-maps',
    tag: '2D Blueprint',
    title: 'Interactive Maps',
    description:
      'Pan, zoom, inspect live signal rings, switch compass modes, and preview calibrated beacon coordinates cleanly.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    number: '01',
    title: 'Pin Your Destination',
    detail:
      'Select your starting location or target room directly on the calibrated interactive building map.',
  },
  {
    number: '02',
    title: 'Connect BLE Beacons',
    detail:
      'Enable Bluetooth to scan nearby room beacons; Kalman smoothing stabilizes noisy RSSI measurements in real time.',
  },
  {
    number: '03',
    title: 'Follow Live Turn Guidance',
    detail:
      'Dijkstra routing computes the shortest corridor path and gyroscope compass cues announce upcoming turns.',
  },
];

const SUPPORTED_ZONES = [
  { code: 'ENT', name: 'Main Entrances' },
  { code: 'JNC', name: 'Corridor Junctions' },
  { code: 'LCT', name: 'Lecture Halls' },
  { code: 'LAB', name: 'Laboratories' },
  { code: 'OFF', name: 'Faculty Offices' },
  { code: 'STG', name: 'Stairs & Lifts' },
  { code: 'SEM', name: 'Seminar Rooms' },
  { code: 'PIN', name: 'Custom Map Pins' },
];

const SYSTEM_PILLARS = [
  {
    code: 'FILTERING',
    title: 'Kalman RSSI & Path-Loss',
    detail:
      '1D Kalman filters dampen indoor multipath spikes and translate stable RSSI signals into metric corridor distances.',
  },
  {
    code: 'ROUTING',
    title: 'Dijkstra & Junction Alignment',
    detail:
      'Shortest walkable path planning paired with sensor fusion that snaps orientation onto verified hallway axes.',
  },
  {
    code: 'RESILIENCE',
    title: 'Offline PWA Support',
    detail:
      'Floor-plan assets, routing tables, and beacon metadata cache locally so navigation works even without cellular data.',
  },
];

const TEAM_MEMBERS = [
  {
    id: '01',
    name: 'Team Member 01',
    role: 'Project Lead & Architecture',
    detail: 'System architecture, milestone coordination, and end-to-end validation across hardware and web modules.',
  },
  {
    id: '02',
    name: 'Team Member 02',
    role: 'BLE Hardware & Firmware',
    detail: 'ESP32 / BLE beacon calibration, TX power profiling, and room-by-room RSSI signal fingerprinting.',
  },
  {
    id: '03',
    name: 'Team Member 03',
    role: 'Localization Engine',
    detail: '1D Kalman smoothing, log-distance path-loss modeling, and proximity-weighted trilateration logic.',
  },
  {
    id: '04',
    name: 'Team Member 04',
    role: 'Routing & Motion Sensors',
    detail: 'Dijkstra walkable graph modeling, gyroscope compass heading fusion, and junction turn alerts.',
  },
  {
    id: '05',
    name: 'Team Member 05',
    role: 'Frontend UI & Cartography',
    detail: '2D floor plan layout, interactive canvas controls, landing experience, and mobile responsiveness.',
  },
  {
    id: '06',
    name: 'Team Member 06',
    role: 'PWA Offline & QA Testing',
    detail: 'Service Worker asset caching, cross-device Playwright regression testing, and technical documentation.',
  },
];

function BrandMark() {
  return (
    <svg className="landing-brand-svg" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#111a2b" stroke="rgba(148,163,184,0.28)" strokeWidth="1.5" />
      <path d="M16 7.5L23.5 23.5L16 19.5L8.5 23.5L16 7.5Z" stroke="#60a5fa" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx="16" cy="17.5" r="1.75" fill="#d4a656" />
    </svg>
  );
}

export default function LandingPage({ onStartNavigation }) {
  const [activeSection, setActiveSection] = useState('hero-screen');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const targets = NAV_LINKS.map((item) => document.getElementById(item.id)).filter(Boolean);
    if (targets.length === 0) return undefined;

    const ratios = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          ratios.set(entry.target.id, entry.intersectionRatio);
        });
        let bestId = null;
        let bestRatio = 0;
        targets.forEach((el) => {
          const r = ratios.get(el.id) || 0;
          if (r > bestRatio) {
            bestRatio = r;
            bestId = el.id;
          }
        });
        if (bestId && bestRatio > 0.15) {
          setActiveSection(bestId);
        }
      },
      { threshold: [0.15, 0.35, 0.6], rootMargin: '-12% 0px -18% 0px' },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((event, targetId) => {
    event?.preventDefault?.();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduce ? 'auto' : 'smooth';

    if (targetId === 'hero-screen' || targetId === 'home') {
      window.scrollTo({ top: 0, behavior });
      return;
    }

    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    const headerEl = document.querySelector('.landing-header');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const top = Math.max(0, targetEl.getBoundingClientRect().top + window.scrollY - headerH);
    window.scrollTo({ top, behavior });
  }, []);

  return (
    <div className="landing-page" id="home">
      <a className="landing-skip-link" href="#main-content">
        Skip to content
      </a>

      {/* Header */}
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <a
            href="#home"
            className="landing-brand-link"
            aria-label="NavSense Home"
            onClick={(e) => scrollToSection(e, 'hero-screen')}
          >
            <BrandMark />
            <div className="landing-brand-text">
              <span className="landing-brand-name">NavSense</span>
              <span className="landing-brand-sub">RUSL · Indoor Wayfinding</span>
            </div>
          </a>

          <nav className="landing-desktop-nav" aria-label="Primary navigation">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`landing-nav-link ${activeSection === item.id ? 'is-active' : ''}`}
                aria-current={activeSection === item.id ? 'location' : undefined}
                onClick={(e) => scrollToSection(e, item.id)}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <nav className="landing-mobile-nav-strip" aria-label="Mobile section navigation">
          {NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`landing-mobile-nav-link ${activeSection === item.id ? 'is-active' : ''}`}
              aria-current={activeSection === item.id ? 'location' : undefined}
              onClick={(e) => scrollToSection(e, item.id)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      {/* Desktop screen progress indicator (Visibility of System Status) */}
      <nav className="landing-screen-rail" aria-label="Section progress">
        {NAV_LINKS.map((item, idx) => (
          <a
            key={item.id}
            href={item.href}
            className={`landing-rail-dot ${activeSection === item.id ? 'is-active' : ''}`}
            aria-label={`Jump to screen ${idx + 1}: ${item.label}`}
            title={`${item.label}`}
            onClick={(e) => scrollToSection(e, item.id)}
          />
        ))}
      </nav>

      <main id="main-content" className="landing-main">
        {/* Screen 1: Hero */}
        <section id="hero-screen" className="landing-hero-section landing-snap-screen">
          <div className="landing-container landing-hero-grid">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">
                <span className="landing-eyebrow-code">SMART CAMPUS WAYFINDING</span>
                <span className="landing-eyebrow-sep" aria-hidden="true">/</span>
                <span>Faculty of Technology, RUSL</span>
              </p>

              <h1 className="landing-hero-title">
                Quiet precision for indoor campus navigation.
              </h1>

              <p className="landing-hero-subtitle">
                Navigate lecture halls, laboratories, and campus buildings using calibrated BLE beacons,
                gyroscope heading alignment, and clear turn-by-turn guidance.
              </p>

              <div className="landing-hero-actions">
                <button
                  type="button"
                  id="btnStartNav"
                  className="landing-btn-hero-primary"
                  onClick={onStartNavigation}
                >
                  <span>Start Navigation</span>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4.5 10h11" />
                    <path d="M11.5 6l4 4-4 4" />
                  </svg>
                </button>
              </div>

              <dl className="landing-hero-specs" aria-label="System coverage">
                <div className="landing-spec-item">
                  <dt>Scope</dt>
                  <dd>Rooms, Halls &amp; Corridors</dd>
                </div>
                <div className="landing-spec-item">
                  <dt>Sensors</dt>
                  <dd>BLE RSSI + Gyroscope</dd>
                </div>
                <div className="landing-spec-item">
                  <dt>Runtime</dt>
                  <dd>Offline-ready PWA</dd>
                </div>
              </dl>
            </div>

            <div className="landing-hero-visual-panel">
              <div className="landing-hero-frame">
                <div className="landing-frame-header">
                  <span className="landing-frame-dot" aria-hidden="true" />
                  <span className="landing-frame-title">RUSL · Faculty of Technology</span>
                  <span className="landing-frame-badge">2D Blueprint</span>
                </div>
                <img
                  src="/assets/NavSense at Rajarata University.png"
                  alt="NavSense interactive indoor navigation map at Rajarata University"
                  className="landing-hero-visual-img"
                  decoding="async"
                />
                <div className="landing-frame-caption">
                  <span>Interactive Map · Corridor &amp; Junction Graph</span>
                  <span>BLE + IMU</span>
                </div>
              </div>
            </div>
          </div>

          <a
            href="#features"
            className="landing-scroll-cue"
            aria-label="Scroll to Capabilities section"
            onClick={(e) => scrollToSection(e, 'features')}
          >
            <span>Scroll to explore</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4v11" />
              <path d="M6 11l4 4 4-4" />
            </svg>
          </a>
        </section>

        {/* Screen 2: Features */}
        <section id="features" className="landing-section landing-snap-screen">
          <div className="landing-container landing-screen-body">
            <div className="landing-section-header">
              <p className="landing-section-kicker">01 · CAPABILITIES</p>
              <h2 className="landing-section-title">Designed for clear indoor wayfinding</h2>
              <p className="landing-section-lead">
                Four focused subsystems work together to replace outdoor GPS inside multi-room campus buildings.
              </p>
            </div>

            <div className="landing-features-grid">
              {FEATURE_CARDS.map((card) => (
                <article key={card.id} className="landing-feature-card">
                  <div className="landing-feature-head">
                    <div className="landing-feature-icon">{card.icon}</div>
                    <span className="landing-feature-tag">{card.tag}</span>
                  </div>
                  <h3 className="landing-feature-title">{card.title}</h3>
                  <p className="landing-feature-desc">{card.description}</p>
                </article>
              ))}
            </div>
          </div>

          <a
            href="#how-it-works"
            className="landing-scroll-cue"
            aria-label="Scroll to Workflow section"
            onClick={(e) => scrollToSection(e, 'how-it-works')}
          >
            <span>Next: Workflow</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4v11" />
              <path d="M6 11l4 4 4-4" />
            </svg>
          </a>
        </section>

        {/* Screen 3: How It Works */}
        <section id="how-it-works" className="landing-section landing-section-alt landing-snap-screen">
          <div className="landing-container landing-screen-body">
            <div className="landing-section-header">
              <p className="landing-section-kicker">02 · WORKFLOW</p>
              <h2 className="landing-section-title">Three steps from entrance to destination</h2>
              <p className="landing-section-lead">
                Open the live floor map, connect nearby beacons, and follow calm turn-by-turn corridor guidance.
              </p>
            </div>

            <div className="landing-steps-grid">
              {HOW_IT_WORKS_STEPS.map((step) => (
                <article key={step.number} className="landing-step-card">
                  <span className="landing-step-index">{step.number}</span>
                  <h3 className="landing-step-title">{step.title}</h3>
                  <p className="landing-step-desc">{step.detail}</p>
                </article>
              ))}
            </div>

            <div className="landing-directory-panel" aria-label="Supported indoor spatial nodes">
              <div className="landing-directory-header">
                <div>
                  <span className="landing-directory-kicker">GENERALIZED MAP ARCHITECTURE</span>
                  <h3 className="landing-directory-title">Supported Building Zones</h3>
                </div>
                <span className="landing-directory-count">{SUPPORTED_ZONES.length} Zone Types</span>
              </div>

              <ul className="landing-directory-grid">
                {SUPPORTED_ZONES.map((zone) => (
                  <li key={zone.name} className="landing-directory-item">
                    <span className="landing-directory-code">{zone.code}</span>
                    <span className="landing-directory-name">{zone.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <a
            href="#about"
            className="landing-scroll-cue"
            aria-label="Scroll to Architecture section"
            onClick={(e) => scrollToSection(e, 'about')}
          >
            <span>Next: Architecture</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4v11" />
              <path d="M6 11l4 4 4-4" />
            </svg>
          </a>
        </section>

        {/* Screen 4: About & Architecture */}
        <section id="about" className="landing-section landing-snap-screen">
          <div className="landing-container landing-screen-body">
            <div className="landing-about-grid">
              <div className="landing-about-left">
                <div className="landing-section-header landing-section-header-left">
                  <p className="landing-section-kicker">03 · ARCHITECTURE</p>
                  <h2 className="landing-section-title">Reliable sensing beneath a quiet interface</h2>
                  <p className="landing-section-lead">
                    Developed for the Faculty of Technology at Rajarata University of Sri Lanka, combining
                    low-energy RF ranging with browser-native Progressive Web App delivery across campus facilities.
                  </p>
                </div>

                <div className="landing-pillars-list">
                  {SYSTEM_PILLARS.map((pillar) => (
                    <article key={pillar.title} className="landing-pillar-card">
                      <span className="landing-pillar-code">{pillar.code}</span>
                      <div>
                        <h3 className="landing-pillar-title">{pillar.title}</h3>
                        <p className="landing-pillar-desc">{pillar.detail}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <aside className="landing-campus-plaque" aria-label="University affiliation">
                <div className="landing-campus-crest-box">
                  <img
                    src="/assets/rajarata-university-logo.png"
                    alt="Rajarata University of Sri Lanka Official Crest"
                    className="landing-campus-logo"
                    decoding="async"
                  />
                </div>
                <div className="landing-campus-meta">
                  <span className="landing-campus-label">ACADEMIC DEPLOYMENT</span>
                  <h3 className="landing-campus-name">Rajarata University of Sri Lanka</h3>
                  <p className="landing-campus-sub">Faculty of Technology · Mihintale, Sri Lanka</p>
                  <dl className="landing-campus-facts">
                    <div>
                      <dt>Target Environment</dt>
                      <dd>Academic Buildings &amp; Lecture Wings</dd>
                    </div>
                    <div>
                      <dt>Installation</dt>
                      <dd>Browser + Home Screen PWA</dd>
                    </div>
                  </dl>
                </div>
              </aside>
            </div>
          </div>

          <a
            href="#team"
            className="landing-scroll-cue"
            aria-label="Scroll to Project Team section"
            onClick={(e) => scrollToSection(e, 'team')}
          >
            <span>Next: Project Team</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4v11" />
              <path d="M6 11l4 4 4-4" />
            </svg>
          </a>
        </section>

        {/* Screen 5: Team */}
        <section id="team" className="landing-section landing-section-alt landing-team-screen landing-snap-screen">
          <div className="landing-container landing-screen-body">
            <div className="landing-section-header">
              <p className="landing-section-kicker">04 · PROJECT TEAM</p>
              <h2 className="landing-section-title">Six contributors behind NavSense</h2>
              <p className="landing-section-lead">
                Faculty of Technology engineering cohort collaborating across embedded BLE, routing math,
                UI cartography, and validation.
              </p>
            </div>

            <div className="landing-team-grid">
              {TEAM_MEMBERS.map((member) => (
                <article key={member.id} className="landing-team-card">
                  <div className="landing-team-card-head">
                    <span className="landing-team-index">{member.id}</span>
                    <div className="landing-team-identity">
                      <h3 className="landing-team-name">{member.name}</h3>
                      <p className="landing-team-role">{member.role}</p>
                    </div>
                  </div>
                  <p className="landing-team-detail">{member.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Closing Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-card">
            <div className="landing-footer-brand">
              <img
                src="/assets/rajarata-university-logo-white.png"
                alt="Rajarata University Crest"
                className="landing-footer-logo"
              />
              <div>
                <p className="landing-footer-title">NavSense · Rajarata University of Sri Lanka</p>
                <p className="landing-footer-subtitle">
                  Faculty of Technology · BLE &amp; Gyroscope Indoor Wayfinding System
                </p>
              </div>
            </div>

            <div className="landing-footer-actions">
              <button
                type="button"
                className="landing-footer-launch"
                onClick={onStartNavigation}
              >
                Open Live Map
              </button>
            </div>
          </div>

          <p className="landing-footer-copyright">
            © 2026 NavSense · Indoor Navigation System · Faculty of Technology, RUSL
          </p>
        </div>
      </footer>
    </div>
  );
}
