import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Loader2, AlertTriangle, X, AlertCircle, BarChart3, HelpCircle, 
  Trash2, Copy, Settings, Download, RotateCcw, Filter, Columns, Rows, 
  Plus, ArrowUpDown, ChevronDown, Edit3, Save, Calendar, Search, 
  Grid, FileText, Play, RefreshCw, ShieldAlert, Sparkles, Check,
  Binary, Scissors, Type, Table, Home
} from 'lucide-react';
import { ALGORITHMS } from '../config/algorithms';
import ContextMenu from './ContextMenu';

import './styles/datalab-theme.css';
import './styles/datalab-layout.css';
import './styles/datalab-ribbon.css';
import './styles/datalab-table.css';
import './styles/datalab-sidebars.css';

const DTYPE_STYLES = {
  int64: 'col-type',
  int32: 'col-type',
  int16: 'col-type',
  int8: 'col-type',
  uint64: 'col-type',
  uint32: 'col-type',
  uint16: 'col-type',
  uint8: 'col-type',
  float64: 'col-type flt',
  float32: 'col-type flt',
  object: 'col-type obj',
  bool: 'col-type obj',
  boolean: 'col-type obj'
};

const getDtypeClass = (dtype) => {
  const typeStr = String(dtype).toLowerCase();
  for (const [key, value] of Object.entries(DTYPE_STYLES)) {
    if (typeStr.includes(key)) {
      return value;
    }
  }
  return 'col-type';
};

const formatPreviewNumber = (val) => {
  if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) return val;
  return val % 1 !== 0 ? Number(val.toFixed(4)) : val;
};

const DATALAB_API_BASE = 'http://localhost:8000/api/datalab';

