import polars as pl
import pandas as pd
import numpy as np
import math

def handle_drop_columns(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    cols = [c for c in cols if c in lf.columns]
    if cols:
        lf = lf.drop(cols)
    return lf

def handle_fill_null(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    strategy = params.get('strategy', 'mean')
    val = params.get('value')
    
    for col in cols:
        if col not in lf.columns:
            continue
        if strategy == 'mean':
            lf = lf.with_columns(pl.col(col).fill_null(pl.col(col).mean()))
        elif strategy == 'median':
            lf = lf.with_columns(pl.col(col).fill_null(pl.col(col).median()))
        elif strategy == 'mode':
            lf = lf.with_columns(pl.col(col).fill_null(pl.col(col).mode().first()))
        elif strategy == 'constant':
            if val is not None:
                # Get the schema type of the column to cast the constant value correctly
                schema = lf.schema
                col_type = schema.get(col)
                if col_type in (pl.Int64, pl.Int32, pl.Int16, pl.Int8):
                    try:
                        c_val = int(float(val))
                    except ValueError:
                        c_val = val
                elif col_type in (pl.Float64, pl.Float32):
                    try:
                        c_val = float(val)
                    except ValueError:
                        c_val = val
                elif col_type == pl.Boolean:
                    c_val = str(val).lower() in ('true', '1', 'yes', 'y', 't')
                else:
                    c_val = str(val)
                lf = lf.with_columns(pl.col(col).fill_null(pl.lit(c_val)))
    return lf

def handle_remove_duplicates(lf, params):
    return lf.unique()

def handle_rename_column(lf, params):
    mapping = params.get('columns')
    if not mapping and params.get('oldName') and params.get('newName'):
        mapping = {params.get('oldName'): params.get('newName')}
    if mapping:
        mapping = {k: v for k, v in mapping.items() if k in lf.columns}
        if mapping:
            lf = lf.rename(mapping)
    return lf

def handle_min_max_scale(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    for col in cols:
        if col in lf.columns:
            col_min = pl.col(col).min()
            col_max = pl.col(col).max()
            lf = lf.with_columns(
                pl.when(col_max == col_min)
                .then(pl.lit(0.0))
                .otherwise((pl.col(col) - col_min) / (col_max - col_min))
                .alias(col)
            )
    return lf

def handle_standardize(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    for col in cols:
        if col in lf.columns:
            col_mean = pl.col(col).mean()
            col_std = pl.col(col).std()
            lf = lf.with_columns(
                pl.when(col_std == 0)
                .then(pl.lit(0.0))
                .otherwise((pl.col(col) - col_mean) / col_std)
                .alias(col)
            )
    return lf

def handle_lowercase(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    for col in cols:
        if col in lf.columns:
            lf = lf.with_columns(pl.col(col).cast(pl.String).str.to_lowercase().alias(col))
    return lf

def handle_uppercase(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    for col in cols:
        if col in lf.columns:
            lf = lf.with_columns(pl.col(col).cast(pl.String).str.to_uppercase().alias(col))
    return lf

def handle_trim_spaces(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    for col in cols:
        if col in lf.columns:
            lf = lf.with_columns(pl.col(col).cast(pl.String).str.strip_chars().alias(col))
    return lf

def handle_toggle_bool(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    for col in cols:
        if col in lf.columns:
            lf = lf.with_columns(pl.col(col).not_().alias(col))
    return lf

def handle_one_hot_encode(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    cols = [c for c in cols if c in lf.columns]
    for col in cols:
        unique_vals = lf.select(col).unique().collect().get_column(col).to_list()
        if len(unique_vals) > 0:
            unique_vals = [v for v in unique_vals if v is not None]
            unique_vals.sort()
            # drop_first=True
            for val in unique_vals[1:]:
                col_name = f"{col}_{val}"
                lf = lf.with_columns((pl.col(col) == val).cast(pl.Int32).alias(col_name))
            lf = lf.drop(col)
    return lf

def handle_change_datatype(lf, params):
    cols = params.get('columns', [])
    if not cols and params.get('column'):
        cols = [params.get('column')]
    new_type = params.get('dtype')
    if new_type:
        type_map = {
            'int64': pl.Int64,
            'float64': pl.Float64,
            'object': pl.String,
            'bool': pl.Boolean,
            'str': pl.String,
            'string': pl.String,
            'datetime': pl.Datetime
        }
        pl_type = type_map.get(new_type)
        if pl_type:
            for col in cols:
                if col in lf.columns:
                    if pl_type == pl.Datetime:
                        lf = lf.with_columns(pl.col(col).cast(pl.String).str.to_datetime(strict=False).alias(col))
                    else:
                        lf = lf.with_columns(pl.col(col).cast(pl_type).alias(col))
    return lf

def handle_filter_rows(lf, params):
    col = params.get('column')
    op = params.get('operator')
    val = params.get('value')
    if col in lf.columns and op and val is not None:
        if op == '==':
            lf = lf.filter(pl.col(col) == val)
        elif op == '!=':
            lf = lf.filter(pl.col(col) != val)
        elif op == '>':
            try:
                lf = lf.filter(pl.col(col) > float(val))
            except:
                lf = lf.filter(pl.col(col) > val)
        elif op == '<':
            try:
                lf = lf.filter(pl.col(col) < float(val))
            except:
                lf = lf.filter(pl.col(col) < val)
        elif op == 'contains':
            lf = lf.filter(pl.col(col).cast(pl.String).str.contains(str(val)))
    return lf

def handle_sort_column(lf, params):
    col = params.get('column')
    ascending = params.get('ascending', True)
    if col in lf.columns:
        lf = lf.sort(col, descending=not ascending)
    return lf

def handle_reorder_column(lf, params):
    col = params.get('column')
    direction = params.get('direction')
    if col not in lf.columns:
        return lf
    cols = list(lf.columns)
    idx = cols.index(col)
    if direction == 'start':
        cols.remove(col)
        cols.insert(0, col)
    elif direction == 'end':
        cols.remove(col)
        cols.append(col)
    elif direction == 'left' and idx > 0:
        cols[idx], cols[idx-1] = cols[idx-1], cols[idx]
    elif direction == 'right' and idx < len(cols) - 1:
        cols[idx], cols[idx+1] = cols[idx+1], cols[idx]
    return lf.select(cols)

def handle_duplicate_column(lf, params):
    col = params.get('column')
    new_name = params.get('new_name')
    if col in lf.columns and new_name:
        lf = lf.with_columns(pl.col(col).alias(new_name))
    return lf

def handle_split_column(lf, params):
    col = params.get('column')
    delimiter = params.get('delimiter', ',')
    if col not in lf.columns:
        return lf
    split_lf = lf.select(pl.col(col).cast(pl.String).str.split(delimiter).alias("_splits"))
    max_splits = split_lf.select(pl.col("_splits").list.len().max()).collect().item()
    if max_splits and max_splits > 0:
        exprs = []
        for i in range(max_splits):
            exprs.append(pl.col(col).cast(pl.String).str.split(delimiter).list.get(i).alias(f"{col}_split_{i+1}"))
        lf = lf.with_columns(exprs)
    return lf

def handle_merge_columns(lf, params):
    col1 = params.get('column')
    col2 = params.get('column2')
    separator = params.get('separator', ' ')
    new_name = params.get('new_name')
    if col1 in lf.columns and col2 in lf.columns and new_name:
        lf = lf.with_columns(
            (pl.col(col1).cast(pl.String) + pl.lit(separator) + pl.col(col2).cast(pl.String)).alias(new_name)
        )
    return lf

def handle_ffill(lf, params):
    col = params.get('column')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).forward_fill().alias(col))
    return lf

def handle_bfill(lf, params):
    col = params.get('column')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).backward_fill().alias(col))
    return lf

def handle_interpolate(lf, params):
    col = params.get('column')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).interpolate().alias(col))
    return lf

def handle_flag_null(lf, params):
    col = params.get('column')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).is_null().cast(pl.Int32).alias(f"{col}_isnull"))
    return lf

def handle_drop_null_rows(lf, params):
    scope = params.get('scope', 'column')
    col = params.get('column')
    if scope == 'column' and col in lf.columns:
        lf = lf.filter(pl.col(col).is_not_null())
    elif scope == 'any':
        lf = lf.drop_nulls()
    elif scope == 'all':
        lf = lf.filter(~pl.all_horizontal(pl.all().is_null()))
    return lf

def handle_drop_cols_null_threshold(lf, params):
    threshold = float(params.get('threshold', 50)) / 100.0
    null_counts = lf.null_count().collect()
    total_rows = lf.select(pl.len()).collect().item()
    if total_rows > 0:
        cols_to_keep = []
        for col in lf.columns:
            null_pct = null_counts.get_column(col)[0] / total_rows
            if null_pct <= threshold:
                cols_to_keep.append(col)
        lf = lf.select(cols_to_keep)
    return lf

def handle_deduplicate_subset(lf, params):
    cols = params.get('columns', [])
    cols = [c for c in cols if c in lf.columns]
    if cols:
        lf = lf.unique(subset=cols)
    return lf

def handle_sample_rows(lf, params):
    method = params.get('method', 'count')
    val = float(params.get('value', 100))
    random_state = int(params.get('random_state', 42))
    
    df = lf.collect()
    if method == 'count':
        n = min(int(val), len(df))
        df = df.sample(n=n, seed=random_state)
    else:
        frac = min(val, 1.0)
        df = df.sample(fraction=frac, seed=random_state)
    return df.lazy()

def handle_drop_rows_index(lf, params):
    start = params.get('start')
    end = params.get('end')
    if start is not None and end is not None:
        lf = lf.with_row_index("_idx")
        lf = lf.filter((pl.col("_idx") < int(start)) | (pl.col("_idx") > int(end)))
        lf = lf.drop("_idx")
    return lf

def handle_label_encode(lf, params):
    col = params.get('column')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).cast(pl.Categorical).to_physical().alias(col))
    return lf

