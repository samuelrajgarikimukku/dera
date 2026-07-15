import os
import warnings
try:
    from polars.exceptions import PerformanceWarning
    warnings.simplefilter("ignore", PerformanceWarning)
except ImportError:
    pass
import json
import time
import random
import string
import sys
import math
import sqlite3
import uvicorn
import polars as pl
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.dataset import polars_transforms

app = FastAPI(title="DERA FastAPI Backend")

# Enable CORS for frontend flexibility (running Vite on a separate port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount DERA folder to serve static files (replacing legacy Node.js routing)
os.makedirs("DERA", exist_ok=True)
app.mount("/DERA", StaticFiles(directory="DERA"), name="DERA")

SERVER_SESSION_ID = ''.join(random.choices(string.ascii_lowercase + string.digits, k=13)) + str(int(time.time() * 1000))

# --- ML Algorithms Metadata for Python Generation ---

ALGO_METADATA = {
    'linear-regression': {
        'importName': 'LinearRegression',
        'importStatement': 'from sklearn.linear_model import LinearRegression',
        'category': 'Regression'
    },
    'ridge-regression': {
        'importName': 'Ridge',
        'importStatement': 'from sklearn.linear_model import Ridge',
        'category': 'Regression'
    },
    'lasso-regression': {
        'importName': 'Lasso',
        'importStatement': 'from sklearn.linear_model import Lasso',
        'category': 'Regression'
    },
    'decision-tree-regressor': {
        'importName': 'DecisionTreeRegressor',
        'importStatement': 'from sklearn.tree import DecisionTreeRegressor',
        'category': 'Regression'
    },
    'random-forest-regressor': {
        'importName': 'RandomForestRegressor',
        'importStatement': 'from sklearn.ensemble import RandomForestRegressor',
        'category': 'Regression'
    },
    'xgboost-regressor': {
        'importName': 'XGBRegressor',
        'importStatement': 'from xgboost import XGBRegressor',
        'category': 'Regression'
    },
    'svr': {
        'importName': 'SVR',
        'importStatement': 'from sklearn.svm import SVR',
        'category': 'Regression'
    },
    'elasticnet': {
        'importName': 'ElasticNet',
        'importStatement': 'from sklearn.linear_model import ElasticNet',
        'category': 'Regression'
    },
    'knn-regressor': {
        'importName': 'KNeighborsRegressor',
        'importStatement': 'from sklearn.neighbors import KNeighborsRegressor',
        'category': 'Regression'
    },
    'adaboost-regressor': {
        'importName': 'AdaBoostRegressor',
        'importStatement': 'from sklearn.ensemble import AdaBoostRegressor',
        'category': 'Regression'
    },
    'gradient-boosting-regressor': {
        'importName': 'GradientBoostingRegressor',
        'importStatement': 'from sklearn.ensemble import GradientBoostingRegressor',
        'category': 'Regression'
    },
    'logistic-regression': {
        'importName': 'LogisticRegression',
        'importStatement': 'from sklearn.linear_model import LogisticRegression',
        'category': 'Classification'
    },
    'decision-tree-classifier': {
        'importName': 'DecisionTreeClassifier',
        'importStatement': 'from sklearn.tree import DecisionTreeClassifier',
        'category': 'Classification'
    },
    'random-forest-classifier': {
        'importName': 'RandomForestClassifier',
        'importStatement': 'from sklearn.ensemble import RandomForestClassifier',
        'category': 'Classification'
    },
    'svm-classifier': {
        'importName': 'SVC',
        'importStatement': 'from sklearn.svm import SVC',
        'category': 'Classification'
    },
    'knn-classifier': {
        'importName': 'KNeighborsClassifier',
        'importStatement': 'from sklearn.neighbors import KNeighborsClassifier',
        'category': 'Classification'
    },
    'naive-bayes': {
        'importName': 'GaussianNB',
        'importStatement': 'from sklearn.naive_bayes import GaussianNB',
        'category': 'Classification'
    },
    'xgboost-classifier': {
        'importName': 'XGBClassifier',
        'importStatement': 'from xgboost import XGBClassifier',
        'category': 'Classification'
    },
    'adaboost-classifier': {
        'importName': 'AdaBoostClassifier',
        'importStatement': 'from sklearn.ensemble import AdaBoostClassifier',
        'category': 'Classification'
    },
    'kmeans': {
        'importName': 'KMeans',
        'importStatement': 'from sklearn.cluster import KMeans',
        'category': 'Clustering'
    },
    'dbscan': {
        'importName': 'DBSCAN',
        'importStatement': 'from sklearn.cluster import DBSCAN',
        'category': 'Clustering'
    },
    'agglomerative-clustering': {
        'importName': 'AgglomerativeClustering',
        'importStatement': 'from sklearn.cluster import AgglomerativeClustering',
        'category': 'Clustering'
    }
}

# --- Pydantic Schemas for Request Validation ---

class PreprocessPayload(BaseModel):
    projectName: str
    sessionId: Optional[str] = None
    rawDatasetPath: str
    preprocessingSteps: List[Dict[str, Any]] = []
    createdAt: Optional[str] = ""

class PreviewPayload(BaseModel):
    projectName: Optional[str] = ""
    rawDatasetPath: str
    preprocessingSteps: List[Dict[str, Any]] = []

class ChartPayload(BaseModel):
    filePath: str
    chartType: str = "scatter"
    xAxis: str = ""
    yAxis: str = ""
    zoom: float = 1.0
    projectName: str = ""
    visualizationMode: str = "standard"
    customCode: str = ""
    advancedOptions: dict = {}

class FormatPayload(BaseModel):
    code: str

class SyncSessionPayload(BaseModel):
    projectName: str
    session: Optional[dict] = None

class CreateProjectPayload(BaseModel):
    projectName: str
    algorithmId: Optional[str] = "linear-regression"

class SyncProjectPayload(BaseModel):
    projectName: str
    params: dict

class TrainModelPayload(BaseModel):
    projectName: str
    params: dict

class RunPipelinePayload(BaseModel):
    projectName: str
    params: dict

class ExportCodePayload(BaseModel):
    projectName: str
    params: dict

class SaveComparisonPayload(BaseModel):
    projectName: str
    params: dict
    metrics: dict
    datasetInfo: Optional[dict] = None

class DeleteModelPayload(BaseModel):
    projectName: str
    fileName: str

class DeleteProjectPayload(BaseModel):
    projectName: str

class SyncActiveViewPayload(BaseModel):
    projectName: str
    activeView: Optional[str] = None
    activeViewMode: Optional[str] = None

class SaveGraphPayload(BaseModel):
    projectName: str
    graphName: Optional[str] = ""
    chartType: Optional[str] = ""
    xAxis: Optional[str] = ""
    yAxis: Optional[str] = ""
    visualizationMode: Optional[str] = "standard"
    customCode: Optional[str] = ""
    advancedOptions: Optional[dict] = {}

# --- Parameter helper mappings ---

def camel_to_snake(name: str) -> str:
    if len(name) <= 1:
        return name
    if name == 'copyX':
        return 'copy_X'
    if name == 'l1Ratio':
        return 'l1_ratio'
    s = ''
    for i, char in enumerate(name):
        if char.isupper():
            if i == 0:
                s += char.lower()
            else:
                s += '_' + char.lower()
        else:
            s += char
    return s

# --- SQLite Caching Implementation in Python ---

def get_cache_db_path(project_name: str) -> str:
    return os.path.abspath(os.path.join(os.getcwd(), 'DERA', project_name, '.dera', 'cache.db'))

