import React from 'react';
import { 
  ArrowLeft, 
  Terminal, 
  Database, 
  Sliders, 
  Cpu, 
  BarChart4, 
  Folder, 
  ChevronRight, 
  FileCode 
} from 'lucide-react';

/**
 * Clean, static placeholder dashboard for the DERA pipeline view.
 * Simulates a professional ML interface (Vercel/Linear style).
 */
export default function Dashboard({ projectName, algorithm, onBack }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Navigation Header */}
      <header className="border-b border-zinc-900 bg-zinc-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
            title="Back to Algorithms"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-zinc-500 hover:text-zinc-400 cursor-pointer">Projects</span>
            <ChevronRight className="h-3 w-3 text-zinc-600" />
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Folder className="h-4 w-4 text-zinc-400 shrink-0" />
              <span className="font-mono text-xs">{projectName}</span>
            </div>
            <ChevronRight className="h-3 w-3 text-zinc-600" />
            <span className="text-zinc-400">{algorithm.name}</span>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400 border border-zinc-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Workspace Ready
          </span>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-grow p-6 md:p-8 max-w-7xl w-full mx-auto">
        
        {/* Project Subheading Banner */}
        <div className="mb-8 p-5 bg-zinc-900/20 border border-zinc-900 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold font-heading text-white tracking-tight">
              {projectName}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Active configuration for training <span className="text-zinc-200 font-medium">{algorithm.name}</span> in the selected sandbox environment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${algorithm.badgeColor}`}>
              {algorithm.category}
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 text-xs font-medium text-zinc-400 font-mono">
              v0.1.0-alpha
            </span>
          </div>
        </div>

        {/* Grid representing the four pipeline blocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. Dataset Ingestion */}
          <div className="rounded-xl border border-zinc-900 bg-zinc-900/10 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                  <Database className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  Dataset Ingestion
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Connect your data source to begin feature engineering. Place your dataset directly in the root project folder.
              </p>
              
              {/* Mock upload / folder contents */}
              <div className="border border-dashed border-zinc-800 rounded-lg p-4 bg-zinc-950/30 flex flex-col items-center justify-center text-center">
                <FileCode className="h-6 w-6 text-zinc-600 mb-2" />
                <span className="text-xs font-mono text-zinc-500">Wait for data input</span>
                <span className="text-[10px] text-zinc-600 mt-0.5">e.g. dataset.csv / dataset.parquet</span>
              </div>
            </div>
            <div className="mt-6 flex justify-between items-center text-[11px] text-zinc-500">
              <span>Maximum size: 2.5 GB</span>
              <span className="font-mono">STATUS: PENDING_UPLOAD</span>
            </div>
          </div>

          {/* 2. Hyperparameter Tuning */}
          <div className="rounded-xl border border-zinc-900 bg-zinc-900/10 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                  <Sliders className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  Parameters Configuration
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Configure hyperparameters. These parameters will be serialized into the local project configuration file.
              </p>

              {/* Mock Param Lists */}
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5 border-b border-zinc-900 text-xs">
                  <span className="font-mono text-zinc-400">learning_rate</span>
                  <span className="font-mono text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">0.05</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-zinc-900 text-xs">
                  <span className="font-mono text-zinc-400">max_depth</span>
                  <span className="font-mono text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">6</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-zinc-900 text-xs">
                  <span className="font-mono text-zinc-400">n_estimators</span>
                  <span className="font-mono text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">100</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-between items-center text-[11px] text-zinc-500">
              <span>Read-only configuration</span>
              <span className="font-mono">config.json</span>
            </div>
          </div>

          {/* 3. Training Execution */}
          <div className="rounded-xl border border-zinc-900 bg-zinc-900/10 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                  <Cpu className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  Training Engine
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Execute cross-validation splits and compile metrics. Output binaries will be written in the models folder.
              </p>
              
              {/* Static Train Trigger Box */}
              <div className="bg-zinc-950/50 rounded-lg p-5 border border-zinc-900 flex flex-col items-center justify-center">
                <button 
                  disabled
                  className="px-5 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold cursor-not-allowed"
                >
                  Start Pipeline Training
                </button>
                <span className="text-[10px] text-zinc-600 mt-2">Requires uploaded dataset to execute</span>
              </div>
            </div>
            <div className="mt-6 flex justify-between items-center text-[11px] text-zinc-500">
              <span>Execution device: CPU</span>
              <span className="font-mono">STATUS: BLOCKED</span>
            </div>
          </div>

          {/* 4. Model Evaluation */}
          <div className="rounded-xl border border-zinc-900 bg-zinc-900/10 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                  <BarChart4 className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  Evaluation Report
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Explore classification reports, ROC curve thresholds, and features contribution parameters.
              </p>
              
              {/* Static evaluation graph area placeholder */}
              <div className="h-28 border border-zinc-900/60 rounded-lg bg-zinc-950/20 flex items-center justify-center text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium text-zinc-600">Metric graphs will display after training</span>
                  <span className="text-[10px] text-zinc-700 font-mono mt-1">Accuracy / Loss curves</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-between items-center text-[11px] text-zinc-500">
              <span>Export formats: PDF, JSON</span>
              <span className="font-mono">NO_METRICS_FOUND</span>
            </div>
          </div>

        </div>

        {/* Footer info note */}
        <footer className="mt-12 text-center text-xs text-zinc-600 flex items-center justify-center gap-2">
          <Terminal className="h-3.5 w-3.5" />
          <span>DERA Machine Learning Experimenter v0.1 • Project state stored locally in workspace</span>
        </footer>

      </main>
    </div>
  );
}