def handle_ordinal_encode(lf, params):
    col = params.get('column')
    order = params.get('order', '')
    if col in lf.columns and order:
        categories = [cat.strip() for cat in order.split(',') if cat.strip()]
        if categories:
            expr = pl.when(pl.col(col) == categories[0]).then(0)
            for idx, cat in enumerate(categories[1:]):
                expr = expr.when(pl.col(col) == cat).then(idx + 1)
            expr = expr.otherwise(-1).alias(col)
            lf = lf.with_columns(expr)
    return lf

def handle_binary_encode(lf, params):
    col = params.get('column')
    if col in lf.columns:
        phys_lf = lf.with_columns(pl.col(col).cast(pl.Categorical).to_physical().alias("_code"))
        max_code = phys_lf.select(pl.col("_code").max()).collect().item()
        if max_code is None or max_code <= 0:
            lf = lf.with_columns(pl.lit(0).alias(f"{col}_bin_0"))
            return lf
        num_bits = int(math.ceil(math.log2(max_code + 1)))
        for i in range(num_bits):
            expr = ((pl.col("_code") / (2**i)).floor().cast(pl.Int64) % 2).alias(f"{col}_bin_{i}")
            lf = lf.with_columns(expr)
    return lf

def handle_robust_scale(lf, params):
    col = params.get('column')
    if col in lf.columns:
        stats = lf.select([
            pl.col(col).quantile(0.25).alias("q25"),
            pl.col(col).median().alias("med"),
            pl.col(col).quantile(0.75).alias("q75")
        ]).collect()
        q25 = stats.get_column("q25")[0]
        med = stats.get_column("med")[0]
        q75 = stats.get_column("q75")[0]
        iqr = q75 - q25
        if iqr == 0:
            lf = lf.with_columns(pl.lit(0.0).alias(col))
        else:
            lf = lf.with_columns(((pl.col(col) - med) / iqr).alias(col))
    return lf