def init_cache_db(project_name: str):
    db_path = get_cache_db_path(project_name)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS column_stats (
      cacheKey TEXT,
      column TEXT,
      value TEXT,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cacheKey, column)
    );
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS unique_values (
      cacheKey TEXT,
      column TEXT,
      value TEXT,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cacheKey, column)
    );
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS profiling (
      cacheKey TEXT,
      reportType TEXT,
      column TEXT,
      value TEXT,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cacheKey, reportType, column)
    );
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS graph_cache (
      cacheKey TEXT,
      chartType TEXT,
      xAxis TEXT,
      yAxis TEXT,
      configHash TEXT,
      value TEXT,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cacheKey, chartType, xAxis, yAxis, configHash)
    );
    """)
    conn.commit()
    return conn

def get_db_cache(project_name: str, table: str, key_fields: dict):
    if not project_name:
        return None
    try:
        conn = init_cache_db(project_name)
        cursor = conn.cursor()
        
        if table == 'column_stats':
            cursor.execute("SELECT value FROM column_stats WHERE cacheKey = ? AND column = ?", (key_fields.get('cacheKey'), key_fields.get('column')))
        elif table == 'unique_values':
            cursor.execute("SELECT value FROM unique_values WHERE cacheKey = ? AND column = ?", (key_fields.get('cacheKey'), key_fields.get('column')))
        elif table == 'profiling':
            cursor.execute("SELECT value FROM profiling WHERE cacheKey = ? AND reportType = ? AND column = ?", (key_fields.get('cacheKey'), key_fields.get('reportType'), key_fields.get('column', '')))
        elif table == 'graph_cache':
            cursor.execute("SELECT value FROM graph_cache WHERE cacheKey = ? AND chartType = ? AND xAxis = ? AND yAxis = ? AND configHash = ?", 
                           (key_fields.get('cacheKey'), key_fields.get('chartType'), key_fields.get('xAxis'), key_fields.get('yAxis'), key_fields.get('configHash')))
        else:
            conn.close()
            return None
            
        row = cursor.fetchone()
        if row:
            # Update last accessed
            if table == 'column_stats':
                cursor.execute("UPDATE column_stats SET last_accessed = CURRENT_TIMESTAMP WHERE cacheKey = ? AND column = ?", (key_fields.get('cacheKey'), key_fields.get('column')))
            elif table == 'unique_values':
                cursor.execute("UPDATE unique_values SET last_accessed = CURRENT_TIMESTAMP WHERE cacheKey = ? AND column = ?", (key_fields.get('cacheKey'), key_fields.get('column')))
            elif table == 'profiling':
                cursor.execute("UPDATE profiling SET last_accessed = CURRENT_TIMESTAMP WHERE cacheKey = ? AND reportType = ? AND column = ?", (key_fields.get('cacheKey'), key_fields.get('reportType'), key_fields.get('column', '')))
            elif table == 'graph_cache':
                cursor.execute("UPDATE graph_cache SET last_accessed = CURRENT_TIMESTAMP WHERE cacheKey = ? AND chartType = ? AND xAxis = ? AND yAxis = ? AND configHash = ?", 
                               (key_fields.get('cacheKey'), key_fields.get('chartType'), key_fields.get('xAxis'), key_fields.get('yAxis'), key_fields.get('configHash')))
            conn.commit()
            val = json.loads(row[0])
            conn.close()
            return val
        conn.close()
    except Exception as e:
        print(f"[DERA Python Cache] Error getting cache: {e}")
    return None

def set_db_cache(project_name: str, table: str, key_fields: dict, value):
    if not project_name:
        return
    try:
        conn = init_cache_db(project_name)
        cursor = conn.cursor()
        val_str = json.dumps(value)
        
        if table == 'column_stats':
            cursor.execute("INSERT OR REPLACE INTO column_stats (cacheKey, column, value, last_accessed) VALUES (?, ?, ?, CURRENT_TIMESTAMP)", 
                           (key_fields.get('cacheKey'), key_fields.get('column'), val_str))
        elif table == 'unique_values':
            cursor.execute("INSERT OR REPLACE INTO unique_values (cacheKey, column, value, last_accessed) VALUES (?, ?, ?, CURRENT_TIMESTAMP)", 
                           (key_fields.get('cacheKey'), key_fields.get('column'), val_str))
        elif table == 'profiling':
            cursor.execute("INSERT OR REPLACE INTO profiling (cacheKey, reportType, column, value, last_accessed) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", 
                           (key_fields.get('cacheKey'), key_fields.get('reportType'), key_fields.get('column', ''), val_str))
        elif table == 'graph_cache':
            cursor.execute("INSERT OR REPLACE INTO graph_cache (cacheKey, chartType, xAxis, yAxis, configHash, value, last_accessed) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)", 
                           (key_fields.get('cacheKey'), key_fields.get('chartType'), key_fields.get('xAxis'), key_fields.get('yAxis'), key_fields.get('configHash'), val_str))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DERA Python Cache] Error setting cache: {e}")

def clear_db_cache(project_name: str):
    if not project_name:
        return
    try:
        db_path = get_cache_db_path(project_name)
        if os.path.exists(db_path):
            conn = init_cache_db(project_name)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM column_stats;")
            cursor.execute("DELETE FROM unique_values;")
            cursor.execute("DELETE FROM profiling;")
            cursor.execute("DELETE FROM graph_cache;")
            cursor.execute("VACUUM;")
            conn.commit()
            conn.close()
    except Exception as e:
        print(f"[DERA Python Cache] Error clearing cache: {e}")

def delete_db_cache_for_column(project_name: str, column: str):
    if not project_name:
        return
    try:
        conn = init_cache_db(project_name)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM column_stats WHERE column = ?", (column,))
        cursor.execute("DELETE FROM unique_values WHERE column = ?", (column,))
        cursor.execute("DELETE FROM profiling WHERE column = ?", (column,))
        cursor.execute("DELETE FROM profiling WHERE column = '' OR column IS NULL")
        cursor.execute("DELETE FROM graph_cache WHERE xAxis = ? OR yAxis = ?", (column, column))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DERA Python Cache] Error deleting cache for column: {e}")

# --- Helper functions for filesystem and metadata workflow envelopes ---

def ensure_directories_exist(project_name: str):
    dera_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA'))
    project_dir = os.path.join(dera_root, project_name)
    
    dirs = [
        dera_root,
        project_dir,
        os.path.join(project_dir, '.dera'),
        os.path.join(project_dir, 'data'),
        os.path.join(project_dir, 'models'),
        os.path.join(project_dir, 'graphs'),
        os.path.join(project_dir, 'graphs', 'saved')
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    return project_dir

def load_pipeline(project_name: str) -> dict:
    pipeline_path = os.path.join("DERA", project_name, ".dera", "pipeline.json")
    if os.path.exists(pipeline_path):
        try:
            with open(pipeline_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"version": "1.0", "steps": []}

def save_pipeline(project_name: str, pipeline: dict):
    pipeline_path = os.path.join("DERA", project_name, ".dera", "pipeline.json")
    os.makedirs(os.path.dirname(pipeline_path), exist_ok=True)
    with open(pipeline_path, "w", encoding="utf-8") as f:
        json.dump(pipeline, f, indent=2)

def load_pipeline_steps(project_name: str) -> list:
    return load_pipeline(project_name).get("steps", [])

def load_registry(project_name: str) -> dict:
    registry_path = os.path.join("DERA", project_name, ".dera", "datasets.json")
    if os.path.exists(registry_path):
        try:
            with open(registry_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"datasets": []}

def save_registry(project_name: str, registry: dict):
    registry_path = os.path.join("DERA", project_name, ".dera", "datasets.json")
    os.makedirs(os.path.dirname(registry_path), exist_ok=True)
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2)

def register_raw_dataset(project_name: str, filename: str, original_path: str, raw_path: str, format_type: str) -> dict:
    registry = load_registry(project_name)
    normalized_raw = raw_path.replace('\\', '/')
    normalized_orig = original_path.replace('\\', '/') if original_path else ''
    
    # Check if already registered
    for d in registry.get("datasets", []):
        if d.get("rawDatasetPath") == normalized_raw:
            return d
            
    rand_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
    dataset_id = f"dataset_{rand_suffix}_{int(time.time() * 1000)}"
    
    dataset = {
        "datasetId": dataset_id,
        "name": filename,
        "format": format_type,
        "originalPath": normalized_orig,
        "rawDatasetPath": normalized_raw,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "processedVersions": []
    }
    registry["datasets"].append(dataset)
    save_registry(project_name, registry)
    return dataset

def classify_operation(step_type: str) -> str:
    dataset_level_ops = {
        'remove_duplicates', 'filter_rows', 'drop_null_rows', 'drop_cols_null_threshold',
        'deduplicate_subset', 'sample_rows', 'drop_rows_index', 'groupby_aggregate',
        'pivot_table', 'melt', 'transpose', 'correlation_filter', 'variance_threshold',
        'select_k_best', 'remove_constant_cols', 'remove_highly_correlated', 'remove_outliers'
    }
    return 'dataset' if step_type in dataset_level_ops else 'column'

def get_changed_columns(step: dict) -> list:
    step_type = step.get('type')
    params = step.get('params', {})
    changed = set()
    
    in_place_ops = {
        'standardize', 'min_max_scale', 'fill_null', 'lowercase', 'uppercase',
        'trim_spaces', 'toggle_bool', 'change_datatype', 'ffill', 'bfill',
        'interpolate', 'robust_scale', 'log_transform', 'sqrt_transform',
        'power_transform', 'replace_substring', 'regex_replace', 'remove_special_chars',
        'cap_clip', 'label_encode', 'ordinal_encode'
    }
    
    if step_type in in_place_ops:
        if params.get('column'):
            changed.add(params.get('column'))
        if isinstance(params.get('columns'), list):
            for c in params.get('columns'):
                changed.add(c)
    elif step_type == 'rename_column':
        if params.get('oldName'):
            changed.add(params.get('oldName'))
        if isinstance(params.get('columns'), dict):
            for k in params.get('columns').keys():
                changed.add(k)
    elif step_type == 'drop_columns':
        if params.get('column'):
            changed.add(params.get('column'))
        if isinstance(params.get('columns'), list):
            for c in params.get('columns'):
                changed.add(c)
    elif step_type == 'one_hot_encode':
        if params.get('column'):
            changed.add(params.get('column'))
        if isinstance(params.get('columns'), list):
            for c in params.get('columns'):
                changed.add(c)
                
    return list(changed)

# --- Polars Transformation Execution Natively ---

def run_polars_preview(resolved_raw_path: str, steps: list, limit: Optional[int] = 50):
    lf = polars_transforms.load_dataset(resolved_raw_path)
    original_dtypes = {k: str(v) for k, v in lf.collect_schema().items()}
    
    lf = polars_transforms.apply_pipeline(lf, steps)
    new_dtypes = {k: str(v) for k, v in lf.collect_schema().items()}
    
    total_rows = lf.select(pl.len()).collect().item()
    columns = lf.collect_schema().names()
    total_cols = len(columns)
    
    missing_lf = lf.select([pl.col(c).null_count().alias(c) for c in columns])
    missing_df = missing_lf.collect()
    missing_counts = {c: int(missing_df.get_column(c)[0]) for c in columns}
    
    if limit is not None:
        preview_df = lf.slice(0, limit).collect()
    else:
        preview_df = lf.collect()
        
    records = []
    for r in preview_df.iter_rows(named=True):
        clean_row = {}
        for k, v in r.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                clean_row[k] = None
            else:
                clean_row[k] = v
        records.append(clean_row)
        
    return {
        "success": True,
        "originalDtypes": original_dtypes,
        "newDtypes": new_dtypes,
        "dtypes": new_dtypes,
        "totalRows": int(total_rows),
        "totalCols": int(total_cols),
        "missingCounts": missing_counts,
        "columns": columns,
        "records": records
    }

def precompute_metadata_in_bg(project_name: str, file_path: str, steps: list, columns_to_compute: list = None):
    try:
        import subprocess
        payload = {
            "path": file_path,
            "steps": steps,
            "columns": columns_to_compute
        }
        process = subprocess.Popen(
            [sys.executable, "backend/dataset/precompute.py"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout_data, _ = process.communicate(input=json.dumps(payload))
        if process.returncode == 0:
            result = json.loads(stdout_data.strip())
            if result.get("success"):
                cache_key = "current"
                if "columns" in result:
                    for col, col_data in result["columns"].items():
                        if "column_stats" in col_data:
                            set_db_cache(project_name, "column_stats", {"cacheKey": cache_key, "column": col}, col_data["column_stats"])
                        if "unique_values" in col_data:
                            set_db_cache(project_name, "unique_values", {"cacheKey": cache_key, "column": col}, col_data["unique_values"])
                        if "class_distribution" in col_data:
                            set_db_cache(project_name, "profiling", {"cacheKey": cache_key, "reportType": "class_distribution", "column": col}, col_data["class_distribution"])
                
                if "dataset_wide" in result:
                    dw = result["dataset_wide"]
                    if "dataset_summary" in dw:
                        set_db_cache(project_name, "profiling", {"cacheKey": cache_key, "reportType": "dataset_summary", "column": ""}, dw["dataset_summary"])
                    if "missing_analysis" in dw:
                        set_db_cache(project_name, "profiling", {"cacheKey": cache_key, "reportType": "missing_analysis", "column": ""}, dw["missing_analysis"])
                    if "datatype_overview" in dw:
                        set_db_cache(project_name, "profiling", {"cacheKey": cache_key, "reportType": "datatype_overview", "column": ""}, dw["datatype_overview"])
                    if "correlation_matrix" in dw:
                        set_db_cache(project_name, "profiling", {"cacheKey": cache_key, "reportType": "correlation_matrix", "column": ""}, dw["correlation_matrix"])
    except Exception as e:
        print(f"[DERA Python Background Precompute] Error: {e}")

# --- ML Pipeline Code Generation Logic in Python ---

def generate_user_visible_code(project_name: str, params: dict) -> str:
    dataset = params.get("dataset") or {}
    train_test_split = params.get("trainTestSplit") or {}
    model_params = params.get("modelParams") or {}
    algo_id = params.get("algorithmId", "linear-regression")
    
    meta = ALGO_METADATA.get(algo_id, ALGO_METADATA['linear-regression'])
    category = meta['category']
    model_class_name = meta['importName']
    import_statement = meta['importStatement']
    
    has_target = dataset.get("hasTarget") == 'Yes' or dataset.get("hasTarget") is True
    target_col = dataset.get("targetColumn", "target") if has_target else "target"
    
    imports = {
        'import pandas as pd',
        'import numpy as np',
        import_statement
    }
    if category != 'Clustering':
        imports.add('from sklearn.model_selection import train_test_split')
        
    pipeline = load_pipeline(project_name)
    steps = pipeline.get("steps", [])
    
    preprocessing_lines = []
    for idx, step in enumerate(steps):
        s_type = step.get("type")
        p = step.get("params", {})
        
        preprocessing_lines.append(f"\n# Step {idx + 1}: {s_type.replace('_', ' ')}")
        
        if s_type == 'drop_columns':
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            if cols:
                preprocessing_lines.append(f"df = df.drop(columns={json.dumps(cols)})")
        elif s_type == 'rename_column':
            mapping = p.get("columns")
            if not mapping and p.get("oldName") and p.get("newName"):
                mapping = {p.get("oldName"): p.get("newName")}
            if mapping:
                preprocessing_lines.append(f"df = df.rename(columns={json.dumps(mapping)})")
        elif s_type == 'remove_duplicates':
            preprocessing_lines.append("df = df.drop_duplicates()")
        elif s_type == 'deduplicate_subset':
            cols = p.get("columns", [])
            if cols:
                preprocessing_lines.append(f"df = df.drop_duplicates(subset={json.dumps(cols)})")
        elif s_type == 'fill_null':
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            strategy = p.get("strategy", "mean")
            val = p.get("value")
            for col in cols:
                if strategy == 'mean':
                    preprocessing_lines.append(f"df['{col}'] = df['{col}'].fillna(df['{col}'].mean())")
                elif strategy == 'median':
                    preprocessing_lines.append(f"df['{col}'] = df['{col}'].fillna(df['{col}'].median())")
                elif strategy == 'mode':
                    preprocessing_lines.append(f"df['{col}'] = df['{col}'].fillna(df['{col}'].mode()[0])")
                elif strategy == 'constant':
                    formatted_val = f'"{val}"' if isinstance(val, str) else val
                    preprocessing_lines.append(f"df['{col}'] = df['{col}'].fillna({formatted_val})")
        elif s_type in ('min_max_scale', 'standardize', 'robust_scale'):
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            if cols:
                if s_type == 'min_max_scale':
                    imports.add('from sklearn.preprocessing import MinMaxScaler')
                    preprocessing_lines.append("min_max_scaler = MinMaxScaler()")
                    preprocessing_lines.append(f"df[{json.dumps(cols)}] = min_max_scaler.fit_transform(df[{json.dumps(cols)}])")
                elif s_type == 'standardize':
                    imports.add('from sklearn.preprocessing import StandardScaler')
                    preprocessing_lines.append("standard_scaler = StandardScaler()")
                    preprocessing_lines.append(f"df[{json.dumps(cols)}] = standard_scaler.fit_transform(df[{json.dumps(cols)}])")
                elif s_type == 'robust_scale':
                    imports.add('from sklearn.preprocessing import RobustScaler')
                    preprocessing_lines.append("robust_scaler = RobustScaler()")
                    preprocessing_lines.append(f"df[{json.dumps(cols)}] = robust_scaler.fit_transform(df[{json.dumps(cols)}])")
        elif s_type == 'lowercase':
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            for col in cols:
                preprocessing_lines.append(f"df['{col}'] = df['{col}'].astype(str).str.lower()")
        elif s_type == 'uppercase':
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            for col in cols:
                preprocessing_lines.append(f"df['{col}'] = df['{col}'].astype(str).str.upper()")
        elif s_type == 'trim_spaces':
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            for col in cols:
                preprocessing_lines.append(f"df['{col}'] = df['{col}'].astype(str).str.strip()")
        elif s_type == 'toggle_bool':
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            for col in cols:
                preprocessing_lines.append(f"df['{col}'] = ~df['{col}']")
        elif s_type == 'one_hot_encode':
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            if cols:
                preprocessing_lines.append(f"df = pd.get_dummies(df, columns={json.dumps(cols)}, drop_first=True)")
        elif s_type == 'change_datatype':
            cols = p.get("columns", [])
            if not cols and p.get("column"):
                cols = [p.get("column")]
            dtype = p.get("dtype")
            if dtype:
                for col in cols:
                    if dtype == 'datetime':
                        preprocessing_lines.append(f"df['{col}'] = pd.to_datetime(df['{col}'], errors='coerce')")
                    else:
                        preprocessing_lines.append(f"df['{col}'] = df['{col}'].astype('{dtype}')")
        elif s_type == 'filter_rows':
            col = p.get("column")
            op = p.get("operator")
            val = p.get("value")
            formatted_val = f'"{val}"' if isinstance(val, str) else val
            if op == 'contains':
                preprocessing_lines.append(f"df = df[df['{col}'].astype(str).str.contains({formatted_val})]")
            else:
                preprocessing_lines.append(f"df = df[df['{col}'] {op} {formatted_val}]")
        elif s_type == 'sort_column':
            col = p.get("column")
            asc = p.get("ascending") != False
            preprocessing_lines.append(f"df = df.sort_values(by='{col}', ascending={ 'True' if asc else 'False' })")
        elif s_type == 'reorder_column':
            preprocessing_lines.append("# Reordered columns as configured")
        elif s_type == 'duplicate_column':
            preprocessing_lines.append(f"df['{p.get('new_name')}'] = df['{p.get('column')}']")
        elif s_type == 'split_column':
            preprocessing_lines.append(f"split_df = df['{p.get('column')}'].astype(str).str.split('{p.get('delimiter', ',')}', expand=True)")
            preprocessing_lines.append("for i in range(split_df.shape[1]):")
            preprocessing_lines.append(f"    df[f'{p.get('column')}_split_{{i+1}}'] = split_df[i]")
        elif s_type == 'merge_columns':
            preprocessing_lines.append(f"df['{p.get('new_name')}'] = df['{p.get('column')}'].astype(str) + '{p.get('separator', ' ')}' + df['{p.get('column2')}'].astype(str)")
        elif s_type == 'ffill':
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].ffill()")
        elif s_type == 'bfill':
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].bfill()")
        elif s_type == 'interpolate':
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].interpolate()")
        elif s_type == 'flag_null':
            preprocessing_lines.append(f"df['{p.get('column')}_isnull'] = df['{p.get('column')}'].isnull().astype(int)")
        elif s_type == 'drop_null_rows':
            scope = p.get("scope", "column")
            if scope == 'column' and p.get("column"):
                preprocessing_lines.append(f"df = df.dropna(subset=['{p.get('column')}'])")
            elif scope == 'any':
                preprocessing_lines.append("df = df.dropna()")
            elif scope == 'all':
                preprocessing_lines.append("df = df.dropna(how='all')")
        elif s_type == 'drop_cols_null_threshold':
            thresh = (p.get("threshold", 50)) / 100.0
            preprocessing_lines.append(f"df = df.loc[:, df.isnull().mean() <= {thresh}]")
        elif s_type == 'sample_rows':
            method = p.get("method", "count")
            val = p.get("value")
            seed = p.get("random_state", 42)
            if method == 'count':
                preprocessing_lines.append(f"df = df.sample(n=min({val}, len(df)), random_state={seed})")
            else:
                preprocessing_lines.append(f"df = df.sample(frac={val}, random_state={seed})")
        elif s_type == 'drop_rows_index':
            preprocessing_lines.append(f"df = df.drop(df.index[{p.get('start')}:{(p.get('end') or p.get('start')) + 1}])")
        elif s_type == 'label_encode':
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].astype('category').cat.codes")
        elif s_type == 'ordinal_encode':
            cats = [c.strip() for c in p.get("order", "").split(",") if c.strip()]
            if cats:
                mapping = {cat: idx for idx, cat in enumerate(cats)}
                preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].map({json.dumps(mapping)}).fillna(-1).astype(int)")
        elif s_type == 'binary_encode':
            preprocessing_lines.append(f"# Binary encoding for column {p.get('column')}")
            preprocessing_lines.append(f"codes = df['{p.get('column')}'].astype('category').cat.codes")
            preprocessing_lines.append("max_code = codes.max()")
            preprocessing_lines.append("if max_code > 0:")
            preprocessing_lines.append("    num_bits = int(np.ceil(np.log2(max_code + 1)))")
            preprocessing_lines.append("    for i in range(num_bits):")
            preprocessing_lines.append(f"        df[f'{p.get('column')}_bin_{{i}}'] = (codes // (2**i)) % 2")
        elif s_type == 'log_transform':
            preprocessing_lines.append(f"df['{p.get('column')}'] = np.log(df['{p.get('column')}'] + {p.get('shift', 1)})")
        elif s_type == 'sqrt_transform':
            preprocessing_lines.append(f"df['{p.get('column')}'] = np.sqrt(df['{p.get('column')}'])")
        elif s_type == 'power_transform':
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'] ** {p.get('exponent', 2)}")
        elif s_type == 'custom_formula':
            preprocessing_lines.append(f"df['{p.get('new_name')}'] = df.eval('{p.get('formula')}')")
        elif s_type == 'bin_bucket':
            col_name = p.get('column')
            new_name_val = p.get('new_name') or f"{col_name}_binned"
            preprocessing_lines.append(f"df['{new_name_val}'] = pd.cut(df['{col_name}'], bins={p.get('bins', 5)}).astype(str)")
        elif s_type in ('custom_binning', 'binning'):
            col = p.get("column")
            out_col = p.get("outputColumn", f"{col}_Bin")
            bins_list = p.get("bins", [])
            default_label = p.get("defaultLabel")
            
            sorted_bins = sorted(bins_list, key=lambda x: float(x.get("from", 0)))
            
            preprocessing_lines.append(f"# Custom binning for {col}")
            for b in sorted_bins:
                b_from = b.get("from")
                b_to = b.get("to")
                b_label = b.get("label")
                if b_label is None or str(b_label).strip() == '':
                    b_label = f"{b_from}–{b_to}"
                preprocessing_lines.append(f"# {b_from} to {b_to} -> {b_label}")
            if default_label is not None:
                preprocessing_lines.append(f"# All other values -> {default_label}")
            
            edges = []
            labels = []
            if sorted_bins:
                edges.append(float(sorted_bins[0].get("from", 0)))
                for b in sorted_bins:
                    edges.append(float(b.get("to", 0)))
                    lbl = b.get("label")
                    if lbl is None or str(lbl).strip() == '':
                        lbl = f"{b.get('from')}–{b.get('to')}"
                    labels.append(lbl)
                
                if default_label is not None:
                    edges.append(float('inf'))
                    labels.append(default_label)
            
            edges_strs = []
            for edge in edges:
                if edge == float('inf'):
                    edges_strs.append("float('inf')")
                elif edge == float('-inf'):
                    edges_strs.append("float('-inf')")
                else:
                    edges_strs.append(str(edge))
            edges_repr = "[" + ", ".join(edges_strs) + "]"
            
            preprocessing_lines.append(f"bins = {edges_repr}")
            preprocessing_lines.append(f"labels = {json.dumps(labels)}")
            preprocessing_lines.append(f"df['{out_col}'] = pd.cut(")
            preprocessing_lines.append(f"    df['{col}'],")
            preprocessing_lines.append(f"    bins=bins,")
            preprocessing_lines.append(f"    labels=labels,")
            preprocessing_lines.append(f"    include_lowest=True")
            preprocessing_lines.append(f")")
        elif s_type == 'date_parts':
            parts = p.get("parts", ["year", "month", "day"])
            for part in parts:
                if part == 'dayofweek':
                    preprocessing_lines.append(f"df['{p.get('column')}_dayofweek'] = df['{p.get('column')}'].dt.dayofweek")
                else:
                    preprocessing_lines.append(f"df['{p.get('column')}_{part}'] = df['{p.get('column')}'].dt.{part}")
        elif s_type == 'regex_extraction':
            preprocessing_lines.append(f"df['{p.get('new_name')}'] = df['{p.get('column')}'].astype(str).str.extract(r'{p.get('pattern')}')")
        elif s_type == 'rolling_window':
            newName = p.get('new_name') or f"{p.get('column')}_rolling_{p.get('operation', 'mean')}_{p.get('window', 3)}"
            preprocessing_lines.append(f"df['{newName}'] = df['{p.get('column')}'].rolling(window={p.get('window', 3)}, min_periods=1).{p.get('operation', 'mean')}()")
        elif s_type == 'interaction_terms':
            newName = p.get('new_name') or f"{p.get('column')}_x_{p.get('column2')}"
            preprocessing_lines.append(f"df['{newName}'] = df['{p.get('column')}'] * df['{p.get('column2')}']")
        elif s_type == 'groupby_aggregate':
            preprocessing_lines.append(f"df = df.groupby({json.dumps(p.get('group_cols'))})['{p.get('agg_col')}'].agg('{p.get('agg_type', 'mean')}').reset_index()")
        elif s_type == 'pivot_table':
            preprocessing_lines.append(f"df = df.pivot_table(index='{p.get('index')}', columns='{p.get('columns_col')}', values='{p.get('values')}', aggfunc='{p.get('aggfunc', 'mean')}').reset_index()")
        elif s_type == 'melt':
            preprocessing_lines.append(f"df = pd.melt(df, id_vars={json.dumps(p.get('id_vars', []))}, value_vars={json.dumps(p.get('value_vars', []))})")
        elif s_type == 'transpose':
            preprocessing_lines.append("df = df.transpose().reset_index()")
        elif s_type == 'correlation_filter':
            preprocessing_lines.append("# Correlation filter based on target column")
            preprocessing_lines.append("numeric_df = df.select_dtypes(include=[np.number])")
            preprocessing_lines.append(f"if '{p.get('target')}' in numeric_df.columns:")
            preprocessing_lines.append(f"    corrs = numeric_df.corr()['{p.get('target')}'].abs()")
            preprocessing_lines.append(f"    cols_to_drop = corrs[corrs < {p.get('threshold', 0.1)}].index.tolist()")
            preprocessing_lines.append(f"    df = df.drop(columns=[c for c in cols_to_drop if c != '{p.get('target')}'])")
        elif s_type == 'variance_threshold':
            preprocessing_lines.append("# Variance threshold filter")
            preprocessing_lines.append("numeric_cols = df.select_dtypes(include=[np.number]).columns")
            preprocessing_lines.append(f"vars = df[numeric_cols].var()")
            preprocessing_lines.append(f"cols_to_drop = vars[vars <= {p.get('threshold', 0.0)}].index.tolist()")
            preprocessing_lines.append("df = df.drop(columns=cols_to_drop)")
        elif s_type == 'select_k_best':
            preprocessing_lines.append("# Select K best features based on correlation")
            preprocessing_lines.append("numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()")
            preprocessing_lines.append(f"if '{p.get('target')}' in numeric_cols:")
            preprocessing_lines.append(f"    corrs = df[numeric_cols].corr()['{p.get('target')}'].abs().drop('{p.get('target')}', errors='ignore')")
            preprocessing_lines.append(f"    top_k = corrs.nlargest({p.get('k', 5)}).index.tolist()")
            preprocessing_lines.append("    non_numeric = df.select_dtypes(exclude=[np.number]).columns.tolist()")
            preprocessing_lines.append(f"    df = df[top_k + ['{p.get('target')}'] + [c for c in non_numeric if c != '{p.get('target')}']]")
        elif s_type == 'remove_constant_cols':
            preprocessing_lines.append("df = df.loc[:, df.nunique() > 1]")
        elif s_type == 'remove_highly_correlated':
            preprocessing_lines.append("# Remove highly correlated features")
            preprocessing_lines.append("numeric_df = df.select_dtypes(include=[np.number])")
            preprocessing_lines.append("if numeric_df.shape[1] > 1:")
            preprocessing_lines.append("    corr_matrix = numeric_df.corr().abs()")
            preprocessing_lines.append("    upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))")
            preprocessing_lines.append(f"    to_drop = [column for column in upper.columns if any(upper[column] > {p.get('threshold', 0.9)})]")
            preprocessing_lines.append("    df = df.drop(columns=to_drop)")
        elif s_type == 'detect_iqr':
            preprocessing_lines.append(f"# Detect outliers using IQR for {p.get('column')}")
            preprocessing_lines.append(f"q25 = df['{p.get('column')}'].quantile(0.25)")
            preprocessing_lines.append(f"q75 = df['{p.get('column')}'].quantile(0.75)")
            preprocessing_lines.append("iqr = q75 - q25")
            preprocessing_lines.append(f"df['{p.get('column')}_outlier_iqr'] = ((df['{p.get('column')}'] < q25 - 1.5 * iqr) | (df['{p.get('column')}'] > q75 + 1.5 * iqr)).astype(int)")
        elif s_type == 'detect_zscore':
            preprocessing_lines.append(f"# Detect outliers using Z-score for {p.get('column')}")
            preprocessing_lines.append(f"mean = df['{p.get('column')}'].mean()")
            preprocessing_lines.append(f"std = df['{p.get('column')}'].std()")
            preprocessing_lines.append("if std > 0:")
            preprocessing_lines.append(f"    df['{p.get('column')}_outlier_z'] = (((df['{p.get('column')}'] - mean) / std).abs() > {p.get('threshold', 3.0)}).astype(int)")
        elif s_type == 'cap_clip':
            preprocessing_lines.append(f"lower = df['{p.get('column')}'].quantile({p.get('lower_q', 0.01)})")
            preprocessing_lines.append(f"upper = df['{p.get('column')}'].quantile({p.get('upper_q', 0.99)})")
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].clip(lower=lower, upper=upper)")
        elif s_type == 'remove_outliers':
            if p.get("method") == 'iqr':
                preprocessing_lines.append(f"q25 = df['{p.get('column')}'].quantile(0.25)")
                preprocessing_lines.append(f"q75 = df['{p.get('column')}'].quantile(0.75)")
                preprocessing_lines.append("iqr = q75 - q25")
                preprocessing_lines.append(f"df = df[(df['{p.get('column')}'] >= q25 - 1.5 * iqr) & (df['{p.get('column')}'] <= q75 + 1.5 * iqr)]")
            else:
                preprocessing_lines.append(f"mean = df['{p.get('column')}'].mean()")
                preprocessing_lines.append(f"std = df['{p.get('column')}'].std()")
                preprocessing_lines.append("if std > 0:")
                preprocessing_lines.append(f"    df = df[((df['{p.get('column')}'] - mean) / std).abs() <= {p.get('threshold', 3.0)}]")
        elif s_type == 'replace_substring':
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].astype(str).str.replace('{p.get('old_val', '')}', '{p.get('new_val', '')}', regex=False)")
        elif s_type == 'regex_replace':
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].astype(str).str.replace(r'{p.get('pattern', '')}', '{p.get('replacement', '')}', regex=True)")
        elif s_type == 'remove_special_chars':
            preprocessing_lines.append(f"df['{p.get('column')}'] = df['{p.get('column')}'].astype(str).str.replace(r'[^a-zA-Z0-9\\s]', '', regex=True)")
        elif s_type == 'extract_domain':
            preprocessing_lines.append(f"emails = df['{p.get('column')}'].astype(str).str.extract(r'@([^\\s]+)')")
            preprocessing_lines.append(f"urls = df['{p.get('column')}'].astype(str).str.extract(r'https?://(?:www\\.)?([^/\\s]+)')")
            preprocessing_lines.append(f"df['{p.get('column')}_domain'] = emails.fillna(urls).fillna('')")
            
    arg_pairs = []
    for k, v in model_params.items():
        python_val = 'None'
        if v is True:
            python_val = 'True'
        elif v is False:
            python_val = 'False'
        elif isinstance(v, (int, float)):
            python_val = str(v)
        elif isinstance(v, str):
            if v.lower() == 'none':
                python_val = 'None'
            elif v.replace('.', '', 1).isdigit():
                python_val = v
            else:
                python_val = f'"{v}"'
        param_name = camel_to_snake(k)
        if algo_id == 'kmeans' and param_name == 'copy_X':
            param_name = 'copy_x'
        arg_pairs.append(f"{param_name}={python_val}")
        
    init_args = ",\n    ".join(arg_pairs)
    
    filePath = dataset.get("filePath", "")
    normalized_path = filePath.replace('\\', '/') if filePath else 'data/dataset.csv'
    
    target_section = ''
    train_test_section = ''
    fit_section = ''
    evaluation_section = ''
    
    if category == 'Clustering':
        target_section = """
