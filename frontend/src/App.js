import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import AuthModal from './components/AuthModal';
import LayoutWithSidebar from './components/Layout/LayoutWithSidebar';
import HomePageNew from './pages/HomePageNew';
import OptionsAnalyzer from './pages/OptionsAnalyzer';
import AnalysisView from './pages/AnalysisView';
import OptionsCalculatorBasic from './pages/OptionsCalculatorBasic';
import OptionsCalculatorML from './pages/OptionsCalculatorML';
import SavedConfigurations from './pages/SavedConfigurations';
import ComponentsShowcase from './pages/ComponentsShowcase';
import FloatingAIChat from './components/FloatingAIChat/FloatingAIChat';
import GradualStrategyCalculator from './components/GradualStrategyCalculator/GradualStrategyCalculator';
import IBMonitoring from './pages/IBMonitoring';
import Settings from './pages/Settings/Settings';
import TestChart from './pages/TestChart';
import NewDeal from './pages/NewDeal';
import DealsArchive from './pages/DealsArchive';
import CryptoRating from './pages/CryptoRating';

function App() {
  return (
    <AuthModal>
      <LayoutWithSidebar>
        <Routes>
          <Route path="/" element={<HomePageNew />} />
          <Route path="/tools/options-analyzer" element={<OptionsAnalyzer />} />
          <Route path="/tools/options-calculator" element={<OptionsCalculatorBasic />} />
          <Route path="/tools/calculator-ml" element={<OptionsCalculatorML />} />
          <Route path="/tools/gradual-strategy-calculator" element={<GradualStrategyCalculator />} />
          <Route path="/tools/saved-configurations" element={<SavedConfigurations />} />
          <Route path="/tools/test-chart" element={<TestChart />} />
          <Route path="/tools/new-deal" element={<NewDeal />} />
          <Route path="/tools/deals-archive" element={<DealsArchive />} />
          <Route path="/tools/crypto-rating" element={<CryptoRating />} />
          <Route path="/components" element={<Navigate to="/settings?section=components" replace />} />
          <Route path="/analysis/:id" element={<AnalysisView />} />
          <Route path="/admin/ib-monitoring" element={<IBMonitoring />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </LayoutWithSidebar>
      
      {/* Глобальный плавающий AI-чат */}
      <FloatingAIChat />
    </AuthModal>
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