def handle_log_transform(lf, params):
    col = params.get('column')
    shift = float(params.get('shift', 1))
    if col in lf.columns:
        lf = lf.with_columns((pl.col(col) + shift).log().alias(col))
    return lf

def handle_sqrt_transform(lf, params):
    col = params.get('column')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).sqrt().alias(col))
    return lf

def handle_power_transform(lf, params):
    col = params.get('column')
    exponent = float(params.get('exponent', 2))
    if col in lf.columns:
        lf = lf.with_columns((pl.col(col) ** exponent).alias(col))
    return lf

def handle_custom_formula(lf, params):
    formula = params.get('formula')
    new_name = params.get('new_name')
    if formula and new_name:
        df = lf.collect().to_pandas()
        try:
            df[new_name] = df.eval(formula)
            return pl.from_pandas(df).lazy()
        except:
            pass
    return lf

def handle_bin_bucket(lf, params):
    col = params.get('column')
    num_bins = int(params.get('bins', 5))
    new_name = params.get('new_name') or f"{col}_binned"
    if col in lf.columns:
        stats = lf.select([pl.col(col).min().alias("min_v"), pl.col(col).max().alias("max_v")]).collect()
        min_v = stats.get_column("min_v")[0]
        max_v = stats.get_column("max_v")[0]
        if min_v is not None and max_v is not None and max_v > min_v:
            bin_width = (max_v - min_v) / num_bins
            breaks = [min_v + i * bin_width for i in range(1, num_bins)]
            lf = lf.with_columns(pl.col(col).cut(breaks).cast(pl.String).alias(new_name))
    return lf