# 2. Extract Features
X = df.copy()
"""
        train_test_section = """
# 3. Clustering Dataset Preparation
print(f"Dataset shape for clustering: {X.shape}\\n")
"""
        fit_section = f"""
# 5. Model Clustering Execution
model.fit(X)
labels = model.labels_
print("Clustering completed successfully.\\n")
"""
        evaluation_section = """
# 6. Evaluation Metrics
from sklearn.metrics import silhouette_score
unique_labels = np.unique(labels)
n_clusters = len(unique_labels)
if -1 in unique_labels:
    n_clusters_clean = n_clusters - 1
else:
    n_clusters_clean = n_clusters

silhouette = None
if 1 < n_clusters_clean < X.shape[0]:
    try:
        silhouette = silhouette_score(X, labels)
    except:
        pass

print("=========================================")
print("Model Evaluation Metrics")
print("=========================================")
print(f"Cluster Count:          {n_clusters_clean}")
if silhouette is not None:
    print(f"Silhouette Score:       {silhouette:.4f}")
"""
    else:
        excluded_columns = dataset.get("excludedColumns", [])
        valid_exclusions = [c for c in excluded_columns if c != target_col]
        
        target_section = f"""
# 2. Extract Features and Target Variable
target_col = "{target_col}"
excluded_columns = {json.dumps(valid_exclusions, indent=4)}
X = df.drop(columns=[target_col] + excluded_columns)
y = df[target_col]
"""
        split_args = [
            'X',
            'y',
            f"test_size={train_test_split.get('testSize', 0.2)}"
        ]
        if train_test_split.get("useAdvanced"):
            if train_test_split.get("trainSize") not in (None, ''):
                split_args.append(f"train_size={train_test_split.get('trainSize')}")
                
        random_state_val = train_test_split.get('randomState')
        split_args.append(f"random_state={random_state_val if random_state_val not in (None, '') else 'None'}")
        
        if train_test_split.get("useAdvanced"):
            shuffle_val = 'True' if train_test_split.get('shuffle') else 'False'
            split_args.append(f"shuffle={shuffle_val}")
            if train_test_split.get("stratify"):
                split_args.append("stratify=y")
                
        split_args_str = ",\n    ".join(split_args)
        train_test_section = f"""
