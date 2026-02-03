import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LayoutWithSidebar from './components/Layout/LayoutWithSidebar';
import Login from './pages/Login';
import OptionsAnalyzer from './pages/OptionsAnalyzer';
import AnalysisView from './pages/AnalysisView';
import OptionsCalculatorBasic from './pages/OptionsCalculatorBasic';
import UniversalOptionsCalculator from './pages/UniversalOptionsCalculator';
import SavedConfigurations from './pages/SavedConfigurations';
import UniversalSavedConfigurations from './pages/UniversalSavedConfigurations';
import GradualStrategyCalculator from './components/GradualStrategyCalculator/GradualStrategyCalculator';
import Settings from './pages/Settings/Settings';
import TestChart from './pages/TestChart';
import NewDeal from './pages/NewDeal';
import DealsArchive from './pages/DealsArchive';
import CryptoRating from './pages/CryptoRating';

function App() {
  return (
    <Routes>
      {/* Страница логина без Layout */}
      <Route path="/login" element={<Login />} />
      
      {/* Остальные страницы с Layout */}
      <Route path="/*" element={
        <LayoutWithSidebar>
          <Routes>
            <Route path="/" element={<UniversalOptionsCalculator />} />
            <Route path="/tools/options-analyzer" element={<OptionsAnalyzer />} />
            <Route path="/tools/options-calculator" element={<OptionsCalculatorBasic />} />
            <Route path="/tools/universal-calculator" element={<UniversalOptionsCalculator />} />
            <Route path="/tools/gradual-strategy-calculator" element={<GradualStrategyCalculator />} />
            <Route path="/tools/saved-configurations" element={<SavedConfigurations />} />
            <Route path="/tools/universal-saved-configurations" element={<UniversalSavedConfigurations />} />
            <Route path="/tools/test-chart" element={<TestChart />} />
            <Route path="/tools/new-deal" element={<NewDeal />} />
            <Route path="/tools/deals-archive" element={<DealsArchive />} />
            <Route path="/tools/crypto-rating" element={<CryptoRating />} />
            <Route path="/components" element={<Navigate to="/settings?section=components" replace />} />
            <Route path="/analysis/:id" element={<AnalysisView />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </LayoutWithSidebar>
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