def handle_date_parts(lf, params):
    col = params.get('column')
    parts = params.get('parts', ['year', 'month', 'day'])
    if not col or col not in lf.columns:
        raise ValueError(f"Column '{col}' not found in dataset.")
    exprs = []
    for part in parts:
        if part == 'year':
            exprs.append(pl.col(col).dt.year().alias(f"{col}_year"))
        elif part == 'month':
            exprs.append(pl.col(col).dt.month().alias(f"{col}_month"))
        elif part == 'day':
            exprs.append(pl.col(col).dt.day().alias(f"{col}_day"))
        elif part == 'dayofweek':
            exprs.append((pl.col(col).dt.weekday() - 1).alias(f"{col}_dayofweek"))
        elif part == 'hour':
            exprs.append(pl.col(col).dt.hour().alias(f"{col}_hour"))
        elif part == 'quarter':
            exprs.append(pl.col(col).dt.quarter().alias(f"{col}_quarter"))
        elif part == 'minute':
            exprs.append(pl.col(col).dt.minute().alias(f"{col}_minute"))
        elif part == 'second':
            exprs.append(pl.col(col).dt.second().alias(f"{col}_second"))
    if exprs:
        lf = lf.with_columns(exprs)
    return lf

def handle_regex_extraction(lf, params):
    col = params.get('column')
    pattern = params.get('pattern')
    new_name = params.get('new_name')
    if col in lf.columns and pattern and new_name:
        lf = lf.with_columns(pl.col(col).cast(pl.String).str.extract(pattern).alias(new_name))
    return lf

def handle_rolling_window(lf, params):
    col = params.get('column')
    window = int(params.get('window', 3))
    op = params.get('operation', 'mean')
    new_name = params.get('new_name') or f"{col}_rolling_{op}_{window}"
    if col in lf.columns:
        if op == 'mean':
            lf = lf.with_columns(pl.col(col).rolling_mean(window_size=window, min_periods=1).alias(new_name))
        elif op == 'std':
            lf = lf.with_columns(pl.col(col).rolling_std(window_size=window, min_periods=1).alias(new_name))
        elif op == 'sum':
            lf = lf.with_columns(pl.col(col).rolling_sum(window_size=window, min_periods=1).alias(new_name))
    return lf

def handle_interaction_terms(lf, params):
    col1 = params.get('column')
    col2 = params.get('column2')
    new_name = params.get('new_name') or f"{col1}_x_{col2}"
    if col1 in lf.columns and col2 in lf.columns:
        lf = lf.with_columns((pl.col(col1) * pl.col(col2)).alias(new_name))
    return lf