# 3. Train-Test Split Configuration
X_train, X_test, y_train, y_test = train_test_split(
    {split_args_str}
)
"""
        fit_section = """
# 5. Model Training Execution
model.fit(X_train, y_train)
"""
        if category == 'Regression':
            evaluation_section = """
# 6. Evaluation Metrics
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

y_train_pred = model.predict(X_train)
train_mae = mean_absolute_error(y_train, y_train_pred)
train_rmse = np.sqrt(mean_squared_error(y_train, y_train_pred))
train_r2 = model.score(X_train, y_train)

y_pred = model.predict(X_test)
test_mae = mean_absolute_error(y_test, y_pred)
test_rmse = np.sqrt(mean_squared_error(y_test, y_pred))
test_r2 = model.score(X_test, y_test)

print("=========================================")
print("Model Evaluation Metrics")
print("=========================================")
print(f"Training R2 score:      {train_r2:.4f}")
print(f"Training RMSE:          {train_rmse:.4f}")
print(f"Training MAE:           {train_mae:.4f}")
print("-----------------------------------------")
print(f"Testing R2 score:       {test_r2:.4f}")
print(f"Testing RMSE:           {test_rmse:.4f}")
print(f"Testing MAE:            {test_mae:.4f}")
print("=========================================")
"""
        else: # Classification
            evaluation_section = """
# 6. Evaluation Metrics
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)

print("=========================================")
print("Model Evaluation Metrics")
print("=========================================")
print(f"Accuracy:               {accuracy:.4f}")
print(f"Precision (Weighted):   {precision:.4f}")
print(f"Recall (Weighted):      {recall:.4f}")
print(f"F1 Score (Weighted):    {f1:.4f}")
print("=========================================")
"""

    import_lines = "\n".join(sorted(list(imports)))
    code = """__IMPORT_LINES__

# 1. Dataset Loading and Pipeline Application
# Loaded dataset file: __NORMALIZED_PATH__
df = pd.read_csv("__NORMALIZED_PATH__")
__PREPROCESSING_LINES__

__TARGET_SECTION__
__TRAIN_TEST_SECTION__
# 4. Model Initialization
model = __MODEL_CLASS_NAME__(
    __INIT_ARGS__
)

__FIT_SECTION__
__EVALUATION_SECTION__
"""
    return (code
            .replace("__IMPORT_LINES__", import_lines)
            .replace("__NORMALIZED_PATH__", normalized_path)
            .replace("__PREPROCESSING_LINES__", "".join(preprocessing_lines))
            .replace("__TARGET_SECTION__", target_section)
            .replace("__TRAIN_TEST_SECTION__", train_test_section)
            .replace("__MODEL_CLASS_NAME__", model_class_name)
            .replace("__INIT_ARGS__", init_args)
            .replace("__FIT_SECTION__", fit_section)
            .replace("__EVALUATION_SECTION__", evaluation_section))

def generate_python_code(project_name: str, params: dict) -> str:
    dataset = params.get("dataset") or {}
    train_test_split = params.get("trainTestSplit") or {}
    model_params = params.get("modelParams") or {}
    algo_id = params.get("algorithmId", "linear-regression")
    
    meta = ALGO_METADATA.get(algo_id, ALGO_METADATA['linear-regression'])
    category = meta['category']
    model_class_name = meta['importName']
    import_statement = meta['importStatement']
    
    has_target = dataset.get("hasTarget") == 'Yes' or dataset.get("hasTarget") is True
    target_col = dataset.get("targetColumn", "target") if has_target else "target"
    
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'dataset')).replace('\\', '\\\\')
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', project_name))
    
    resolved_raw_path = dataset.get("filePath", "")
    if resolved_raw_path and not os.path.isabs(resolved_raw_path):
        resolved_raw_path = os.path.abspath(os.path.join(project_root, resolved_raw_path))
    normalized_path = resolved_raw_path.replace('\\', '\\\\')
    pipeline_path = os.path.join(project_root, '.dera', 'pipeline.json').replace('\\', '\\\\')
    
    arg_pairs = []
    for k, v in model_params.items():
        python_val = 'None'
        if v is True:
            python_val = 'True'
        elif v is False:
            python_val = 'False'
        elif isinstance(v, (int, float)):
            python_val = str(v)
        elif isinstance(v, str):
            if v.lower() == 'none':
                python_val = 'None'
            elif v.replace('.', '', 1).isdigit():
                python_val = v
            else:
                python_val = f'"{v}"'
        param_name = camel_to_snake(k)
        if algo_id == 'kmeans' and param_name == 'copy_X':
            param_name = 'copy_x'
        arg_pairs.append(f"{param_name}={python_val}")
        
    init_args = ",\n    ".join(arg_pairs)
    
    target_section = ''
    if category == 'Clustering':
        target_section = """
# 2. Extract Features
X = df.copy()
"""
    elif has_target:
        excluded_columns = dataset.get("excludedColumns", [])
        valid_exclusions = [c for c in excluded_columns if c != target_col]
        target_section = f"""
# 2. Extract Features and Target Variable
target_col = "{target_col}"
excluded_columns = {json.dumps(valid_exclusions)}
valid_exclusions = [col for col in excluded_columns if col in df.columns and col != target_col]

if target_col not in df.columns:
    raise ValueError(f"Target column '{target_col}' not found in dataset")
    
X = df.drop(columns=[target_col] + valid_exclusions)
y = df[target_col]
"""
    else:
        target_section = f"""
# 2. Extract Features and Target Variable
X = df.iloc[:, :-1]
y = df.iloc[:, -1]
"""

    split_args = [
        'X',
        'y',
        f"test_size={train_test_split.get('testSize', 0.2)}"
    ]
    if train_test_split.get("useAdvanced"):
        if train_test_split.get("trainSize") not in (None, ''):
            split_args.append(f"train_size={train_test_split.get('trainSize')}")
            
    random_state_val = train_test_split.get('randomState')
    split_args.append(f"random_state={random_state_val if random_state_val not in (None, '') else 'None'}")
    
    if train_test_split.get("useAdvanced"):
        shuffle_val = 'True' if train_test_split.get('shuffle') else 'False'
        split_args.append(f"shuffle={shuffle_val}")
        if train_test_split.get("stratify"):
            split_args.append("stratify=y")
            
    train_test_section = ''
    if category != 'Clustering':
        split_args_str = ",\n    ".join(split_args)
        train_test_section = f"""
# 3. Train-Test Split Configuration
X_train, X_test, y_train, y_test = train_test_split(
    {split_args_str}
)
print("Train/Test split complete.")
print(f"Training set: {{X_train.shape[0]}} samples")
print(f"Testing set:  {{X_test.shape[0]}} samples\\n")
"""
    else:
        train_test_section = """
# 3. Clustering Dataset Preparation
print(f"Dataset shape for clustering: {X.shape}\\n")
"""

    fit_section = ''
    if category != 'Clustering':
        fit_section = f"""
# 5. Model Training Execution
print("Training {model_class_name} model...")
model.fit(X_train, y_train)
print("Training completed successfully.\\n")
"""
    else:
        fit_section = f"""
# 5. Model Clustering Execution
print("Running clustering on dataset using {model_class_name}...")
labels = model.fit_predict(X)
print("Clustering completed successfully.\\n")
"""

    metrics_imports = ''
    evaluation_section = ''
    if category == 'Regression':
        metrics_imports = "from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score"
        evaluation_section = f"""
# 6. Evaluation metrics
y_train_pred = model.predict(X_train)
train_mae = mean_absolute_error(y_train, y_train_pred)
train_mse = mean_squared_error(y_train, y_train_pred)
train_rmse = float(np.sqrt(train_mse))
train_r2 = model.score(X_train, y_train)

y_pred = model.predict(X_test)
test_mae = mean_absolute_error(y_test, y_pred)
test_mse = mean_squared_error(y_test, y_pred)
test_rmse = float(np.sqrt(test_mse))
test_r2 = model.score(X_test, y_test)

metrics = {{
    "mae": float(test_mae),
    "mse": float(test_mse),
    "rmse": float(test_rmse),
    "r2": float(test_r2),
    "train_r2": float(train_r2),
    "train_rmse": float(train_rmse),
    "train_mae": float(train_mae)
}}

print("=========================================")
print(f"Model Evaluation Metrics ({{PROJECT_NAME}})")
print("=========================================")
print(f"Training R2 score:      {{train_r2:.4f}}")
print(f"Training RMSE:          {{train_rmse:.4f}}")
print(f"Training MAE:           {{train_mae:.4f}}")
print("-----------------------------------------")
print(f"Testing R2 score:       {{test_r2:.4f}}")
print(f"Testing RMSE:           {{test_rmse:.4f}}")
print(f"Testing MAE:            {{test_mae:.4f}}")
print(f"Testing MSE:            {{test_mse:.4f}}")
print("=========================================")
"""
    elif category == 'Classification':
        metrics_imports = "from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix"
        evaluation_section = f"""
# 6. Evaluation metrics
y_pred = model.predict(X_test)

accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
cm = confusion_matrix(y_test, y_pred).tolist()

metrics = {{
    "accuracy": float(accuracy),
    "precision": float(precision),
    "recall": float(recall),
    "f1": float(f1),
    "confusion_matrix": cm
}}

print("=========================================")
print(f"Model Evaluation Metrics ({{PROJECT_NAME}})")
print("=========================================")
print(f"Accuracy:               {{accuracy:.4f}}")
print(f"Precision (Weighted):   {{precision:.4f}}")
print(f"Recall (Weighted):      {{recall:.4f}}")
print(f"F1 Score (Weighted):    {{f1:.4f}}")
print(f"Confusion Matrix:       {{cm}}")
print("=========================================")
"""
    else: # Clustering
        metrics_imports = "from sklearn.metrics import silhouette_score"
        evaluation_section = f"""
# 6. Evaluation metrics
unique_labels = np.unique(labels)
n_clusters = len(unique_labels)
if -1 in unique_labels:
    n_clusters_clean = n_clusters - 1
else:
    n_clusters_clean = n_clusters

silhouette = None
if 1 < n_clusters_clean < X.shape[0]:
    try:
        sample_size = min(10000, X.shape[0])
        if sample_size < X.shape[0]:
            indices = np.random.choice(X.shape[0], sample_size, replace=False)
            silhouette = float(silhouette_score(X.iloc[indices], labels[indices]))
        else:
            silhouette = float(silhouette_score(X, labels))
    except Exception as e:
        print(f"Could not calculate Silhouette Score: {{str(e)}}")

inertia = None
if hasattr(model, 'inertia_'):
    inertia = float(model.inertia_)

metrics = {{
    "silhouette": silhouette,
    "inertia": inertia,
    "cluster_count": int(n_clusters_clean)
}}

print("=========================================")
print(f"Model Evaluation Metrics ({{PROJECT_NAME}})")
print("=========================================")
print(f"Cluster Count:          {{n_clusters_clean}}")
if silhouette is not None:
    print(f"Silhouette Score:       {{silhouette:.4f}}")
