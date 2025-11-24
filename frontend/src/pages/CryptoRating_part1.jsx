import React, { useState, useEffect } from 'react';
import { Camera, ChevronDown, ChevronUp, Calendar, TrendingDown, TrendingUp, Trash2 } from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function CryptoRating() {
  const [snapshots, setSnapshots] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isAnalysesExpanded, setIsAnalysesExpanded] = useState(true);
  const [isSnapshotsExpanded, setIsSnapshotsExpanded] = useState(true);
  
  useEffect(() => {
    fetchData();
  }, []);