def handle_correlation_filter(lf, params):
    df = lf.collect()
    target = params.get('target')
    threshold = float(params.get('threshold', 0.1))
    if target in df.columns:
        numeric_cols = [c for c in df.columns if df[c].dtype.is_numeric()]
        if target in numeric_cols:
            corrs = {col: np.corrcoef(df[col].to_numpy(), df[target].to_numpy())[0, 1] for col in numeric_cols if col != target}
            cols_to_drop = [col for col, corr in corrs.items() if not np.isnan(corr) and abs(corr) < threshold]
            if cols_to_drop:
                df = df.drop(cols_to_drop)
    return df.lazy()

def handle_variance_threshold(lf, params):
    df = lf.collect()
    threshold = float(params.get('threshold', 0.0))
    numeric_cols = [c for c in df.columns if df[c].dtype.is_numeric()]
    cols_to_drop = [col for col in numeric_cols if df[col].var() <= threshold]
    if cols_to_drop:
        df = df.drop(cols_to_drop)
    return df.lazy()

def handle_select_k_best(lf, params):
    df = lf.collect()
    target = params.get('target')
    k = int(params.get('k', 5))
    if target in df.columns:
        numeric_cols = [c for c in df.columns if df[c].dtype.is_numeric() and c != target]
        corrs = {}
        for col in numeric_cols:
            c_val = np.corrcoef(df[col].to_numpy(), df[target].to_numpy())[0, 1]
            corrs[col] = abs(c_val) if not np.isnan(c_val) else 0.0
        top_k_cols = sorted(corrs, key=corrs.get, reverse=True)[:k]
        non_numeric = [c for c in df.columns if not df[c].dtype.is_numeric()]
        df = df.select(top_k_cols + [target] + [c for c in non_numeric if c != target])
    return df.lazy()

def handle_remove_constant_cols(lf, params):
    df = lf.collect()
    cols_to_keep = [col for col in df.columns if df[col].n_unique() > 1]
    df = df.select(cols_to_keep)
    return df.lazy()

def handle_remove_highly_correlated(lf, params):
    df = lf.collect()
    threshold = float(params.get('threshold', 0.9))
    numeric_cols = [c for c in df.columns if df[c].dtype.is_numeric()]
    if len(numeric_cols) > 1:
        corr_matrix = np.corrcoef([df[c].to_numpy() for c in numeric_cols])
        to_drop = []
        for i in range(len(numeric_cols)):
            for j in range(i+1, len(numeric_cols)):
                if abs(corr_matrix[i, j]) > threshold:
                    to_drop.append(numeric_cols[j])
        if to_drop:
            df = df.drop(list(set(to_drop)))
    return df.lazy()

def handle_detect_iqr(lf, params):
    col = params.get('column')
    if col in lf.columns:
        stats = lf.select([
            pl.col(col).quantile(0.25).alias("q25"),
            pl.col(col).quantile(0.75).alias("q75")
        ]).collect()
        q25 = stats.get_column("q25")[0]
        q75 = stats.get_column("q75")[0]
        iqr = q75 - q25
        lower = q25 - 1.5 * iqr
        upper = q75 + 1.5 * iqr
        lf = lf.with_columns(
            ((pl.col(col) < lower) | (pl.col(col) > upper)).cast(pl.Int32).alias(f"{col}_outlier_iqr")
        )
    return lf

def handle_detect_zscore(lf, params):
    col = params.get('column')
    threshold = float(params.get('threshold', 3.0))
    if col in lf.columns:
        stats = lf.select([
            pl.col(col).mean().alias("mean"),
            pl.col(col).std().alias("std")
        ]).collect()
        mean = stats.get_column("mean")[0]
        std = stats.get_column("std")[0]
        if std and std > 0:
            lf = lf.with_columns(
                (((pl.col(col) - mean) / std).abs() > threshold).cast(pl.Int32).alias(f"{col}_outlier_z")
            )
    return lf