else:
    print("Silhouette Score:       N/A")
if inertia is not None:
    print(f"Inertia:                {{inertia:.4f}}")
else:
    print("Inertia:                N/A")
print("=========================================")
"""

    code = """import json
import pandas as pd
import numpy as np
__TRAIN_TEST_SPLIT_IMPORT__
__IMPORT_STATEMENT__
__METRICS_IMPORTS__

# ==============================================================================
# DERA ML PIPELINE GENERATOR - __CATEGORY_UPPER__ WORKSPACE
# Project: __PROJECT_NAME__
# Model: __MODEL_CLASS_NAME__
# Generated automatically by the DERA Interface.
# ==============================================================================

PROJECT_NAME = "__PROJECT_NAME__"

# 1. Dataset Loading and Pipeline Application
import os
import sys
import json
import warnings
try:
    from polars.exceptions import PerformanceWarning
    warnings.simplefilter("ignore", PerformanceWarning)
except ImportError:
    pass

backend_dir = r"__BACKEND_DIR__"
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import polars_transforms
dataset_path = r"__NORMALIZED_PATH__"
pipeline_path = r"__PIPELINE_PATH__"

print(f"Loading raw dataset from: {dataset_path}...")
try:
    lf = polars_transforms.load_dataset(dataset_path)
    if os.path.exists(pipeline_path):
        with open(pipeline_path, 'r') as f:
            pipeline_data = json.load(f)
            steps = pipeline_data.get('steps', [])
        print(f"Applying {len(steps)} transformation steps from pipeline.json...")
        lf = polars_transforms.apply_pipeline(lf, steps)
    df = lf.collect().to_pandas()
    print(f"Dataset successfully loaded with shape: {df.shape}")
except Exception as e:
    print(f"\\n[WARNING] Failed to load/transform dataset: {e}")
    print("DERA has created a mock dataset in memory for demonstration purposes.")
    np.random.seed(__RANDOM_STATE__)
    mock_data = np.random.randn(100, 4)
    df = pd.DataFrame(mock_data, columns=['feature_1', 'feature_2', 'feature_3', 'feature_4'])
    if "__CATEGORY__" != "Clustering":
        df = df.rename(columns={'feature_4': '__TARGET_COL__'})
        if "__CATEGORY__" == "Classification":
            df['__TARGET_COL__'] = (df['__TARGET_COL__'] > 0).astype(int)
    print(f"Mock dataset initialized with shape: {df.shape}\\n")

__TARGET_SECTION__

# 2.5. Data Preprocessing (Handling missing values and categorical features)
print("Preprocessing dataset (handling missing values and categorical encoding)...")
if "__CATEGORY__" != "Clustering":
    if y.isnull().any():
        missing_y_count = y.isnull().sum()
        missing_indices = y[y.isnull()].index
        X = X.drop(index=missing_indices)
        y = y.drop(index=missing_indices)
        print(f"Dropped {missing_y_count} rows with missing target values.")

numeric_cols = X.select_dtypes(include=['number']).columns.tolist()
for col in numeric_cols:
    if X[col].isnull().any():
        mean_val = X[col].mean()
        X[col] = X[col].fillna(mean_val)
        print(f"Filled missing values in numerical column '{col}' with column mean ({mean_val:.4f})")

categorical_cols = X.select_dtypes(include=['object', 'category']).columns.tolist()
for col in categorical_cols:
    if X[col].isnull().any():
        mode_val = X[col].mode()[0] if not X[col].mode().empty else 'missing'
        X[col] = X[col].fillna(mode_val)
        print(f"Filled missing values in categorical column '{col}' with column mode ('{mode_val}')")

if len(categorical_cols) > 0:
    print(f"One-hot encoding categorical variables: {categorical_cols}")
    X = pd.get_dummies(X, columns=categorical_cols, drop_first=True)
    for col in X.columns:
        if X[col].dtype == bool:
            X[col] = X[col].astype(int)

__TRAIN_TEST_SECTION__

# 4. Model Initialization
model = __MODEL_CLASS_NAME__(
    __INIT_ARGS__
)

__FIT_SECTION__
__EVALUATION_SECTION__

