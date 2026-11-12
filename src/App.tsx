import { lazy, Suspense } from 'react';
import { HashRouter, NavLink, Route, Routes, Link } from 'react-router-dom';
import { BrandMark, IconDice, IconHome, IconMoon, IconQueue, IconReport, IconSun, IconTable } from './components/Icons';
import { FeedbackProvider } from './components/ui';
import { DbProvider, useDb } from './state/DbProvider';
import { SelectionProvider } from './state/selection';
import { ThemeProvider, useTheme } from './state/theme';
import Dashboard from './pages/Dashboard';

const DataPage = lazy(() => import('./pages/DataPage'));
const RecordFormPage = lazy(() => import('./pages/RecordFormPage'));
const QueuePage = lazy(() => import('./pages/QueuePage'));
const ScenariosPage = lazy(() => import('./pages/ScenariosPage'));
const MonteCarloPage = lazy(() => import('./pages/MonteCarloPage'));
const SimulatorPage = lazy(() => import('./pages/SimulatorPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));

const NAV = [
  { to: '/', label: 'Inicio', icon: IconHome, end: true },
  { to: '/datos', label: 'Datos', icon: IconTable },
  { to: '/colas', label: 'Colas', icon: IconQueue },
  { to: '/simular', label: 'Simular', icon: IconDice },
  { to: '/informe', label: 'Informe', icon: IconReport },
];

function SaveStatus() {
  const { saving, saveError } = useDb();
  if (saveError) return <span className="small" style={{ color: '#ffb4b4' }} role="alert">Sin guardar</span>;
  return <span className="small" style={{ color: 'var(--sign-muted)' }} aria-live="polite">{saving ? 'Guardando…' : 'Guardado'}</span>;
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const toDark = resolved === 'light';
  return (
    <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label={toDark ? 'Activar modo oscuro' : 'Activar modo claro'} title={toDark ? 'Modo oscuro' : 'Modo claro'}>
      {toDark ? <IconMoon /> : <IconSun />}
    </button>
  );
}

function Shell() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="ParkSmart Arkadia, inicio">
          <BrandMark className="brand-mark" />
          <span className="brand-name">ParkSmart <span>Arkadia</span></span>
        </Link>
        <span className="topbar-spacer" />
        <SaveStatus />
        <ThemeToggle />
      </header>
      <nav className="bottomnav" aria-label="Secciones">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main" id="contenido">
        <Suspense fallback={<p className="muted" role="status">Cargando…</p>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/datos" element={<DataPage />} />
            <Route path="/datos/registro/:id" element={<RecordFormPage />} />
            <Route path="/colas" element={<QueuePage />} />
            <Route path="/colas/escenarios" element={<ScenariosPage />} />
            <Route path="/simular" element={<MonteCarloPage />} />
            <Route path="/simular/visual" element={<SimulatorPage />} />
            <Route path="/informe" element={<ReportPage />} />
            <Route path="*" element={<p>Página no encontrada. <Link to="/">Volver al inicio</Link></p>} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <DbProvider>
      <SelectionProvider>
        <FeedbackProvider>
          <HashRouter>
            <Shell />
          </HashRouter>
        </FeedbackProvider>
      </SelectionProvider>
    </DbProvider>
    </ThemeProvider>
  );
}