def handle_cap_clip(lf, params):
    col = params.get('column')
    lower_q = float(params.get('lower_q', 0.01))
    upper_q = float(params.get('upper_q', 0.99))
    if col in lf.columns:
        stats = lf.select([
            pl.col(col).quantile(lower_q).alias("lower"),
            pl.col(col).quantile(upper_q).alias("upper")
        ]).collect()
        lower = stats.get_column("lower")[0]
        upper = stats.get_column("upper")[0]
        lf = lf.with_columns(
            pl.col(col).clip(lower_limit=lower, upper_limit=upper).alias(col)
        )
    return lf

def handle_remove_outliers(lf, params):
    col = params.get('column')
    method = params.get('method', 'iqr')
    if col in lf.columns:
        if method == 'iqr':
            stats = lf.select([
                pl.col(col).quantile(0.25).alias("q25"),
                pl.col(col).quantile(0.75).alias("q75")
            ]).collect()
            q25 = stats.get_column("q25")[0]
            q75 = stats.get_column("q75")[0]
            iqr = q75 - q25
            lower = q25 - 1.5 * iqr
            upper = q75 + 1.5 * iqr
            lf = lf.filter((pl.col(col) >= lower) & (pl.col(col) <= upper))
        else:
            threshold = float(params.get('threshold', 3.0))
            stats = lf.select([
                pl.col(col).mean().alias("mean"),
                pl.col(col).std().alias("std")
            ]).collect()
            mean = stats.get_column("mean")[0]
            std = stats.get_column("std")[0]
            if std and std > 0:
                lf = lf.filter((((pl.col(col) - mean) / std).abs() <= threshold))
    return lf

def handle_replace_substring(lf, params):
    col = params.get('column')
    old_val = params.get('old_val', '')
    new_val = params.get('new_val', '')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).cast(pl.String).str.replace(old_val, new_val, literal=True).alias(col))
    return lf

def handle_regex_replace(lf, params):
    col = params.get('column')
    pattern = params.get('pattern', '')
    replacement = params.get('replacement', '')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).cast(pl.String).str.replace(pattern, replacement, literal=False).alias(col))
    return lf

def handle_remove_special_chars(lf, params):
    col = params.get('column')
    if col in lf.columns:
        lf = lf.with_columns(pl.col(col).cast(pl.String).str.replace_all(r'[^a-zA-Z0-9\s]', '').alias(col))
    return lf

def handle_extract_domain(lf, params):
    col = params.get('column')
    if col in lf.columns:
        emails = pl.col(col).cast(pl.String).str.extract(r'@([^\s]+)')
        urls = pl.col(col).cast(pl.String).str.extract(r'https?://(?:www\.)?([^/\s]+)')
        lf = lf.with_columns(
            pl.coalesce([emails, urls, pl.lit('')]).alias(f"{col}_domain")
        )
    return lf

def handle_groupby_aggregate(lf, params):
    group_cols = params.get('group_cols', [])
    agg_col = params.get('agg_col')
    agg_type = params.get('agg_type', 'mean')
    if group_cols and agg_col in lf.columns:
        if agg_type == 'mean':
            lf = lf.group_by(group_cols).agg(pl.col(agg_col).mean().alias(agg_col))
        elif agg_type == 'sum':
            lf = lf.group_by(group_cols).agg(pl.col(agg_col).sum().alias(agg_col))
        elif agg_type == 'count':
            lf = lf.group_by(group_cols).agg(pl.col(agg_col).count().alias(agg_col))
        elif agg_type == 'min':
            lf = lf.group_by(group_cols).agg(pl.col(agg_col).min().alias(agg_col))
        elif agg_type == 'max':
            lf = lf.group_by(group_cols).agg(pl.col(agg_col).max().alias(agg_col))
    return lf

def handle_pivot_table(lf, params):
    df = lf.collect().to_pandas()
    index = params.get('index')
    columns = params.get('columns_col')
    values = params.get('values')
    aggfunc = params.get('aggfunc', 'mean')
    if index in df.columns and columns in df.columns and values in df.columns:
        df = df.pivot_table(index=index, columns=columns, values=values, aggfunc=aggfunc).reset_index()
        return pl.from_pandas(df).lazy()
    return lf