print("DERA_METRICS_JSON_START")
print(json.dumps(metrics))
print("DERA_METRICS_JSON_END")
"""
    tt_split_import = 'from sklearn.model_selection import train_test_split' if category != 'Clustering' else ''
    
    return (code
            .replace("__TRAIN_TEST_SPLIT_IMPORT__", tt_split_import)
            .replace("__IMPORT_STATEMENT__", import_statement)
            .replace("__METRICS_IMPORTS__", metrics_imports)
            .replace("__CATEGORY_UPPER__", category.upper())
            .replace("__CATEGORY__", category)
            .replace("__PROJECT_NAME__", project_name)
            .replace("__MODEL_CLASS_NAME__", model_class_name)
            .replace("__BACKEND_DIR__", backend_dir)
            .replace("__NORMALIZED_PATH__", normalized_path)
            .replace("__PIPELINE_PATH__", pipeline_path)
            .replace("__RANDOM_STATE__", str(train_test_split.get('randomState', 42) or 42))
            .replace("__TARGET_COL__", target_col)
            .replace("__TARGET_SECTION__", target_section)
            .replace("__TRAIN_TEST_SECTION__", train_test_section)
            .replace("__INIT_ARGS__", init_args)
            .replace("__FIT_SECTION__", fit_section)
            .replace("__EVALUATION_SECTION__", evaluation_section))

def save_to_history(project_path: str, project_name: str, run_id: int, algorithm_id: str, params: dict, metrics: dict, dataset_info: dict):
    dera_dir = os.path.join(project_path, '.dera')
    os.makedirs(dera_dir, exist_ok=True)
    history_path = os.path.join(dera_dir, 'comparison_history.json')
    
    history = {"models": []}
    if os.path.exists(history_path):
        try:
            with open(history_path, 'r', encoding='utf-8') as f:
                history = json.load(f)
        except Exception:
            pass
            
    normalized_params = {
        "algorithmId": algorithm_id or params.get("algorithmId") or 'linear-regression',
        "dataset": dataset_info or params.get("dataset"),
        "trainTestSplit": params.get("trainTestSplit"),
        "modelParams": params.get("modelParams")
    }
    
    run_file = f"run_{str(run_id).zfill(3)}.py"
    
    history_entry = {
        "runId": run_id,
        "file": f"Run {run_id}",
        "codeFile": run_file,
        "algorithm": algorithm_id or params.get("algorithmId") or 'linear-regression',
        "parameters": normalized_params,
        "metrics": metrics,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    try:
        models_dir = os.path.join(project_path, 'models')
        os.makedirs(models_dir, exist_ok=True)
        run_file_path = os.path.join(models_dir, run_file)
        user_code = generate_user_visible_code(project_name, params)
        with open(run_file_path, "w", encoding="utf-8") as wf:
            wf.write(user_code)
    except Exception as e:
        print(f"[DERA History] Failed to save code snapshot file: {e}")
        
    existing_idx = -1
    for idx, m in enumerate(history.get("models", [])):
        if m.get("runId") == run_id:
            existing_idx = idx
            break
            
    if existing_idx > -1:
        history["models"][existing_idx] = history_entry
    else:
        history["models"].append(history_entry)
        
    with open(history_path, 'w', encoding='utf-8') as wf:
        json.dump(history, wf, indent=2)
        
    return history

def get_next_run_id(project_path: str) -> int:
    history_path = os.path.join(project_path, '.dera', 'comparison_history.json')
    max_val = 0
    if os.path.exists(history_path):
        try:
            with open(history_path, 'r', encoding='utf-8') as f:
                history = json.load(f)
            for m in history.get("models", []):
                run_id = m.get("runId")
                if run_id and isinstance(run_id, int):
                    if run_id > max_val:
                        max_val = run_id
                elif m.get("file"):
                    import re
                    match = re.search(r"(\d+)", m.get("file"))
                    if match:
                        val = int(match.group(1))
                        if val > max_val:
                            max_val = val
        except Exception:
            pass
    return max_val + 1

# --- API Endpoints ---

@app.get("/api/server-session")
async def server_session():
    return {"success": True, "serverSessionId": SERVER_SESSION_ID}

@app.get("/api/list-projects")
async def list_projects():
    dera_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA'))
    if not os.path.exists(dera_root):
        return {"success": True, "exists": False, "projects": []}
        
    projects = []
    try:
        items = os.listdir(dera_root)
        for item in items:
            project_path = os.path.join(dera_root, item)
            if os.path.isdir(project_path) and item != 'datasets' and not item.startswith('.'):
                config_path = os.path.join(project_path, '.dera', 'project_config.json')
                if os.path.exists(config_path):
                    try:
                        with open(config_path, 'r', encoding='utf-8') as rf:
                            config = json.load(rf)
                            
                        state_path = os.path.join(project_path, '.dera', 'latest_state.json')
                        state = None
                        if os.path.exists(state_path):
                            try:
                                with open(state_path, 'r', encoding='utf-8') as sf:
                                    state = json.load(sf)
                            except Exception:
                                pass
                                
                        history_path = os.path.join(project_path, '.dera', 'comparison_history.json')
                        has_comparisons = False
                        if os.path.exists(history_path):
                            try:
                                with open(history_path, 'r', encoding='utf-8') as hf:
                                    history = json.load(hf)
                                    if len(history.get("models", [])) > 0:
                                        has_comparisons = True
                            except Exception:
                                pass
                                
                        last_modified = config.get("createdAt", "")
                        if os.path.exists(state_path):
                            last_modified = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(os.path.getmtime(state_path)))
                        elif os.path.exists(config_path):
                            last_modified = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(os.path.getmtime(config_path)))
                            
                        projects.append({
                            "name": item,
                            "algorithmId": config.get("algorithmId", "linear-regression"),
                            "createdAt": config.get("createdAt", ""),
                            "lastModified": last_modified,
                            "state": state,
                            "hasComparisons": has_comparisons
                        })
                    except Exception as err:
                        print(f"[DERA API] Failed to parse config for project: {item}. Error: {err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"success": True, "exists": True, "projects": projects}

@app.get("/api/load-project")
async def load_project(projectName: str):
    if not projectName:
        raise HTTPException(status_code=400, detail="projectName parameter is required")
        
    project_path = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    config_path = os.path.join(project_path, '.dera', 'project_config.json')
    state_path = os.path.join(project_path, '.dera', 'latest_state.json')
    history_path = os.path.join(project_path, '.dera', 'comparison_history.json')
    
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail="Project configuration not found")
        
    try:
        with open(config_path, 'r', encoding='utf-8') as rf:
            config = json.load(rf)
            
        state = None
        if os.path.exists(state_path):
            with open(state_path, 'r', encoding='utf-8') as rf:
                state = json.load(rf)
                
        history = {"models": []}
        if os.path.exists(history_path):
            try:
                with open(history_path, 'r', encoding='utf-8') as rf:
                    history = json.load(rf)
            except Exception:
                pass
                
        algo_id = config.get("algorithmId", "linear-regression")
        code = generate_user_visible_code(projectName, state.get("parameters") if state else {
            "algorithmId": algo_id,
            "dataset": {"hasTarget": "Yes", "targetColumn": "target", "filePath": ""},
            "trainTestSplit": {"testSize": 0.2, "randomState": 48, "shuffle": True, "useAdvanced": False},
            "modelParams": {}
        })
        
        pipeline = load_pipeline(projectName)
        return {
            "success": True,
            "projectName": projectName,
            "config": config,
            "state": state,
            "history": history,
            "code": code,
            "pipeline": pipeline
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/initialize")
async def initialize_project(projectName: str = Form(...), file: UploadFile = File(...)):
    projectName = projectName.strip()
    if not projectName:
        raise HTTPException(status_code=400, detail="Project name is required")
    if ".." in projectName or "/" in projectName or "\\" in projectName:
        raise HTTPException(status_code=400, detail="Invalid project name")
        
    dera_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA'))
    if os.path.exists(dera_root):
        existing_dirs = os.listdir(dera_root)
        is_duplicate = any(d.lower() == projectName.lower() for d in existing_dirs if os.path.isdir(os.path.join(dera_root, d)))
        if is_duplicate:
            raise HTTPException(status_code=400, detail="Project name already exists. Please choose a different name.")
    else:
        os.makedirs(dera_root, exist_ok=True)
        
    project_dir = ensure_directories_exist(projectName)
    iso_now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    
    filename = file.filename
    format_type = filename.split('.')[-1].lower() if '.' in filename else 'csv'
    data_dir = os.path.join(project_dir, 'data')
    
    dest_path = os.path.join(data_dir, filename)
    try:
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write uploaded file: {str(e)}")
        
    clear_db_cache(projectName)
    relative_raw_path = f"data/{filename}"
    dataset = register_raw_dataset(projectName, filename, "", relative_raw_path, format_type)
    
    # Save config
    config_path = os.path.join(project_dir, '.dera', 'project_config.json')
    with open(config_path, 'w', encoding='utf-8') as wf:
        json.dump({
            "projectName": projectName,
            "algorithmId": "linear-regression",
            "createdAt": iso_now,
            "projectVersion": "1.0"
        }, wf, indent=2)
        
    # Save default state
    state_path = os.path.join(project_dir, '.dera', 'latest_state.json')
    default_state = {
        "algorithmId": "linear-regression",
        "projectName": projectName,
        "parameters": {
            "algorithmId": "linear-regression",
            "dataset": {"hasTarget": "Yes", "targetColumn": "target", "filePath": relative_raw_path, "excludedColumns": []},
            "trainTestSplit": {"testSize": 0.2, "randomState": 48, "shuffle": True, "useAdvanced": False},
            "modelParams": {}
        },
        "datasetPath": relative_raw_path,
        "targetColumn": "target",
        "metrics": None,
        "activeRunId": None
    }
    with open(state_path, 'w', encoding='utf-8') as wf:
        json.dump(default_state, wf, indent=2)
        
    return {
        "success": True,
        "projectName": projectName,
        "dataset": dataset
    }

@app.post("/api/create-project")
async def create_project(payload: CreateProjectPayload):
    projectName = payload.projectName.strip()
    algorithmId = payload.algorithmId
    
    if not projectName:
        raise HTTPException(status_code=400, detail="Project name is required")
    if ".." in projectName or "/" in projectName or "\\" in projectName:
        raise HTTPException(status_code=400, detail="Invalid project name. No directory traversal allowed.")
        
    dera_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA'))
    if os.path.exists(dera_root):
        existing_dirs = os.listdir(dera_root)
        is_duplicate = any(d.lower() == projectName.lower() for d in existing_dirs if os.path.isdir(os.path.join(dera_root, d)))
        if is_duplicate:
            raise HTTPException(status_code=400, detail="Project name already exists. Please choose a different name.")
    else:
        os.makedirs(dera_root, exist_ok=True)
        
    project_dir = ensure_directories_exist(projectName)
    iso_now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    
    config_path = os.path.join(project_dir, '.dera', 'project_config.json')
    with open(config_path, 'w', encoding='utf-8') as wf:
        json.dump({
            "projectName": projectName,
            "algorithmId": algorithmId,
            "createdAt": iso_now,
            "projectVersion": "1.0"
        }, wf, indent=2)
        
    state_path = os.path.join(project_dir, '.dera', 'latest_state.json')
    default_state = {
        "algorithmId": algorithmId,
        "projectName": projectName,
        "parameters": {
            "algorithmId": algorithmId,
            "dataset": {"hasTarget": "Yes", "targetColumn": "target", "filePath": "", "excludedColumns": []},
            "trainTestSplit": {"testSize": 0.2, "randomState": 48, "shuffle": True, "useAdvanced": False},
            "modelParams": {}
        },
        "datasetPath": "",
        "targetColumn": "target",
        "metrics": None,
        "activeRunId": None
    }
    with open(state_path, 'w', encoding='utf-8') as wf:
        json.dump(default_state, wf, indent=2)
        
    return {
        "success": True,
        "projectName": projectName,
        "message": f"Project {projectName} successfully created."
    }

@app.post("/api/sync-project")
async def sync_project(payload: SyncProjectPayload):
    projectName = payload.projectName
    params = payload.params
    
    project_path = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    os.makedirs(project_path, exist_ok=True)
    
    updated_code = generate_user_visible_code(projectName, params)
    
    state_path = os.path.join(project_path, '.dera', 'latest_state.json')
    latest_state = {}
    if os.path.exists(state_path):
        try:
            with open(state_path, 'r', encoding='utf-8') as rf:
                latest_state = json.load(rf)
        except Exception:
            pass
            
    if params.get("algorithmId"):
        latest_state["algorithmId"] = params["algorithmId"]
    latest_state["parameters"] = params
    latest_state["datasetPath"] = params.get("dataset", {}).get("filePath", "")
    latest_state["targetColumn"] = params.get("dataset", {}).get("targetColumn", "")
    latest_state.pop("activeVersionFile", None)
    
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    with open(state_path, 'w', encoding='utf-8') as wf:
        json.dump(latest_state, wf, indent=2)
        
    config_path = os.path.join(project_path, '.dera', 'project_config.json')
    if os.path.exists(config_path) and params.get("algorithmId"):
        try:
            with open(config_path, 'r', encoding='utf-8') as rf:
                config = json.load(rf)
            config["algorithmId"] = params["algorithmId"]
            with open(config_path, 'w', encoding='utf-8') as wf:
                json.dump(config, wf, indent=2)
        except Exception:
            pass
            
    return {"success": True, "code": updated_code}

@app.post("/api/train-model")
async def train_model(payload: TrainModelPayload):
    projectName = payload.projectName
    params = payload.params
    
    project_path = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    os.makedirs(project_path, exist_ok=True)
    
    python_code = generate_python_code(projectName, params)
    
    try:
        import subprocess
        process = subprocess.Popen(
            [sys.executable, "-"],
            cwd=project_path,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout_data, stderr_data = process.communicate(input=python_code)
        if process.returncode != 0:
            raise HTTPException(status_code=500, detail=stderr_data or f"Python training exited with code {process.returncode}")
            
        return {"success": True, "output": stdout_data}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/run-pipeline")
async def run_pipeline(payload: RunPipelinePayload):
    projectName = payload.projectName
    params = payload.params
    
    project_path = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    os.makedirs(project_path, exist_ok=True)
    
    python_code = generate_python_code(projectName, params)
    
    try:
        import subprocess
        process = subprocess.Popen(
            [sys.executable, "-"],
            cwd=project_path,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout_data, stderr_data = process.communicate(input=python_code)
        
        metrics = None
        import re
        metrics_match = re.search(r"DERA_METRICS_JSON_START\s*([\s\S]*?)\s*DERA_METRICS_JSON_END", stdout_data)
        if metrics_match:
            try:
                metrics = json.loads(metrics_match.group(1))
            except Exception as parse_err:
                print(f"[DERA API] Failed to parse metrics JSON: {parse_err}")
            stdout_data = stdout_data.replace(metrics_match.group(0), '').strip()
            
        next_run_id = get_next_run_id(project_path)
        
        if process.returncode != 0:
            raise HTTPException(status_code=500, detail=stderr_data or f"Python training exited with code {process.returncode}")
            
        if metrics:
            try:
                save_to_history(project_path, projectName, next_run_id, params.get("algorithmId"), params, metrics, params.get("dataset"))
            except Exception as history_err:
                print(f"[DERA API] Failed to auto-save to comparison history: {history_err}")
                
            try:
                state_path = os.path.join(project_path, '.dera', 'latest_state.json')
                latest_state = {}
                if os.path.exists(state_path):
                    with open(state_path, 'r', encoding='utf-8') as rf:
                        latest_state = json.load(rf)
                latest_state["parameters"] = params
                latest_state["datasetPath"] = params.get("dataset", {}).get("filePath", "")
                latest_state["targetColumn"] = params.get("dataset", {}).get("targetColumn", "")
                latest_state["metrics"] = metrics
                latest_state["activeRunId"] = next_run_id
                latest_state.pop("activeVersionFile", None)
                with open(state_path, 'w', encoding='utf-8') as wf:
                    json.dump(latest_state, wf, indent=2)
            except Exception as state_err:
                print(f"[DERA API] Failed to update latest state file: {state_err}")
                
        user_code = generate_user_visible_code(projectName, params)
        
        return {
            "success": True,
            "stdout": stdout_data or '',
            "stderr": stderr_data or '',
            "metrics": metrics,
            "error": None,
            "code": user_code,
            "runId": next_run_id,
            "file": f"Run {next_run_id}"
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/export-code")
async def export_code(payload: ExportCodePayload):
    projectName = payload.projectName
    params = payload.params
    
    try:
        code = generate_user_visible_code(projectName, params)
        return {"success": True, "code": code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-comparison")
async def save_comparison(payload: SaveComparisonPayload):
    projectName = payload.projectName
    params = payload.params
    metrics = payload.metrics
    datasetInfo = payload.datasetInfo
    
    project_path = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    os.makedirs(project_path, exist_ok=True)
    
    next_run_id = get_next_run_id(project_path)
    save_result = save_to_history(project_path, projectName, next_run_id, params.get("algorithmId", "linear-regression"), params, metrics, datasetInfo)
    
    try:
        state_path = os.path.join(project_path, '.dera', 'latest_state.json')
        latest_state = {}
        if os.path.exists(state_path):
            with open(state_path, 'r', encoding='utf-8') as rf:
                latest_state = json.load(rf)
        latest_state["parameters"] = params
        latest_state["datasetPath"] = params.get("dataset", {}).get("filePath", "")
        latest_state["targetColumn"] = params.get("dataset", {}).get("targetColumn", "")
        latest_state["metrics"] = metrics
        latest_state["activeRunId"] = next_run_id
        latest_state.pop("activeVersionFile", None)
        with open(state_path, 'w', encoding='utf-8') as wf:
            json.dump(latest_state, wf, indent=2)
    except Exception as state_err:
        print(f"[DERA API] Failed to update latest state file inside save-comparison: {state_err}")
        
    models = save_result.get("models", [])
    base_model = models[0] if len(models) > 0 else None
    compare_model = next(m for m in models if m.get("runId") == next_run_id) if len(models) > 0 else None
    
    return {
        "success": True,
        "compareData": {
            "base": base_model,
            "compare": compare_model
        }
    }

@app.get("/api/get-comparison-history")
async def get_comparison_history(projectName: str):
    if not projectName:
        raise HTTPException(status_code=400, detail="projectName parameter is required")
        
    project_path = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    history_path = os.path.join(project_path, '.dera', 'comparison_history.json')
    
    history = {"models": []}
    if os.path.exists(history_path):
        try:
            with open(history_path, 'r', encoding='utf-8') as rf:
                history = json.load(rf)
        except Exception:
            pass
            
    return {"success": True, "history": history}

@app.post("/api/delete-model")
async def delete_model(payload: DeleteModelPayload):
    projectName = payload.projectName
    fileName = payload.fileName
    
    project_path = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    history_path = os.path.join(project_path, '.dera', 'comparison_history.json')
    
    history = {"models": []}
    if os.path.exists(history_path):
        try:
            with open(history_path, 'r', encoding='utf-8') as rf:
                history = json.load(rf)
        except Exception:
            pass
            
    model_to_delete = next((m for m in history.get("models", []) if m.get("file") == fileName), None)
    if model_to_delete and model_to_delete.get("codeFile"):
        code_file_path = os.path.join(project_path, 'models', model_to_delete.get("codeFile"))
        if os.path.exists(code_file_path):
            try:
                os.remove(code_file_path)
            except Exception as e:
                print(f"[DERA API] Failed to delete code snapshot file: {e}")
                
    history["models"] = [m for m in history.get("models", []) if m.get("file") != fileName]
    with open(history_path, 'w', encoding='utf-8') as wf:
        json.dump(history, wf, indent=2)
        
    state_path = os.path.join(project_path, '.dera', 'latest_state.json')
    if os.path.exists(state_path):
        try:
            with open(state_path, 'r', encoding='utf-8') as rf:
                latest_state = json.load(rf)
            if latest_state.get("activeVersionFile") == fileName or f"Run {latest_state.get('activeRunId')}" == fileName:
                if len(history["models"]) > 0:
                    last_model = history["models"][-1]
                    latest_state["activeRunId"] = last_model.get("runId")
                    latest_state["metrics"] = last_model.get("metrics")
                    latest_state["parameters"] = last_model.get("parameters")
                    latest_state["datasetPath"] = last_model.get("parameters", {}).get("dataset", {}).get("filePath", "")
                    latest_state["targetColumn"] = last_model.get("parameters", {}).get("dataset", {}).get("targetColumn", "")
                    latest_state.pop("activeVersionFile", None)
                else:
                    latest_state["activeRunId"] = None
                    latest_state["metrics"] = None
                    latest_state.pop("activeVersionFile", None)
                with open(state_path, 'w', encoding='utf-8') as wf:
                    json.dump(latest_state, wf, indent=2)
        except Exception as state_err:
            print(f"[DERA API] Failed to update latest state file inside delete-model: {state_err}")
            
    return {"success": True, "history": history}

@app.post("/api/delete-project")
async def delete_project(payload: DeleteProjectPayload):
    projectName = payload.projectName.strip()
    
    if not projectName:
        raise HTTPException(status_code=400, detail="projectName is required")
    if ".." in projectName or "/" in projectName or "\\" in projectName:
        raise HTTPException(status_code=400, detail="Invalid project name")
        
    dera_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA'))
    project_path = os.path.abspath(os.path.join(dera_root, projectName))
    relative = os.path.relpath(project_path, dera_root)
    
    if relative.startswith('..') or os.path.isabs(relative) or not relative or relative == '.':
        raise HTTPException(status_code=400, detail="Invalid project path boundary")
        
    if os.path.exists(project_path):
        import shutil
        try:
            shutil.rmtree(project_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete project folder: {str(e)}")
            
    return {"success": True}

@app.post("/api/sync-active-view")
async def sync_active_view(payload: SyncActiveViewPayload):
    projectName = payload.projectName
    activeView = payload.activeView
    activeViewMode = payload.activeViewMode
    
    if not projectName:
        raise HTTPException(status_code=400, detail="projectName is required")
        
    project_path = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    state_path = os.path.join(project_path, '.dera', 'latest_state.json')
    
    latest_state = {}
    if os.path.exists(state_path):
        try:
            with open(state_path, 'r', encoding='utf-8') as rf:
                latest_state = json.load(rf)
        except Exception:
            pass
            
    if activeView is not None:
        latest_state["activeView"] = activeView
    if activeViewMode is not None:
        latest_state["activeViewMode"] = activeViewMode
        
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    with open(state_path, 'w', encoding='utf-8') as wf:
        json.dump(latest_state, wf, indent=2)
        
    return {"success": True}

# --- Data Lab Lifecycle Endpoints ---

@app.post("/api/datalab/upload-dataset")
async def upload_dataset(projectName: str, file: UploadFile = File(...)):
    if not projectName:
        raise HTTPException(status_code=400, detail="projectName is required")
    ensure_directories_exist(projectName)
    
    filename = file.filename
    format_type = filename.split('.')[-1].lower() if '.' in filename else 'csv'
    project_dir = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    data_dir = os.path.join(project_dir, 'data')
    
    dest_filename = filename
    dest_path = os.path.join(data_dir, dest_filename)
    if os.path.exists(dest_path):
        base, ext = os.path.splitext(filename)
        dest_filename = f"{base}_{int(time.time() * 1000)}{ext}"
        dest_path = os.path.join(data_dir, dest_filename)
        
    try:
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write uploaded file: {str(e)}")
        
    clear_db_cache(projectName)
    relative_raw_path = f"data/{dest_filename}"
    dataset = register_raw_dataset(projectName, dest_filename, "", relative_raw_path, format_type)
    
    return {
        "success": True,
        "message": "Dataset uploaded and registered successfully.",
        "dataset": dataset
    }

@app.get("/api/datalab/select-dataset")
async def select_dataset(projectName: str):
    if not projectName:
        raise HTTPException(status_code=400, detail="projectName query parameter is required")
    ensure_directories_exist(projectName)
    
    ps_command = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$w = New-Object System.Windows.Forms.Form; "
        "$w.TopMost = $true; $w.Width = 1; $w.Height = 1; "
        "$w.ShowInTaskbar = $false; $w.Opacity = 0; $w.Show(); $w.Activate(); "
        "$f = New-Object System.Windows.Forms.OpenFileDialog; "
        "$f.Filter = 'Dataset Files (*.csv;*.xlsx;*.xls;*.parquet)|*.csv;*.xlsx;*.xls;*.parquet|CSV Files (*.csv)|*.csv|Excel Files (*.xlsx;*.xls)|*.xlsx;*.xls|Parquet Files (*.parquet)|*.parquet'; "
        "$f.Title = 'Select DERA Dataset File'; "
        "$f.ShowHelp = $true; "
        "$f.ShowDialog($w) | Out-Null; "
        "$w.Close(); "
        "$f.FileName"
    )
    
    import subprocess
    try:
        result = subprocess.run(
            ["powershell", "-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_command],
            capture_output=True,
            text=True
        )
        selected_path = result.stdout.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File selection dialog failed: {str(e)}")
        
    if not selected_path:
        return {"success": True, "cancelled": True}
        
    original_filename = os.path.basename(selected_path)
    format_type = original_filename.split('.')[-1].lower() if '.' in original_filename else 'csv'
    project_dir = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    data_dir = os.path.join(project_dir, 'data')
    
    dest_filename = original_filename
    dest_path = os.path.join(data_dir, dest_filename)
    if os.path.exists(dest_path):
        base, ext = os.path.splitext(original_filename)
        dest_filename = f"{base}_{int(time.time() * 1000)}{ext}"
        dest_path = os.path.join(data_dir, dest_filename)
        
    import shutil
    try:
        shutil.copyfile(selected_path, dest_path)
        clear_db_cache(projectName)
        relative_raw_path = f"data/{dest_filename}"
        dataset = register_raw_dataset(projectName, dest_filename, selected_path, relative_raw_path, format_type)
        return {"success": True, "dataset": dataset}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to copy selected file: {str(e)}")

@app.get("/api/datalab/preview-dataset")
async def preview_dataset(
    projectName: str = "",
    filePath: str = "",
    limit: str = "50",
    background_tasks: BackgroundTasks = None
):
    if not filePath:
        raise HTTPException(status_code=400, detail="filePath parameter is required")
    
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName)) if projectName else os.getcwd()
    resolved_path = filePath if os.path.isabs(filePath) else os.path.abspath(os.path.join(project_root, filePath))
    
    limit_val = None if limit == "all" else int(limit)
    steps = load_pipeline_steps(projectName) if projectName else []
    
    try:
        result = run_polars_preview(resolved_path, steps, limit_val)
        if result["success"] and projectName:
            background_tasks.add_task(precompute_metadata_in_bg, projectName, resolved_path, steps)
        return result
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Failed to load preview: {str(e)}\n{traceback.format_exc()}")

@app.get("/api/datalab/column-stats")
async def column_stats(projectName: str = "", filePath: str = "", column: str = ""):
    if not filePath or not column:
        raise HTTPException(status_code=400, detail="filePath and column parameters are required")
        
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName)) if projectName else os.getcwd()
    resolved_path = filePath if os.path.isabs(filePath) else os.path.abspath(os.path.join(project_root, filePath))
    
    cache_key = 'current'
    if projectName:
        cached = get_db_cache(projectName, 'column_stats', {"cacheKey": cache_key, "column": column})
        if cached:
            return {"success": True, "stats": cached}
            
    steps = load_pipeline_steps(projectName) if projectName else []
    try:
        lf = polars_transforms.load_dataset(resolved_path)
        lf = polars_transforms.apply_pipeline(lf, steps)
        
        schema = lf.collect_schema()
        if column not in schema.names():
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found in dataset")
            
        total_count = lf.select(pl.len()).collect().item()
        null_count = lf.select(pl.col(column).null_count()).collect().item()
        non_null_count = total_count - null_count
        
        is_numeric = schema.get(column) in (pl.Int64, pl.Int32, pl.Int16, pl.Int8, pl.Float64, pl.Float32)
        dtype_str = str(schema.get(column))
        
        stats = {
            "type": dtype_str,
            "count": int(non_null_count),
            "nulls": int(null_count),
            "mean": "N/A",
            "median": "N/A",
            "std": "N/A",
            "min": "N/A",
            "max": "N/A",
            "skewness": "N/A",
            "outliers": "N/A",
            "distribution": []
        }
        
        if is_numeric and non_null_count > 0:
            agg_stats = lf.select([
                pl.col(column).mean().alias("mean"),
                pl.col(column).median().alias("median"),
                pl.col(column).std().alias("std"),
                pl.col(column).min().alias("min"),
                pl.col(column).max().alias("max"),
                pl.col(column).skew().alias("skewness")
            ]).collect()
            
            mean_val = agg_stats.get_column("mean")[0]
            median_val = agg_stats.get_column("median")[0]
            std_val = agg_stats.get_column("std")[0]
            min_val = agg_stats.get_column("min")[0]
            max_val = agg_stats.get_column("max")[0]
            skewness_val = agg_stats.get_column("skewness")[0]
            
            stats["mean"] = float(mean_val) if mean_val is not None else 0.0
            stats["median"] = float(median_val) if median_val is not None else 0.0
            stats["std"] = float(std_val) if std_val is not None else 0.0
            stats["min"] = float(min_val) if min_val is not None else 0.0
            stats["max"] = float(max_val) if max_val is not None else 0.0
            stats["skewness"] = float(skewness_val) if skewness_val is not None else 0.0
            
            q_stats = lf.select([
                pl.col(column).quantile(0.25).alias("q1"),
                pl.col(column).quantile(0.75).alias("q3")
            ]).collect()
            q1 = q_stats.get_column("q1")[0]
            q3 = q_stats.get_column("q3")[0]
            
            iqr = q3 - q1 if (q3 is not None and q1 is not None) else 0.0
            lower = q1 - 1.5 * iqr if q1 is not None else 0.0
            upper = q3 + 1.5 * iqr if q3 is not None else 0.0
            
            outliers = lf.filter((pl.col(column) < lower) | (pl.col(column) > upper)).select(pl.len()).collect().item()
            stats["outliers"] = int(outliers)
            
            col_clean = lf.select(pl.col(column).drop_nulls()).collect().get_column(column).to_numpy()
            if len(col_clean) > 0:
                counts, bin_edges = np.histogram(col_clean, bins=5)
                total_clean = len(col_clean)
                fill_classes = ["", " teal-fill", "", " teal-fill", " amber-fill"]
                for i in range(len(counts)):
                    start = bin_edges[i]
                    end = bin_edges[i+1]
                    pct = float((counts[i] / total_clean) * 100)
                    stats["distribution"].append({
                        "label": f"{start:.1f}–{end:.1f}" if abs(start) < 1000 and abs(end) < 1000 else f"{start:.0e}–{end:.0e}",
                        "percentage": pct,
                        "fillClass": fill_classes[i % len(fill_classes)]
                    })
        else:
            vc = lf.select(pl.col(column)).collect().get_column(column).value_counts(sort=True).head(5)
            total_clean = non_null_count
            fill_classes = ["", " teal-fill", "", " teal-fill", " amber-fill"]
            if total_clean > 0:
                for idx, r in enumerate(vc.iter_rows(named=True)):
                    val = r[column]
                    count = r["count"]
                    pct = float((count / total_clean) * 100)
                    stats["distribution"].append({
                        "label": str(val) if val is not None else 'NaN',
                        "percentage": pct,
                        "fillClass": fill_classes[idx % len(fill_classes)]
                    })
                    
        cols = schema.names()
        num_cols = sum(1 for c in cols if schema[c].is_numeric())
        obj_cols = len(cols) - num_cols
        total_missing = lf.select(pl.sum_horizontal(pl.all().is_null().sum())).collect().item()
        
        stats["datasetOverview"] = {
            "totalRows": int(total_count),
            "totalCols": len(cols),
            "numericCols": num_cols,
            "objectCols": obj_cols,
            "totalMissing": int(total_missing)
        }
        
        if projectName:
            set_db_cache(projectName, 'column_stats', {"cacheKey": cache_key, "column": column}, stats)
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate stats: {str(e)}")

@app.get("/api/datalab/read-columns")
async def read_columns(projectName: str = "", filePath: str = ""):
    if not filePath:
        raise HTTPException(status_code=400, detail="filePath parameter is required")
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName)) if projectName else os.getcwd()
    resolved_path = filePath if os.path.isabs(filePath) else os.path.abspath(os.path.join(project_root, filePath))
    steps = load_pipeline_steps(projectName) if projectName else []
    try:
        lf = polars_transforms.load_dataset(resolved_path)
        lf = polars_transforms.apply_pipeline(lf, steps)
        return {"success": True, "columns": lf.columns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/datalab/unique-values")
async def unique_values(projectName: str = "", filePath: str = "", column: str = ""):
    if not filePath or not column:
        raise HTTPException(status_code=400, detail="filePath and column parameters are required")
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName)) if projectName else os.getcwd()
    resolved_path = filePath if os.path.isabs(filePath) else os.path.abspath(os.path.join(project_root, filePath))
    
    cache_key = 'current'
    if projectName:
        cached = get_db_cache(projectName, 'unique_values', {"cacheKey": cache_key, "column": column})
        if cached:
            return cached
            
    steps = load_pipeline_steps(projectName) if projectName else []
    try:
        lf = polars_transforms.load_dataset(resolved_path)
        lf = polars_transforms.apply_pipeline(lf, steps)
        
        if column not in lf.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found in dataset")
            
        lf_col = lf.select(pl.col(column))
        total_unique = lf_col.unique().select(pl.len()).collect().item()
        
        value_counts = lf_col.collect().get_column(column).value_counts(sort=True).head(100)
        unique_list = []
        for r in value_counts.iter_rows(named=True):
            val = r[column]
            val_str = str(val) if val is not None else 'NaN'
            unique_list.append({"value": val_str, "count": int(r["count"])})
            
        result = {
            "success": True,
            "column": column,
            "uniqueValues": unique_list,
            "totalUnique": int(total_unique)
        }
        if projectName:
            set_db_cache(projectName, 'unique_values', {"cacheKey": cache_key, "column": column}, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/datalab/preprocess-dataset")
async def preprocess_dataset(payload: PreprocessPayload, background_tasks: BackgroundTasks):
    project_name = payload.projectName
    session_id = payload.sessionId
    raw_dataset_path = payload.rawDatasetPath
    preprocessing_steps = payload.preprocessingSteps
    created_at = payload.createdAt
    
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', project_name))
    resolved_raw_path = raw_dataset_path if os.path.isabs(raw_dataset_path) else os.path.abspath(os.path.join(project_root, raw_dataset_path))
    
    relative_raw_path = os.path.relpath(resolved_raw_path, project_root).replace('\\', '/')
    
    prev_pipeline = load_pipeline(project_name)
    prev_steps = prev_pipeline.get("steps", [])
    new_steps = preprocessing_steps
    
    is_single_append = False
    appended_step = None
    if len(new_steps) == len(prev_steps) + 1 and new_steps[:len(prev_steps)] == prev_steps:
        is_single_append = True
        appended_step = new_steps[-1]
        
    op_type = 'dataset'
    changed_cols = []
    if is_single_append and appended_step:
        op_type = classify_operation(appended_step.get('type', ''))
        if op_type == 'column':
            changed_cols = get_changed_columns(appended_step)
            
    save_pipeline(project_name, {"version": "1.0", "steps": new_steps})
    
    if op_type == 'column':
        for col in changed_cols:
            delete_db_cache_for_column(project_name, col)
    else:
        clear_db_cache(project_name)
        
    try:
        result = run_polars_preview(resolved_raw_path, new_steps, 50)
        
        db_path = get_cache_db_path(project_name)
        cached_columns = set()
        if os.path.exists(db_path):
            try:
                conn = init_cache_db(project_name)
                cursor = conn.cursor()
                cursor.execute("SELECT column FROM column_stats WHERE cacheKey = 'current'")
                cached_columns = set(row[0] for row in cursor.fetchall())
                conn.close()
            except Exception:
                pass
                
        columns = result.get("columns", [])
        missing_columns = [c for c in columns if c not in cached_columns]
        if missing_columns:
            background_tasks.add_task(precompute_metadata_in_bg, project_name, resolved_raw_path, new_steps, missing_columns)
            
        return {
            "success": True,
            "session": {
                "sessionId": session_id or f"session_{''.join(random.choices(string.ascii_lowercase + string.digits, k=9))}_{int(time.time() * 1000)}",
                "rawDatasetPath": relative_raw_path,
                "processedDatasetPath": relative_raw_path,
                "columns": result.get("columns"),
                "metadata": {
                    "totalRows": result.get("totalRows"),
                    "totalCols": result.get("totalCols"),
                    "missingCounts": result.get("missingCounts"),
                    "dtypes": result.get("newDtypes"),
                    "records": result.get("records")
                },
                "preprocessingSteps": new_steps,
                "createdAt": created_at or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/datalab/pipeline-preview")
async def pipeline_preview(payload: PreviewPayload):
    project_name = payload.projectName
    raw_dataset_path = payload.rawDatasetPath
    preprocessing_steps = payload.preprocessingSteps
    
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', project_name)) if project_name else os.getcwd()
    resolved_raw_path = raw_dataset_path if os.path.isabs(raw_dataset_path) else os.path.abspath(os.path.join(project_root, raw_dataset_path))
    
    try:
        result = run_polars_preview(resolved_raw_path, preprocessing_steps, 50)
        return {
            "success": True,
            "columns": result.get("columns"),
            "dtypes": result.get("newDtypes"),
            "totalRows": result.get("totalRows"),
            "totalCols": result.get("totalCols"),
            "missingCounts": result.get("missingCounts"),
            "records": result.get("records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/datalab/chart-data")
@app.post("/api/datalab/chart-data")
async def chart_data(
    payload: Optional[ChartPayload] = None,
    filePath: Optional[str] = None,
    chartType: Optional[str] = None,
    xAxis: Optional[str] = None,
    yAxis: Optional[str] = None,
    zoom: Optional[float] = 1.0,
    projectName: Optional[str] = "",
    visualizationMode: Optional[str] = "standard",
    customCode: Optional[str] = "",
    advancedOptions: Optional[str] = None
):
    if payload is not None:
        data_payload = payload.dict()
    else:
        try:
            adv_opt = json.loads(advancedOptions) if advancedOptions else {}
        except Exception:
            adv_opt = {}
        data_payload = {
            "filePath": filePath,
            "chartType": chartType or "scatter",
            "xAxis": xAxis or "",
            "yAxis": yAxis or "",
            "zoom": zoom or 1.0,
            "projectName": projectName or "",
            "visualizationMode": visualizationMode or "standard",
            "customCode": customCode or "",
            "advancedOptions": adv_opt
        }
        
    f_path = data_payload.get("filePath")
    c_type = data_payload.get("chartType")
    x_ax = data_payload.get("xAxis")
    y_ax = data_payload.get("yAxis")
    zoom_val = data_payload.get("zoom", 1.0)
    proj_name = data_payload.get("projectName", "")
    vis_mode = data_payload.get("visualizationMode", "standard")
    cust_code = data_payload.get("customCode", "")
    adv_opts = data_payload.get("advancedOptions", {})
    
    if not f_path or not x_ax:
        raise HTTPException(status_code=400, detail="filePath and xAxis parameters are required")
        
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', proj_name)) if proj_name else os.getcwd()
    resolved_path = f_path if os.path.isabs(f_path) else os.path.abspath(os.path.join(project_root, f_path))
    
    steps = load_pipeline_steps(proj_name) if proj_name else []
    
    import hashlib
    hash_payload = {
        "chartType": c_type,
        "xAxis": x_ax,
        "yAxis": y_ax,
        "zoom": zoom_val,
        "visualizationMode": vis_mode,
        "customCode": cust_code,
        "advancedOptions": adv_opts,
        "filePath": f_path,
        "preprocessingSteps": steps
    }
    config_hash = hashlib.md5(json.dumps(hash_payload, sort_keys=True).encode('utf-8')).hexdigest()
    
    if proj_name:
        graphs_dir = os.path.join(project_root, 'graphs')
        os.makedirs(graphs_dir, exist_ok=True)
        relative_image_path = f"DERA/{proj_name}/graphs/current_graph.png"
        relative_meta_path = f"DERA/{proj_name}/graphs/current_graph.json"
        absolute_image_path = os.path.join(graphs_dir, 'current_graph.png')
        absolute_meta_path = os.path.join(graphs_dir, 'current_graph.json')
    else:
        temp_dir = os.path.abspath(os.path.join(os.getcwd(), 'DERA', 'temp_graphs'))
        os.makedirs(temp_dir, exist_ok=True)
        relative_image_path = "DERA/temp_graphs/current_graph.png"
        relative_meta_path = "DERA/temp_graphs/current_graph.json"
        absolute_image_path = os.path.join(temp_dir, 'current_graph.png')
        absolute_meta_path = os.path.join(temp_dir, 'current_graph.json')
        
    cache_key = 'current'
    if proj_name:
        cached = get_db_cache(proj_name, 'graph_cache', {"cacheKey": cache_key, "chartType": c_type, "xAxis": x_ax, "yAxis": y_ax, "configHash": config_hash})
        if cached and os.path.exists(absolute_image_path):
            return cached
            
    input_payload = {
        "path": resolved_path,
        "chart_type": c_type,
        "x_col": x_ax,
        "y_col": y_ax,
        "zoom_level": zoom_val,
        "output_img_path": absolute_image_path,
        "output_meta_path": absolute_meta_path,
        "relative_img_path": relative_image_path,
        "project_name": proj_name,
        "preprocessing_steps": steps,
        "visualization_mode": vis_mode,
        "custom_code": cust_code,
        "advanced_options": adv_opts
    }
    
    try:
        import subprocess
        process = subprocess.Popen(
            [sys.executable, "backend/graphs/main.py"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout_data, stderr_data = process.communicate(input=json.dumps(input_payload))
        if process.returncode != 0:
            raise HTTPException(status_code=500, detail=stderr_data or f"Chart engine failed with exit code {process.returncode}")
            
        result = json.loads(stdout_data.strip())
        if result.get("success") and proj_name:
            set_db_cache(proj_name, 'graph_cache', {"cacheKey": cache_key, "chartType": c_type, "xAxis": x_ax, "yAxis": y_ax, "configHash": config_hash}, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/datalab/format-code")
async def format_code(payload: FormatPayload):
    code = payload.code
    try:
        import black
        formatted_code = black.format_str(code, mode=black.Mode())
    except Exception:
        formatted_code = code
    return {"success": True, "formattedCode": formatted_code}

@app.post("/api/datalab/save-graph")
async def save_graph(
    payload: Optional[SaveGraphPayload] = None,
    projectName: Optional[str] = None,
    graphName: Optional[str] = ""
):
    proj_name = projectName
    g_name = graphName
    if payload:
        proj_name = payload.projectName or proj_name
        g_name = payload.graphName or g_name
        
    if not proj_name:
        raise HTTPException(status_code=400, detail="projectName parameter is required")
        
    project_dir = os.path.abspath(os.path.join(os.getcwd(), 'DERA', proj_name))
    graphs_dir = os.path.join(project_dir, 'graphs')
    saved_dir = os.path.join(graphs_dir, 'saved')
    os.makedirs(saved_dir, exist_ok=True)
    
    current_img = os.path.join(graphs_dir, 'current_graph.png')
    current_meta = os.path.join(graphs_dir, 'current_graph.json')
    
    if not os.path.exists(current_img):
        raise HTTPException(status_code=400, detail="No active graph to save.")
        
    current_meta_obj = {}
    if os.path.exists(current_meta):
        try:
            with open(current_meta, "r", encoding="utf-8") as rf:
                current_meta_obj = json.load(rf)
        except Exception:
            pass
            
    files = os.listdir(saved_dir)
    max_id = 0
    import re
    for f in files:
        match = re.match(r"^graph_(\d+)\.png$", f, re.IGNORECASE)
        if match:
            val = int(match.group(1))
            if val > max_id:
                max_id = val
                
    next_id = str(max_id + 1).zfill(3)
    dest_img = os.path.join(saved_dir, f"graph_{next_id}.png")
    dest_meta = os.path.join(saved_dir, f"graph_{next_id}.json")
    
    import shutil
    shutil.copyfile(current_img, dest_img)
    
    metadata = {
        "graphId": next_id,
        "graphName": g_name or f"Graph {next_id}",
        "imagePath": f"DERA/{proj_name}/graphs/saved/graph_{next_id}.png",
        "chartType": current_meta_obj.get("chartType", ""),
        "xAxis": current_meta_obj.get("xAxis", []),
        "yAxis": current_meta_obj.get("yAxis", []),
        "visualizationMode": current_meta_obj.get("visualizationMode", "standard"),
        "customCode": current_meta_obj.get("customCode", ""),
        "advancedOptions": current_meta_obj.get("advancedOptions", {}),
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    with open(dest_meta, "w", encoding="utf-8") as wf:
        json.dump(metadata, wf, indent=2)
        
    return {"success": True, "graph": metadata}

@app.get("/api/datalab/get-saved-graphs")
async def get_saved_graphs(projectName: str):
    if not projectName:
        raise HTTPException(status_code=400, detail="projectName parameter is required")
    project_dir = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName))
    saved_dir = os.path.join(project_dir, 'graphs', 'saved')
    if not os.path.exists(saved_dir):
        return {"success": True, "graphs": []}
        
    files = os.listdir(saved_dir)
    graphs = []
    for f in files:
        if f.endswith('.json'):
            try:
                meta_path = os.path.join(saved_dir, f)
                with open(meta_path, "r", encoding="utf-8") as rf:
                    graphs.append(json.load(rf))
            except Exception:
                pass
    graphs.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    return {"success": True, "graphs": graphs}

@app.get("/api/datalab/profiling-report")
async def profiling_report(projectName: str = "", filePath: str = "", reportType: str = "dataset_summary", column: str = ""):
    if not filePath:
        raise HTTPException(status_code=400, detail="filePath parameter is required")
    project_root = os.path.abspath(os.path.join(os.getcwd(), 'DERA', projectName)) if projectName else os.getcwd()
    resolved_path = filePath if os.path.isabs(filePath) else os.path.abspath(os.path.join(project_root, filePath))
    
    cache_key = 'current'
    if projectName:
        cached = get_db_cache(projectName, 'profiling', {"cacheKey": cache_key, "reportType": reportType, "column": column})
        if cached:
            return cached
            
    steps = load_pipeline_steps(projectName) if projectName else []
    
    payload = {
        "path": resolved_path,
        "steps": steps,
        "columns": [column] if column else None
    }
    
    try:
        import subprocess
        process = subprocess.Popen(
            [sys.executable, "backend/dataset/precompute.py"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout_data, stderr_data = process.communicate(input=json.dumps(payload))
        if process.returncode != 0:
            raise HTTPException(status_code=500, detail=stderr_data or f"Precomputing failed with exit code {process.returncode}")
            
        result = json.loads(stdout_data.strip())
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Precomputation failed"))
            
        response_data = {}
        if reportType == 'dataset_summary':
            dw = result.get("dataset_wide", {})
            response_data = {
                "success": True,
                "data": dw.get("dataset_summary", {})
            }
        elif reportType == 'missing_analysis':
            dw = result.get("dataset_wide", {})
            response_data = {
                "success": True,
                "data": dw.get("missing_analysis", {})
            }
        elif reportType == 'datatype_overview':
            dw = result.get("dataset_wide", {})
            response_data = {
                "success": True,
                "data": dw.get("datatype_overview", {})
            }
        elif reportType == 'correlation_matrix':
            dw = result.get("dataset_wide", {})
            if len(dw.get("correlation_matrix", {}).get("columns", [])) > 0:
                response_data = {
                    "success": True,
                    "data": dw.get("correlation_matrix", {})
                }
            else:
                response_data = {
                    "success": True,
                    "data": {"columns": [], "matrix": []}
                }
        elif reportType == 'class_distribution':
            col_data = result.get("columns", {}).get(column, {})
            response_data = {
                "success": True,
                "data": {
                    "column": column,
                    "distribution": col_data.get("class_distribution", [])
                }
            }
            
        if projectName and response_data:
            set_db_cache(projectName, 'profiling', {"cacheKey": cache_key, "reportType": reportType, "column": column}, response_data)
        return response_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/datalab/sync-datalab-session")
async def sync_datalab_session(payload: SyncSessionPayload):
    project_name = payload.projectName
    session = payload.session
    
    project_dir = os.path.abspath(os.path.join(os.getcwd(), 'DERA', project_name))
    state_path = os.path.join(project_dir, '.dera', 'latest_state.json')
    
    latest_state = {}
    if os.path.exists(state_path):
        try:
            with open(state_path, "r", encoding="utf-8") as rf:
                latest_state = json.load(rf)
        except Exception:
            pass
            
    clean_session = None
    if session:
        clean_session = session.copy()
        clean_session.pop("records", None)
        clean_session.pop("preprocessingSteps", None)
        if "metadata" in clean_session:
            clean_session["metadata"] = clean_session["metadata"].copy()
            clean_session["metadata"].pop("records", None)
            clean_session["metadata"].pop("statistics", None)
            clean_session["metadata"].pop("profiling", None)
            clean_session["metadata"].pop("graphData", None)
            
    latest_state["dataLabSession"] = clean_session
    if clean_session:
        latest_state["datasetPath"] = clean_session.get("rawDatasetPath", "")
        
    try:
        os.makedirs(os.path.dirname(state_path), exist_ok=True)
        with open(state_path, "w", encoding="utf-8") as wf:
            json.dump(latest_state, wf, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Serve Single-Page Application (SPA) ---
from fastapi.responses import FileResponse

# Mount the static assets built by Vite
backend_dir = os.path.dirname(os.path.abspath(__file__))
dist_assets_path = os.path.abspath(os.path.join(backend_dir, 'dist', 'assets'))
if not os.path.exists(dist_assets_path):
    dist_assets_path = os.path.abspath(os.path.join(os.getcwd(), 'dist', 'assets'))

if os.path.exists(dist_assets_path):
    app.mount("/assets", StaticFiles(directory=dist_assets_path), name="assets")

# Catch-all route to serve Vite index.html for client-side routing
@app.get("/{catchall:path}")
async def serve_spa(catchall: str):
    index_path = os.path.abspath(os.path.join(backend_dir, 'dist', 'index.html'))
    if not os.path.exists(index_path):
        index_path = os.path.abspath(os.path.join(os.getcwd(), 'dist', 'index.html'))
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Frontend build index.html not found.")

def run_gui():
    import webbrowser
    print("[DERA Backend] Starting FastAPI Server on port 8000...")
    webbrowser.open("http://127.0.0.1:8000")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False, access_log=False)

if __name__ == "__main__":
    run_gui()
