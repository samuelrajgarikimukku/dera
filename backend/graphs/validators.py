import pandas as pd

def validate_columns(df, x_cols, y_cols, chart_type):
    if len(x_cols) > 5:
        raise ValueError("reason:Maximum axis column limit reached.")
    if len(y_cols) > 10:
        raise ValueError("reason:Maximum axis column limit reached.")

    if not x_cols:
        raise ValueError("reason:X-Axis column selection is required.")
        
    for c in x_cols:
        if c not in df.columns:
            raise ValueError(f"reason:X-Axis column '{c}' not found in dataset")
    for c in y_cols:
        if c not in df.columns:
            raise ValueError(f"reason:Y-Axis column '{c}' not found in dataset")

    def is_numeric(col):
        return pd.api.types.is_numeric_dtype(df[col])

    def is_datetime(col):
        return pd.api.types.is_datetime64_any_dtype(df[col]) or 'datetime' in str(df[col].dtype).lower()

    if chart_type == 'scatter':
        if not y_cols:
            raise ValueError("reason:Scatter Plot requires at least one Y-Axis column selection.")
        if len(x_cols) > 0 and not (is_numeric(x_cols[0]) or is_datetime(x_cols[0])):
            raise ValueError(f"col:{x_cols[0]}|reason:Scatter plots require numeric or datetime values.")
        for c in y_cols:
            if not (is_numeric(c) or is_datetime(c)):
                raise ValueError(f"col:{c}|reason:Scatter plots require numeric or datetime values.")

    elif chart_type == 'line':
        if not y_cols:
            raise ValueError("reason:Line Chart requires at least one Y-Axis column selection.")
        if len(x_cols) > 0 and not (is_numeric(x_cols[0]) or is_datetime(x_cols[0])):
            raise ValueError(f"col:{x_cols[0]}|reason:Line Chart requires a numeric or datetime X-Axis.")
        for c in y_cols:
            if not is_numeric(c):
                raise ValueError(f"col:{c}|reason:Line Chart requires numeric Y columns.")

    elif chart_type in ['bar', 'box', 'violin']:
        for c in y_cols:
            if not is_numeric(c):
                raise ValueError(f"col:{c}|reason:{chart_type.capitalize()} Plot requires numeric Y columns.")

    elif chart_type == 'heatmap':
        for c in x_cols + y_cols:
            if not is_numeric(c):
                raise ValueError(f"col:{c}|reason:Heatmap supports numeric columns only.")