def handle_melt(lf, params):
    df = lf.collect().to_pandas()
    id_vars = params.get('id_vars', [])
    value_vars = params.get('value_vars', [])
    id_vars = [c for c in id_vars if c in df.columns]
    value_vars = [c for c in value_vars if c in df.columns]
    if id_vars or value_vars:
        df = pd.melt(df, id_vars=id_vars, value_vars=value_vars)
        return pl.from_pandas(df).lazy()
    return lf

def handle_transpose(lf, params):
    df = lf.collect().to_pandas().transpose().reset_index()
    return pl.from_pandas(df).lazy()

TRANSFORMS = {
    'drop_columns': handle_drop_columns,
    'fill_null': handle_fill_null,
    'remove_duplicates': handle_remove_duplicates,
    'rename_column': handle_rename_column,
    'min_max_scale': handle_min_max_scale,
    'standardize': handle_standardize,
    'lowercase': handle_lowercase,
    'uppercase': handle_uppercase,
    'trim_spaces': handle_trim_spaces,
    'toggle_bool': handle_toggle_bool,
    'one_hot_encode': handle_one_hot_encode,
    'change_datatype': handle_change_datatype,
    'filter_rows': handle_filter_rows,
    'sort_column': handle_sort_column,
    'reorder_column': handle_reorder_column,
    'duplicate_column': handle_duplicate_column,
    'split_column': handle_split_column,
    'merge_columns': handle_merge_columns,
    'ffill': handle_ffill,
    'bfill': handle_bfill,
    'interpolate': handle_interpolate,
    'flag_null': handle_flag_null,
    'drop_null_rows': handle_drop_null_rows,
    'drop_cols_null_threshold': handle_drop_cols_null_threshold,
    'deduplicate_subset': handle_deduplicate_subset,
    'sample_rows': handle_sample_rows,
    'drop_rows_index': handle_drop_rows_index,
    'label_encode': handle_label_encode,
    'ordinal_encode': handle_ordinal_encode,
    'binary_encode': handle_binary_encode,
    'robust_scale': handle_robust_scale,
    'log_transform': handle_log_transform,
    'sqrt_transform': handle_sqrt_transform,
    'power_transform': handle_power_transform,
    'custom_formula': handle_custom_formula,
    'bin_bucket': handle_bin_bucket,
    'date_parts': handle_date_parts,
    'regex_extraction': handle_regex_extraction,
    'rolling_window': handle_rolling_window,
    'interaction_terms': handle_interaction_terms,
    'correlation_filter': handle_correlation_filter,
    'variance_threshold': handle_variance_threshold,
    'select_k_best': handle_select_k_best,
    'remove_constant_cols': handle_remove_constant_cols,
    'remove_highly_correlated': handle_remove_highly_correlated,
    'detect_iqr': handle_detect_iqr,
    'detect_zscore': handle_detect_zscore,
    'cap_clip': handle_cap_clip,
    'remove_outliers': handle_remove_outliers,
    'replace_substring': handle_replace_substring,
    'regex_replace': handle_regex_replace,
    'remove_special_chars': handle_remove_special_chars,
    'extract_domain': handle_extract_domain,
    'groupby_aggregate': handle_groupby_aggregate,
    'pivot_table': handle_pivot_table,
    'melt': handle_melt,
    'transpose': handle_transpose
}

def load_dataset(path):
    path_lower = path.lower()
    if path_lower.endswith(('.xlsx', '.xls')):
        return pl.read_excel(path).lazy()
    elif path_lower.endswith('.parquet'):
        return pl.scan_parquet(path)
    else:
        return pl.scan_csv(path)

def apply_pipeline(lf, steps):
    for step in steps:
        step_type = step.get('type')
        step_params = step.get('params', {})
        if step_type in TRANSFORMS:
            lf = TRANSFORMS[step_type](lf, step_params)
        else:
            raise ValueError(f"Unsupported transformation action: '{step_type}'")
    return lf
