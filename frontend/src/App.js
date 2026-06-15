import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { syncFuturesSettingsFromServer } from './utils/futuresSettings';
import { syncEtfSettingsFromServer } from './utils/etfSettings';
import { syncStrategyDefaultsFromServer } from './utils/strategyDefaults';
import LayoutWithSidebar from './components/Layout/LayoutWithSidebar';
import ProtectedRoute from './components/ProtectedRoute';
import OptionsAnalyzer from './pages/OptionsAnalyzer';
import AnalysisView from './pages/AnalysisView';
import OptionsCalculatorBasic from './pages/OptionsCalculatorBasic';
import UniversalOptionsCalculator from './pages/UniversalOptionsCalculator';
import SavedConfigurations from './pages/SavedConfigurations';
import UniversalSavedConfigurations from './pages/UniversalSavedConfigurations';
import DatabaseSavedConfigurations from './pages/DatabaseSavedConfigurations';
import GradualStrategyCalculator from './components/GradualStrategyCalculator/GradualStrategyCalculator';
import Settings from './pages/Settings/Settings';
import TestChart from './pages/TestChart';
import NewDeal from './pages/NewDeal';
import DealsArchive from './pages/DealsArchive';
import CryptoRating from './pages/CryptoRating';

function App() {
  // На старте подтягиваем общие таблицы настроек фьючерсов и ETF с сервера.
  // ЗАЧЕМ: до этой ручки таблицы жили только в localStorage и расходились
  // между пользователями. Теперь сервер хранит единый список; кэш в
  // localStorage остаётся для синхронных вызовов из калькулятора
  // (getPointValue, isEtfTicker и т.п.).
  useEffect(() => {
    syncFuturesSettingsFromServer();
    syncEtfSettingsFromServer();
    // Значения по умолчанию для экранов подбора «Север» / «Север GPT».
    syncStrategyDefaultsFromServer();
  }, []);

  return (
    <Routes>
      {/* Аутентификация отключена: старый /login ведёт на главную */}
      <Route path="/login" element={<Navigate to="/" replace />} />

      <Route path="/*" element={
        <ProtectedRoute>
          <LayoutWithSidebar>
            <Routes>
              <Route path="/" element={<UniversalOptionsCalculator />} />
              <Route path="/tools/options-analyzer" element={<OptionsAnalyzer />} />
              <Route path="/tools/options-calculator" element={<OptionsCalculatorBasic />} />
              <Route path="/tools/universal-calculator" element={<UniversalOptionsCalculator />} />
              <Route path="/tools/gradual-strategy-calculator" element={<GradualStrategyCalculator />} />
              <Route path="/tools/saved-configurations" element={<SavedConfigurations />} />
              <Route path="/tools/universal-saved-configurations" element={<UniversalSavedConfigurations />} />
              <Route path="/tools/db-saved-configurations" element={<DatabaseSavedConfigurations />} />
              <Route path="/tools/test-chart" element={<TestChart />} />
              <Route path="/tools/new-deal" element={<NewDeal />} />
              <Route path="/tools/deals-archive" element={<DealsArchive />} />
              <Route path="/tools/crypto-rating" element={<CryptoRating />} />
              <Route path="/components" element={<Navigate to="/settings?section=components" replace />} />
              <Route path="/analysis/:id" element={<AnalysisView />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </LayoutWithSidebar>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

function AppWithRouter() {
  return (
    <Router>
      <App />
    </Router>
  );
}

export default AppWithRouter;
