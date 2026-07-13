import json
import sys
import os
import polars as pl
import pandas as pd
import numpy as np

def clean_value(val):
    if val is None:
        return None
    try:
        # Check if float nan or inf
        if isinstance(val, (float, np.floating)):
            if np.isnan(val) or np.isinf(val):
                return None
            return float(val)
        if isinstance(val, (int, np.integer)):
            return int(val)
    except:
        pass
    return val

def main():
    try:
        # Read payload from stdin
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"success": False, "error": "No input payload received"}))
            return
        
        payload = json.loads(input_data)
        file_path = payload.get("path")
        steps = payload.get("steps", [])
        target_columns = payload.get("columns") # list of columns to compute, or None for all
        
        if not file_path:
            print(json.dumps({"success": False, "error": "file path is required"}))
            return

        # Add backend/dataset directory to path to import polars_transforms
        dataset_dir = os.path.dirname(os.path.abspath(__file__))
        sys.path.append(dataset_dir)
        import polars_transforms
        
        lf = polars_transforms.load_dataset(file_path)
        lf = polars_transforms.apply_pipeline(lf, steps)
        
        # Collect data frame to compute in memory
        df = lf.collect()
        
        all_columns = df.columns
        if target_columns is None:
            cols_to_compute = all_columns
        else:
            cols_to_compute = [c for c in target_columns if c in all_columns]
            
        total_rows = len(df)
        total_cols = len(all_columns)
        
        num_cols = sum(1 for c in all_columns if df.schema[c].is_numeric())
        obj_cols = total_cols - num_cols
        
        total_missing = 0
        if total_cols > 0:
            total_missing = int(df.null_count().sum_horizontal()[0])
        
        dataset_overview = {
            "totalRows": total_rows,
            "totalCols": total_cols,
            "numericCols": num_cols,
            "objectCols": obj_cols,
            "totalMissing": total_missing
        }
        
        column_results = {}
        
        for column in cols_to_compute:
            col_series = df.get_column(column)
            null_count = int(col_series.null_count())
            non_null_count = total_rows - null_count
            dtype_str = str(df.schema[column])
            is_numeric = df.schema[column].is_numeric()
            
            # 1. column_stats
            stats = {
                "type": dtype_str,
                "count": non_null_count,
                "nulls": null_count,
                "mean": "N/A",
                "median": "N/A",
                "std": "N/A",
                "min": "N/A",
                "max": "N/A",
                "skewness": "N/A",
                "outliers": "N/A",
                "distribution": [],
                "datasetOverview": dataset_overview
            }
            
            if is_numeric and non_null_count > 0:
                mean_val = clean_value(col_series.mean())
                median_val = clean_value(col_series.median())
                std_val = clean_value(col_series.std())
                min_val = clean_value(col_series.min())
                max_val = clean_value(col_series.max())
                
                try:
                    skewness_val = clean_value(col_series.skew())
                except:
                    skewness_val = "N/A"
                
                stats["mean"] = mean_val if mean_val is not None else 0.0
                stats["median"] = median_val if median_val is not None else 0.0
                stats["std"] = std_val if std_val is not None else 0.0
                stats["min"] = min_val if min_val is not None else 0.0
                stats["max"] = max_val if max_val is not None else 0.0
                stats["skewness"] = skewness_val if skewness_val is not None else "N/A"
                
                # Outliers IQR
                try:
                    q1 = col_series.quantile(0.25)
                    q3 = col_series.quantile(0.75)
                    iqr = q3 - q1 if (q3 is not None and q1 is not None) else 0.0
                    lower = q1 - 1.5 * iqr if q1 is not None else 0.0
                    upper = q3 + 1.5 * iqr if q3 is not None else 0.0
                    outliers = int(((col_series < lower) | (col_series > upper)).sum())
                except:
                    outliers = 0
                stats["outliers"] = outliers
                
                # Histogram bins
                try:
                    col_clean = col_series.drop_nulls().cast(pl.Float64).to_numpy()
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
                except Exception as bin_err:
                    pass
            else:
                # Non-numeric distribution
                try:
                    vc = col_series.value_counts(sort=True).head(5)
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
                except:
                    pass
            
            # 2. unique_values
            try:
                total_unique = col_series.n_unique()
                vc_unique = col_series.value_counts(sort=True).head(100)
                unique_list = []
                for r in vc_unique.iter_rows(named=True):
                    val = r[column]
                    val_str = str(val) if val is not None else 'NaN'
                    unique_list.append({"value": val_str, "count": int(r["count"])})
            except:
                total_unique = 0
                unique_list = []
                
            unique_values_data = {
                "success": True,
                "column": column,
                "uniqueValues": unique_list,
                "totalUnique": total_unique
            }
            
            # 3. class_distribution (profiling report)
            try:
                vc_class = col_series.value_counts(sort=True).head(30)
                class_dist_list = []
                for r in vc_class.iter_rows(named=True):
                    val = r[column]
                    val_str = str(val) if val is not None else 'NaN'
                    count = r["count"]
                    pct = float((count / total_rows) * 100) if total_rows > 0 else 0.0
                    class_dist_list.append({
                        "value": val_str,
                        "count": int(count),
                        "percentage": pct
                    })
            except:
                class_dist_list = []
                
            class_distribution_data = {
                "success": True,
                "data": {
                    "column": column,
                    "distribution": class_dist_list
                }
            }
            
            column_results[column] = {
                "column_stats": stats,
                "unique_values": unique_values_data,
                "class_distribution": class_distribution_data
            }
            
        # 4. dataset-wide profiling reports
        # dataset_summary
        uniq_rows = len(df.unique())
        duplicate_rows = total_rows - uniq_rows
        
        numeric_cols = [c for c in all_columns if df.schema[c].is_numeric()]
        numeric_desc = {}
        if numeric_cols:
            try:
                desc_df = df.select(numeric_cols).describe()
                for col in numeric_cols:
                    col_desc = {}
                    for row in desc_df.iter_rows(named=True):
                        stat_name = row["statistic"]
                        val = clean_value(row[col])
                        col_desc[stat_name] = val
                    numeric_desc[col] = col_desc
            except:
                pass
                
        dtypes_counts = {}
        for c in all_columns:
            dt = str(df.schema[c])
            dtypes_counts[dt] = dtypes_counts.get(dt, 0) + 1
            
        dataset_summary = {
            "success": True,
            "data": {
                "totalRows": total_rows,
                "totalCols": total_cols,
                "duplicateRows": duplicate_rows,
                "dtypesCounts": dtypes_counts,
                "numericDesc": numeric_desc
            }
        }
        
        # missing_analysis
        missing_list = []
        if total_rows > 0:
            try:
                null_counts = df.null_count()
                for col in all_columns:
                    count = int(null_counts.get_column(col)[0])
                    pct = float((count / total_rows) * 100)
                    missing_list.append({
                        "column": col,
                        "nulls": count,
                        "percentage": pct
                    })
                missing_list.sort(key=lambda x: x["nulls"], reverse=True)
            except:
                pass
        missing_analysis = {
            "success": True,
            "data": {
                "missingAnalysis": missing_list
            }
        }
        
        # datatype_overview
        overview = []
        for col in all_columns:
            dtype_str = str(df.schema[col])
            try:
                sample_vals = df.select(pl.col(col).drop_nulls().unique().head(3)).get_column(col).to_list()
                sample_vals = [str(x) for x in sample_vals]
            except:
                sample_vals = []
            overview.append({
                "column": col,
                "dtype": dtype_str,
                "sampleValues": sample_vals
            })
        datatype_overview = {
            "success": True,
            "data": {
                "datatypeOverview": overview
            }
        }
        
        # correlation_matrix
        if len(numeric_cols) > 1:
            try:
                corr_matrix = []
                for col1 in numeric_cols:
                    row_corrs = []
                    col1_arr = df.get_column(col1).cast(pl.Float64).fill_null(0.0).to_numpy()
                    for col2 in numeric_cols:
                        col2_arr = df.get_column(col2).cast(pl.Float64).fill_null(0.0).to_numpy()
                        # Use nan_to_num to be absolutely safe
                        val = np.corrcoef(col1_arr, col2_arr)[0, 1]
                        row_corrs.append(float(val) if not np.isnan(val) else 0.0)
                    corr_matrix.append(row_corrs)
                correlation_matrix = {
                    "success": True,
                    "data": {
                        "columns": numeric_cols,
                        "matrix": corr_matrix
                    }
                }
            except Exception as corr_err:
                correlation_matrix = {
                    "success": True,
                    "data": {
                        "columns": [],
                        "matrix": []
                    }
                }
        else:
            correlation_matrix = {
                "success": True,
                "data": {
                    "columns": [],
                    "matrix": []
                }
            }
            
        dataset_wide = {
            "dataset_summary": dataset_summary,
            "missing_analysis": missing_analysis,
            "datatype_overview": datatype_overview,
            "correlation_matrix": correlation_matrix
        }
        
        print(json.dumps({
            "success": True,
            "columns": column_results,
            "dataset_wide": dataset_wide
        }))
        
    except Exception as e:
        import traceback
        print(json.dumps({"success": False, "error": str(e), "trace": traceback.format_exc()}))

if __name__ == '__main__':
    main()