export default function DataLabWorkspace({
  projectName,
  onBack,
  onHome,
  existingProjectNames = [],
  onLaunchProject,
  initialSession = null,
  initialViewMode = 'data'
}) {
  // Session details
  const [session, setSession] = useState(initialSession);
  const [activeViewMode, setActiveViewMode] = useState(initialViewMode); // 'data' | 'graph'
  const [activeGraphTab, setActiveGraphTab] = useState('Builder'); // 'Builder' | 'Saved'
  const runTriggerRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Hoisted Saved Graphs states
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [selectedSavedGraph, setSelectedSavedGraph] = useState(null);
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [savedSortBy, setSavedSortBy] = useState('Newest');
  const [savedGraphsRefreshTrigger, setSavedGraphsRefreshTrigger] = useState(0);

  // Fetch saved graphs when history tab is active
  useEffect(() => {
    if (activeGraphTab === 'Saved' && projectName) {
      const fetchSavedGraphs = async () => {
        setIsLoadingSaved(true);
        try {
          const res = await fetch(`${DATALAB_API_BASE}/get-saved-graphs?projectName=${encodeURIComponent(projectName)}`);
          const data = await res.json();
          if (res.ok && data.success) {
            setSavedGraphs(data.graphs);
          }
        } catch (e) {
          console.error('Error fetching saved graphs:', e);
        } finally {
          setIsLoadingSaved(false);
        }
      };
      fetchSavedGraphs();
    }
  }, [activeGraphTab, projectName, savedGraphsRefreshTrigger]);

  // Clear selection on project or active dataset change
  useEffect(() => {
    setSelectedSavedGraph(null);
  }, [projectName, session?.processedDatasetPath, session?.rawDatasetPath]);

  // Filter & Sort Saved Graphs
  const sortedSavedGraphs = useMemo(() => {
    const filtered = savedGraphs.filter(g => {
      const q = savedSearchQuery.toLowerCase();
      const nameMatch = g.graphName ? g.graphName.toLowerCase().includes(q) : false;
      const typeMatch = g.chartType ? g.chartType.toLowerCase().includes(q) : false;
      const datasetMatch = g.dataset ? g.dataset.toLowerCase().includes(q) : false;
      const xMatch = g.xAxis ? g.xAxis.some(x => x.toLowerCase().includes(q)) : false;
      const yMatch = g.yAxis ? g.yAxis.some(y => y.toLowerCase().includes(q)) : false;
      return nameMatch || typeMatch || datasetMatch || xMatch || yMatch;
    });

    return [...filtered].sort((a, b) => {
      if (savedSortBy === 'Newest') {
        return new Date(b.createdAt) - new Date(a.createdAt);
      } else if (savedSortBy === 'Oldest') {
        return new Date(a.createdAt) - new Date(b.createdAt);
      } else if (savedSortBy === 'Name') {
        return (a.graphName || '').localeCompare(b.graphName || '');
      }
      return 0;
    });
  }, [savedGraphs, savedSearchQuery, savedSortBy]);

  // Automatically select the first available graph in Saved Graphs tab
  useEffect(() => {
    if (activeGraphTab === 'Saved') {
      if (sortedSavedGraphs.length > 0) {
        const isStillInList = selectedSavedGraph && sortedSavedGraphs.some(g => g.graphId === selectedSavedGraph.graphId);
        if (!isStillInList) {
          setSelectedSavedGraph(sortedSavedGraphs[0]);
        }
      } else {
        setSelectedSavedGraph(null);
      }
    }
  }, [activeGraphTab, sortedSavedGraphs, selectedSavedGraph]);

  // Rows limit and display configuration
  const [rowsLimit, setRowsLimit] = useState(50);
  const [pendingLimit, setPendingLimit] = useState(null);
  const [showWarningModal, setShowWarningModal] = useState(false);

  const handleLimitChange = (newLimit) => {
    const totalRows = session?.metadata?.totalRows || 0;
    if (newLimit === 'all' && totalRows > 1000) {
      setPendingLimit('all');
      setShowWarningModal(true);
    } else {
      setRowsLimit(newLimit);
    }
  };

  // Active column tracking
  const [selectedColumn, setSelectedColumn] = useState('');
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [columnStats, setColumnStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Resizable stats sidebar
  const [statsWidth, setStatsWidth] = useState(() => {
    const saved = localStorage.getItem('dera_datalab_stats_width');
    return saved ? parseInt(saved, 10) : 260;
  });
  const isDraggingStats = useRef(false);

  useEffect(() => {
    localStorage.setItem('dera_datalab_stats_width', statsWidth.toString());
  }, [statsWidth]);

  const handleStatsResize = (e) => {
    if (!isDraggingStats.current) return;
    const mainEl = document.querySelector('.main');
    if (mainEl) {
      const rect = mainEl.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      const clampedWidth = Math.max(260, newWidth);
      setStatsWidth(clampedWidth);
    }
  };

  const stopStatsResize = () => {
    isDraggingStats.current = false;
    document.removeEventListener('mousemove', handleStatsResize);
    document.removeEventListener('mouseup', stopStatsResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const startStatsResize = (e) => {
    e.preventDefault();
    isDraggingStats.current = true;
    document.addEventListener('mousemove', handleStatsResize);
    document.addEventListener('mouseup', stopStatsResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Inspector tab
  const [activeInspectorTab, setActiveInspectorTab] = useState('Stats'); // 'Stats' | 'GraphBuilder'

  // Search filter for left sidebar Graph Builder columns
  const [graphSearch, setGraphSearch] = useState('');

  // Active ribbon operation popover action
  const [activeRibbonAction, setActiveRibbonAction] = useState(''); // 'rename' | 'cast' | 'fill' | 'filter' | 'constant' | ''

  // Preprocessing Form inputs
  const [renameNewName, setRenameNewName] = useState('');
  const [castType, setCastType] = useState('int64');
  const [fillStrategy, setFillStrategy] = useState('mean');
  const [fillValue, setFillValue] = useState('');
  const [filterOperator, setFilterOperator] = useState('==');
  const [filterValue, setFilterValue] = useState('');

  // Ribbon collapse & pin state
  const [isPinned, setIsPinned] = useState(true);
  const [isTempExpanded, setIsTempExpanded] = useState(false);
  const ribbonRef = useRef(null);

  // Tab click handler
  const handleTabClick = (category) => {
    if (activeCategory === category) {
      if (!isPinned) {
        setIsTempExpanded(!isTempExpanded);
      }
    } else {
      setActiveCategory(category);
      setActiveRibbonAction('');
      if (!isPinned) {
        setIsTempExpanded(true);
      }
    }
  };

  // Click outside detection for ribbon
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (ribbonRef.current && !ribbonRef.current.contains(e.target)) {
        if (!isPinned && isTempExpanded) {
          setIsTempExpanded(false);
        }
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isPinned, isTempExpanded]);

  // Category navigation state
  const [activeCategory, setActiveCategory] = useState('Home');
  const [contextMenu, setContextMenu] = useState(null);
  const [duplicateNewName, setDuplicateNewName] = useState('');
  const [splitDelimiter, setSplitDelimiter] = useState(',');
  const [mergeCol2, setMergeCol2] = useState('');
  const [mergeSeparator, setMergeSeparator] = useState(' ');
  const [mergeNewName, setMergeNewName] = useState('');
  const [interpolateMethod, setInterpolateMethod] = useState('linear');
  const [dropNullScope, setDropNullScope] = useState('column');
  const [dropNullThreshold, setDropNullThreshold] = useState('50');
  const [dedupeSubsetCols, setDedupeSubsetCols] = useState([]);
  const [sampleMethod, setSampleMethod] = useState('count');
  const [sampleValue, setSampleValue] = useState('100');
  const [sampleRandomState, setSampleRandomState] = useState('42');
  const [dropRowsStart, setDropRowsStart] = useState('');
  const [dropRowsEnd, setDropRowsEnd] = useState('');
  const [ordinalOrder, setOrdinalOrder] = useState('');
  const [logShift, setLogShift] = useState('1');
  const [powerExponent, setPowerExponent] = useState('2');
  const [formulaInput, setFormulaInput] = useState('');
  const [formulaNewName, setFormulaNewName] = useState('');
  const [binCount, setBinCount] = useState('5');
  const [binNewName, setBinNewName] = useState('');
  const [dateExtractParts, setDateExtractParts] = useState(['year', 'month', 'day']);
  const [regexPattern, setRegexPattern] = useState('');
  const [regexNewName, setRegexNewName] = useState('');
  const [rollingWindowSize, setRollingWindowSize] = useState('3');
  const [rollingOp, setRollingOp] = useState('mean');
  const [rollingNewName, setRollingNewName] = useState('');
  const [interactionCol2, setInteractionCol2] = useState('');
  const [interactionNewName, setInteractionNewName] = useState('');
  const [corrTarget, setCorrTarget] = useState('');
  const [corrThreshold, setCorrThreshold] = useState('0.1');
  const [varThreshold, setVarThreshold] = useState('0.0');
  const [kBestTarget, setKBestTarget] = useState('');
  const [kBestK, setKBestK] = useState('5');
  const [highCorrThreshold, setHighCorrThreshold] = useState('0.9');
  const [zScoreThreshold, setZScoreThreshold] = useState('3.0');
  const [capLowerQuantile, setCapLowerQuantile] = useState('0.01');
  const [capUpperQuantile, setCapUpperQuantile] = useState('0.99');
  const [removeOutlierMethod, setRemoveOutlierMethod] = useState('iqr');
  const [removeOutlierThreshold, setRemoveOutlierThreshold] = useState('3.0');
  const [replaceOld, setReplaceOld] = useState('');
  const [replaceNew, setReplaceNew] = useState('');
  const [regexReplacePattern, setRegexReplacePattern] = useState('');
  const [regexReplaceNew, setRegexReplaceNew] = useState('');
  const [groupByCols, setGroupByCols] = useState([]);
  const [aggCol, setAggCol] = useState('');
  const [aggType, setAggType] = useState('mean');
  const [pivotIndex, setPivotIndex] = useState('');
  const [pivotColumns, setPivotColumns] = useState('');
  const [pivotValues, setPivotValues] = useState('');
  const [pivotAgg, setPivotAgg] = useState('mean');
  const [meltIdVars, setMeltIdVars] = useState([]);
  const [meltValueVars, setMeltValueVars] = useState([]);
  const [snapshotNameInput, setSnapshotNameInput] = useState('');
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);

  // Profiling Modals
  const [profilingModalOpen, setProfilingModalOpen] = useState(false);
  const [profilingModalType, setProfilingModalType] = useState('');
  const [profilingModalData, setProfilingModalData] = useState(null);
  const [isProfilingLoading, setIsProfilingLoading] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState({ message: '', type: '', visible: false });

  const showToast = (message, type = 'success') => {
    setToast({ message, type, visible: true });
  };

  // Sync Data Lab session state to backend on changes
  useEffect(() => {
    if (projectName && session) {
      const syncSession = async () => {
        try {
          await fetch(`${DATALAB_API_BASE}/sync-datalab-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectName, session })
          });
        } catch (e) {
          console.error('[DERA Client DataLab] Failed to sync session to backend:', e);
        }
      };
      syncSession();
    }
  }, [projectName, session]);

  // Load preview page when rows limit or active dataset path changes
  useEffect(() => {
    if (session) {
      loadPreviewPage(rowsLimit);
    }
  }, [rowsLimit, session?.sessionId, session?.processedDatasetPath, session?.rawDatasetPath]);

  // Auto-hide toast
  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(() => {
        setToast(prev => ({ ...prev, visible: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.visible]);

  // Load preview data from server
  const loadPreviewPage = async (limitVal) => {
    if (!session) return;
    setIsProcessing(true);
    try {
      const activePath = session.processedDatasetPath || session.rawDatasetPath;
      const res = await fetch(`${DATALAB_API_BASE}/preview-dataset?projectName=${encodeURIComponent(projectName)}&filePath=${encodeURIComponent(activePath)}&limit=${limitVal}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSession(prev => ({
          ...prev,
          metadata: {
            ...prev.metadata,
            records: data.records,
            totalRows: data.totalRows,
            totalCols: data.totalCols,
            missingCounts: data.missingCounts,
            dtypes: data.dtypes
          }
        }));
      } else {
        alert(data.error || 'Failed to load dataset preview.');
      }
    } catch (err) {
      console.error('[DERA Client DataLab] Dataset preview error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Select first column on load
  const records = session?.metadata?.records || [];
  const [customColumnOrder, setCustomColumnOrder] = useState([]);

  const sessionColumnsJson = JSON.stringify(session?.metadata?.columns || []);
  useEffect(() => {
    const recs = session?.metadata?.records || [];
    const sessionCols = session?.metadata?.columns || (recs.length > 0 ? Object.keys(recs[0]) : []);
    setCustomColumnOrder(sessionCols);
  }, [sessionColumnsJson, session?.metadata?.records]);

  const columns = customColumnOrder;

  useEffect(() => {
    if (columns.length > 0 && !selectedColumn) {
      setSelectedColumn(columns[0]);
    }
  }, [columns, selectedColumn]);

  // Lazy load statistics when selected column or active file changes
  useEffect(() => {
    if (!session || !selectedColumn) {
      setColumnStats(null);
      return;
    }
    const fetchStats = async () => {
      setIsLoadingStats(true);
      try {
        const filePath = session.processedDatasetPath || session.rawDatasetPath;
        const res = await fetch(`${DATALAB_API_BASE}/column-stats?projectName=${encodeURIComponent(projectName)}&filePath=${encodeURIComponent(filePath)}&column=${encodeURIComponent(selectedColumn)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setColumnStats(data.stats);
          }
        }
      } catch (err) {
        console.error('Failed to fetch column stats:', err);
      } finally {
        setIsLoadingStats(false);
      }
    };
    fetchStats();
  }, [selectedColumn, session?.processedDatasetPath, session?.rawDatasetPath]);

  // Reset ribbon menus when action switches
  useEffect(() => {
    if (activeRibbonAction) {
      if (activeRibbonAction === 'rename') setRenameNewName(selectedColumn || '');
    }
  }, [activeRibbonAction, selectedColumn]);

  // Adjust active popover position to fixed viewport-relative coordinates
  // to prevent horizontal-scroll container (overflow-y: hidden) from clipping it.
  useEffect(() => {
    if (activeRibbonAction) {
      const adjustPopover = () => {
        const popover = document.querySelector('.ribbon-tools-container .absolute');
        const activeButton = document.querySelector('.rbtn-large.active, .rbtn-small.active');
        if (popover && activeButton) {
          const rect = activeButton.getBoundingClientRect();
          popover.style.position = 'fixed';
          popover.style.top = `${rect.bottom + 6}px`;
          
          const popoverWidth = popover.offsetWidth || 240;
          popover.style.left = `${Math.min(rect.left, window.innerWidth - popoverWidth - 16)}px`;
          popover.style.zIndex = '100';
        }
      };

      adjustPopover();
      const timer = setTimeout(adjustPopover, 10);
      return () => clearTimeout(timer);
    }
  }, [activeRibbonAction]);

  // OpenFileDialog selection
  const handleSelectLocalDataset = async () => {
    setIsSelecting(true);
    try {
      const response = await fetch(`${DATALAB_API_BASE}/select-dataset?projectName=${encodeURIComponent(projectName)}`);
      const data = await response.json();
      if (response.ok && data.success) {
        if (data.cancelled) {
          setIsSelecting(false);
          return;
        }
        const dataset = data.dataset;
        const newSession = {
          sessionId: dataset.datasetId,
          rawDatasetPath: dataset.rawDatasetPath,
          processedDatasetPath: '',
          columns: [],
          metadata: {
            totalRows: 0,
            totalCols: 0,
            missingCounts: {},
            dtypes: {},
            records: []
          },
          preprocessingSteps: [],
          createdAt: dataset.createdAt
        };
        setSession(newSession);
        setSelectedColumn('');
        setColumnStats(null);
      } else {
        alert(data.error || 'Failed to select dataset file.');
      }
    } catch (err) {
      console.error('[DERA Client DataLab] File select error:', err);
      alert('Error connecting to DERA server for file selection.');
    } finally {
      setIsSelecting(false);
    }
  };

  const handleFileInput = async (e) => {
    const file = e.target.files[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const uploadFile = async (file) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${DATALAB_API_BASE}/upload-dataset?projectName=${encodeURIComponent(projectName)}`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const dataset = data.dataset;
        const newSession = {
          sessionId: dataset.datasetId,
          rawDatasetPath: dataset.rawDatasetPath,
          processedDatasetPath: '',
          columns: [],
          metadata: {
            totalRows: 0,
            totalCols: 0,
            missingCounts: {},
            dtypes: {},
            records: []
          },
          preprocessingSteps: [],
          createdAt: dataset.createdAt
        };
        setSession(newSession);
        setSelectedColumn('');
        setColumnStats(null);
      } else {
        alert(data.error || 'Failed to upload dataset.');
      }
    } catch (err) {
      console.error('[DERA Client DataLab] Upload error:', err);
      alert('Error uploading file to DERA server.');
    } finally {
      setIsUploading(false);
    }
  };

  // Run preprocessing pipeline steps
  const runPreprocessing = async (updatedSteps) => {
    setIsProcessing(true);
    const lastStep = updatedSteps[updatedSteps.length - 1];

    try {
      const response = await fetch(`${DATALAB_API_BASE}/preprocess-dataset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          sessionId: session.sessionId,
          rawDatasetPath: session.rawDatasetPath,
          preprocessingSteps: updatedSteps,
          createdAt: session.createdAt
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSession(data.session);
        setActiveRibbonAction('');

        // Toast feedback based on step
        if (updatedSteps.length === 0) {
          showToast('Dataset reset to original raw state', 'info');
        } else if (lastStep) {
          showToast(`Applied: ${getCompactStepText(lastStep)}`, 'success');
        }
      } else {
        showToast(data.error || 'Failed to apply transformation steps.', 'error');
      }
    } catch (err) {
      console.error('[DERA Client DataLab] Preprocess run error:', err);
      showToast('Error communicating with preprocessing engine.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCastTypeDirect = (type) => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'change_datatype',
      params: { column: selectedColumn, dtype: type }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleDatePartDirect = (part) => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'date_parts',
      params: { column: selectedColumn, parts: [part] }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  // Core Pipeline Step Generators
  const handleDropColumn = (col) => {
    if (!col) return;
    const newStep = {
      type: 'drop_columns',
      params: { columns: [col] }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleRenameColumn = () => {
    if (!selectedColumn || !renameNewName.trim() || renameNewName.trim() === selectedColumn) return;
    const newStep = {
      type: 'rename_column',
      params: { oldName: selectedColumn, newName: renameNewName.trim() }
    };
    const updatedSteps = [...session.preprocessingSteps, newStep];
    runPreprocessing(updatedSteps);
    setSelectedColumn(renameNewName.trim());
  };

  const handleChangeDatatype = () => {
    if (!selectedColumn || !castType) return;
    const newStep = {
      type: 'change_datatype',
      params: { column: selectedColumn, dtype: castType }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleFillNull = (strategy, customVal = null) => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'fill_null',
      params: {
        column: selectedColumn,
        strategy,
        value: strategy === 'constant' ? customVal : null
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleFilterRows = () => {
    if (!selectedColumn || !filterOperator || filterValue === '') return;
    const newStep = {
      type: 'filter_rows',
      params: { column: selectedColumn, operator: filterOperator, value: filterValue }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleRemoveDuplicates = () => {
    const newStep = {
      type: 'remove_duplicates',
      params: {}
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleSortColumn = (ascending) => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'sort_column',
      params: { column: selectedColumn, ascending }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleScaleColumn = (strategy) => {
    if (!selectedColumn) return;
    const newStep = {
      type: strategy === 'min_max_scale' ? 'min_max_scale' : 'standardize',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleOneHotEncode = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'one_hot_encode',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleTextOperation = (op) => {
    if (!selectedColumn) return;
    const newStep = {
      type: op, // 'lowercase' | 'uppercase' | 'trim_spaces'
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleDragStart = (e, colName) => {
    setDraggedColumn(colName);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colName);
  };

  const handleDragOver = (e, colName) => {
    if (draggedColumn && draggedColumn !== colName) {
      e.preventDefault();
      if (dragOverColumn !== colName) {
        setDragOverColumn(colName);
      }
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const handleDrop = (e, targetColName) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetColName) {
      setDraggedColumn(null);
      setDragOverColumn(null);
      return;
    }

    const fromIdx = customColumnOrder.indexOf(draggedColumn);
    const toIdx = customColumnOrder.indexOf(targetColName);

    if (fromIdx !== -1 && toIdx !== -1) {
      const newOrder = [...customColumnOrder];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedColumn);
      setCustomColumnOrder(newOrder);
    }

    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const handleDuplicateColumn = () => {
    if (!selectedColumn || !duplicateNewName.trim()) return;
    const newStep = {
      type: 'duplicate_column',
      params: { column: selectedColumn, new_name: duplicateNewName.trim() }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setDuplicateNewName('');
  };

  const handleSplitColumn = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'split_column',
      params: { column: selectedColumn, delimiter: splitDelimiter }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleMergeColumns = () => {
    if (!selectedColumn || !mergeCol2 || !mergeNewName.trim()) return;
    const newStep = {
      type: 'merge_columns',
      params: {
        column: selectedColumn,
        column2: mergeCol2,
        separator: mergeSeparator,
        new_name: mergeNewName.trim()
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setMergeNewName('');
  };

  const handleFfill = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'ffill',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleBfill = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'bfill',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleInterpolate = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'interpolate',
      params: { column: selectedColumn, method: interpolateMethod }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleFlagNull = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'flag_null',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleDropNullRows = () => {
    const newStep = {
      type: 'drop_null_rows',
      params: { column: selectedColumn, scope: dropNullScope }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleDropColsNullThreshold = () => {
    const newStep = {
      type: 'drop_cols_null_threshold',
      params: { threshold: parseFloat(dropNullThreshold) }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleDeduplicateSubset = () => {
    if (dedupeSubsetCols.length === 0) return;
    const newStep = {
      type: 'deduplicate_subset',
      params: { columns: dedupeSubsetCols }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setDedupeSubsetCols([]);
  };

  const handleSampleRows = () => {
    const newStep = {
      type: 'sample_rows',
      params: {
        method: sampleMethod,
        value: parseFloat(sampleValue),
        random_state: parseInt(sampleRandomState) || 42
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleDropRowsIndex = () => {
    if (dropRowsStart === '' || dropRowsEnd === '') return;
    const newStep = {
      type: 'drop_rows_index',
      params: { start: parseInt(dropRowsStart), end: parseInt(dropRowsEnd) }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setDropRowsStart('');
    setDropRowsEnd('');
  };

  const handleLabelEncode = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'label_encode',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleOrdinalEncode = () => {
    if (!selectedColumn || !ordinalOrder.trim()) return;
    const newStep = {
      type: 'ordinal_encode',
      params: { column: selectedColumn, order: ordinalOrder.trim() }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setOrdinalOrder('');
  };

  const handleBinaryEncode = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'binary_encode',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleRobustScale = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'robust_scale',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleLogTransform = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'log_transform',
      params: { column: selectedColumn, shift: parseFloat(logShift) || 1.0 }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleSqrtTransform = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'sqrt_transform',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handlePowerTransform = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'power_transform',
      params: { column: selectedColumn, exponent: parseFloat(powerExponent) || 2.0 }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleCustomFormula = () => {
    if (!formulaInput.trim() || !formulaNewName.trim()) return;
    const newStep = {
      type: 'custom_formula',
      params: { formula: formulaInput.trim(), new_name: formulaNewName.trim() }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setFormulaInput('');
    setFormulaNewName('');
  };

  const handleBinBucket = () => {
    if (!selectedColumn || !binNewName.trim()) return;
    const newStep = {
      type: 'bin_bucket',
      params: { column: selectedColumn, bins: parseInt(binCount) || 5, new_name: binNewName.trim() }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setBinNewName('');
  };

  const handleDateParts = () => {
    if (!selectedColumn || dateExtractParts.length === 0) return;
    const newStep = {
      type: 'date_parts',
      params: { column: selectedColumn, parts: dateExtractParts }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleRegexExtraction = () => {
    if (!selectedColumn || !regexPattern.trim() || !regexNewName.trim()) return;
    const newStep = {
      type: 'regex_extraction',
      params: { column: selectedColumn, pattern: regexPattern.trim(), new_name: regexNewName.trim() }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setRegexPattern('');
    setRegexNewName('');
  };

  const handleRollingWindow = () => {
    if (!selectedColumn || !rollingNewName.trim()) return;
    const newStep = {
      type: 'rolling_window',
      params: {
        column: selectedColumn,
        window: parseInt(rollingWindowSize) || 3,
        operation: rollingOp,
        new_name: rollingNewName.trim()
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setRollingNewName('');
  };

  const handleInteractionTerms = () => {
    if (!selectedColumn || !interactionCol2 || !interactionNewName.trim()) return;
    const newStep = {
      type: 'interaction_terms',
      params: {
        column: selectedColumn,
        column2: interactionCol2,
        new_name: interactionNewName.trim()
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setInteractionNewName('');
  };

  const handleCorrelationFilter = () => {
    if (!corrTarget) return;
    const newStep = {
      type: 'correlation_filter',
      params: { target: corrTarget, threshold: parseFloat(corrThreshold) || 0.1 }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleVarianceThreshold = () => {
    const newStep = {
      type: 'variance_threshold',
      params: { threshold: parseFloat(varThreshold) || 0.0 }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleSelectKBest = () => {
    if (!kBestTarget) return;
    const newStep = {
      type: 'select_k_best',
      params: { target: kBestTarget, k: parseInt(kBestK) || 5 }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleRemoveConstantCols = () => {
    const newStep = {
      type: 'remove_constant_cols',
      params: {}
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleRemoveHighlyCorrelated = () => {
    const newStep = {
      type: 'remove_highly_correlated',
      params: { threshold: parseFloat(highCorrThreshold) || 0.9 }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleDetectIQR = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'detect_iqr',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleDetectZScore = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'detect_zscore',
      params: { column: selectedColumn, threshold: parseFloat(zScoreThreshold) || 3.0 }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleCapClip = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'cap_clip',
      params: {
        column: selectedColumn,
        lower_q: parseFloat(capLowerQuantile) || 0.01,
        upper_q: parseFloat(capUpperQuantile) || 0.99
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleRemoveOutliers = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'remove_outliers',
      params: {
        column: selectedColumn,
        method: removeOutlierMethod,
        threshold: parseFloat(removeOutlierThreshold) || 3.0
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleReplaceSubstring = () => {
    if (!selectedColumn || replaceOld === '') return;
    const newStep = {
      type: 'replace_substring',
      params: {
        column: selectedColumn,
        old_val: replaceOld,
        new_val: replaceNew
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setReplaceOld('');
    setReplaceNew('');
  };

  const handleRegexReplace = () => {
    if (!selectedColumn || regexReplacePattern === '') return;
    const newStep = {
      type: 'regex_replace',
      params: {
        column: selectedColumn,
        pattern: regexReplacePattern,
        replacement: regexReplaceNew
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setRegexReplacePattern('');
    setRegexReplaceNew('');
  };

  const handleRemoveSpecialChars = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'remove_special_chars',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleExtractDomain = () => {
    if (!selectedColumn) return;
    const newStep = {
      type: 'extract_domain',
      params: { column: selectedColumn }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleGroupbyAggregate = () => {
    if (groupByCols.length === 0 || !aggCol) return;
    const newStep = {
      type: 'groupby_aggregate',
      params: {
        group_cols: groupByCols,
        agg_col: aggCol,
        agg_type: aggType
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setGroupByCols([]);
  };

  const handlePivotTable = () => {
    if (!pivotIndex || !pivotColumns || !pivotValues) return;
    const newStep = {
      type: 'pivot_table',
      params: {
        index: pivotIndex,
        columns_col: pivotColumns,
        values: pivotValues,
        aggfunc: pivotAgg
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleMelt = () => {
    if (meltIdVars.length === 0 && meltValueVars.length === 0) return;
    const newStep = {
      type: 'melt',
      params: {
        id_vars: meltIdVars,
        value_vars: meltValueVars
      }
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
    setMeltIdVars([]);
    setMeltValueVars([]);
  };

  const handleTranspose = () => {
    const newStep = {
      type: 'transpose',
      params: {}
    };
    runPreprocessing([...session.preprocessingSteps, newStep]);
  };

  const handleSaveSnapshot = () => {
    if (!snapshotNameInput.trim()) return;
    const name = snapshotNameInput.trim();
    const currentSteps = [...(session.preprocessingSteps || [])];
    const newSnapshot = {
      name,
      steps: currentSteps,
      timestamp: new Date().toISOString()
    };
    const updatedSnapshots = [...(session.snapshots || []), newSnapshot];
    const updatedSession = {
      ...session,
      snapshots: updatedSnapshots
    };
    setSession(updatedSession);
    setSnapshotNameInput('');
    setActiveRibbonAction('');
    showToast(`Snapshot "${name}" saved!`, 'success');
  };

  const handleRevertSnapshot = () => {
    const snapshotsList = session.snapshots || [];
    if (snapshotsList.length === 0) return;
    const snap = snapshotsList[selectedSnapshotIndex];
    if (!snap) return;
    runPreprocessing(snap.steps);
    setActiveRibbonAction('');
    showToast(`Reverted to snapshot "${snap.name}"!`, 'info');
  };

  const handleTriggerProfiling = async (reportType) => {
    setProfilingModalType(reportType);
    setProfilingModalOpen(true);
    setIsProfilingLoading(true);
    setProfilingModalData(null);
    try {
      const activePath = session.processedDatasetPath || session.rawDatasetPath;
      const url = `${DATALAB_API_BASE}/profiling-report?projectName=${encodeURIComponent(projectName)}&filePath=${encodeURIComponent(activePath)}&reportType=${reportType}&column=${encodeURIComponent(selectedColumn || '')}`;
      const res = await fetch(url);
      const resData = await res.json();
      if (res.ok && resData.success) {
        setProfilingModalData(resData.data);
      } else {
        alert(resData.error || 'Failed to generate profiling report.');
      }
    } catch (err) {
      console.error('Profiling report error:', err);
      alert('Error fetching profiling report from backend.');
    } finally {
      setIsProfilingLoading(false);
    }
  };

  const handleUndo = () => {
    if (!session || session.preprocessingSteps.length === 0) return;
    const updatedSteps = [...session.preprocessingSteps];
    updatedSteps.pop();
    runPreprocessing(updatedSteps);
  };

  const handleClearAll = () => {
    if (session.preprocessingSteps.length === 0) return;
    if (window.confirm('Reset this workspace and clear all pipeline transformations?')) {
      runPreprocessing([]);
    }
  };

  const handleDeleteStep = (index) => {
    const updatedSteps = [...session.preprocessingSteps];
    updatedSteps.splice(index, 1);
    runPreprocessing(updatedSteps);
  };

  // Launch Model workspace Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedAlgo, setSelectedAlgo] = useState(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState('');

  const handleOpenLaunchModal = () => {
    if (projectName) {
      setNewProjectName(projectName);
    } else {
      const rawName = session.rawDatasetPath.split('/').pop();
      const cleanBaseName = rawName.split('.').shift().replace(/[^a-zA-Z0-9]/g, '_');
      setNewProjectName(`${cleanBaseName}_project`);
    }
    setSelectedAlgo(null);
    setProjectError('');
    setIsModalOpen(true);
  };

  const handleCreateAndLaunch = async () => {
    setProjectError('');
    if (!selectedAlgo) {
      setProjectError('Please select a training algorithm.');
      return;
    }
    setIsCreatingProject(true);
    try {
      if (projectName) {
        setIsModalOpen(false);
        await onLaunchProject(projectName, selectedAlgo, session);
      } else {
        const response = await fetch('http://localhost:8000/api/create-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: newProjectName.trim(),
            algorithmId: selectedAlgo.id
          })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          setIsModalOpen(false);
          onLaunchProject(newProjectName.trim(), selectedAlgo, session);
        } else {
          setProjectError(data.error || 'Failed to initialize project.');
        }
      }
    } catch (err) {
      console.error('[DERA Client DataLab] Launch project error:', err);
      setProjectError('Error connecting to DERA server.');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const getCompactStepText = (step) => {
    if (step.type === 'drop_columns') {
      return `Drop ${step.params?.columns?.join(', ')}`;
    }
    if (step.type === 'rename_column') {
      return `Rename "${step.params?.oldName}" → "${step.params?.newName}"`;
    }
    if (step.type === 'fill_null') {
      const strat = step.params?.strategy;
      const val = step.params?.value;
      return `Fill ${step.params?.column} (${strat === 'constant' ? val : strat})`;
    }
    if (step.type === 'remove_duplicates') {
      return `Deduplicate rows`;
    }
    if (step.type === 'change_datatype') {
      return `Cast ${step.params?.column} → ${step.params?.dtype}`;
    }
    if (step.type === 'filter_rows') {
      return `Filter where ${step.params?.column} ${step.params?.operator} "${step.params?.value}"`;
    }
    if (step.type === 'sort_column') {
      return `Sort ${step.params?.column} ${step.params?.ascending ? 'asc' : 'desc'}`;
    }
    if (step.type === 'standardize') {
      return `Standardize ${step.params?.column}`;
    }
    if (step.type === 'min_max_scale') {
      return `Normalize ${step.params?.column}`;
    }
    if (step.type === 'lowercase') {
      return `Lowercase ${step.params?.column}`;
    }
    if (step.type === 'uppercase') {
      return `Uppercase ${step.params?.column}`;
    }
    if (step.type === 'trim_spaces') {
      return `Trim spaces ${step.params?.column}`;
    }
    if (step.type === 'toggle_bool') {
      return `Toggle boolean ${step.params?.column}`;
    }
    return step.type;
  };

  const totalRows = session?.metadata?.totalRows || 0;
  const totalCols = session?.metadata?.totalCols || 0;
  const missingCounts = session?.metadata?.missingCounts || {};
  const dtypes = session?.metadata?.dtypes || {};
  const totalMissing = Object.values(missingCounts).reduce((a, b) => a + b, 0);

  // Filter columns list for Graph Builder
  const filteredGraphColumns = columns.filter(col => col.toLowerCase().includes(graphSearch.toLowerCase()));

  // Active view toggle via inspector tabs (automatically switches activeViewMode)
  const handleTabChange = (tabName) => {
    if (tabName === 'Stats') {
      setActiveViewMode('data');
    } else if (tabName === 'GraphBuilder') {
      setActiveViewMode('graph');
    }
    setActiveInspectorTab(tabName);
  };

  const CATEGORIES = [
    'Home',
    'Missing & Types',
    'Scale & Math',
    'Text & Encode',
    'Feature Engineering',
    'Analyze & Dataset'
  ];

  const renderRibbonTools = () => {
    switch (activeCategory) {
      case 'Home':
        return (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <button className="rbtn-large" onClick={() => handleDropColumn(selectedColumn)} disabled={!selectedColumn}>
                  <Trash2 className="h-5 w-5" />
                  <span>Drop Column</span>
                </button>
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'rename' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'rename' ? '' : 'rename')} disabled={!selectedColumn}>
                    <Edit3 className="h-5 w-5" />
                    <span>Rename Column</span>
                  </button>
                  {activeRibbonAction === 'rename' && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-3 z-50">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Rename Column</h4>
                      <input
                        type="text"
                        value={renameNewName}
                        onChange={(e) => setRenameNewName(e.target.value)}
                        placeholder="New name..."
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button onClick={handleRenameColumn} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'duplicate' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'duplicate' ? '' : 'duplicate'); setDuplicateNewName(selectedColumn ? `${selectedColumn}_copy` : ''); }} disabled={!selectedColumn}>
                    <Copy className="h-5 w-5" />
                    <span>Duplicate Column</span>
                  </button>
                  {activeRibbonAction === 'duplicate' && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-3 z-50">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Duplicate Column</h4>
                      <input
                        type="text"
                        value={duplicateNewName}
                        onChange={(e) => setDuplicateNewName(e.target.value)}
                        placeholder="Copy name..."
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button onClick={handleDuplicateColumn} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Duplicate</button>
                    </div>
                  )}
                </div>
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'split' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'split' ? '' : 'split')} disabled={!selectedColumn}>
                      <Grid className="h-3.5 w-3.5" />
                      <span>Split Column</span>
                    </button>
                    {activeRibbonAction === 'split' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-3 z-50">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Split Column</h4>
                        <input
                          type="text"
                          value={splitDelimiter}
                          onChange={(e) => setSplitDelimiter(e.target.value)}
                          placeholder="Delimiter (e.g. ,)"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                        />
                        <button onClick={handleSplitColumn} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Split</button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'merge' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'merge' ? '' : 'merge'); setMergeCol2(columns.filter(c => c !== selectedColumn)[0] || ''); setMergeNewName(selectedColumn ? `${selectedColumn}_merged` : ''); }} disabled={!selectedColumn}>
                      <Grid className="h-3.5 w-3.5" />
                      <span>Merge Column</span>
                    </button>
                    {activeRibbonAction === 'merge' && (
                      <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-3 z-50">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Merge Column With</h4>
                        <select
                          value={mergeCol2}
                          onChange={(e) => setMergeCol2(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                        >
                          {columns.filter(c => c !== selectedColumn).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <button onClick={handleMergeColumns} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Merge</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'cast' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'cast' ? '' : 'cast')} disabled={!selectedColumn}>
                    <Settings className="h-5 w-5" />
                    <span>Change Data Type</span>
                  </button>
                  {activeRibbonAction === 'cast' && (
                    <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-3.5 z-50">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Cast Type</h4>
                      <select
                        value={castType}
                        onChange={(e) => setCastType(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                      >
                        <option value="int64">int64 (Integer)</option>
                        <option value="float64">float64 (Decimal)</option>
                        <option value="object">object (Text)</option>
                        <option value="bool">bool (Boolean)</option>
                        <option value="datetime">datetime (Date)</option>
                      </select>
                      <button onClick={handleChangeDatatype} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Cast</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="ribbon-group-label">Column Operations</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'filter' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'filter' ? '' : 'filter')} disabled={!selectedColumn}>
                    <Filter className="h-5 w-5" />
                    <span>Filter Rows</span>
                  </button>
                  {activeRibbonAction === 'filter' && (
                    <div className="absolute left-0 mt-1.5 w-52 bg-zinc-950 border border-zinc-850 rounded-lg p-3 shadow-2xl space-y-2.5 z-50">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Filter Rows</h4>
                      <select
                        value={filterOperator}
                        onChange={(e) => setFilterOperator(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                      >
                        <option value="==">Equals (==)</option>
                        <option value="!=">Not Equals (!=)</option>
                        <option value=">">Greater Than (&gt;)</option>
                        <option value="&lt;">Less Than (&lt;)</option>
                        <option value="contains">Contains</option>
                      </select>
                      <input
                        type="text"
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                        placeholder="Value..."
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                      />
                      <button onClick={handleFilterRows} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Filter</button>
                    </div>
                  )}
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleSortColumn(true)} disabled={!selectedColumn}>
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span>Sort Asc</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleSortColumn(false)} disabled={!selectedColumn}>
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span>Sort Desc</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={handleRemoveDuplicates}>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Deduplicate</span>
                  </button>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'dedupe_subset' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'dedupe_subset' ? '' : 'dedupe_subset')}>
                      <Columns className="h-3.5 w-3.5" />
                      <span>Deduplicate By Subset</span>
                    </button>
                    {activeRibbonAction === 'dedupe_subset' && (
                      <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Select Columns</h4>
                        <div className="max-h-36 overflow-y-auto border border-zinc-800 p-1.5 rounded bg-zinc-900 space-y-1">
                          {columns.map(c => (
                            <label key={c} className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dedupeSubsetCols.includes(c)}
                                onChange={(e) => {
                                  if (e.target.checked) setDedupeSubsetCols([...dedupeSubsetCols, c]);
                                  else setDedupeSubsetCols(dedupeSubsetCols.filter(x => x !== c));
                                }}
                                className="rounded text-indigo-500"
                              />
                              <span>{c}</span>
                            </label>
                          ))}
                        </div>
                        <button onClick={handleDeduplicateSubset} className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded mt-2">Deduplicate</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'sample' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'sample' ? '' : 'sample')}>
                      <Rows className="h-3.5 w-3.5" />
                      <span>Sample Rows</span>
                    </button>
                    {activeRibbonAction === 'sample' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2.5 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Sample Rows</h4>
                        <select
                          value={sampleMethod}
                          onChange={(e) => setSampleMethod(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        >
                          <option value="count">Fixed Count</option>
                          <option value="fraction">Fraction (0.0 - 1.0)</option>
                        </select>
                        <input
                          type="number"
                          step="any"
                          value={sampleValue}
                          onChange={(e) => setSampleValue(e.target.value)}
                          placeholder="Value..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleSampleRows} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Sample</button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'drop_index' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'drop_index' ? '' : 'drop_index')}>
                      <Rows className="h-3.5 w-3.5" />
                      <span>Drop Rows</span>
                    </button>
                    {activeRibbonAction === 'drop_index' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Index Range</h4>
                        <input
                          type="number"
                          value={dropRowsStart}
                          onChange={(e) => setDropRowsStart(e.target.value)}
                          placeholder="Start Index"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <input
                          type="number"
                          value={dropRowsEnd}
                          onChange={(e) => setDropRowsEnd(e.target.value)}
                          placeholder="End Index"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleDropRowsIndex} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Drop Rows</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Rows className="h-3.5 w-3.5" />
                    <span>Keep Top N</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Rows className="h-3.5 w-3.5" />
                    <span>Keep Bottom N</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Row Operations</div>
            </div>
          </>
        );
      case 'Missing & Types':
        return (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleFillNull('mean')} disabled={!selectedColumn}>
                    <Settings className="h-3.5 w-3.5" />
                    <span>Fill Mean</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleFillNull('median')} disabled={!selectedColumn}>
                    <Settings className="h-3.5 w-3.5" />
                    <span>Fill Median</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleFillNull('mode')} disabled={!selectedColumn}>
                    <Settings className="h-3.5 w-3.5" />
                    <span>Fill Mode</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'constant' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'constant' ? '' : 'constant')} disabled={!selectedColumn}>
                      <Settings className="h-3.5 w-3.5" />
                      <span>Fill Constant</span>
                    </button>
                    {activeRibbonAction === 'constant' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2.5 z-50">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Constant Value</h4>
                        <input
                          type="text"
                          value={fillValue}
                          onChange={(e) => setFillValue(e.target.value)}
                          placeholder="Value..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                        />
                        <button onClick={() => handleFillNull('constant', fillValue)} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Fill</button>
                      </div>
                    )}
                  </div>
                  <button className="rbtn-small" onClick={handleFfill} disabled={!selectedColumn}>
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span>Forward Fill</span>
                  </button>
                  <button className="rbtn-small" onClick={handleBfill} disabled={!selectedColumn}>
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span>Backward Fill</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'interpolate' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'interpolate' ? '' : 'interpolate')} disabled={!selectedColumn}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Interpolate</span>
                    </button>
                    {activeRibbonAction === 'interpolate' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-3 z-50">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Interpolate Method</h4>
                        <select
                          value={interpolateMethod}
                          onChange={(e) => setInterpolateMethod(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                        >
                          <option value="linear">Linear</option>
                          <option value="time">Time</option>
                          <option value="index">Index</option>
                          <option value="nearest">Nearest</option>
                          <option value="zero">Zero</option>
                          <option value="slinear">Slinear</option>
                          <option value="quadratic">Quadratic</option>
                          <option value="cubic">Cubic</option>
                        </select>
                        <button onClick={handleInterpolate} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Interpolate</button>
                      </div>
                    )}
                  </div>
                  <button className="rbtn-small" onClick={handleFlagNull} disabled={!selectedColumn}>
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Flag Missing</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'drop_null_rows' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'drop_null_rows' ? '' : 'drop_null_rows')} disabled={!selectedColumn}>
                      <Rows className="h-3.5 w-3.5" />
                      <span>Drop Rows With Nulls</span>
                    </button>
                    {activeRibbonAction === 'drop_null_rows' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-3 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Scope</h4>
                        <select
                          value={dropNullScope}
                          onChange={(e) => setDropNullScope(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                        >
                          <option value="column">Selected Column Only</option>
                          <option value="any">Any Column Null</option>
                          <option value="all">All Columns Null</option>
                        </select>
                        <button onClick={handleDropNullRows} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Drop Rows</button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'drop_null_cols' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'drop_null_cols' ? '' : 'drop_null_cols')}>
                      <Columns className="h-3.5 w-3.5" />
                      <span>Drop Columns With Nulls</span>
                    </button>
                    {activeRibbonAction === 'drop_null_cols' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-3 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Threshold %</h4>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={dropNullThreshold}
                          onChange={(e) => setDropNullThreshold(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                        />
                        <button onClick={handleDropColsNullThreshold} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'drop_null_cols_thresh' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'drop_null_cols_thresh' ? '' : 'drop_null_cols_thresh')}>
                      <Columns className="h-3.5 w-3.5" />
                      <span>Drop Columns By Threshold</span>
                    </button>
                    {activeRibbonAction === 'drop_null_cols_thresh' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-3 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Threshold %</h4>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={dropNullThreshold}
                          onChange={(e) => setDropNullThreshold(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none font-mono"
                        />
                        <button onClick={handleDropColsNullThreshold} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="ribbon-group-label">Missing Values</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleCastTypeDirect('int64')} disabled={!selectedColumn}>
                    <Settings className="h-3.5 w-3.5" />
                    <span>String → Integer</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleCastTypeDirect('float64')} disabled={!selectedColumn}>
                    <Settings className="h-3.5 w-3.5" />
                    <span>String → Float</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleCastTypeDirect('datetime')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>String → DateTime</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleCastTypeDirect('float64')} disabled={!selectedColumn}>
                    <Settings className="h-3.5 w-3.5" />
                    <span>Integer → Float</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleCastTypeDirect('bool')} disabled={!selectedColumn}>
                    <Check className="h-3.5 w-3.5" />
                    <span>Boolean Conversion</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleCastTypeDirect('object')} disabled={!selectedColumn}>
                    <FileText className="h-3.5 w-3.5" />
                    <span>Category Conversion</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Data Type Conversion</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('year')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Year</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('month')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Month</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('day')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Day</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('dayofweek')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Weekday</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('hour')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Hour</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('quarter')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Quarter</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('week')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Week Number</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('minute')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Minute</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleDatePartDirect('second')} disabled={!selectedColumn}>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Extract Second</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Age Calculation</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Date Difference</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Date-Time Operations</div>
            </div>
          </>
        );
      case 'Scale & Math':
        return (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <button className="rbtn-large" onClick={() => handleScaleColumn('min_max_scale')} disabled={!selectedColumn}>
                  <ArrowUpDown className="h-5 w-5" />
                  <span>Min-Max Scaling</span>
                </button>
                <button className="rbtn-large" onClick={() => handleScaleColumn('standardize')} disabled={!selectedColumn}>
                  <Settings className="h-5 w-5" />
                  <span>Standard Scaling</span>
                </button>
                <button className="rbtn-large" onClick={handleRobustScale} disabled={!selectedColumn}>
                  <ShieldAlert className="h-5 w-5" />
                  <span>Robust Scaling</span>
                </button>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Settings className="h-3.5 w-3.5" />
                    <span>MaxAbs Scaling</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Settings className="h-3.5 w-3.5" />
                    <span>Unit Vector Norm</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Scaling & Normalization</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'log' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'log' ? '' : 'log')} disabled={!selectedColumn}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Log Transform</span>
                    </button>
                    {activeRibbonAction === 'log' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Log(x + shift)</h4>
                        <input
                          type="number"
                          step="any"
                          value={logShift}
                          onChange={(e) => setLogShift(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleLogTransform} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                  <button className="rbtn-small" onClick={handleSqrtTransform} disabled={!selectedColumn}>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Square Root</span>
                  </button>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'power' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'power' ? '' : 'power')} disabled={!selectedColumn}>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Power Transform</span>
                    </button>
                    {activeRibbonAction === 'power' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Exponent</h4>
                        <input
                          type="number"
                          step="any"
                          value={powerExponent}
                          onChange={(e) => setPowerExponent(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handlePowerTransform} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Cube Root Transform</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Reciprocal Transform</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Absolute Value</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Mathematical Transformations</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={handleDetectIQR} disabled={!selectedColumn}>
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Detect IQR</span>
                  </button>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'detect_z' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'detect_z' ? '' : 'detect_z')} disabled={!selectedColumn}>
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Detect Z-Score</span>
                    </button>
                    {activeRibbonAction === 'detect_z' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Z Score Limit</h4>
                        <input
                          type="number"
                          step="any"
                          value={zScoreThreshold}
                          onChange={(e) => setZScoreThreshold(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleDetectZScore} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'cap_clip' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'cap_clip' ? '' : 'cap_clip')} disabled={!selectedColumn}>
                      <Scissors className="h-3.5 w-3.5" />
                      <span>Cap Values</span>
                    </button>
                    {activeRibbonAction === 'cap_clip' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2.5 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Quantiles to Clip</h4>
                        <input
                          type="number"
                          step="any"
                          value={capLowerQuantile}
                          onChange={(e) => setCapLowerQuantile(e.target.value)}
                          placeholder="Lower (e.g. 0.01)"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <input
                          type="number"
                          step="any"
                          value={capUpperQuantile}
                          onChange={(e) => setCapUpperQuantile(e.target.value)}
                          placeholder="Upper (e.g. 0.99)"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleCapClip} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Clip</button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'cap_clip' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'cap_clip' ? '' : 'cap_clip')} disabled={!selectedColumn}>
                      <Scissors className="h-3.5 w-3.5" />
                      <span>Clip Values</span>
                    </button>
                  </div>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Scissors className="h-3.5 w-3.5" />
                    <span>Winsorization</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'remove_outliers' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'remove_outliers' ? '' : 'remove_outliers')} disabled={!selectedColumn}>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove Outlier Rows</span>
                    </button>
                    {activeRibbonAction === 'remove_outliers' && (
                      <div className="absolute right-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Method</h4>
                        <select
                          value={removeOutlierMethod}
                          onChange={(e) => setRemoveOutlierMethod(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        >
                          <option value="iqr">IQR Bounds</option>
                          <option value="zscore">Z Score Limit</option>
                        </select>
                        {removeOutlierMethod === 'zscore' && (
                          <input
                            type="number"
                            step="any"
                            value={removeOutlierThreshold}
                            onChange={(e) => setRemoveOutlierThreshold(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                          />
                        )}
                        <button onClick={handleRemoveOutliers} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Remove</button>
                      </div>
                    )}
                  </div>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Outlier Flag</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Outlier Handling</div>
            </div>
          </>
        );
      case 'Text & Encode':
        return (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleTextOperation('trim_spaces')} disabled={!selectedColumn}>
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Trim Whitespace</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Remove Extra Spaces</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleTextOperation('uppercase')} disabled={!selectedColumn}>
                    <Type className="h-3.5 w-3.5" />
                    <span>Uppercase</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleTextOperation('lowercase')} disabled={!selectedColumn}>
                    <Type className="h-3.5 w-3.5" />
                    <span>Lowercase</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Type className="h-3.5 w-3.5" />
                    <span>Title Case</span>
                  </button>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'replace_sub' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'replace_sub' ? '' : 'replace_sub')} disabled={!selectedColumn}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Replace Text</span>
                    </button>
                    {activeRibbonAction === 'replace_sub' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Text Replacement</h4>
                        <input
                          type="text"
                          value={replaceOld}
                          onChange={(e) => setReplaceOld(e.target.value)}
                          placeholder="Find text..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <input
                          type="text"
                          value={replaceNew}
                          onChange={(e) => setReplaceNew(e.target.value)}
                          placeholder="Replace with..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleReplaceSubstring} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Replace</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'regex_replace' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'regex_replace' ? '' : 'regex_replace')} disabled={!selectedColumn}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Regex Replace</span>
                    </button>
                    {activeRibbonAction === 'regex_replace' && (
                      <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Regex Match & Replace</h4>
                        <input
                          type="text"
                          value={regexReplacePattern}
                          onChange={(e) => setRegexReplacePattern(e.target.value)}
                          placeholder="Regex..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <input
                          type="text"
                          value={regexReplaceNew}
                          onChange={(e) => setRegexReplaceNew(e.target.value)}
                          placeholder="Replace..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleRegexReplace} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Replace</button>
                      </div>
                    )}
                  </div>
                  <button className="rbtn-small" onClick={handleRemoveSpecialChars} disabled={!selectedColumn}>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove Special Characters</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove Numbers</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove Alphabets</span>
                  </button>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'regex_extract' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'regex_extract' ? '' : 'regex_extract')} disabled={!selectedColumn}>
                      <Search className="h-3.5 w-3.5" />
                      <span>Extract Pattern</span>
                    </button>
                    {activeRibbonAction === 'regex_extract' && (
                      <div className="absolute right-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-2.5 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Regex Match Pattern</h4>
                        <input
                          type="text"
                          value={regexPattern}
                          onChange={(e) => setRegexPattern(e.target.value)}
                          placeholder="Regex: e.g. (\d+)"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5"
                        />
                        <input
                          type="text"
                          value={regexNewName}
                          onChange={(e) => setRegexNewName(e.target.value)}
                          placeholder="New col name..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5"
                        />
                        <button onClick={handleRegexExtraction} className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Extract</button>
                      </div>
                    )}
                  </div>
                  <button className="rbtn-small" onClick={handleExtractDomain} disabled={!selectedColumn}>
                    <Search className="h-3.5 w-3.5" />
                    <span>Extract Domain</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <FileText className="h-3.5 w-3.5" />
                    <span>String Length</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">String Handling</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <button className="rbtn-large" onClick={handleLabelEncode} disabled={!selectedColumn}>
                  <FileText className="h-5 w-5" />
                  <span>Label Encoding</span>
                </button>
                <button className="rbtn-large" onClick={handleOneHotEncode} disabled={!selectedColumn}>
                  <Grid className="h-5 w-5" />
                  <span>One-Hot Encoding</span>
                </button>
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'ordinal' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'ordinal' ? '' : 'ordinal')} disabled={!selectedColumn}>
                    <ArrowUpDown className="h-5 w-5" />
                    <span>Ordinal Encoding</span>
                  </button>
                  {activeRibbonAction === 'ordinal' && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-3 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Ordinal Categories</h4>
                      <input
                        type="text"
                        value={ordinalOrder}
                        onChange={(e) => setOrdinalOrder(e.target.value)}
                        placeholder="Order: low,med,high"
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none"
                      />
                      <button onClick={handleOrdinalEncode} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Encode</button>
                    </div>
                  )}
                </div>
                <button className="rbtn-large" onClick={handleBinaryEncode} disabled={!selectedColumn}>
                  <Binary className="h-5 w-5" />
                  <span>Binary Encoding</span>
                </button>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Frequency Encoding</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Target Encoding</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Encoding</div>
            </div>
          </>
        );
      case 'Feature Engineering':
        return (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'formula' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'formula' ? '' : 'formula')}>
                    <Plus className="h-5 w-5" />
                    <span>Custom Formula</span>
                  </button>
                  {activeRibbonAction === 'formula' && (
                    <div className="absolute left-0 mt-1.5 w-64 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-3 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Custom Formula</h4>
                      <input
                        type="text"
                        value={formulaInput}
                        onChange={(e) => setFormulaInput(e.target.value)}
                        placeholder="e.g. col1 * 2 + col2"
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={formulaNewName}
                        onChange={(e) => setFormulaNewName(e.target.value)}
                        placeholder="New col name..."
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none"
                      />
                      <button onClick={handleCustomFormula} className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Create Field</button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'merge' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'merge' ? '' : 'merge'); setMergeCol2(columns.filter(c => c !== selectedColumn)[0] || ''); setMergeNewName(selectedColumn ? `${selectedColumn}_merged` : ''); }} disabled={!selectedColumn}>
                    <Grid className="h-5 w-5" />
                    <span>Merge Columns</span>
                  </button>
                </div>
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'interaction' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'interaction' ? '' : 'interaction'); setInteractionCol2(columns.filter(c => c !== selectedColumn)[0] || ''); setInteractionNewName(selectedColumn ? `${selectedColumn}_interaction` : ''); }} disabled={!selectedColumn}>
                    <Sparkles className="h-5 w-5" />
                    <span>Interaction Features</span>
                  </button>
                  {activeRibbonAction === 'interaction' && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-3.5 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Interaction columns</h4>
                      <select
                        value={interactionCol2}
                        onChange={(e) => setInteractionCol2(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none"
                      >
                        {columns.filter(c => c !== selectedColumn).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={interactionNewName}
                        onChange={(e) => setInteractionNewName(e.target.value)}
                        placeholder="New column name..."
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none"
                      />
                      <button onClick={handleInteractionTerms} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Generate</button>
                    </div>
                  )}
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Ratio Features</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Difference Features</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Polynomial Features</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Custom Features</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'bin' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'bin' ? '' : 'bin'); setBinNewName(selectedColumn ? `${selectedColumn}_bins` : ''); }} disabled={!selectedColumn}>
                    <Grid className="h-5 w-5" />
                    <span>Equal Width Binning</span>
                  </button>
                  {activeRibbonAction === 'bin' && (
                    <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Bins Count</h4>
                      <input
                        type="number"
                        value={binCount}
                        onChange={(e) => setBinCount(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      />
                      <input
                        type="text"
                        value={binNewName}
                        onChange={(e) => setBinNewName(e.target.value)}
                        placeholder="New name..."
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      />
                      <button onClick={handleBinBucket} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                    </div>
                  )}
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Grid className="h-3.5 w-3.5" />
                    <span>Equal Freq Binning</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Grid className="h-3.5 w-3.5" />
                    <span>Custom Binning</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Grid className="h-3.5 w-3.5" />
                    <span>Quantile Binning</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Binning</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Lag Features</span>
                  </button>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'rolling_mean' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'rolling_mean' ? '' : 'rolling_mean'); setRollingOp('mean'); setRollingNewName(selectedColumn ? `${selectedColumn}_roll_mean` : ''); }} disabled={!selectedColumn}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Rolling Mean</span>
                    </button>
                    {activeRibbonAction === 'rolling_mean' && (
                      <div className="absolute left-0 mt-1.5 w-52 bg-zinc-950 border border-zinc-850 rounded-lg p-3 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Rolling Mean</h4>
                        <input
                          type="number"
                          value={rollingWindowSize}
                          onChange={(e) => setRollingWindowSize(e.target.value)}
                          placeholder="Window size"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <input
                          type="text"
                          value={rollingNewName}
                          onChange={(e) => setRollingNewName(e.target.value)}
                          placeholder="New column name..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleRollingWindow} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'rolling_sum' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'rolling_sum' ? '' : 'rolling_sum'); setRollingOp('sum'); setRollingNewName(selectedColumn ? `${selectedColumn}_roll_sum` : ''); }} disabled={!selectedColumn}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Rolling Sum</span>
                    </button>
                    {activeRibbonAction === 'rolling_sum' && (
                      <div className="absolute left-0 mt-1.5 w-52 bg-zinc-950 border border-zinc-850 rounded-lg p-3 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Rolling Sum</h4>
                        <input
                          type="number"
                          value={rollingWindowSize}
                          onChange={(e) => setRollingWindowSize(e.target.value)}
                          placeholder="Window size"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <input
                          type="text"
                          value={rollingNewName}
                          onChange={(e) => setRollingNewName(e.target.value)}
                          placeholder="New column name..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleRollingWindow} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Rolling Min</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Rolling Max</span>
                  </button>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'rolling_std' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'rolling_std' ? '' : 'rolling_std'); setRollingOp('std'); setRollingNewName(selectedColumn ? `${selectedColumn}_roll_std` : ''); }} disabled={!selectedColumn}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Rolling Std</span>
                    </button>
                    {activeRibbonAction === 'rolling_std' && (
                      <div className="absolute left-0 mt-1.5 w-52 bg-zinc-950 border border-zinc-850 rounded-lg p-3 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Rolling Std</h4>
                        <input
                          type="number"
                          value={rollingWindowSize}
                          onChange={(e) => setRollingWindowSize(e.target.value)}
                          placeholder="Window size"
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <input
                          type="text"
                          value={rollingNewName}
                          onChange={(e) => setRollingNewName(e.target.value)}
                          placeholder="New column name..."
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleRollingWindow} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Cumulative Sum</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Cumulative Count</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Time Series Features</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'var_threshold' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'var_threshold' ? '' : 'var_threshold')}>
                    <Settings className="h-5 w-5" />
                    <span>Variance Threshold</span>
                  </button>
                  {activeRibbonAction === 'var_threshold' && (
                    <div className="absolute left-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Variance Limit</h4>
                      <input
                        type="number"
                        step="any"
                        value={varThreshold}
                        onChange={(e) => setVarThreshold(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      />
                      <button onClick={handleVarianceThreshold} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply Limit</button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'corr_filter' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'corr_filter' ? '' : 'corr_filter'); setCorrTarget(columns[0] || ''); }}>
                    <Filter className="h-5 w-5" />
                    <span>Correlation Filter</span>
                  </button>
                  {activeRibbonAction === 'corr_filter' && (
                    <div className="absolute left-0 mt-1.5 w-52 bg-zinc-950 border border-zinc-850 rounded-lg p-3 shadow-2xl space-y-2 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Target Variable</h4>
                      <select
                        value={corrTarget}
                        onChange={(e) => setCorrTarget(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      >
                        {columns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="any"
                        value={corrThreshold}
                        onChange={(e) => setCorrThreshold(e.target.value)}
                        placeholder="Threshold (e.g. 0.1)"
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      />
                      <button onClick={handleCorrelationFilter} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply Filter</button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'k_best' ? 'active' : ''}`} onClick={() => { setActiveRibbonAction(activeRibbonAction === 'k_best' ? '' : 'k_best'); setKBestTarget(columns[0] || ''); }}>
                    <BarChart3 className="h-5 w-5" />
                    <span>Select K Best</span>
                  </button>
                  {activeRibbonAction === 'k_best' && (
                    <div className="absolute left-0 mt-1.5 w-52 bg-zinc-950 border border-zinc-850 rounded-lg p-3 shadow-2xl space-y-2 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Target Variable</h4>
                      <select
                        value={kBestTarget}
                        onChange={(e) => setKBestTarget(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      >
                        {columns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={kBestK}
                        onChange={(e) => setKBestK(e.target.value)}
                        placeholder="K features to keep"
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      />
                      <button onClick={handleSelectKBest} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Select features</button>
                    </div>
                  )}
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Mutual Information</span>
                  </button>
                  <button className="rbtn-small" onClick={handleRemoveConstantCols}>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove Constant Features</span>
                  </button>
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'remove_highly_corr' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'remove_highly_corr' ? '' : 'remove_highly_corr')}>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove Highly Correlated</span>
                    </button>
                    {activeRibbonAction === 'remove_highly_corr' && (
                      <div className="absolute right-0 mt-1.5 w-48 bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 shadow-2xl space-y-2 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Corr Threshold</h4>
                        <input
                          type="number"
                          step="any"
                          value={highCorrThreshold}
                          onChange={(e) => setHighCorrThreshold(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                        />
                        <button onClick={handleRemoveHighlyCorrelated} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Apply</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="ribbon-group-label">Feature Selection</div>
            </div>
          </>
        );
      case 'Analyze & Dataset':
        return (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <button className="rbtn-large" onClick={() => handleTriggerProfiling('dataset_summary')}>
                  <BarChart3 className="h-5 w-5" />
                  <span>Dataset Summary</span>
                </button>
                <button className="rbtn-large" onClick={() => handleTabChange('Stats')}>
                  <FileText className="h-5 w-5" />
                  <span>Column Statistics</span>
                </button>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('missing_analysis')}>
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Missing Value Analysis</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('datatype_overview')}>
                    <Type className="h-3.5 w-3.5" />
                    <span>Data Type Summary</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('class_distribution')} disabled={!selectedColumn}>
                    <Grid className="h-3.5 w-3.5" />
                    <span>Unique Values Summary</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Memory Usage</span>
                  </button>
                  <button className="rbtn-small" disabled={true} title="Action disabled (UI Only)">
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Duplicate Analysis</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('correlation_matrix')}>
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Correlation Matrix</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('class_distribution')} disabled={!selectedColumn}>
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Class Distribution</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Data Profiling</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'groupby' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'groupby' ? '' : 'groupby')}>
                    <Table className="h-5 w-5" />
                    <span>Group By</span>
                  </button>
                  {activeRibbonAction === 'groupby' && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-2 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Group By Columns</h4>
                      <div className="max-h-28 overflow-y-auto border border-zinc-800 p-1.5 bg-zinc-900 rounded space-y-1">
                        {columns.map(c => (
                          <label key={c} className="flex items-center gap-2 text-[11px] text-zinc-300">
                            <input
                              type="checkbox"
                              checked={groupByCols.includes(c)}
                              onChange={(e) => {
                                if (e.target.checked) setGroupByCols([...groupByCols, c]);
                                else setGroupByCols(groupByCols.filter(x => x !== c));
                              }}
                            />
                            <span>{c}</span>
                          </label>
                        ))}
                      </div>
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase mt-2">Aggregate Column</h4>
                      <select
                        value={aggCol}
                        onChange={(e) => setAggCol(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      >
                        <option value="">-- Select --</option>
                        {columns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase mt-2">Function</h4>
                      <select
                        value={aggType}
                        onChange={(e) => setAggType(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1"
                      >
                        <option value="mean">Mean (Average)</option>
                        <option value="sum">Sum</option>
                        <option value="count">Count</option>
                        <option value="min">Minimum</option>
                        <option value="max">Maximum</option>
                      </select>
                      <button onClick={handleGroupbyAggregate} className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded mt-2">Aggregate</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="ribbon-group-label">Aggregation</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'pivot' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'pivot' ? '' : 'pivot')}>
                    <Grid className="h-5 w-5" />
                    <span>Pivot Table</span>
                  </button>
                  {activeRibbonAction === 'pivot' && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-2 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Index Column</h4>
                      <select value={pivotIndex} onChange={(e) => setPivotIndex(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded p-1">
                        <option value="">-- Select --</option>
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Columns Column</h4>
                      <select value={pivotColumns} onChange={(e) => setPivotColumns(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded p-1">
                        <option value="">-- Select --</option>
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Values Column</h4>
                      <select value={pivotValues} onChange={(e) => setPivotValues(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded p-1">
                        <option value="">-- Select --</option>
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Agg Function</h4>
                      <select value={pivotAgg} onChange={(e) => setPivotAgg(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded p-1">
                        <option value="mean">Mean</option>
                        <option value="sum">Sum</option>
                        <option value="count">Count</option>
                      </select>
                      <button onClick={handlePivotTable} className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded mt-2">Pivot</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="ribbon-group-label">Summarize</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <div className="relative">
                    <button className={`rbtn-small ${activeRibbonAction === 'melt' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'melt' ? '' : 'melt')}>
                      <Rows className="h-3.5 w-3.5" />
                      <span>Melt (Unpivot)</span>
                    </button>
                    {activeRibbonAction === 'melt' && (
                      <div className="absolute right-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-2.5 z-50 font-mono">
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Id Variables (Keep)</h4>
                        <div className="max-h-24 overflow-y-auto border border-zinc-800 p-1.5 bg-zinc-900 rounded space-y-1">
                          {columns.map(c => (
                            <label key={c} className="flex items-center gap-2 text-[10px] text-zinc-300">
                              <input
                                type="checkbox"
                                checked={meltIdVars.includes(c)}
                                onChange={(e) => {
                                  if (e.target.checked) setMeltIdVars([...meltIdVars, c]);
                                  else setMeltIdVars(meltIdVars.filter(x => x !== c));
                                }}
                              />
                              <span>{c}</span>
                            </label>
                          ))}
                        </div>
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase mt-1">Value Variables (Melt)</h4>
                        <div className="max-h-24 overflow-y-auto border border-zinc-800 p-1.5 bg-zinc-900 rounded space-y-1">
                          {columns.map(c => (
                            <label key={c} className="flex items-center gap-2 text-[10px] text-zinc-300">
                              <input
                                type="checkbox"
                                checked={meltValueVars.includes(c)}
                                onChange={(e) => {
                                  if (e.target.checked) setMeltValueVars([...meltValueVars, c]);
                                  else setMeltValueVars(meltValueVars.filter(x => x !== c));
                                }}
                              />
                              <span>{c}</span>
                            </label>
                          ))}
                        </div>
                        <button onClick={handleMelt} className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded mt-2">Melt</button>
                      </div>
                    )}
                  </div>
                  <button className="rbtn-small" onClick={handleTranspose}>
                    <Columns className="h-3.5 w-3.5" />
                    <span>Transpose</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Reshape</div>
            </div>
          </>
        );
      case 'Dataset Operations':
        return (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'save_snap' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'save_snap' ? '' : 'save_snap')}>
                    <Save className="h-5 w-5" />
                    <span>Save Snapshot</span>
                  </button>
                  {activeRibbonAction === 'save_snap' && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-3 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Snapshot Name</h4>
                      <input
                        type="text"
                        value={snapshotNameInput}
                        onChange={(e) => setSnapshotNameInput(e.target.value)}
                        placeholder="e.g. baseline_v1"
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none"
                      />
                      <button onClick={handleSaveSnapshot} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">Save</button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button className={`rbtn-large ${activeRibbonAction === 'revert_snap' ? 'active' : ''}`} onClick={() => setActiveRibbonAction(activeRibbonAction === 'revert_snap' ? '' : 'revert_snap')}>
                    <RotateCcw className="h-5 w-5" />
                    <span>Revert Snap</span>
                  </button>
                  {activeRibbonAction === 'revert_snap' && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 shadow-2xl space-y-3 z-50 font-mono">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase">Select Snapshot</h4>
                      {(session.snapshots || []).length === 0 ? (
                        <div className="text-[11px] text-zinc-500 italic">No snapshots available</div>
                      ) : (
                        <>
                          <select
                            value={selectedSnapshotIndex}
                            onChange={(e) => setSelectedSnapshotIndex(parseInt(e.target.value))}
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-250 text-xs rounded p-1.5 focus:outline-none"
                          >
                            {(session.snapshots || []).map((snap, i) => (
                              <option key={i} value={i}>{snap.name} ({new Date(snap.timestamp).toLocaleTimeString()})</option>
                            ))}
                          </select>
                          <button onClick={handleRevertSnapshot} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded animate-pulse">Revert</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="ribbon-group-label">Snapshots</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <button className="rbtn-large" onClick={() => showToast('Exported CSV path saved to disk', 'info')}>
                  <Download className="h-5 w-5" />
                  <span>Export CSV</span>
                </button>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => { setProfilingModalType('dataset_info'); setProfilingModalOpen(true); setProfilingModalData({ filename: (session.processedDatasetPath || session.rawDatasetPath).split(/[/\\]/).pop(), format: (session.processedDatasetPath || session.rawDatasetPath).split('.').pop(), rawPath: session.rawDatasetPath, procPath: session.processedDatasetPath || 'None (original raw file)', stepsCount: session.preprocessingSteps.length, createdAt: session.createdAt }); }}>
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>Dataset Info</span>
                  </button>
                  <button className="rbtn-small" onClick={() => { loadPreviewPage(rowsLimit); showToast('Preview refreshed', 'info'); }}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Refresh Preview</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Actions</div>
            </div>
          </>
        );
      case 'Data Profiling':
        return (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <button className="rbtn-large" onClick={() => handleTriggerProfiling('dataset_summary')}>
                  <BarChart3 className="h-5 w-5" />
                  <span>Dataset Summary</span>
                </button>
                <button className="rbtn-large" onClick={() => { handleTabChange('Stats'); showToast('Focused Column Stats Sidebar', 'info'); }}>
                  <FileText className="h-5 w-5" />
                  <span>Column Stats</span>
                </button>
              </div>
              <div className="ribbon-group-label">Overview</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('missing_analysis')}>
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Missing Analysis</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('datatype_overview')}>
                    <Type className="h-3.5 w-3.5" />
                    <span>Datatype Overview</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Quality & Types</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-controls">
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('class_distribution')} disabled={!selectedColumn}>
                    <Grid className="h-3.5 w-3.5" />
                    <span>Unique Values</span>
                  </button>
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('correlation_matrix')}>
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Corr Matrix</span>
                  </button>
                </div>
                <div className="ribbon-column">
                  <button className="rbtn-small" onClick={() => handleTriggerProfiling('class_distribution')} disabled={!selectedColumn}>
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Class Dist</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Deep Analysis</div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app">
      {/* 2. UPLOADER / WORKSPACE SHELL */}
      {!session ? (
        <div className="flex-grow flex flex-col justify-center items-center py-20 max-w-xl mx-auto w-full text-center">
          <div 
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '#7F77DD';
              e.currentTarget.style.background = 'rgba(127,119,221,0.03)';
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '';
              e.currentTarget.style.background = '';
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '';
              e.currentTarget.style.background = '';
              if (isUploading) return;
              const file = e.dataTransfer.files[0];
              if (file) {
                await uploadFile(file);
              }
            }}
            className="w-full border-2 border-dashed border-zinc-800 bg-zinc-900/10 hover:border-indigo-500/40 hover:bg-indigo-500/[0.01] rounded-2xl p-16 flex flex-col items-center justify-center transition-all duration-300 shadow-2xl relative"
          >
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-500 mb-6">
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              ) : (
                <i className="ti ti-cloud-upload" style={{ fontSize: '32px', color: '#7F77DD' }}></i>
              )}
            </div>
            <h3 className="text-base font-bold text-zinc-200">
              {isUploading ? 'Uploading file...' : 'Upload or Drag & drop dataset file here'}
            </h3>
            <p className="text-xs text-zinc-400 mt-2 max-w-sm leading-relaxed">
              Supports CSV, Microsoft Excel (XLSX, XLS), and Parquet file formats.
            </p>
 
            <div className="mt-8 flex flex-col items-center justify-center">
              <label className="px-6 py-2.5 bg-zinc-100 hover:bg-zinc-50 text-zinc-950 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-md">
                <i className="ti ti-file-upload" style={{ fontSize: '14px', color: '#111' }}></i>
                <span>Select Dataset</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileInput}
                  accept=".csv,.xlsx,.xls,.parquet"
                  disabled={isUploading}
                />
              </label>
              <span className="text-[10px] text-zinc-500 mt-3 block">Drag & Drop Supported</span>
            </div>
          </div>
          <button
            onClick={onBack}
            className="mt-6 px-4 py-2 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors text-xs"
          >
            ← Back to Landing Page
          </button>
        </div>
      ) : (
        <>
          {/* 3. RIBBON */}
          <div 
            ref={ribbonRef}
            className={`ribbon ${!isPinned && !isTempExpanded ? 'collapsed' : ''}`}
          >
            <div className="ribbon-tabs-bar">
              <button
                type="button"
                className="ribbon-home-btn"
                onClick={onHome || onBack}
                title="Go to Homepage / Projects"
              >
                <Home className="h-4 w-4" />
              </button>
              {CATEGORIES.map(category => (
                <button
                  key={category}
                  className={`ribbon-tab ${activeCategory === category ? 'active' : ''}`}
                  onClick={() => handleTabClick(category)}
                  onDoubleClick={() => {
                    setIsPinned(!isPinned);
                    setIsTempExpanded(false);
                  }}
                >
                  {category}
                </button>
              ))}
              <button
                className="ribbon-train-btn"
                onClick={handleOpenLaunchModal}
              >
                <i className="ti ti-brain"></i> Train Model
              </button>

              {/* Chevron-down button shown ONLY when collapsed */}
              {!isPinned && !isTempExpanded && (
                <button
                  className="ribbon-expand-btn"
                  onClick={() => setIsPinned(true)}
                  title="Expand and Pin Ribbon"
                >
                  <i className="ti ti-chevron-down"></i>
                </button>
              )}
            </div>
            <div 
              className="ribbon-tools-container" 
              onScroll={() => setActiveRibbonAction('')}
              onClick={(e) => {
                const target = e.target.closest('button, .rbtn-large, .rbtn-small');
                if (target && !isPinned && isTempExpanded) {
                  const text = target.textContent || '';
                  const isToggle = text.includes('Group By') || 
                                   text.includes('Pivot Table') || 
                                   text.includes('Melt') || 
                                   text.includes('Save Snapshot') || 
                                   text.includes('Revert Snap');
                  const isDirectToggle = isToggle && !target.closest('.absolute');
                  if (!isDirectToggle) {
                    setIsTempExpanded(false);
                  }
                }
              }}
            >
              {renderRibbonTools()}
            </div>

            {/* Chevron-up button shown ONLY when expanded */}
            {(isPinned || isTempExpanded) && (
              <button
                className="ribbon-collapse-btn"
                onClick={() => {
                  setIsPinned(false);
                  setIsTempExpanded(false);
                }}
                title="Collapse Ribbon"
              >
                <i className="ti ti-chevron-up"></i>
              </button>
            )}
          </div>

          {/* 4. MAIN WORKSPACE GRID */}
          <div className="main" style={{ gridTemplateColumns: activeViewMode === 'graph' ? `${statsWidth}px 6px 1fr` : `${statsWidth}px 6px 1fr 220px` }}>
            {/* Left Sidebar (Active Analysis Workspace) */}
            <div className="sidebar-left">
              <div className="sr-tabs" style={{ pointerEvents: 'none' }}>
                <div className="sr-tab active">
                  {activeViewMode === 'graph' ? 'Graph Builder' : 'Stats'}
                </div>
              </div>
              <div className="sr-body">
                {activeViewMode !== 'graph' && (
                  <>
                    {isLoadingStats ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: '8px' }}>
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                        <span style={{ fontSize: '11px', color: '#555', fontFamily: 'var(--font-sans)' }}>Loading statistics...</span>
                      </div>
                    ) : columnStats ? (
                      <>
                        <div className="section-head">Selected column — {selectedColumn}</div>
                        <div className="stat-row"><span className="stat-label">Type</span><span className="stat-val" style={{ color: '#EF9F27' }}>{columnStats.type}</span></div>
                        <div className="stat-row"><span className="stat-label">Count</span><span className="stat-val">{columnStats.count.toLocaleString()}</span></div>
                        <div className="stat-row"><span className="stat-label">Nulls</span><span className="stat-val" style={{ color: columnStats.nulls > 0 ? '#EF9F27' : '#5DCAA5' }}>{columnStats.nulls.toLocaleString()}</span></div>
                        <div className="stat-row"><span className="stat-label">Mean</span><span className="stat-val">{formatPreviewNumber(columnStats.mean)}</span></div>
                        <div className="stat-row"><span className="stat-label">Median</span><span className="stat-val">{formatPreviewNumber(columnStats.median)}</span></div>
                        <div className="stat-row"><span className="stat-label">Std</span><span className="stat-val">{formatPreviewNumber(columnStats.std)}</span></div>
                        <div className="stat-row"><span className="stat-label">Min</span><span className="stat-val">{formatPreviewNumber(columnStats.min)}</span></div>
                        <div className="stat-row"><span className="stat-label">Max</span><span className="stat-val">{formatPreviewNumber(columnStats.max)}</span></div>
                        <div className="stat-row"><span className="stat-label">Skewness</span><span className="stat-val">{formatPreviewNumber(columnStats.skewness)}</span></div>
                        <div className="stat-row" style={{ border: 'none' }}><span className="stat-label">Outliers (IQR)</span><span className="stat-val" style={{ color: columnStats.outliers > 0 ? '#EF9F27' : '#5DCAA5' }}>{columnStats.outliers}</span></div>

                        <div className="section-head">Distribution</div>
                        <div className="mini-bar-wrap">
                          {columnStats.distribution && columnStats.distribution.length > 0 ? (
                            columnStats.distribution.map((bin, i) => (
                              <React.Fragment key={i}>
                                <div className="mini-bar-label"><span>{bin.label}</span><span>{bin.percentage.toFixed(0)}%</span></div>
                                <div className="mini-bar-track">
                                  <div className={`mini-bar-fill${bin.fillClass}`} style={{ width: `${bin.percentage}%` }}></div>
                                </div>
                              </React.Fragment>
                            ))
                          ) : (
                            <div style={{ fontSize: '10px', color: '#555', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>No distribution data</div>
                          )}
                        </div>

                        <div className="section-head">Dataset overview</div>
                        <div className="stat-row"><span className="stat-label">Total rows</span><span className="stat-val">{columnStats.datasetOverview.totalRows.toLocaleString()}</span></div>
                        <div className="stat-row"><span className="stat-label">Total cols</span><span className="stat-val">{columnStats.datasetOverview.totalCols.toLocaleString()}</span></div>
                        <div className="stat-row"><span className="stat-label">Numeric cols</span><span className="stat-val">{columnStats.datasetOverview.numericCols.toLocaleString()}</span></div>
                        <div className="stat-row"><span className="stat-label">Object cols</span><span className="stat-val">{columnStats.datasetOverview.objectCols.toLocaleString()}</span></div>
                        <div className="stat-row" style={{ border: 'none' }}><span className="stat-label">Total missing</span><span className="stat-val" style={{ color: columnStats.datasetOverview.totalMissing > 0 ? '#EF9F27' : '#5DCAA5' }}>{columnStats.datasetOverview.totalMissing.toLocaleString()}</span></div>
                      </>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#555', textAlign: 'center', padding: '24px 0' }}>Select a column to inspect statistics</div>
                    )}
                  </>
                )}

                {activeViewMode === 'graph' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                    {/* Graph Navigation Tab buttons */}
                    <div style={{ display: 'flex', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-main)' }}>
                      <button
                        onClick={() => setActiveGraphTab('Builder')}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: activeGraphTab === 'Builder' ? '1px solid #635ac7' : '1px solid var(--color-border-main)',
                          background: activeGraphTab === 'Builder' ? 'rgba(99, 90, 199, 0.08)' : '#ffffff',
                          color: activeGraphTab === 'Builder' ? '#635ac7' : 'var(--color-text-main)',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s'
                        }}
                      >
                        New Graph
                      </button>
                      {projectName && (
                        <button
                          onClick={() => setActiveGraphTab('Saved')}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: activeGraphTab === 'Saved' ? '1px solid #635ac7' : '1px solid var(--color-border-main)',
                            background: activeGraphTab === 'Saved' ? 'rgba(99, 90, 199, 0.08)' : '#ffffff',
                            color: activeGraphTab === 'Saved' ? '#635ac7' : 'var(--color-text-main)',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s'
                          }}
                        >
                          Saved Graphs
                        </button>
                      )}
                    </div>

                    {activeGraphTab === 'Builder' ? (
                      <>
                        <div className="section-head" style={{ marginTop: '4px', fontSize: '14px', fontWeight: '700', color: 'var(--color-text-main)' }}>
                          Graph Builder Columns
                        </div>
                        <input
                          type="text"
                          placeholder="Search graph columns..."
                          value={graphSearch}
                          onChange={(e) => setGraphSearch(e.target.value)}
                          style={{
                            width: '100%',
                            background: '#ffffff',
                            border: '1px solid var(--color-border-main)',
                            color: 'var(--color-text-main)',
                            fontSize: '12px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            outline: 'none'
                          }}
                        />
                        
                        <div className="col-list" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                          {filteredGraphColumns.map(col => {
                            const typeLabel = dtypes[col] || 'object';
                            const typeClass = getDtypeClass(typeLabel);
                            
                            return (
                              <div
                                key={col}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', col);
                                }}
                                className="col-item"
                                style={{
                                  cursor: 'grab',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 12px',
                                  border: '1px solid var(--color-border-main)',
                                  borderRadius: '6px',
                                  marginBottom: '5px',
                                  background: 'var(--color-bg-topbar)'
                                }}
                                title="Drag to X-Axis or Y-Axis drop zones in the graph visualization"
                              >
                                <span className={typeClass} style={{ fontSize: '10px', padding: '1px 4px' }}>{typeLabel}</span>
                                <span className="col-name" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {col}
                                </span>
                                <i className="ti ti-hand-finger text-[12px] text-zinc-500 ml-auto"></i>
                              </div>
                            );
                          })}
                          {filteredGraphColumns.length === 0 && (
                            <div style={{ textAlign: 'center', color: '#555', fontSize: '12px', fontStyle: 'italic', padding: '16px 0' }}>No columns found</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          placeholder="Search saved graphs..."
                          value={savedSearchQuery}
                          onChange={(e) => setSavedSearchQuery(e.target.value)}
                          style={{
                            width: '100%',
                            background: '#ffffff',
                            border: '1px solid var(--color-border-main)',
                            color: 'var(--color-text-main)',
                            fontSize: '12px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            outline: 'none'
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
                          <span style={{ fontWeight: '600' }}>Sort:</span>
                          <select
                            value={savedSortBy}
                            onChange={(e) => setSavedSortBy(e.target.value)}
                            style={{
                              flex: 1,
                              background: '#ffffff',
                              border: '1px solid var(--color-border-main)',
                              borderRadius: '4px',
                              padding: '2px 4px',
                              fontSize: '11px',
                              color: 'var(--color-text-main)',
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="Newest">Newest</option>
                            <option value="Oldest">Oldest</option>
                            <option value="Name">Name</option>
                          </select>
                        </div>
                        
                        <div className="saved-graphs-list" style={{ flex: 1, overflowY: 'auto', padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {isLoadingSaved ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '8px', color: 'var(--color-text-dim)' }}>
                              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Loading saved reports...</span>
                            </div>
                          ) : sortedSavedGraphs.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', color: 'var(--color-text-dim)', textAlign: 'center', gap: '4px' }}>
                              <BarChart3 className="h-6 w-6 text-zinc-300" />
                              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>No graphs found</span>
                            </div>
                          ) : (
                            sortedSavedGraphs.map((g, idx) => {
                              const isSelected = selectedSavedGraph && selectedSavedGraph.graphId === g.graphId;
                              return (
                                <div
                                  key={g.graphId || idx}
                                  onClick={() => setSelectedSavedGraph(g)}
                                  style={{
                                    padding: '6px',
                                    borderRadius: '8px',
                                    border: isSelected ? '2px solid #635ac7' : '1px solid var(--color-border-main)',
                                    background: isSelected ? 'rgba(99, 90, 199, 0.08)' : '#ffffff',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    boxShadow: isSelected ? '0 2px 4px rgba(99, 90, 199, 0.15)' : 'none'
                                  }}
                                >
                                  {/* Small graph preview image */}
                                  <div style={{ 
                                    width: '100%', 
                                    height: '75px', 
                                    background: '#f8fafc', 
                                    borderRadius: '6px', 
                                    border: '1px solid #f1f5f9', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    overflow: 'hidden' 
                                  }}>
                                    <img
                                      src={`/${g.imagePath}`}
                                      alt={g.graphName}
                                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                    />
                                  </div>
                                  <div style={{ fontWeight: '600', fontSize: '11px', color: 'var(--color-text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 2px' }}>
                                    {g.graphName}
                                  </div>
                                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'capitalize', padding: '0 2px' }}>
                                    {g.chartType}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Draggable Resize Handle */}
            <div 
              className="resizer-handle"
              onMouseDown={startStatsResize}
              title="Drag to resize Stats panel"
            />

            {/* Center Panel (Preserved View Preserving Graph & Table) */}
            <div className="center-panel">
              <div className="panel-header" style={{ position: 'relative' }}>
                <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className={activeViewMode === 'graph' ? "ti ti-chart-bar" : "ti ti-table"} style={{ fontSize: '14px', color: '#7F77DD' }} aria-hidden="true"></i>{' '}
                  {activeViewMode === 'graph' ? 'Dataset Exploratory Visualization' : 'Dataset Preview'}
                </span>
                
                {/* View Mode Toggle Group */}
                <div className="view-toggle-container">
                  <button
                    onClick={() => setActiveViewMode('data')}
                    className={`view-toggle-btn ${activeViewMode === 'data' ? 'active' : ''}`}
                  >
                    Table View
                  </button>
                  <button
                    onClick={() => setActiveViewMode('graph')}
                    className={`view-toggle-btn ${activeViewMode === 'graph' ? 'active' : ''}`}
                  >
                    Graph View
                  </button>
                </div>

                {activeViewMode !== 'graph' ? (
                  <div className="meta-chips">
                    <div className="chip">Rows <span>{totalRows.toLocaleString()}</span></div>
                    <div className="chip">Cols <span>{totalCols.toLocaleString()}</span></div>
                    <div className="chip">Missing <span style={{ color: totalMissing > 0 ? '#EF9F27' : '#5DCAA5' }}>{totalMissing.toLocaleString()}</span></div>
                  </div>
                ) : (
                  activeGraphTab === 'Builder' && (
                    <button
                      className="ribbon-train-btn"
                      onClick={() => {
                        if (runTriggerRef.current) {
                          runTriggerRef.current();
                        }
                      }}
                      style={{
                        marginLeft: 'auto',
                        alignSelf: 'center',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Run</span>
                    </button>
                  )
                )}
              </div>

              <div 
                style={{ 
                  flex: 1, 
                  display: activeViewMode === 'graph' ? 'flex' : 'none', 
                  flexDirection: 'column', 
                  background: 'var(--color-bg-app)', 
                  padding: '6px', 
                  minHeight: 0, 
                  overflow: 'hidden' 
                }}
              >
                <ExploratoryGraphView 
                  session={session} 
                  projectName={projectName} 
                  showToast={showToast} 
                  activeSubTab={activeGraphTab} 
                  setActiveSubTab={setActiveGraphTab} 
                  runTriggerRef={runTriggerRef}
                  savedGraphs={savedGraphs}
                  isLoadingSaved={isLoadingSaved}
                  selectedSavedGraph={selectedSavedGraph}
                  setSelectedSavedGraph={setSelectedSavedGraph}
                  onGraphSaved={() => setSavedGraphsRefreshTrigger(t => t + 1)}
                  columns={columns}
                  dtypes={dtypes}
                />
              </div>

              <div 
                className="preview-table"
                style={{
                  display: activeViewMode !== 'graph' ? '' : 'none'
                }}
              >
                {isProcessing && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-sans)', color: 'var(--color-text-muted)' }}>Applying transformation...</span>
                  </div>
                )}

                {records.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th className="idx">#</th>
                          {columns.map(col => {
                            const nullCount = missingCounts[col] || 0;
                            const type = dtypes[col] || 'object';
                            const isNumeric = type.toLowerCase().includes('int') || type.toLowerCase().includes('float');
                            const thClass = [
                              selectedColumn === col ? 'selected-col' : '',
                              isNumeric ? 'numeric' : ''
                            ].filter(Boolean).join(' ');
                            return (
                              <th 
                                key={col} 
                                onClick={() => setSelectedColumn(col)} 
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setSelectedColumn(col);
                                  setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    column: col
                                  });
                                }}
                                className={thClass}
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, col)}
                                onDragOver={(e) => handleDragOver(e, col)}
                                onDragLeave={handleDragLeave}
                                onDragEnd={handleDragEnd}
                                onDrop={(e) => handleDrop(e, col)}
                                style={{ 
                                  cursor: draggedColumn === col ? 'grabbing' : 'grab',
                                  opacity: draggedColumn === col ? 0.4 : 1,
                                  borderLeft: (dragOverColumn === col && draggedColumn && columns.indexOf(draggedColumn) > columns.indexOf(col)) ? '3px solid #6366f1' : undefined,
                                  borderRight: (dragOverColumn === col && draggedColumn && columns.indexOf(draggedColumn) < columns.indexOf(col)) ? '3px solid #6366f1' : undefined,
                                }}
                              >
                                {col}
                                <span className="th-type">{type}</span>
                                {nullCount > 0 && <span className="th-null">{nullCount} null</span>}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((row, idx) => {
                          const absoluteIndex = idx + 1;
                          return (
                            <tr key={idx}>
                              <td className="idx">{absoluteIndex}</td>
                              {columns.map(col => {
                                const val = row[col];
                                const isNull = val === null || val === undefined;
                                const isSelectedCol = selectedColumn === col;
                                const type = dtypes[col] || 'object';
                                const isNumeric = typeof val === 'number' || type.toLowerCase().includes('int') || type.toLowerCase().includes('float');
                                const tdClass = [
                                  isSelectedCol ? 'selected-col' : '',
                                  isNumeric ? 'numeric' : ''
                                ].filter(Boolean).join(' ');

                                if (isNull) {
                                  return (
                                    <td key={col} className={tdClass} style={{ color: isSelectedCol ? '#fca5a5' : '#e06060', fontStyle: 'italic' }}>
                                      NaN
                                    </td>
                                  );
                                }

                                if (typeof val === 'boolean' || (dtypes[col] === 'object' && (String(val) === 'Yes' || String(val) === 'No'))) {
                                  const boolVal = String(val) === 'Yes' || val === true;
                                  return (
                                    <td key={col} className={`${boolVal ? 'bool-yes' : 'bool-no'} ${tdClass}`}>
                                      {String(val)}
                                    </td>
                                  );
                                }

                                return (
                                  <td key={col} className={tdClass}>
                                    {typeof val === 'number' ? formatPreviewNumber(val) : String(val)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '36px', color: '#555', fontFamily: 'var(--font-sans)' }}>No preview data loaded.</div>
                  )}
                </div>

              {activeViewMode === 'data' && totalRows > 0 && (
                <div className="pagination" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="pg-info">Showing {Math.min(records.length, totalRows).toLocaleString()} of {totalRows.toLocaleString()} rows</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#ccc' }}>Rows Displayed:</span>
                    <select
                      value={rowsLimit}
                      onChange={(e) => handleLimitChange(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                      style={{
                        backgroundColor: '#1e1e24',
                        color: '#fff',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                      <option value={1000}>1000</option>
                      <option value={5000}>5000</option>
                      <option value="all">All Rows</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar (Pipeline Steps) */}
            {activeViewMode !== 'graph' && (
              <div className="sidebar-right">
                <div className="sidebar-section">
                  <div className="sidebar-title">
                    <i className="ti ti-list-numbers" aria-hidden="true"></i> Pipeline steps
                  </div>
                  {session.preprocessingSteps.length === 0 ? (
                    <div className="empty-steps">No transformations applied. Original dataset.</div>
                  ) : (
                    <div style={{ maxHeight: 'none', overflowY: 'auto' }}>
                      {session.preprocessingSteps.map((step, idx) => (
                        <div key={idx} className="step-item">
                          <div className="step-num">{idx + 1}</div>
                          <div className="step-desc" title={getCompactStepText(step)}>
                            {step.type === 'rename_column' ? (
                              <>Rename <span>{step.params?.oldName}</span> → {step.params?.newName}</>
                            ) : step.type === 'fill_null' ? (
                              <>Fill <span>{step.params?.column}</span> with {step.params?.strategy}</>
                            ) : step.type === 'drop_columns' ? (
                              <>Drop <span>{step.params?.columns?.join(', ')}</span></>
                            ) : (
                              getCompactStepText(step)
                            )}
                          </div>
                          <div className="step-del" onClick={() => handleDeleteStep(idx)} title="Delete transformation">
                            <i className="ti ti-x" aria-hidden="true"></i>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button className="btn-ghost" style={{ fontSize: '10px', flex: 1, justifyContent: 'center' }} onClick={handleUndo} disabled={session.preprocessingSteps.length === 0}>
                      <i className="ti ti-arrow-back-up" style={{ fontSize: '11px' }}></i> Undo
                    </button>
                    <button className="btn-ghost" style={{ fontSize: '10px', flex: 1, justifyContent: 'center', color: '#e06060', borderColor: '#3a2020' }} onClick={handleClearAll} disabled={session.preprocessingSteps.length === 0}>
                      <i className="ti ti-trash" style={{ fontSize: '11px' }}></i> Clear all
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* 5. LIGHTWEIGHT ALGORITHM SELECTOR MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <i className="ti ti-brain" style={{ fontSize: '18px', color: '#7F77DD' }}></i>
                <span>Initialize Model Project</span>
              </h2>
              <p className="text-xs text-zinc-400">
                Create a model project based on your preprocessed dataset file.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 font-mono block mb-1">Project Directory Name</label>
                <input
                  type="text"
                  placeholder="e.g. housing_regression"
                  value={newProjectName}
                  disabled={!!projectName}
                  onChange={(e) => setNewProjectName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  className={`w-full border text-zinc-200 text-xs rounded-xl p-2.5 focus:outline-none font-mono ${projectName ? 'bg-zinc-900/40 border-zinc-900/60 text-zinc-500 cursor-not-allowed' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 focus:border-indigo-500'}`}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 font-mono block mb-2">Select Algorithm / Model</label>
                <div className="max-h-56 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                  <div>
                    <h4 className="text-[8px] font-bold text-zinc-500 font-mono uppercase tracking-widest border-b border-zinc-900 pb-1 mb-2">Regression</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {ALGORITHMS.filter(a => a.category === 'Regression').map(algo => (
                        <button
                          key={algo.id}
                          onClick={() => setSelectedAlgo(algo)}
                          className={`p-2.5 rounded-lg border text-left font-mono text-[10px] transition-all cursor-pointer truncate ${selectedAlgo?.id === algo.id ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-900 bg-zinc-900/30 hover:border-zinc-850 hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'}`}
                        >
                          {algo.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[8px] font-bold text-zinc-500 font-mono uppercase tracking-widest border-b border-zinc-900 pb-1 mb-2">Classification</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {ALGORITHMS.filter(a => a.category === 'Classification').map(algo => (
                        <button
                          key={algo.id}
                          onClick={() => setSelectedAlgo(algo)}
                          className={`p-2.5 rounded-lg border text-left font-mono text-[10px] transition-all cursor-pointer truncate ${selectedAlgo?.id === algo.id ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-zinc-900 bg-zinc-900/30 hover:border-zinc-850 hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'}`}
                        >
                          {algo.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[8px] font-bold text-zinc-500 font-mono uppercase tracking-widest border-b border-zinc-900 pb-1 mb-2">Clustering</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {ALGORITHMS.filter(a => a.category === 'Clustering').map(algo => (
                        <button
                          key={algo.id}
                          onClick={() => setSelectedAlgo(algo)}
                          className={`p-2.5 rounded-lg border text-left font-mono text-[10px] transition-all cursor-pointer truncate ${selectedAlgo?.id === algo.id ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-zinc-900 bg-zinc-900/30 hover:border-zinc-850 hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'}`}
                        >
                          {algo.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {projectError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[10px] font-mono">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{projectError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isCreatingProject}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateAndLaunch}
                disabled={isCreatingProject || !selectedAlgo}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/30 hover:border-indigo-400/50 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isCreatingProject ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Launching...</span>
                  </>
                ) : (
                  <span>Launch Workspace</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* WARNING MODAL FOR ALL ROWS */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl max-w-md w-full overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-left font-sans">
            {/* Header */}
            <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>Performance Warning</span>
              </h2>
              <button 
                onClick={() => { setShowWarningModal(false); setPendingLimit(null); }}
                className="text-zinc-500 hover:text-white p-1 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Content */}
            <div className="p-6 text-zinc-350 text-sm space-y-4">
              <p>
                You are about to display all rows for a dataset with <strong>{(session?.metadata?.totalRows || 0).toLocaleString()}</strong> rows.
              </p>
              <p className="text-zinc-400 text-xs">
                Loading a very large dataset into the browser may cause performance lag, memory exhaustion, or temporarily freeze the page.
              </p>
            </div>
            {/* Footer */}
            <div className="p-4 bg-zinc-950/50 border-t border-zinc-900 flex justify-end gap-3">
              <button
                onClick={() => { setShowWarningModal(false); setPendingLimit(null); }}
                className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setRowsLimit('all');
                  setShowWarningModal(false);
                  setPendingLimit(null);
                }}
                className="px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 text-xs font-semibold cursor-pointer"
              >
                Display All Rows
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROFILING REPORT MODAL */}
      {profilingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-left font-sans">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-400" />
                  <span>
                    {profilingModalType === 'dataset_info' && 'Dataset Information'}
                    {profilingModalType === 'dataset_summary' && 'Dataset Summary & Description'}
                    {profilingModalType === 'missing_analysis' && 'Missing Value Analysis'}
                    {profilingModalType === 'datatype_overview' && 'Data Type Overview'}
                    {profilingModalType === 'correlation_matrix' && 'Correlation Matrix (Pearson)'}
                    {profilingModalType === 'class_distribution' && `Unique Value Distribution: ${selectedColumn}`}
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {profilingModalType === 'dataset_info' && 'General project storage details and file locations.'}
                  {profilingModalType === 'dataset_summary' && 'Summary statistical metrics for all numeric attributes.'}
                  {profilingModalType === 'missing_analysis' && 'Audit of empty, NaN, and null values across all columns.'}
                  {profilingModalType === 'datatype_overview' && 'Inspection of detected data types and sample values.'}
                  {profilingModalType === 'correlation_matrix' && 'Linear relationship strength (-1 to +1) between numeric features.'}
                  {profilingModalType === 'class_distribution' && 'Frequency analysis of classes and categories in this column.'}
                </p>
              </div>
              <button 
                onClick={() => { setProfilingModalOpen(false); setProfilingModalData(null); }}
                className="text-zinc-500 hover:text-white p-1 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-grow text-zinc-350 text-xs space-y-4">
              {isProfilingLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                  <span className="font-mono text-zinc-500">Calculating report from Python backend...</span>
                </div>
              ) : profilingModalData ? (
                <>
                  {/* DATASET INFO REPORT */}
                  {profilingModalType === 'dataset_info' && (
                    <div className="space-y-4 font-mono">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl space-y-2">
                          <div className="text-[10px] text-zinc-500 uppercase font-bold">File Name</div>
                          <div className="text-zinc-200 truncate">{profilingModalData.filename}</div>
                        </div>
                        <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl space-y-2">
                          <div className="text-[10px] text-zinc-500 uppercase font-bold">Format</div>
                          <div className="text-zinc-200 uppercase">{profilingModalData.format}</div>
                        </div>
                        <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl space-y-2 col-span-2">
                          <div className="text-[10px] text-zinc-500 uppercase font-bold">Raw Path</div>
                          <div className="text-zinc-300 truncate select-all">{profilingModalData.rawPath}</div>
                        </div>
                        <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl space-y-2 col-span-2">
                          <div className="text-[10px] text-zinc-500 uppercase font-bold">Processed Path</div>
                          <div className="text-zinc-300 truncate select-all">{profilingModalData.procPath}</div>
                        </div>
                        <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl space-y-2">
                          <div className="text-[10px] text-zinc-500 uppercase font-bold">Pipeline Step Count</div>
                          <div className="text-zinc-200">{profilingModalData.stepsCount} steps</div>
                        </div>
                        <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-xl space-y-2">
                          <div className="text-[10px] text-zinc-500 uppercase font-bold">Created At</div>
                          <div className="text-zinc-200">{new Date(profilingModalData.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DATASET SUMMARY REPORT */}
                  {profilingModalType === 'dataset_summary' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-zinc-900/30 p-3 border border-zinc-900 rounded-xl text-center">
                          <div className="text-[9px] text-zinc-500 uppercase font-mono">Total Rows</div>
                          <div className="text-base font-bold text-zinc-100 mt-1">{profilingModalData.totalRows?.toLocaleString()}</div>
                        </div>
                        <div className="bg-zinc-900/30 p-3 border border-zinc-900 rounded-xl text-center">
                          <div className="text-[9px] text-zinc-500 uppercase font-mono">Total Columns</div>
                          <div className="text-base font-bold text-zinc-100 mt-1">{profilingModalData.totalCols?.toLocaleString()}</div>
                        </div>
                        <div className="bg-zinc-900/30 p-3 border border-zinc-900 rounded-xl text-center">
                          <div className="text-[9px] text-zinc-500 uppercase font-mono">Duplicate Rows</div>
                          <div className={`text-base font-bold mt-1 ${profilingModalData.duplicateRows > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {profilingModalData.duplicateRows?.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Numeric Description Table */}
                      {Object.keys(profilingModalData.numericDesc || {}).length > 0 ? (
                        <div className="space-y-2">
                          <h3 className="text-xs font-bold text-zinc-300 font-mono uppercase tracking-wider">Descriptive Statistics</h3>
                          <div className="overflow-x-auto border border-zinc-900 rounded-xl">
                            <table className="w-full text-left font-mono border-collapse">
                              <thead>
                                <tr className="bg-zinc-900/80 border-b border-zinc-900">
                                  <th className="p-2.5 text-zinc-400 font-bold">Column</th>
                                  {Object.keys(Object.values(profilingModalData.numericDesc)[0] || {}).map(metric => (
                                    <th key={metric} className="p-2.5 text-zinc-400 font-bold text-right">{metric}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-900">
                                {Object.entries(profilingModalData.numericDesc).map(([col, metrics]) => (
                                  <tr key={col} className="hover:bg-zinc-900/20">
                                    <td className="p-2.5 text-zinc-200 font-bold max-w-[150px] truncate">{col}</td>
                                    {Object.values(metrics).map((val, idx) => (
                                      <td key={idx} className="p-2.5 text-zinc-350 text-right">
                                        {typeof val === 'number' ? (val % 1 === 0 ? val.toLocaleString() : val.toFixed(4)) : (val ?? 'null')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-zinc-900/20 border border-zinc-900 text-zinc-500 italic rounded-xl text-center font-mono">
                          No numeric attributes detected in this dataset.
                        </div>
                      )}
                    </div>
                  )}

                  {/* MISSING ANALYSIS REPORT */}
                  {profilingModalType === 'missing_analysis' && (
                    <div className="space-y-4">
                      <div className="overflow-x-auto border border-zinc-900 rounded-xl">
                        <table className="w-full text-left font-mono border-collapse">
                          <thead>
                            <tr className="bg-zinc-900/80 border-b border-zinc-900">
                              <th className="p-2.5 text-zinc-400 font-bold">Column Name</th>
                              <th className="p-2.5 text-zinc-400 font-bold text-right">Null Count</th>
                              <th className="p-2.5 text-zinc-400 font-bold text-right">Missing Percentage</th>
                              <th className="p-2.5 text-zinc-400 font-bold w-1/3">Bar Chart Visual</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900">
                            {profilingModalData.missingAnalysis?.map((item, idx) => (
                              <tr key={idx} className="hover:bg-zinc-900/20">
                                <td className="p-2.5 text-zinc-200 font-bold truncate max-w-[200px]">{item.column}</td>
                                <td className={`p-2.5 text-right font-bold ${item.nulls > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {item.nulls.toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right font-bold">{item.percentage.toFixed(2)}%</td>
                                <td className="p-2.5">
                                  <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                                    <div 
                                      className={`h-full ${item.percentage > 50 ? 'bg-red-500' : item.percentage > 20 ? 'bg-amber-500' : 'bg-indigo-500'}`} 
                                      style={{ width: `${item.percentage}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DATA TYPE OVERVIEW */}
                  {profilingModalType === 'datatype_overview' && (
                    <div className="space-y-4">
                      <div className="overflow-x-auto border border-zinc-900 rounded-xl">
                        <table className="w-full text-left font-mono border-collapse">
                          <thead>
                            <tr className="bg-zinc-900/80 border-b border-zinc-900">
                              <th className="p-2.5 text-zinc-400 font-bold">Column Name</th>
                              <th className="p-2.5 text-zinc-400 font-bold">Inferred Type</th>
                              <th className="p-2.5 text-zinc-400 font-bold">Sample Values</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900">
                            {profilingModalData.datatypeOverview?.map((item, idx) => {
                              const typeClass = getDtypeClass(item.dtype);
                              return (
                                <tr key={idx} className="hover:bg-zinc-900/20">
                                  <td className="p-2.5 text-zinc-200 font-bold truncate max-w-[200px]">{item.column}</td>
                                  <td className="p-2.5">
                                    <span className={`${typeClass} px-2 py-0.5 rounded text-[10px]`}>{item.dtype}</span>
                                  </td>
                                  <td className="p-2.5 text-zinc-300">
                                    <div className="flex gap-1.5 flex-wrap">
                                      {item.sampleValues.map((v, i) => (
                                        <span key={i} className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-850 truncate max-w-[150px]">{v}</span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* CORRELATION MATRIX */}
                  {profilingModalType === 'correlation_matrix' && (
                    <div className="space-y-4">
                      {profilingModalData.columns && profilingModalData.columns.length > 0 ? (
                        <div className="overflow-x-auto border border-zinc-900 rounded-xl p-2 bg-zinc-950">
                          <table className="font-mono text-[10px] border-collapse mx-auto">
                            <thead>
                              <tr>
                                <th className="p-1.5 text-zinc-500 text-left truncate max-w-[120px] font-normal">Column</th>
                                {profilingModalData.columns.map(col => (
                                  <th key={col} className="p-1.5 text-zinc-400 text-center truncate max-w-[80px] font-bold" title={col}>
                                    {col.length > 8 ? col.substring(0, 6) + '..' : col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {profilingModalData.columns.map((rowCol, rIdx) => (
                                <tr key={rowCol}>
                                  <td className="p-1.5 text-zinc-300 font-bold truncate max-w-[120px]" title={rowCol}>{rowCol}</td>
                                  {profilingModalData.matrix[rIdx].map((val, cIdx) => {
                                    const abs = Math.abs(val);
                                    let bgStyle = {};
                                    if (val > 0) {
                                      bgStyle = { background: `rgba(99, 102, 241, ${abs})`, color: abs > 0.5 ? '#fff' : '#ccc' };
                                    } else {
                                      bgStyle = { background: `rgba(239, 68, 68, ${abs})`, color: abs > 0.5 ? '#fff' : '#ccc' };
                                    }
                                    return (
                                      <td 
                                        key={cIdx} 
                                        style={bgStyle} 
                                        className="p-1.5 text-center font-bold border border-zinc-900 rounded" 
                                        title={`${rowCol} & ${profilingModalData.columns[cIdx]}: ${val.toFixed(6)}`}
                                      >
                                        {val.toFixed(2)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-6 bg-zinc-900/20 border border-zinc-900 text-zinc-500 italic rounded-xl text-center font-mono">
                          Insufficient numeric columns in dataset to generate correlation coefficients (requires at least 2).
                        </div>
                      )}
                    </div>
                  )}

                  {/* CLASS DISTRIBUTION REPORT */}
                  {profilingModalType === 'class_distribution' && (
                    <div className="space-y-4">
                      <div className="overflow-x-auto border border-zinc-900 rounded-xl">
                        <table className="w-full text-left font-mono border-collapse">
                          <thead>
                            <tr className="bg-zinc-900/80 border-b border-zinc-900">
                              <th className="p-2.5 text-zinc-400 font-bold">Class Value</th>
                              <th className="p-2.5 text-zinc-400 font-bold text-right">Occurrence Count</th>
                              <th className="p-2.5 text-zinc-400 font-bold text-right">Percentage Frequency</th>
                              <th className="p-2.5 text-zinc-400 font-bold w-1/3">Frequency Visual</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900">
                            {profilingModalData.distribution?.map((item, idx) => (
                              <tr key={idx} className="hover:bg-zinc-900/20">
                                <td className="p-2.5 text-zinc-200 font-bold truncate max-w-[250px]">{item.value}</td>
                                <td className="p-2.5 text-right font-bold text-indigo-300">{item.count.toLocaleString()}</td>
                                <td className="p-2.5 text-right font-bold">{item.percentage.toFixed(2)}%</td>
                                <td className="p-2.5">
                                  <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                                    <div 
                                      className="h-full bg-indigo-500" 
                                      style={{ width: `${item.percentage}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10 text-zinc-500 font-mono italic">No data loaded or generated.</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-900 flex justify-end">
              <button 
                onClick={() => { setProfilingModalOpen(false); setProfilingModalData(null); }}
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-250 text-xs font-bold rounded-xl border border-zinc-800 transition-colors cursor-pointer"
              >
                Close View
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 6. TOAST FEEDBACK */}
      {toast.visible && (
        toast.type === 'error' ? (
          <div className="fixed right-6 top-1/2 -translate-y-1/2 z-[100] bg-zinc-900 border border-red-500/40 text-red-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 font-mono text-xs max-w-sm">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 animate-bounce" />
            <div className="flex-grow pr-2">{toast.message}</div>
            <button
              onClick={() => setToast(prev => ({ ...prev, visible: false }))}
              className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded hover:bg-zinc-800 cursor-pointer shrink-0"
              title="Close Notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="fixed bottom-6 right-6 z-[100] bg-zinc-900 border border-indigo-500/30 text-zinc-100 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-3 duration-300 font-mono text-xs max-w-sm">
            <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
            <span>{toast.message}</span>
          </div>
        )
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: 'Delete Column',
              icon: Trash2,
              onClick: () => handleDropColumn(contextMenu.column)
            },
            {
              label: 'Change Data Type',
              icon: Settings,
              onClick: () => {
                setActiveCategory('Home');
                setActiveRibbonAction('cast');
              }
            }
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// 7. EXPLORATORY GRAPH VIEW
function ExploratoryGraphView({ 
  session, 
  projectName, 
  showToast, 
  activeSubTab, 
  setActiveSubTab, 
  runTriggerRef,
  savedGraphs = [],
  isLoadingSaved = false,
  selectedSavedGraph = null,
  setSelectedSavedGraph,
  onGraphSaved,
  columns = [],
  dtypes = {}
}) {
  const [selectedChartType, setSelectedChartType] = useState('auto');
  const [xAxisList, setXAxisList] = useState([]);
  const [yAxisList, setYAxisList] = useState([]);
  const [zoom, setZoom] = useState(1.0);
  const [chartData, setChartData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showError, setShowError] = useState(false);
  const [hasExecutedVisualization, setHasExecutedVisualization] = useState(false);
  const [executedConfig, setExecutedConfig] = useState(null);
  const [isSavingGraph, setIsSavingGraph] = useState(false);

  // New Visualization Mode, Advanced Options & Tab States
  const [visualizationMode, setVisualizationMode] = useState('standard'); // 'standard' | 'custom'
  const [activePreviewTab, setActivePreviewTab] = useState('preview'); // 'preview' | 'editor'
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [executionStatus, setExecutionStatus] = useState('idle'); // 'idle' | 'running_viz' | 'formatting'
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [friendlyError, setFriendlyError] = useState(null);

  // Advanced Options Settings
  const [binningEnabled, setBinningEnabled] = useState(false);
  const [binCount, setBinCount] = useState(10);
  const [aggregationMethod, setAggregationMethod] = useState('none');
  const [sortOrder, setSortOrder] = useState('none');
  const [topNCount, setTopNCount] = useState('');

  // Custom Python Code state
  const [customPythonCode, setCustomPythonCode] = useState('');

  // Naming modal states
  const [isNamingModalOpen, setIsNamingModalOpen] = useState(false);
  const [customGraphName, setCustomGraphName] = useState('');
  const [openAxisDropdown, setOpenAxisDropdown] = useState(null); // 'x' | 'y' | null

  useEffect(() => {
    const handleOutsideClick = () => {
      setOpenAxisDropdown(null);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const toggleAxisDropdown = (e, zone) => {
    e.stopPropagation();
    setOpenAxisDropdown(openAxisDropdown === zone ? null : zone);
  };

  const ZOOM_LEVELS = [1.0, 1.25, 1.5, 2.0];

  const chartNames = {
    scatter: 'Scatter Plot',
    line: 'Line Chart',
    histogram: 'Histogram',
    bar: 'Bar Chart',
    stacked_bar: 'Stacked Bar',
    horizontal_bar: 'Horizontal Bar',
    area: 'Area Chart',
    bubble: 'Bubble Chart',
    box: 'Box Plot',
    violin: 'Violin Plot',
    heatmap: 'Correlation Heatmap',
    count: 'Count Plot',
    density: 'Density Plot',
    kde: 'KDE Plot',
    hexbin: 'Hexbin Plot'
  };

  const DEFAULT_TEMPLATES = {
    scatter: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df                  - Processed DataFrame
# raw_df              - Raw DataFrame before preprocessing
# xAxis               - List of selected X-axis columns (e.g. xAxis[0])
# yAxis               - List of selected Y-axis columns (e.g. yAxis[0])
# chartTitle          - Default string title
# datasetName         - Raw filename
# projectName         - Current project folder name
# selectedChartType   - Active standard chart type ID ('scatter')

plt.figure(figsize=(10, 6))
sns.scatterplot(data=df, x=xAxis[0], y=yAxis[0] if len(yAxis) > 0 else None)
plt.title(chartTitle)
plt.tight_layout()`,
    line: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
sns.lineplot(data=df.sort_values(by=xAxis[0]) if xAxis else df, x=xAxis[0] if xAxis else None, y=yAxis[0] if yAxis else None)
plt.title(chartTitle)
plt.tight_layout()`,
    histogram: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
sns.histplot(data=df, x=xAxis[0] if xAxis else None, kde=True)
plt.title(chartTitle)
plt.tight_layout()`,
    bar: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
sns.barplot(data=df, x=xAxis[0] if xAxis else None, y=yAxis[0] if yAxis else None)
plt.title(chartTitle)
plt.tight_layout()`,
    stacked_bar: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
if len(yAxis) > 0 and len(xAxis) > 0:
    df.set_index(xAxis[0])[yAxis].plot(kind='bar', stacked=True, ax=plt.gca())
elif len(xAxis) > 0:
    df[xAxis[0]].value_counts().plot(kind='bar', stacked=True, ax=plt.gca())
else:
    df.plot(kind='bar', stacked=True, ax=plt.gca())
plt.title(chartTitle)
plt.tight_layout()`,
    horizontal_bar: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
sns.barplot(data=df, y=xAxis[0] if xAxis else None, x=yAxis[0] if yAxis else None, orient='h')
plt.title(chartTitle)
plt.tight_layout()`,
    area: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
if len(xAxis) > 0 and len(yAxis) > 0:
    df.sort_values(by=xAxis[0]).set_index(xAxis[0])[yAxis].plot(kind='area', stacked=False, alpha=0.4, ax=plt.gca())
else:
    df.plot(kind='area', stacked=False, alpha=0.4, ax=plt.gca())
plt.title(chartTitle)
plt.tight_layout()`,
    bubble: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
size_col = yAxis[1] if len(yAxis) > 1 else None
sns.scatterplot(data=df, x=xAxis[0] if xAxis else None, y=yAxis[0] if yAxis else None, size=size_col, sizes=(20, 200), alpha=0.6)
plt.title(chartTitle)
plt.tight_layout()`,
    box: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
sns.boxplot(data=df, x=xAxis[0] if xAxis else None, y=yAxis[0] if yAxis else None)
plt.title(chartTitle)
plt.tight_layout()`,
    violin: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
sns.violinplot(data=df, x=xAxis[0] if xAxis else None, y=yAxis[0] if yAxis else None)
plt.title(chartTitle)
plt.tight_layout()`,
    heatmap: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(8, 6))
cols = (xAxis + yAxis) if (xAxis or yAxis) else df.columns
sns.heatmap(df[cols].corr(), annot=True, cmap='Purples')
plt.title(chartTitle)
plt.tight_layout()`,
    count: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
sns.countplot(data=df, x=xAxis[0] if xAxis else None)
plt.title(chartTitle)
plt.tight_layout()`,
    density: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
if len(yAxis) > 0 and len(xAxis) > 0:
    sns.kdeplot(data=df, x=xAxis[0], y=yAxis[0], fill=True, cmap='Purples')
elif len(xAxis) > 0:
    sns.kdeplot(data=df, x=xAxis[0], fill=True)
plt.title(chartTitle)
plt.tight_layout()`,
    kde: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
if len(yAxis) > 0 and len(xAxis) > 0:
    sns.kdeplot(data=df, x=xAxis[0], y=yAxis[0])
elif len(xAxis) > 0:
    sns.kdeplot(data=df, x=xAxis[0], fill=True)
plt.title(chartTitle)
plt.tight_layout()`,
    hexbin: `import matplotlib.pyplot as plt
import seaborn as sns

# Available variables:
# df, raw_df, xAxis, yAxis, chartTitle, datasetName, projectName, selectedChartType

plt.figure(figsize=(10, 6))
y_val = yAxis[0] if len(yAxis) > 0 else (xAxis[0] if len(xAxis) > 0 else None)
if xAxis and y_val:
    plt.hexbin(df[xAxis[0]], df[y_val], gridsize=20, cmap='Purples', mincnt=1)
plt.title(chartTitle)
plt.tight_layout()`
  };

  const CHART_REGISTRY_METADATA = {
    scatter: { label: 'Scatter Plot', options: [] },
    line: { label: 'Line Chart', options: ['aggregation', 'sorting', 'topN'] },
    histogram: { label: 'Histogram', options: ['binning'] },
    bar: { label: 'Bar Chart', options: ['aggregation', 'sorting', 'topN'] },
    stacked_bar: { label: 'Stacked Bar', options: ['aggregation', 'sorting', 'topN'] },
    horizontal_bar: { label: 'Horizontal Bar', options: ['aggregation', 'sorting', 'topN'] },
    area: { label: 'Area Chart', options: ['aggregation', 'sorting', 'topN'] },
    bubble: { label: 'Bubble Chart', options: [] },
    box: { label: 'Box Plot', options: ['sorting', 'topN'] },
    violin: { label: 'Violin Plot', options: ['sorting', 'topN'] },
    heatmap: { label: 'Correlation Heatmap', options: [] },
    count: { label: 'Count Plot', options: ['sorting', 'topN'] },
    density: { label: 'Density Plot', options: ['binning'] },
    kde: { label: 'KDE Plot', options: ['binning'] },
    hexbin: { label: 'Hexbin Plot', options: ['binning'] }
  };

  const getStarterCode = (cType) => {
    return DEFAULT_TEMPLATES[cType] || DEFAULT_TEMPLATES['scatter'];
  };

  const storageKey = `dera_custom_code_${projectName || 'global'}_${session?.processedDatasetPath || session?.rawDatasetPath || 'global'}`;
  
  useEffect(() => {
    const savedCode = localStorage.getItem(storageKey);
    if (savedCode) {
      setCustomPythonCode(savedCode);
    } else {
      setCustomPythonCode(getStarterCode(selectedChartType === 'auto' ? getAutoChartType() : selectedChartType));
    }
  }, [storageKey]);

  const updateCustomCode = (val) => {
    setCustomPythonCode(val);
    localStorage.setItem(storageKey, val);
  };

  const parseError = (errStr) => {
    if (!errStr) return { col: '', reason: '' };
    const parts = errStr.split('|');
    let col = '';
    let reason = errStr;
    parts.forEach(part => {
      if (part.startsWith('col:')) {
        col = part.substring(4);
      } else if (part.startsWith('reason:')) {
        reason = part.substring(7);
      }
    });
    return { col, reason };
  };

  const getAutoChartType = () => {
    if (xAxisList.length === 0) return 'scatter';
    const firstX = xAxisList[0];
    const xType = String(dtypes[firstX] || '').toLowerCase();
    const hasY = yAxisList.length > 0;
    if (!hasY) {
      const isXNumeric = xType.includes('int') || xType.includes('float') || xType.includes('num');
      return isXNumeric ? 'histogram' : 'bar';
    }
    const firstY = yAxisList[0];
    const yType = String(dtypes[firstY] || '').toLowerCase();
    const isXNumeric = xType.includes('int') || xType.includes('float') || xType.includes('num');
    const isYNumeric = yType.includes('int') || yType.includes('float') || yType.includes('num');
    const isXDate = xType.includes('date') || xType.includes('time');
    const isYDate = yType.includes('date') || yType.includes('time');

    if (isXDate && isYNumeric) return 'line';
    if (isYDate && isXNumeric) return 'line';
    if (isXNumeric && isYNumeric) return 'scatter';
    if ((!isXNumeric && isYNumeric) || (isXNumeric && !isYNumeric)) return 'bar';
    return 'scatter';
  };

  const activeChartType = selectedChartType === 'auto' ? getAutoChartType() : selectedChartType;

  const getDefaultGraphName = () => {
    const chartLabel = chartNames[activeChartType] || 'Plot';
    const xLabel = xAxisList.join(', ');
    const yLabel = yAxisList.length > 0 ? ` vs ${yAxisList.join(', ')}` : '';
    return `${chartLabel} - ${xLabel}${yLabel}`;
  };

  useEffect(() => {
    if (columns.length > 0) {
      if (xAxisList.length === 0) {
        setXAxisList([columns[0]]);
      }
      if (yAxisList.length === 0 && columns.length > 1) {
        setYAxisList([columns[1]]);
      }
    }
  }, [columns]);

  const handleClearChart = () => {
    setXAxisList([]);
    setYAxisList([]);
    setSelectedChartType('auto');
    setChartData(null);
    setError('');
    setShowError(false);
    setExecutedConfig(null);
    setHasExecutedVisualization(false);
  };

  const fetchChartData = async (xList, yList, chartType, forcePayload = null) => {
    if (!session) return;
    setIsLoading(true);
    setError('');
    setShowError(false);
    setFriendlyError(null);
    setExecutionStatus('running_viz');
    try {
      const activePath = session.processedDatasetPath || session.rawDatasetPath;
      const xParam = xList.join(',');
      const yParam = yList.join(',');
      
      const payload = {
        filePath: activePath,
        chartType,
        xAxis: xParam,
        yAxis: yParam,
        zoom: zoom,
        projectName: projectName || '',
        visualizationMode: forcePayload?.visualizationMode || visualizationMode,
        customCode: forcePayload?.customCode !== undefined ? forcePayload.customCode : customPythonCode,
        advancedOptions: {
          binningEnabled,
          binCount,
          densityEnabled: true,
          aggregationMethod,
          sortOrder,
          topNCount,
          chartTitle: getDefaultGraphName()
        }
      };

      const res = await fetch(`${DATALAB_API_BASE}/chart-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && (data.success || data.errorType === 'ExecutionError')) {
        if (data.success) {
          setChartData(data);
          setExecutedConfig({ 
            xAxis: xList, 
            yAxis: yList, 
            chartType,
            visualizationMode: payload.visualizationMode,
            customCode: payload.customCode,
            advancedOptions: payload.advancedOptions
          });
          setHasExecutedVisualization(true);
        } else {
          setChartData(null);
          setError(data.error || 'Execution failed');
          setFriendlyError(data);
          setShowError(true);
        }
      } else {
        setError(data.error || 'Failed to load chart data');
        setShowError(true);
      }
    } catch (err) {
      console.error('[DERA Client GraphView] Chart fetch error:', err);
      setError('Error fetching chart data from backend');
      setShowError(true);
    } finally {
      setIsLoading(false);
      setExecutionStatus('idle');
    }
  };

  const handleRunVisualization = async () => {
    setError('');
    setShowError(false);
    setFriendlyError(null);

    if (xAxisList.length === 0) {
      setError('Please select an X-axis column.');
      setShowError(true);
      return;
    }

    if (visualizationMode === 'standard') {
      if ((activeChartType === 'scatter' || activeChartType === 'line') && yAxisList.length === 0) {
        setError(`Please select both X and Y axes for ${chartNames[activeChartType]}.`);
        setShowError(true);
        return;
      }

      if (activeChartType === 'heatmap' && yAxisList.length === 0) {
        setError('Please select both X and Y axes for Correlation Heatmap.');
        setShowError(true);
        return;
      }
    }

    await fetchChartData(xAxisList, yAxisList, activeChartType);
  };

  useEffect(() => {
    if (runTriggerRef) {
      runTriggerRef.current = handleRunVisualization;
    }
  });

  useEffect(() => {
    handleClearChart();
  }, [session?.processedDatasetPath, session?.rawDatasetPath]);

  const handleSwapAxes = () => {
    const temp = [...xAxisList];
    setXAxisList(yAxisList);
    setYAxisList(temp);
  };

  const handleSaveGraphClick = async (graphName) => {
    if (!projectName || !chartData) return;
    setIsSavingGraph(true);
    try {
      const xParam = xAxisList.join(',');
      const yParam = yAxisList.join(',');
      const payload = {
        projectName: projectName,
        graphName: graphName,
        chartType: activeChartType,
        xAxis: xParam,
        yAxis: yParam,
        visualizationMode: visualizationMode,
        customCode: customPythonCode,
        advancedOptions: {
          binningEnabled,
          binCount,
          aggregationMethod,
          sortOrder,
          topNCount
        }
      };
      
      const res = await fetch(`${DATALAB_API_BASE}/save-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) {
          showToast('Graph successfully saved to project workspace!', 'success');
        } else {
          alert('Graph successfully saved to project workspace!');
        }
        if (onGraphSaved) onGraphSaved();
      } else {
        alert(data.error || 'Failed to save graph.');
      }
    } catch (err) {
      console.error('Save graph error:', err);
      alert('Error saving graph.');
    } finally {
      setIsSavingGraph(false);
    }
  };

  const triggerSaveModal = () => {
    setCustomGraphName(getDefaultGraphName());
    setIsNamingModalOpen(true);
  };

  const handleDragStartChip = (e, index, zone) => {
    e.dataTransfer.setData('application/dera-chip', JSON.stringify({ index, zone }));
    e.stopPropagation();
  };

  const handleDropZone = (e, zone) => {
    e.preventDefault();
    e.stopPropagation();
    
    const chipData = e.dataTransfer.getData('application/dera-chip');
    if (chipData) {
      const { index: dragIdx, zone: dragZone } = JSON.parse(chipData);
      if (dragZone === zone) {
        const list = zone === 'x' ? [...xAxisList] : [...yAxisList];
        const [removed] = list.splice(dragIdx, 1);
        list.push(removed);
        if (zone === 'x') setXAxisList(list);
        else setYAxisList(list);
      } else {
        // Move chip to the other zone
        if (zone === 'x' && xAxisList.length >= 5) {
          if (showToast) showToast('Maximum columns exceeded for X-Axis.', 'warning');
          return;
        }
        if (zone === 'y' && yAxisList.length >= 5) {
          if (showToast) showToast('Maximum columns exceeded for Y-Axis.', 'warning');
          return;
        }
        const sourceList = dragZone === 'x' ? [...xAxisList] : [...yAxisList];
        const [removed] = sourceList.splice(dragIdx, 1);
        const destList = zone === 'x' ? [...xAxisList] : [...yAxisList];
        destList.push(removed);
        
        if (dragZone === 'x') {
          setXAxisList(sourceList);
          setYAxisList(destList);
        } else {
          setYAxisList(sourceList);
          setXAxisList(destList);
        }
      }
    } else {
      // It's a drag from columns list
      const column = e.dataTransfer.getData('text/plain');
      if (column) {
        if (zone === 'x') {
          if (xAxisList.includes(column)) return;
          if (xAxisList.length >= 5) {
            if (showToast) showToast('X-Axis is limited to 5 series.', 'warning');
            return;
          }
          setXAxisList([...xAxisList, column]);
        } else {
          if (yAxisList.includes(column)) return;
          if (yAxisList.length >= 5) {
            if (showToast) showToast('Y-Axis is limited to 5 series.', 'warning');
            return;
          }
          setYAxisList([...yAxisList, column]);
        }
      }
    }
  };

  const handleDropOnChip = (e, targetIdx, zone) => {
    e.preventDefault();
    e.stopPropagation();
    
    const chipData = e.dataTransfer.getData('application/dera-chip');
    if (chipData) {
      const { index: dragIdx, zone: dragZone } = JSON.parse(chipData);
      if (dragZone === zone) {
        const list = zone === 'x' ? [...xAxisList] : [...yAxisList];
        const [removed] = list.splice(dragIdx, 1);
        list.splice(targetIdx, 0, removed);
        if (zone === 'x') setXAxisList(list);
        else setYAxisList(list);
      }
    } else {
      const col = e.dataTransfer.getData('text/plain');
      if (col) {
        if (zone === 'x' && xAxisList.length >= 5 && !xAxisList.includes(col)) {
          if (showToast) showToast('Maximum axis column limit reached.', 'warning');
          return;
        }
        if (zone === 'y' && yAxisList.length >= 5 && !yAxisList.includes(col)) {
          if (showToast) showToast('Maximum axis column limit reached.', 'warning');
          return;
        }
        const list = zone === 'x' ? [...xAxisList] : [...yAxisList];
        if (!list.includes(col)) {
          list.splice(targetIdx, 0, col);
          if (zone === 'x') setXAxisList(list);
          else setYAxisList(list);
        }
      }
    }
  };

  const removeColumn = (index, zone) => {
    if (zone === 'x') {
      const list = [...xAxisList];
      list.splice(index, 1);
      setXAxisList(list);
    } else {
      const list = [...yAxisList];
      list.splice(index, 1);
      setYAxisList(list);
    }
  };

  const handleSelectAdd = (e, zone) => {
    const col = e.target.value;
    if (!col) return;
    if (zone === 'x') {
      if (!xAxisList.includes(col)) {
        if (xAxisList.length >= 5) {
          if (showToast) showToast('X-Axis is limited to 5 series.', 'warning');
          return;
        }
        setXAxisList([...xAxisList, col]);
      }
    } else {
      if (!yAxisList.includes(col)) {
        if (yAxisList.length >= 5) {
          if (showToast) showToast('Y-Axis is limited to 5 series.', 'warning');
          return;
        }
        setYAxisList([...yAxisList, col]);
      }
    }
    e.target.value = '';
  };

  const handleFormatCodeClick = async () => {
    try {
      setExecutionStatus('formatting');
      const res = await fetch(`${DATALAB_API_BASE}/format-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: customPythonCode })
      });
      const data = await res.json();
      if (res.ok && data.success && data.formattedCode) {
        updateCustomCode(data.formattedCode);
      }
    } catch (e) {
      console.error('Format code error:', e);
    } finally {
      setExecutionStatus('idle');
    }
  };

  const handleResetTemplateClick = () => {
    if (window.confirm("Reset template? Your current custom code will be overwritten.")) {
      updateCustomCode(getStarterCode(activeChartType));
    }
  };

  const handleLoadSavedGraphClick = (graph) => {
    setActiveSubTab('Builder');
    if (graph.visualizationMode) {
      setVisualizationMode(graph.visualizationMode);
    } else {
      setVisualizationMode('standard');
    }
    if (graph.chartType) {
      setSelectedChartType(graph.chartType);
    }
    if (graph.xAxis) {
      setXAxisList(typeof graph.xAxis === 'string' ? graph.xAxis.split(',') : graph.xAxis);
    }
    if (graph.yAxis) {
      setYAxisList(typeof graph.yAxis === 'string' ? (graph.yAxis ? graph.yAxis.split(',') : []) : graph.yAxis);
    }
    if (graph.customCode) {
      updateCustomCode(graph.customCode);
    }
    if (graph.advancedOptions) {
      const opts = typeof graph.advancedOptions === 'string' ? JSON.parse(graph.advancedOptions) : graph.advancedOptions;
      setBinningEnabled(opts.binningEnabled || false);
      setBinCount(opts.binCount || 10);
      setAggregationMethod(opts.aggregationMethod || 'none');
      setSortOrder(opts.sortOrder || 'none');
      setTopNCount(opts.topNCount || '');
    }
  };

  const renderChartContent = () => {
    if (showError && error && friendlyError && friendlyError.errorType === 'ExecutionError') {
      return null;
    }

    if (!chartData || !chartData.imagePath) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px' }}>
          <BarChart3 className="h-10 w-10 text-zinc-300" style={{ marginBottom: '16px' }} />
          <h2 style={{
            margin: '0 0 6px 0',
            fontWeight: 800,
            fontSize: '22px',
            color: 'var(--color-text-main)',
            letterSpacing: '-0.02em'
          }}>
            Create a Visualization
          </h2>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: 'var(--color-text-dim)',
            maxWidth: '460px',
            lineHeight: '1.5'
          }}>
            Drag dataset columns into X-Axis and Y-Axis to build a chart.
          </p>
          <div style={{
            fontSize: '13px',
            background: 'var(--color-primary-bg)',
            color: 'var(--color-primary-hover)',
            padding: '6px 14px',
            borderRadius: '8px',
            border: '1px solid var(--color-primary-border)',
            fontFamily: 'var(--font-mono)',
            marginTop: '4px',
            display: 'inline-block'
          }}>
            Try: <strong>X = area</strong>, <strong>Y = price</strong>
          </div>
          <div style={{ fontSize: '13px', marginTop: '12px', width: '100%', maxWidth: '520px' }}>
            <strong style={{ color: 'var(--color-text-main)', display: 'block', marginBottom: '8px', fontSize: '13px' }}>Supported Visualizations:</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {Object.values(chartNames).map(t => (
                <span key={t} style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '500'
                }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const imageUrl = `/${chartData.imagePath}?t=${new Date().getTime()}`;
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
        <img
          src={imageUrl}
          alt={`${chartData.chartType} visualization`}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: '4px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.1s ease-out'
          }}
        />
      </div>
    );
  };

  const handleZoomIn = () => {
    const idx = ZOOM_LEVELS.indexOf(zoom);
    if (idx !== -1 && idx < ZOOM_LEVELS.length - 1) {
      setZoom(ZOOM_LEVELS[idx + 1]);
    }
  };

  const handleZoomOut = () => {
    const idx = ZOOM_LEVELS.indexOf(zoom);
    if (idx !== -1 && idx > 0) {
      setZoom(ZOOM_LEVELS[idx - 1]);
    }
  };

  const activeMetadata = CHART_REGISTRY_METADATA[activeChartType];
  const hasOptions = activeMetadata && activeMetadata.options.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {activeSubTab === 'Builder' ? (
        <>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', background: 'var(--color-bg-ribbon)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--color-border-main)', alignItems: 'end' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }}>Visualization Mode</span>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '8px', border: '1px solid #cbd5e1', height: '34px', alignItems: 'center' }}>
                <button
                  onClick={() => setVisualizationMode('standard')}
                  style={{
                    padding: '0 12px',
                    height: '28px',
                    borderRadius: '6px',
                    border: 'none',
                    background: visualizationMode === 'standard' ? '#ffffff' : 'transparent',
                    color: visualizationMode === 'standard' ? '#635ac7' : 'var(--color-text-dim)',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: visualizationMode === 'standard' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Standard Builder
                </button>
                <button
                  onClick={() => {
                    setVisualizationMode('custom');
                    setActivePreviewTab('editor');
                  }}
                  style={{
                    padding: '0 12px',
                    height: '28px',
                    borderRadius: '6px',
                    border: 'none',
                    background: visualizationMode === 'custom' ? '#ffffff' : 'transparent',
                    color: visualizationMode === 'custom' ? '#635ac7' : 'var(--color-text-dim)',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: visualizationMode === 'custom' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Custom Code
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '170px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }}>Chart Type</span>
              <select
                value={selectedChartType}
                onChange={(e) => {
                  setSelectedChartType(e.target.value);
                  if (visualizationMode === 'custom') {
                    updateCustomCode(getStarterCode(e.target.value === 'auto' ? getAutoChartType() : e.target.value));
                  }
                }}
                style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', fontSize: '13px', padding: '4px 10px', borderRadius: '6px', fontFamily: 'var(--font-sans)', minWidth: '170px', outline: 'none', height: '34px', cursor: 'pointer' }}
              >
                <option value="auto">Auto-detect ({getAutoChartType()})</option>
                <optgroup label="Standard Charts">
                  <option value="histogram">Histogram</option>
                  <option value="bar">Bar Chart</option>
                  <option value="line">Line Chart</option>
                  <option value="scatter">Scatter Plot</option>
                  <option value="box">Box Plot</option>
                  <option value="violin">Violin Plot</option>
                  <option value="heatmap">Correlation Heatmap</option>
                </optgroup>
                <optgroup label="Advanced & Distribution">
                  <option value="area">Area Chart</option>
                  <option value="stacked_bar">Stacked Bar</option>
                  <option value="horizontal_bar">Horizontal Bar</option>
                  <option value="bubble">Bubble Chart</option>
                  <option value="count">Count Plot</option>
                  <option value="density">Density Plot</option>
                  <option value="kde">KDE Plot</option>
                  <option value="hexbin">Hexbin Plot</option>
                </optgroup>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'end', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '220px', position: 'relative' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>X Axis</span>
                <div 
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#7F77DD'; e.currentTarget.style.background = 'rgba(127,119,221,0.03)'; }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-border-main)'; e.currentTarget.style.background = 'transparent'; }}
                  onDrop={(e) => handleDropZone(e, 'x')}
                  style={{ border: '1px dashed var(--color-border-main)', borderRadius: '6px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '6px', height: '34px', transition: 'all 0.15s', background: 'transparent', position: 'relative' }}
                >
                  {xAxisList.length === 0 ? (
                    <select
                      value=""
                      onChange={(e) => handleSelectAdd(e, 'x')}
                      style={{ background: 'transparent', border: 'none', color: 'var(--color-text-dim)', fontSize: '12px', outline: 'none', cursor: 'pointer', width: '100%', height: '100%' }}
                    >
                      <option value="">+ Add Column</option>
                      {columns.map(col => <option key={col} value={col} style={{ background: '#ffffff', color: 'var(--color-text-main)' }}>{col}</option>)}
                    </select>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-topbar)', border: '1px solid var(--color-border-main)', borderRadius: '4px', padding: '2px 6px', fontSize: '12px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '500', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{xAxisList[0]}</span>
                        <button onClick={(e) => { e.stopPropagation(); removeColumn(0, 'x'); }} style={{ border: 'none', background: 'transparent', color: 'var(--color-text-dim)', cursor: 'pointer', padding: '0 2px', fontSize: '12px', fontWeight: 'bold' }}>×</button>
                      </div>
                      <select value="" onChange={(e) => handleSelectAdd(e, 'x')} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-dim)', fontSize: '12px', outline: 'none', cursor: 'pointer', width: '60px' }}>
                        <option value="">+ Add</option>
                        {columns.filter(col => !xAxisList.includes(col)).map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </>
                  )}
                </div>
              </div>

              <button onClick={handleSwapAxes} title="Swap Axes" style={{ padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'var(--color-bg-topbar)', border: '1px solid var(--color-border-main)', color: 'var(--color-text-main)', cursor: 'pointer', height: '34px' }}>⇄</button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '220px', position: 'relative' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Y Axis</span>
                <div 
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#7F77DD'; e.currentTarget.style.background = 'rgba(127,119,221,0.03)'; }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-border-main)'; e.currentTarget.style.background = 'transparent'; }}
                  onDrop={(e) => handleDropZone(e, 'y')}
                  style={{ border: '1px dashed var(--color-border-main)', borderRadius: '6px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '6px', height: '34px', transition: 'all 0.15s', background: 'transparent', position: 'relative' }}
                >
                  {yAxisList.length === 0 ? (
                    <select
                      value=""
                      onChange={(e) => handleSelectAdd(e, 'y')}
                      style={{ background: 'transparent', border: 'none', color: 'var(--color-text-dim)', fontSize: '12px', outline: 'none', cursor: 'pointer', width: '100%', height: '100%' }}
                    >
                      <option value="">+ Add Column</option>
                      {columns.map(col => <option key={col} value={col} style={{ background: '#ffffff', color: 'var(--color-text-main)' }}>{col}</option>)}
                    </select>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-topbar)', border: '1px solid var(--color-border-main)', borderRadius: '4px', padding: '2px 6px', fontSize: '12px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '500', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{yAxisList[0]}</span>
                        <button onClick={(e) => { e.stopPropagation(); removeColumn(0, 'y'); }} style={{ border: 'none', background: 'transparent', color: 'var(--color-text-dim)', cursor: 'pointer', padding: '0 2px', fontSize: '12px', fontWeight: 'bold' }}>×</button>
                      </div>
                      <select value="" onChange={(e) => handleSelectAdd(e, 'y')} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-dim)', fontSize: '12px', outline: 'none', cursor: 'pointer', width: '60px' }}>
                        <option value="">+ Add</option>
                        {columns.filter(col => !yAxisList.includes(col)).map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </>
                  )}
                </div>
              </div>

              <button onClick={handleClearChart} title="Clear Chart" style={{ padding: '0 16px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', height: '34px' }}>Clear</button>

              {hasOptions && visualizationMode === 'standard' && (
                <button onClick={() => setShowAdvancedOptions(!showAdvancedOptions)} style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', background: showAdvancedOptions ? 'rgba(99, 90, 199, 0.08)' : 'var(--color-bg-topbar)', border: showAdvancedOptions ? '1px solid #635ac7' : '1px solid var(--color-border-main)', color: showAdvancedOptions ? '#635ac7' : 'var(--color-text-main)', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', height: '34px' }}>
                  ⚙️ Options {showAdvancedOptions ? '▲' : '▼'}
                </button>
              )}
            </div>
          </div>

          {showAdvancedOptions && visualizationMode === 'standard' && hasOptions && (
            <div style={{ display: 'flex', gap: '20px', background: 'var(--color-bg-topbar)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border-main)', flexWrap: 'wrap', alignItems: 'center' }}>
              {activeMetadata.options.includes('binning') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                    <input type="checkbox" checked={binningEnabled} onChange={(e) => setBinningEnabled(e.target.checked)} style={{ cursor: 'pointer' }} />
                    Manual Binning
                  </label>
                  {binningEnabled && (
                    <input type="number" min="2" max="100" value={binCount} onChange={(e) => setBinCount(parseInt(e.target.value) || 10)} style={{ width: '60px', height: '24px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '12px', outline: 'none' }} />
                  )}
                </div>
              )}
              {activeMetadata.options.includes('aggregation') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>Aggregation:</span>
                  <select value={aggregationMethod} onChange={(e) => setAggregationMethod(e.target.value)} style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', fontSize: '12px', padding: '2px 6px', borderRadius: '4px', outline: 'none', height: '26px', cursor: 'pointer' }}>
                    <option value="none">None</option>
                    <option value="mean">Mean</option>
                    <option value="sum">Sum</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {showError && error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff8f8', border: '1px solid #fda4af', borderRadius: '8px', padding: '16px', color: '#be123c', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                <AlertTriangle className="h-4.5 w-4.5 text-rose-500" />
                <span>{friendlyError?.errorType === 'ExecutionError' ? 'Python Execution Failed' : 'Validation Error'}</span>
                <button onClick={() => setShowError(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', fontWeight: 'bold' }}>×</button>
              </div>
              <pre style={{ margin: 0, padding: '10px', background: '#ffe4e6', borderRadius: '6px', fontSize: '11px', whiteSpace: 'pre-wrap' }}>{error}</pre>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, background: '#ffffff', borderRadius: '8px', border: '1px solid var(--color-border-main)', display: 'flex', flexDirection: 'column', padding: '0', position: 'relative', overflow: 'hidden' }}>
            {visualizationMode === 'custom' && (
              <div style={{ display: 'flex', background: 'var(--color-bg-topbar)', borderBottom: '1px solid var(--color-border-main)', height: '36px', alignItems: 'center', padding: '0 12px', gap: '6px', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '4px', height: '100%', alignItems: 'end' }}>
                  <button onClick={() => setActivePreviewTab('editor')} style={{ padding: '6px 12px', background: activePreviewTab === 'editor' ? '#ffffff' : 'transparent', color: activePreviewTab === 'editor' ? '#635ac7' : 'var(--color-text-dim)', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>💻 Edit</button>
                  <button onClick={() => setActivePreviewTab('preview')} style={{ padding: '6px 12px', background: activePreviewTab === 'preview' ? '#ffffff' : 'transparent', color: activePreviewTab === 'preview' ? '#635ac7' : 'var(--color-text-dim)', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>📊 Preview</button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleFormatCodeClick} style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Format</button>
                </div>
              </div>
            )}

            {visualizationMode === 'custom' && activePreviewTab === 'editor' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1e1e24', width: '100%', height: '100%' }}>
                <textarea value={customPythonCode} onChange={(e) => updateCustomCode(e.target.value)} style={{ flex: 1, background: '#1e1e24', border: 'none', color: '#c5c9db', fontFamily: 'monospace', fontSize: '13px', padding: '16px', outline: 'none', resize: 'none' }} />
              </div>
            ) : (
              <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {renderChartContent()}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#ffffff', border: '1px solid var(--color-border-main)', borderRadius: '8px', padding: '16px', overflow: 'hidden' }}>
          {selectedSavedGraph && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--color-border-main)', padding: '16px' }}>
                <img src={`/${selectedSavedGraph.imagePath}`} alt={selectedSavedGraph.graphName} style={{ maxWidth: '100%', maxHeight: '100%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: '800' }}>{selectedSavedGraph.graphName}</div>
                <button onClick={() => handleLoadSavedGraphClick(selectedSavedGraph)} style={{ padding: '6px 12px', background: '#635ac7', color: '#ffffff', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Open in Builder</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isNamingModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#ffffff', padding: '24px', borderRadius: '16px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Save Graph</h3>
            <input type="text" value={customGraphName} onChange={(e) => setCustomGraphName(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setIsNamingModalOpen(false)}>Cancel</button>
              <button onClick={() => { setIsNamingModalOpen(false); handleSaveGraphClick(customGraphName); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
